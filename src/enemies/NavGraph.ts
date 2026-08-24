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
  if (grid.isBlocked(cell)) return false;

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
