import { edgeCenter, type Axis, type Cell } from '@/building/BuildGrid';
import { rotationDelta } from '@/building/BuildValidation';
import type { PieceId } from '@/data/build-pieces';
import { GRID_TILE } from '@/game/constants';

/** World-space XZ area reserved by the docked wreck and its gangway. */
export const EXPEDITION_RESERVED_AREA = {
  minX: 7,
  maxX: 20,
  minZ: -9,
  maxZ: 9,
} as const;

export interface BuildFootprintInput {
  piece?: PieceId;
  definitionId?: PieceId;
  cell: Pick<Cell, 'x' | 'z'>;
  edge?: { x: number; z: number; axis: Axis };
  rotation?: number;
}

export interface XZFootprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Resolve the physical anchor shared by live placements and save records.
 *
 * Cell centres are two metres apart. An edge is the boundary between two
 * centres, so its world position is one metre past its canonical x/z index on
 * the axis it spans. Keeping that conversion here prevents a wall at edge x=2
 * from being mistaken for a point at x=4 when its actual world wall is x=5.
 */
export function buildAnchorCenter(input: BuildFootprintInput): { x: number; z: number } {
  if (input.edge) {
    const center = edgeCenter({
      x: input.edge.x,
      y: 0,
      z: input.edge.z,
      axis: input.edge.axis,
    });
    return { x: center.x, z: center.z };
  }
  return { x: input.cell.x * GRID_TILE, z: input.cell.z * GRID_TILE };
}

/**
 * Return the conservative XZ collider footprint for a build record.
 *
 * The one metre cell half extent is intentional: a floor ending exactly at
 * x=5 only touches the reserved boundary and remains legal, while a piece
 * whose footprint crosses into x>5 is rejected. Edge pieces use their actual
 * thin wall depth, with the long axis spanning one cell.
 */
export function buildFootprint(input: BuildFootprintInput): XZFootprint {
  const piece = input.definitionId ?? input.piece;
  const anchor = buildAnchorCenter(input);

  if (input.edge) {
    const edgeHalf = 0.08;
    const cellHalf = GRID_TILE / 2;
    return input.edge.axis === 'x'
      ? {
          minX: anchor.x - edgeHalf,
          maxX: anchor.x + edgeHalf,
          minZ: anchor.z - cellHalf,
          maxZ: anchor.z + cellHalf,
        }
      : {
          minX: anchor.x - cellHalf,
          maxX: anchor.x + cellHalf,
          minZ: anchor.z - edgeHalf,
          maxZ: anchor.z + edgeHalf,
        };
  }

  if (piece === 'stairs') {
    const { dx, dz } = rotationDelta(input.rotation ?? 0);
    const run = {
      x: input.cell.x + dx,
      z: input.cell.z + dz,
    };
    const minCenterX = Math.min(input.cell.x, run.x) * GRID_TILE;
    const maxCenterX = Math.max(input.cell.x, run.x) * GRID_TILE;
    const minCenterZ = Math.min(input.cell.z, run.z) * GRID_TILE;
    const maxCenterZ = Math.max(input.cell.z, run.z) * GRID_TILE;
    const half = GRID_TILE / 2;
    return {
      minX: minCenterX - half,
      maxX: maxCenterX + half,
      minZ: minCenterZ - half,
      maxZ: maxCenterZ + half,
    };
  }

  const half = GRID_TILE / 2;
  return {
    minX: anchor.x - half,
    maxX: anchor.x + half,
    minZ: anchor.z - half,
    maxZ: anchor.z + half,
  };
}

/** Use strict overlap so touching the machine-side boundary at x=5 is legal. */
export function footprintOverlapsExpedition(input: BuildFootprintInput): boolean {
  const footprint = buildFootprint(input);
  return footprint.minX < EXPEDITION_RESERVED_AREA.maxX &&
    footprint.maxX > EXPEDITION_RESERVED_AREA.minX &&
    footprint.minZ < EXPEDITION_RESERVED_AREA.maxZ &&
    footprint.maxZ > EXPEDITION_RESERVED_AREA.minZ;
}
