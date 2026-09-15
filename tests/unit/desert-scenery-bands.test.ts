import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  DESERT_ARCHETYPES,
  DesertScenery,
  desertBudget,
  type DesertLibrary,
} from '@/world/DesertScenery';
import { duneHeightAt } from '@/world/DuneField';
import type { ChunkSlot } from '@/world/ChunkManager';

function library(): DesertLibrary {
  const models = Object.fromEntries(
    DESERT_ARCHETYPES.map((kind) => {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      geometry.computeBoundingBox();
      return [kind, { geometry, distant: geometry.clone() }];
    }),
  ) as unknown as DesertLibrary['models'];
  const material = new THREE.MeshStandardMaterial();
  return {
    models,
    material,
    dispose() {
      for (const model of Object.values(models)) {
        model.geometry.dispose();
        model.distant.dispose();
      }
      material.dispose();
    },
  };
}

describe('DesertScenery horizontal streaming', () => {
  it('keeps exactly three authored bands visible and seated at a far lateral offset', () => {
    const assets = library();
    const scenery = new DesertScenery(assets, 1);
    const slots: ChunkSlot[] = [{ slotId: 0, chunkIndex: 4, z: 0 }];
    scenery.syncSlots(slots, 'far-world', 12);
    scenery.setLateralOffset(1024);

    const snapshot = scenery.placementSnapshot;
    expect(snapshot).toHaveLength(desertBudget(12) * 3);
    expect([...new Set(snapshot.map((item) => item.bandIndex))].sort((a, b) => a - b)).toEqual([
      3, 4, 5,
    ]);
    expect(snapshot.some((item) => Math.abs(item.renderX) < 180)).toBe(true);
    for (const item of snapshot) {
      expect(item.renderX).toBeCloseTo(item.worldX - 1024, 8);
      expect(item.groundY).toBeLessThanOrEqual(duneHeightAt(item.worldX, item.worldZ) + 1e-8);
      expect(Number.isFinite(item.y)).toBe(true);
    }

    scenery.dispose();
    assets.dispose();
  });

  it('reuses bounded batch instances across repeated positive and negative band changes', () => {
    const assets = library();
    const scenery = new DesertScenery(assets, 2);
    const slots: ChunkSlot[] = [
      { slotId: 0, chunkIndex: 0, z: 0 },
      { slotId: 1, chunkIndex: 1, z: 64 },
    ];
    scenery.syncSlots(slots, 'bounded-world', 8);
    const expected = desertBudget(8) * 2 * 3;
    for (const offset of [0, 1024, -1025, 4096, 0, 255, 256, -1]) {
      scenery.setLateralOffset(offset);
      expect(scenery.placementSnapshot).toHaveLength(expected);
      expect(new Set(scenery.placementSnapshot.map((item) => item.bandIndex)).size).toBe(3);
    }

    scenery.dispose();
    assets.dispose();
  });
});
