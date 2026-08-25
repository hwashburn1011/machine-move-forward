import { BUILD_PIECES, isStation, type PieceId } from '@/data/build-pieces';
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
export function stairsCells(cell: Cell, rotation: number): {
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
      ? validateEdgePiece(grid, placement)
      : def.anchor === 'double-cell'
        ? validateStairs(grid, placement)
        : isStation(placement.piece)
          ? validateStation(grid, placement)
          : validateCellPiece(grid, placement);

  if (!structural.ok) return structural;
  if (!canAfford(def.cost)) return fail('cannot-afford');
  return OK;
}

function validateCellPiece(grid: BuildGrid<PieceId>, p: Placement): Validation {
  const { cell } = p;
  if (!inEnvelope(cell)) return fail('out-of-bounds');
  if (grid.isBlocked(cell)) return fail('blocked');

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
 * Stairs span three cells but only OCCUPY one.
 *
 * The base cell keeps its floor — the player walks onto the stairs from it —
 * so the stairs instance is stored in the run cell. Storing it in the base
 * would overwrite the very floor the rule requires.
 *
 * A floor plate under the bottom of the flight was suspected of being what
 * made this piece unclimbable, and it is not: measured against the real game,
 * a player walks up a flight whose base is floored without noticing the 1cm
 * between the plate's top and the first tread. What actually broke it was the
 * flight being built back to front — see `stairsGeometry`.
 */
function validateStairs(grid: BuildGrid<PieceId>, p: Placement): Validation {
  const { base, run, landing } = stairsCells(p.cell, p.rotation);

  if (!inEnvelope(base) || !inEnvelope(run) || !inEnvelope(landing)) {
    return fail('out-of-bounds');
  }
  if (grid.isBlocked(run)) return fail('blocked');
  if (!hasFloor(grid, base)) return fail('needs-floor');
  if (grid.hasCell(run)) return fail('needs-clearance');
  if (grid.hasCell(landing)) return fail('needs-clearance');

  return OK;
}
