import {
  BUILD_PIECES,
  canHoldFixture,
  isDecor,
  isFixture,
  isStation,
  type PieceId,
} from '@/data/build-pieces';
import type { ItemCost } from '@/data/items';
import {
  BuildGrid,
  canonicalEdge,
  cellsOfEdge,
  inEnvelope,
  neighbour,
  SIDES,
  type Cell,
  type Edge,
} from './BuildGrid';

/**
 * Placement rules.
 *
 * Pure: no Three.js, no Rapier. The rejection reasons are not decoration —
 * the build HUD shows them, so a vague reason becomes a vague UI.
 */

export type RejectReason =
  | 'out-of-bounds'
  | 'occupied'
  | 'blocked'
  | 'needs-support'
  | 'needs-floor'
  | 'needs-clearance'
  /** A wall fixture with no wall under it. Distinct from `needs-support`. */
  | 'needs-wall'
  | 'expedition-reserved'
  | 'locked'
  | 'cannot-afford';

export interface Validation {
  ok: boolean;
  reason?: RejectReason;
}

export interface Placement {
  piece: PieceId;
  /**
   * For a roof this is the cell being COVERED, not a separate ceiling cell —
   * roofs live in their own grid layer keyed by the floor they cap.
   */
  cell: Cell;
  /** Required for edge-anchored pieces. */
  edge?: Edge;
  /** 0..3, facing -Z, +X, +Z, -X. Only meaningful for rotatable pieces. */
  rotation: number;
}

export const REASON_TEXT: Record<RejectReason, string> = {
  'out-of-bounds': 'Outside the build envelope',
  occupied: 'Something is already there',
  blocked: 'Machine equipment is in the way',
  'needs-support': 'Needs a wall below or a floor beside it',
  'needs-floor': 'Needs a floor',
  'needs-clearance': 'Not enough clear space',
  'needs-wall': 'Needs a wall or doorway to hang on',
  'expedition-reserved': 'Reserved for the active wreck and gangway',
  locked: 'Blueprint not unlocked',
  'cannot-afford': 'Not enough materials',
};

const OK: Validation = { ok: true };
const fail = (reason: RejectReason): Validation => ({ ok: false, reason });

/** Direction a rotation faces, as a cell delta. */
export function rotationDelta(rotation: number): { dx: number; dz: number } {
  switch (((rotation % 4) + 4) % 4) {
    case 0:
      return { dx: 0, dz: -1 };
    case 1:
      return { dx: 1, dz: 0 };
    case 2:
      return { dx: 0, dz: 1 };
    default:
      return { dx: -1, dz: 0 };
  }
}

/**
 * The three cells a staircase involves: the base it starts from, the run it
 * covers horizontally, and the landing it delivers you to one level up.
 */
export function stairsCells(
  cell: Cell,
  rotation: number,
): {
  base: Cell;
  run: Cell;
  landing: Cell;
} {
  const { dx, dz } = rotationDelta(rotation);
  const run = { x: cell.x + dx, y: cell.y, z: cell.z + dz };
  return {
    base: { ...cell },
    run,
    landing: { x: run.x, y: run.y + 1, z: run.z },
  };
}

/**
 * The walkable upper exit is one full cell beyond the run. `stairsCells`
 * deliberately names the cell above the run `landing` because that is the
 * stairwell opening which must remain clear; it is not where a body stands
 * after leaving the flight.
 */
export function stairsExit(cell: Cell, rotation: number): Cell {
  const { run } = stairsCells(cell, rotation);
  const { dx, dz } = rotationDelta(rotation);
  return { x: run.x + dx, y: run.y + 1, z: run.z + dz };
}

/** Does this cell have a floor? */
function hasFloor(grid: BuildGrid<PieceId>, cell: Cell): boolean {
  return grid.getCell(cell) === 'floor';
}

/**
 * A predicate rather than a number, so this stays pure and ignorant of where
 * materials live. That is what lets storage crates count toward a build
 * without the validator knowing crates exist.
 */
export type CanAfford = (cost: ItemCost) => boolean;

export function validatePlacement(
  grid: BuildGrid<PieceId>,
  placement: Placement,
  canAfford: CanAfford,
): Validation {
  const def = BUILD_PIECES[placement.piece];

  // Order matters: the most specific reason should win. Affordability is
  // checked last so the player sees "needs support" rather than "cannot
  // afford" for a spot that was never legal in the first place.
  const structural =
    def.anchor === 'edge'
      ? isFixture(placement.piece)
        ? validateFixture(grid, placement)
        : validateEdgePiece(grid, placement)
      : def.anchor === 'double-cell'
        ? validateStairs(grid, placement)
        : isStation(placement.piece)
          ? validateStation(grid, placement)
          : isDecor(placement.piece)
            ? validateDecor(grid, placement)
            : validateCellPiece(grid, placement);

  if (!structural.ok) return structural;
  if (!canAfford(def.cost)) return fail('cannot-afford');
  return OK;
}

function validateCellPiece(grid: BuildGrid<PieceId>, p: Placement): Validation {
  const { cell } = p;
  if (!inEnvelope(cell)) return fail('out-of-bounds');
  if (grid.isBlocked(cell)) return fail('blocked');

  // A floor placed after the stairs must not cap the opening above their run.
  // The stairs layer stores the run at its lower level, so inspect the cell
  // directly below the proposed floor rather than the floor layer itself.
  if (p.piece === 'floor' && grid.hasStairs({ x: cell.x, y: cell.y - 1, z: cell.z })) {
    return fail('needs-clearance');
  }

  if (p.piece === 'roof') {
    if (grid.hasRoof(cell)) return fail('occupied');
    return hasFloor(grid, cell) ? OK : fail('needs-floor');
  }

  if (grid.hasCell(cell)) return fail('occupied');

  return validateFloorSupport(grid, cell);
}

/** Stations stand ON a floor, in their own layer, so both can coexist. */
function validateStation(grid: BuildGrid<PieceId>, p: Placement): Validation {
  const { cell } = p;
  if (!inEnvelope(cell)) return fail('out-of-bounds');
  if (grid.isBlocked(cell)) return fail('blocked');
  if (grid.hasStation(cell)) return fail('occupied');
  return hasFloor(grid, cell) ? OK : fail('needs-floor');
}

/**
 * Furniture stands on a floor, in its own layer, and asks for nothing else.
 *
 * Deliberately NOT `validateStation` with the piece list widened. That one
 * refuses a cell that already holds a station, and a rug under a workbench is
 * exactly the placement decoration exists for — the two occupy different
 * layers and must be allowed to coexist. Two rules that disagree about the
 * word "occupied" need two functions, the same argument `validateFixture`
 * makes against `validateEdgePiece`.
 *
 * There is no clearance rule here either, and there cannot be one: decor
 * builds no collider, so nothing it is placed near can be obstructed by it.
 */
function validateDecor(grid: BuildGrid<PieceId>, p: Placement): Validation {
  const { cell } = p;
  if (!inEnvelope(cell)) return fail('out-of-bounds');
  if (grid.isBlocked(cell)) return fail('blocked');
  if (grid.hasDecor(cell)) return fail('occupied');
  return hasFloor(grid, cell) ? OK : fail('needs-floor');
}

function validateFloorSupport(grid: BuildGrid<PieceId>, cell: Cell): Validation {
  if (cell.y === 0) return OK; // the chassis carries it

  // Above level 0, a floor needs something holding it up: a wall on the level
  // below touching one of its edges, or an existing floor beside it. This one
  // rule is what stops floating islands while still allowing a one-tile
  // overhang.
  for (const side of SIDES) {
    const below = canonicalEdge({ x: cell.x, y: cell.y - 1, z: cell.z }, side);
    const piece = grid.getEdge(below);
    if (piece === 'wall' || piece === 'doorway') return OK;
  }
  for (const side of SIDES) {
    // Orthogonal only. Diagonals must not count, or structures grow outward in
    // unsupported checkerboards.
    if (hasFloor(grid, neighbour(cell, side))) return OK;
  }

  return fail('needs-support');
}

function validateEdgePiece(grid: BuildGrid<PieceId>, p: Placement): Validation {
  const edge = p.edge;
  if (!edge) return fail('out-of-bounds');

  const [a, b] = cellsOfEdge(edge);
  // At least one side must be inside the envelope; a perimeter wall has one
  // cell in and one cell out, and refusing that would make walling the edge of
  // the build area impossible.
  if (!inEnvelope(a) && !inEnvelope(b)) return fail('out-of-bounds');
  if (grid.hasEdge(edge)) return fail('occupied');

  return hasFloor(grid, a) || hasFloor(grid, b) ? OK : fail('needs-floor');
}

/**
 * A wall fixture hangs on the edge piece that is already there.
 *
 * Deliberately NOT `validateEdgePiece` with an extra clause. That one refuses
 * an edge that already holds something, which is the exact opposite of what a
 * lamp needs: it requires the wall to be there and would be occupied by its
 * own mount. Two rules that disagree about the same word need two functions.
 *
 * The floor rule is not repeated here either. A wall already needed a floor on
 * one side to be built, so anything hanging on a wall inherits that check for
 * free — and a wall that later loses both its floors takes its lamp down with
 * it through the demolition cascade.
 */
function validateFixture(grid: BuildGrid<PieceId>, p: Placement): Validation {
  const edge = p.edge;
  if (!edge) return fail('out-of-bounds');

  const [a, b] = cellsOfEdge(edge);
  if (!inEnvelope(a) && !inEnvelope(b)) return fail('out-of-bounds');
  if (grid.hasFixture(edge)) return fail('occupied');

  return canHoldFixture(grid.getEdge(edge)) ? OK : fail('needs-wall');
}

/**
 * Stairs span three cells and occupy the AIRSPACE of two of them.
 *
 * The flight is a ramp, not a tower, and the whole of this rule follows from
 * where that ramp actually is. Its collider is a 5m slab tilted 37°, running
 * from the far edge of the base cell at floor height to the far edge of the
 * RUN cell three metres up. So over the base cell it climbs from the floor to
 * half a level, and over the run cell it carries on from half a level to a
 * full one, arriving exactly at the floor plane of the landing above.
 *
 * **A floor plate in the run cell is not in the way**, and insisting it was is
 * what made this piece unbuildable in practice. The run had to hang off the
 * edge of whatever the player had already floored — which is to say every
 * staircase had to be built sticking out of the hull — and the reason given
 * was "Not enough clear space" while the space in question was a metre and a
 * half below the lowest tread. The base cell has always been required to be
 * floored for exactly the same geometry; the run cell is the same wedge,
 * further along.
 *
 * **A floor plate at the LANDING is a lid on the stairwell.** The landing sits
 * directly above the run cell, so its plate spans the whole footprint the top
 * of the flight climbs through, and the headroom between ramp and plate falls
 * from a metre and a half at the near edge to nothing at the far one. A player
 * gets a stride and a half up and meets the underside of the deck they were
 * climbing to. The upper storey has to have a hole in it, and that hole is the
 * landing — which is why this is the one thing here that must stay refused.
 */
function validateStairs(grid: BuildGrid<PieceId>, p: Placement): Validation {
  const { base, run, landing } = stairsCells(p.cell, p.rotation);

  if (!inEnvelope(base) || !inEnvelope(run) || !inEnvelope(landing)) {
    return fail('out-of-bounds');
  }
  if (grid.isBlocked(run) || grid.isBlocked(landing)) return fail('blocked');
  if (!hasFloor(grid, base)) return fail('needs-floor');

  if (grid.hasStairs(run)) return fail('occupied');
  // A roof caps the run cell within a hand's breadth of where the top tread
  // arrives, and a workstation is tall enough to meet the lower treads.
  if (grid.hasRoof(run) || grid.hasStation(run)) return fail('needs-clearance');

  // Anything in the run cell that is not a floor reaches into the flight.
  const inRun = grid.getCell(run);
  if (inRun !== undefined && inRun !== 'floor') return fail('needs-clearance');

  // The stairwell opening. See above.
  if (grid.hasCell(landing)) return fail('needs-clearance');

  return OK;
}
