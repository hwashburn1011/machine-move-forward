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
  it('disposes encounter effects and removes its scene group idempotently', async () => {
    const h = await harness();
    expect(h.vehicle.group.parent).toBeTruthy();
    h.vehicle.dispose();
    expect(h.vehicle.group.parent).toBeNull();
    expect(() => h.vehicle.dispose()).not.toThrow();
    h.physics.dispose();
  });

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

  it('reuses warmed roster slots across 100 terminal encounter cycles without collider growth', async () => {
    const h = await harness();
    try {
      const staged = h.vehicle.prepareCrewForWarmup();
      expect(staged).toHaveLength(10);
      h.vehicle.finishCrewWarmup(staged);
      const pool = h.vehicle as unknown as { crewVisualPool: { persistentSlotCount: number } };
      const warmedSlots = pool.crewVisualPool.persistentSlotCount;
      for (let i = 0; i < 100; i += 1) {
        expect(h.vehicle.spawn('port', false, ['bastion', 'sovereign'])).toBe(true);
        expect(h.vehicle.manager.snapshot?.crewHealth).toHaveLength(2);
        expect(h.vehicle.manager.snapshot?.hookHealth).toBeGreaterThan(0);
        h.vehicle.damageHook(1000);
        h.vehicle.fixedUpdate(1 / 60);
        h.vehicle.fixedUpdate(4);
        expect(h.physics.world.bodies.len()).toBe(0);
        expect(h.skiff.visible).toBe(false);
        h.vehicle.clear();
      }
      expect(pool.crewVisualPool.persistentSlotCount).toBe(warmedSlots);
    } finally {
      h.dispose();
    }
  });

  it('cleans pooled visuals and actors for hook-cut and hull-kill terminal paths', async () => {
    const h = await harness();
    try {
      expect(h.vehicle.spawn('starboard', false, ['warden', 'warden'])).toBe(true);
      for (let i = 0; i < 40 && h.vehicle.manager.snapshot?.phase !== 'attached'; i += 1)
        h.vehicle.fixedUpdate(0.25);
      expect(h.vehicle.manager.snapshot?.phase).toBe('attached');
      expect(h.vehicle.holdCutHook(1.25)).toBe(true);
      h.vehicle.fixedUpdate(4);
      expect(h.skiff.visible).toBe(false);
      expect(h.physics.world.bodies.len()).toBe(0);

      h.vehicle.clear();
      expect(h.vehicle.spawn('port', false, ['warden', 'warden'])).toBe(true);
      h.vehicle.damageHull(1000);
      h.vehicle.fixedUpdate(1 / 60);
      h.vehicle.fixedUpdate(4);
      expect(h.skiff.visible).toBe(false);
      expect(h.physics.world.bodies.len()).toBe(0);
    } finally {
      h.dispose();
    }
  });
});
