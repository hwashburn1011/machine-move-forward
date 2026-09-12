import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { VehicleScene } from '@/vehicles/VehicleScene';

async function harness() {
  await initRapier();
  const physics = new PhysicsWorld();
  const material = new THREE.MeshStandardMaterial();
  const materials = Object.fromEntries(
    [
      'hull',
      'hullDark',
      'bareSteel',
      'rustedSteel',
      'rubber',
      'deckPlate',
      'emissiveWarn',
      'accent',
    ].map((name) => [name, material]),
  ) as never;
  const ended = vi.fn();
  const vehicle = new VehicleScene(new THREE.Scene(), physics, materials, {
    spawnBoarder: () => undefined,
    getVolleyTargets: () => [],
    damageVolleyTarget: () => undefined,
    onVolley: () => undefined,
    onHookAttached: () => undefined,
    onRetreat: () => undefined,
    onDestroyed: () => undefined,
    onEnded: ended,
  });
  const skiff = vehicle.group.children[0]!;
  return {
    vehicle,
    physics,
    skiff,
    ended,
    dispose: () => {
      vehicle.clear();
      physics.dispose();
      material.dispose();
    },
  };
}

describe('boarding skiff presentation lifecycle', () => {
  it('never displays an unspawned skiff under the machine, including repeated new-game/load clears', async () => {
    const h = await harness();
    try {
      expect(h.vehicle.active).toBe(false);
      expect(h.vehicle.manager.snapshot).toBeNull();
      expect(h.skiff.visible).toBe(false);
      for (let i = 0; i < 3; i++) {
        h.vehicle.clear();
        h.vehicle.fixedUpdate(1);
        expect(h.skiff.visible).toBe(false);
        expect(h.physics.world.bodies.len()).toBe(0);
      }
    } finally {
      h.dispose();
    }
  });

  it('shows real encounters at their approach position, recedes on retreat and removes the departed model', async () => {
    const h = await harness();
    try {
      for (const side of ['port', 'starboard'] as const) {
        expect(h.vehicle.spawn(side)).toBe(true);
        expect(h.skiff.visible).toBe(true);
        expect(h.skiff.position.z).toBe(55);
        expect(h.skiff.position.x).toBe(side === 'port' ? -30 : 30);
        for (let i = 0; i < 300 && h.vehicle.manager.snapshot?.phase === 'approach'; i++)
          h.vehicle.fixedUpdate(1 / 60);
        expect(h.vehicle.manager.snapshot?.phase).toBe('firing-pass');
        h.vehicle.damageHook(100);
        h.vehicle.fixedUpdate(1 / 60);
        const departure = h.skiff.position.clone();
        h.vehicle.fixedUpdate(1);
        expect(h.skiff.visible).toBe(true);
        expect(h.skiff.position.z).toBeGreaterThan(departure.z);
        expect(Math.abs(h.skiff.position.x)).toBeGreaterThan(Math.abs(departure.x));
        h.vehicle.fixedUpdate(3);
        expect(h.ended).toHaveBeenCalled();
        expect(h.skiff.visible).toBe(false);
        expect(h.physics.world.bodies.len()).toBe(0);
        h.vehicle.clear();
      }
    } finally {
      h.dispose();
    }
  });
});
