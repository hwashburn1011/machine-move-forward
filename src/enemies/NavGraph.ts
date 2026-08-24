import { blocksNavigation, type PieceId } from '@/data/build-pieces';
import {
  DECK_HEIGHT,
  GRID_LEVELS,
  GRID_MAX_X,
  GRID_MAX_Z,
  GRID_MIN_X,
  GRID_MIN_Z,
  GRID_TILE,
  LEVEL_HEIGHT,
} from '@/game/constants';
import {
  BuildGrid,
  canonicalEdge,
  cellKey,
  inEnvelope,
  neighbour,
  SIDES,
  type Cell,
} from '@/building/BuildGrid';

/**
 * Navigation over the build grid (spec 2026-08-24-enemy-navigation-design.md).
 *
 * Pure: cells and edges in, waypoints out. No Three.js and no Rapier, so every
 * rule here is testable in node — the same discipline `RoomDetector` and
 * `EnemySteering` already follow.
 *
 * This answers "which way round the building". It is NOT local avoidance:
 * `EnemySteering` still handles the next metre and a half, and the two are
 * deliberately separate because they are different scales of problem.
 */

export interface NavGraph {
  /** cellKey -> the cells reachable from it in one step. */
  readonly links: Map<string, Cell[]>;
}

/** The machine deck's XZ extent, in metres. */
export interface DeckBoundsXZ {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Level-0 cells lying over the bare deck.
 *
 * Derived from the deck's own bounds rather than hardcoded. The deck is 16m
 * long against a 2m grid whose Z origin does not divide it evenly, so a
 * hardcoded range would misclassify a row at one end and nothing would notice
 * until an enemy walked through open air.
 *
 * The test is the cell's centre, inclusive of the boundary. That matters:
 * arrivals are placed 0.6m in from the deck lip, which rounds to the outermost
 * cell, and excluding it would leave a freshly spawned enemy with no start
 * node at all.
 */
export function deckCells(bounds: DeckBoundsXZ): Cell[] {
  const out: Cell[] = [];

  for (let x = GRID_MIN_X; x <= GRID_MAX_X; x++) {
    const wx = x * GRID_TILE;
    if (wx < bounds.minX || wx > bounds.maxX) continue;

    for (let z = GRID_MIN_Z; z <= GRID_MAX_Z; z++) {
      const wz = z * GRID_TILE;
      if (wz < bounds.minZ || wz > bounds.maxZ) continue;
      out.push({ x, y: 0, z });
    }
  }

  return out;
}

/**
 * The build level a pair of feet is standing on.
 *
 * Floor, not round: a level's floor plane is its lower bound, so an enemy
 * mid-jump on level 0 must not be reported as being on level 1.
 */
export function levelOf(feetY: number): number {
  const raw = Math.floor((feetY - DECK_HEIGHT) / LEVEL_HEIGHT);
  return Math.max(0, Math.min(GRID_LEVELS - 1, raw));
}

/** Can a body stand in this cell? */
function isWalkable(
  grid: BuildGrid<PieceId>,
  cell: Cell,
  deckKeys: ReadonlySet<string>,
): boolean {
  if (!inEnvelope(cell)) return false;

  // Deliberately NOT consulting grid.isBlocked(cell) here. Two separate
  // layers exist on purpose (design doc section 3): A* answers which way
  // round the building, while EnemySteering's local avoidance answers don't
  // walk into the generator. The blocked set is a build-PLACEMENT rule — it
  // rounds equipment collider bounds outward to whole 2m cells, which is far
  // too coarse to describe where a body can actually walk — so reusing it
  // for walkability would carve the deck into disconnected islands and strand
  // enemies with no start node. Equipment avoidance belongs to steering,
  // which already handles it.

  const piece = grid.getCell(cell);
  // The stairs run cell holds 'stairs' and is the ramp itself — walkable.
  if (piece === 'floor' || piece === 'stairs') return true;

  return cell.y === 0 && deckKeys.has(cellKey(cell));
}

export function buildNavGraph(
  grid: BuildGrid<PieceId>,
  deck: readonly Cell[],
): NavGraph {
  const deckKeys = new Set(deck.map(cellKey));

  // Every cell that could hold a body: the bare deck, plus anything the player
  // has floored or run stairs through.
  const candidates = new Map<string, Cell>();
  for (const cell of deck) candidates.set(cellKey(cell), cell);
  for (const entry of grid.cellEntries()) candidates.set(cellKey(entry.cell), entry.cell);

  const walkable = new Map<string, Cell>();
  for (const [key, cell] of candidates) {
    if (isWalkable(grid, cell, deckKeys)) walkable.set(key, cell);
  }

  const links = new Map<string, Cell[]>();

  // Sorted so link order — and therefore every path A* returns — is stable
  // across runs rather than depending on Map insertion order. The harnesses
  // compare paths between runs.
  const keys = [...walkable.keys()].sort();

  for (const key of keys) {
    const cell = walkable.get(key) as Cell;
    const out: Cell[] = [];

    for (const side of SIDES) {
      const next = neighbour(cell, side);
      const nextKey = cellKey(next);
      if (!walkable.has(nextKey)) continue;
      if (blocksNavigation(grid.getEdge(canonicalEdge(cell, side)))) continue;
      out.push(next);
    }

    out.sort((a, b) => cellKey(a).localeCompare(cellKey(b)));
    links.set(key, out);
  }

  // Stairs are the only vertical link in the graph. There is no jump, no drop,
  // and no path off an edge — physics still lets a shoved enemy fall, but
  // nothing will ever plan a route that way.
  //
  // `stairsCells` puts the landing directly above the run, so this needs no
  // rotation. The base is reached from the run by the ordinary lateral link
  // above, because a base is a floor cell adjacent to the run with no piece on
  // the edge between them.
  for (const key of keys) {
    const cell = walkable.get(key) as Cell;
    if (grid.getCell(cell) !== 'stairs') continue;

    const landing: Cell = { x: cell.x, y: cell.y + 1, z: cell.z };
    const landingKey = cellKey(landing);
    if (!walkable.has(landingKey)) continue;

    (links.get(key) as Cell[]).push(landing);
    (links.get(landingKey) as Cell[]).push(cell);
  }

  // Re-sort the two lists the vertical pass touched, so ordering stays stable.
  for (const list of links.values()) {
    list.sort((a, b) => cellKey(a).localeCompare(cellKey(b)));
  }

  return { links };
}

/**
 * Extra cost charged for changing storey.
 *
 * A stair is cheap to walk but expensive to decide on. Without this an enemy
 * two cells away will happily go up and over a staircase to reach you, which
 * looks broken. The heuristic also charges LEVEL_COST per level, but only
 * LEVEL_COST — never more than the true edge cost of a vertical step (which
 * is 1 for the lateral move plus LEVEL_COST), so the heuristic never
 * overestimates and A* stays admissible.
 */
const LEVEL_COST = 3;

function heuristic(a: Cell, b: Cell): number {
  return (
    Math.abs(a.x - b.x) + Math.abs(a.z - b.z) + LEVEL_COST * Math.abs(a.y - b.y)
  );
}

function reconstruct(
  cameFrom: Map<string, string>,
  cells: Map<string, Cell>,
  startKey: string,
  endKey: string,
): Cell[] {
  const out: Cell[] = [];
  let key = endKey;

  while (key !== startKey) {
    out.push(cells.get(key) as Cell);
    const previous = cameFrom.get(key);
    if (previous === undefined) break;
    key = previous;
  }

  return out.reverse();
}

/**
 * A* from one cell to another.
 *
 * Returns the waypoints AFTER the start cell, so the caller can steer at
 * `path[0]` immediately. An empty array never means "you are lost" — it
 * means no waypoints are needed, for one of three reasons:
 *   1. `from` is not a node in the graph at all;
 *   2. `from` and `to` are the same cell, so there is nowhere to step; or
 *   3. the goal is unreachable and the closest reachable cell IS the start,
 *      so the enemy is already standing as close as it can get.
 * Only case 1 is a genuine "off the graph" problem the caller may want to
 * handle specially (e.g. snapping the enemy to a nearby node); cases 2 and 3
 * both mean "stay put" — the caller should not treat every empty array as a
 * signal to relocate the enemy.
 *
 * When the goal cannot be reached, this does NOT fail. Everything A* visited
 * is by definition what the enemy can reach, so it returns the path to
 * whichever visited cell sits closest to the goal. That is the whole of the
 * behaviour for a player who has sealed themselves in: enemies walk to the
 * inside face of the nearest wall and keep hunting, with no siege state
 * machine anywhere.
 */
export function findPath(graph: NavGraph, from: Cell, to: Cell): Cell[] {
  const startKey = cellKey(from);
  if (!graph.links.has(startKey)) return [];

  const goalKey = cellKey(to);
  const cells = new Map<string, Cell>([[startKey, from]]);
  const gScore = new Map<string, number>([[startKey, 0]]);
  const cameFrom = new Map<string, string>();
  const open = new Set<string>([startKey]);
  const closed: string[] = [];

  while (open.size > 0) {
    // Lowest f, ties broken on the key so the search order — and therefore the
    // path — never depends on Set iteration order.
    let currentKey = '';
    let bestF = Infinity;
    for (const key of open) {
      const f =
        (gScore.get(key) as number) + heuristic(cells.get(key) as Cell, to);
      if (f < bestF || (f === bestF && key < currentKey)) {
        bestF = f;
        currentKey = key;
      }
    }

    if (currentKey === goalKey) {
      return reconstruct(cameFrom, cells, startKey, goalKey);
    }

    open.delete(currentKey);
    closed.push(currentKey);

    const tentative = (gScore.get(currentKey) as number) + 1;
    for (const next of graph.links.get(currentKey) ?? []) {
      const nextKey = cellKey(next);
      const sameLevel = next.y === (cells.get(currentKey) as Cell).y;
      const step = sameLevel ? tentative : tentative + LEVEL_COST;
      if (step >= (gScore.get(nextKey) ?? Infinity)) continue;

      cells.set(nextKey, next);
      cameFrom.set(nextKey, currentKey);
      gScore.set(nextKey, step);
      open.add(nextKey);
    }
  }

  // Unreachable. Head for the closest thing that is reachable.
  let bestKey = startKey;
  let bestDistance = heuristic(from, to);
  for (const key of closed) {
    const d = heuristic(cells.get(key) as Cell, to);
    if (d < bestDistance || (d === bestDistance && key < bestKey)) {
      bestDistance = d;
      bestKey = key;
    }
  }

  return bestKey === startKey
    ? []
    : reconstruct(cameFrom, cells, startKey, bestKey);
}

/**
 * Whether a body could walk the straight line between two cells without
 * crossing anything A* would have routed around.
 *
 * Used to let the enemy's steering aim further down a route than the very
 * next waypoint (design note: a single short leg is often close to
 * axis-aligned with whatever the grid happened to route round, which can aim
 * the body broadside at it). That shortcut is only safe if the straight line
 * to the farther waypoint cannot pass through a wall the route existed to
 * avoid — so this walks every cell the segment actually touches, a
 * "supercover" traversal rather than a thin Bresenham line, and requires each
 * consecutive pair to be linked in the graph.
 *
 * Both cells must be on the same level: this is a 2D check across one floor,
 * and a segment that changes level is conservatively not clear (there is no
 * straight line between storeys — only the stairs link).
 *
 * At an exact corner graze — the line passing precisely through the lattice
 * point where four cells meet — the segment genuinely touches all four
 * cells, so both complete L-routes around the corner are required to be
 * passable: current to each orthogonal neighbour AND each of those
 * neighbours on to the diagonal cell. Checking only the two edges leaving
 * `current` proves just the near half of the corner; a wall pair on the far
 * side (e.g. north of one neighbour and east of the other) would still let
 * the line squeeze through undetected. Requiring the full loop closed on
 * both sides is the conservative reading — it can only reject a candidate
 * that a looser check would have let through, never the reverse — and
 * conservative is correct here: aiming through a wall is the failure this
 * function exists to prevent.
 */
export function segmentIsClear(graph: NavGraph, from: Cell, to: Cell): boolean {
  if (from.y !== to.y) return false;

  const y = from.y;
  let x = from.x;
  let z = from.z;

  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const absDx = Math.abs(dx);
  const absDz = Math.abs(dz);
  const stepX = Math.sign(dx);
  const stepZ = Math.sign(dz);

  const tDeltaX = absDx === 0 ? Infinity : 1 / absDx;
  const tDeltaZ = absDz === 0 ? Infinity : 1 / absDz;
  let tMaxX = absDx === 0 ? Infinity : 0.5 * tDeltaX;
  let tMaxZ = absDz === 0 ? Infinity : 0.5 * tDeltaZ;

  const EPS = 1e-9;

  const isLinked = (a: Cell, b: Cell): boolean => {
    const links = graph.links.get(cellKey(a));
    return links !== undefined && links.some((n) => n.x === b.x && n.y === b.y && n.z === b.z);
  };

  while (x !== to.x || z !== to.z) {
    const current: Cell = { x, y, z };
    const tie = stepX !== 0 && stepZ !== 0 && Math.abs(tMaxX - tMaxZ) < EPS;

    if (tie) {
      const nx: Cell = { x: x + stepX, y, z };
      const nz: Cell = { x, y, z: z + stepZ };
      const diag: Cell = { x: x + stepX, y, z: z + stepZ };
      // Both L-routes around the corner, not just the two edges leaving
      // `current` — see the doc comment above for why the near half alone
      // is not enough.
      const viaX = isLinked(current, nx) && isLinked(nx, diag);
      const viaZ = isLinked(current, nz) && isLinked(nz, diag);
      if (!viaX || !viaZ) return false;
      x += stepX;
      z += stepZ;
      tMaxX += tDeltaX;
      tMaxZ += tDeltaZ;
    } else if (tMaxX < tMaxZ) {
      const next: Cell = { x: x + stepX, y, z };
      if (!isLinked(current, next)) return false;
      x += stepX;
      tMaxX += tDeltaX;
    } else {
      const next: Cell = { x, y, z: z + stepZ };
      if (!isLinked(current, next)) return false;
      z += stepZ;
      tMaxZ += tDeltaZ;
    }
  }

  return true;
}
