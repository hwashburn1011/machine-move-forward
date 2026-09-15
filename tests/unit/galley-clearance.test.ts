import { describe, expect, it } from 'vitest';
import { pieceColliders, buildPieceGeometry } from '@/building/BuildPieceGeometry';
import { GRID_TILE, PLAYER_CAPSULE_RADIUS } from '@/game/constants';

const stations = ['stove', 'condenser', 'planter', 'seed-garden'] as const;

describe('galley station footprint contracts', () => {
  it('keeps current procedural station geometry within one 2m cell', () => {
    for (const piece of stations) {
      const geometry = buildPieceGeometry(piece);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      expect(box, piece).not.toBeNull();
      expect(box!.min.x, `${piece} minX`).toBeGreaterThanOrEqual(-GRID_TILE / 2);
      expect(box!.max.x, `${piece} maxX`).toBeLessThanOrEqual(GRID_TILE / 2);
      expect(box!.min.z, `${piece} minZ`).toBeGreaterThanOrEqual(-GRID_TILE / 2);
      expect(box!.max.z, `${piece} maxZ`).toBeLessThanOrEqual(GRID_TILE / 2);
    }
  });

  it('keeps movement colliders inside the station cell footprint', () => {
    for (const piece of stations) {
      const specs = pieceColliders(piece);
      const bounds = specs.reduce(
        (result, spec) => ({
          x: Math.max(result.x, Math.abs(spec.offset.x) + spec.half.x),
          z: Math.max(result.z, Math.abs(spec.offset.z) + spec.half.z),
        }),
        { x: 0, z: 0 },
      );
      expect(bounds.x, `${piece} collider half-width`).toBeLessThanOrEqual(1);
      expect(bounds.z, `${piece} collider half-depth`).toBeLessThanOrEqual(1);
    }
  });

  it('proves adjacent large planters cannot be a capsule aisle', () => {
    const capsuleRadius = PLAYER_CAPSULE_RADIUS;
    for (const piece of ['planter', 'seed-garden'] as const) {
      const half = pieceColliders(piece)[0]!.half.x;
      const gap = GRID_TILE - half * 2;
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThan(capsuleRadius * 2);
    }
  });
});
