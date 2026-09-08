import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildGunboatModel } from '@/art/DefenseModels';
import { GUNBOAT, VEHICLES } from '@/data/vehicles';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { GunboatScene } from '@/vehicles/GunboatScene';
import {
  createGunboatEncounter,
  damageGunboatEncounter,
  restoreGunboatEncounter,
  serialiseGunboatEncounter,
  stepGunboatEncounter,
} from '@/vehicles/GunboatEncounter';

function advance(state: ReturnType<typeof createGunboatEncounter>, seconds: number) {
  for (let left = seconds; left > 0; left -= 1)
    state = stepGunboatEncounter(state, Math.min(1, left));
  return state;
}

function stubMaterials() {
  const material = new THREE.MeshStandardMaterial();
  return {
    hull: material,
    hullDark: material,
    rustedSteel: material,
    bareSteel: material,
  } as never;
}

function sceneHarness(overrides: Partial<ConstructorParameters<typeof GunboatScene>[3]> = {}) {
  const physics = new PhysicsWorld();
  const scene = new THREE.Scene();
  const hits: { id: string; amount: number }[] = [];
  const callbacks: ConstructorParameters<typeof GunboatScene>[3] = {
    getVolleyTargetPosition: () => new THREE.Vector3(0, 5, 0),
    damageVolleyTarget: (id, amount) => hits.push({ id, amount }),
    ...overrides,
  };
  return {
    physics,
    scene,
    hits,
    gunboat: new GunboatScene(scene, physics, stubMaterials(), callbacks),
  };
}

function advanceScene(gunboat: GunboatScene, seconds: number) {
  for (let left = seconds; left > 0; left -= 1) gunboat.fixedUpdate(Math.min(1, left));
}

describe('GunboatEncounter', () => {
  it('keeps gunboat tuning separate from boarding-skiff data', () => {
    expect(VEHICLES.skiff.id).toBe('skiff');
    expect(GUNBOAT.id).toBe('gunboat');
    expect(GUNBOAT.dimensions).toEqual({ widthX: 3.4, lengthZ: 9 });
    expect(GUNBOAT.shell).toEqual({ damage: 10, volleyShots: 2, volleyPeriod: 4, flightTime: 0.9 });
  });
  it('delays two shells by flight time and captures the launch aim', async () => {
    await initRapier();
    const harness = sceneHarness();
    expect(harness.gunboat.spawn()).toBe(true);
    advanceScene(harness.gunboat, 10.45);
    expect(harness.gunboat.pendingShellCount).toBe(2);
    expect(harness.gunboat.telegraphActive).toBe(false);
    expect(harness.hits).toHaveLength(0);
    advanceScene(harness.gunboat, 0.8);
    expect(harness.hits).toHaveLength(0);
    advanceScene(harness.gunboat, 0.1);
    expect(harness.hits).toHaveLength(2);
    harness.gunboat.dispose();
  });

  it('resolves already launched shells after weapon disable', async () => {
    await initRapier();
    const harness = sceneHarness();
    harness.gunboat.spawn();
    advanceScene(harness.gunboat, 10.45);
    harness.gunboat.damage('weapon', 999);
    advanceScene(harness.gunboat, 0.9);
    expect(harness.hits).toHaveLength(2);
    harness.gunboat.dispose();
  });

  it('keeps launched shells alive after terminal cleanup, but reset cancels them', async () => {
    await initRapier();
    const harness = sceneHarness();
    harness.gunboat.spawn();
    advanceScene(harness.gunboat, 10.45);
    harness.gunboat.damage('hull', 999);
    harness.gunboat.clear(true);
    expect(harness.physics.colliderCount).toBe(0);
    expect(harness.gunboat.snapshot).toBeNull();
    expect(harness.gunboat.active).toBe(true);
    expect(harness.gunboat.spawn()).toBe(false);
    advanceScene(harness.gunboat, 0.9);
    expect(harness.hits).toHaveLength(2);
    expect(harness.gunboat.active).toBe(false);
    harness.gunboat.spawn();
    advanceScene(harness.gunboat, 10.45);
    harness.gunboat.clear();
    advanceScene(harness.gunboat, 1);
    expect(harness.hits).toHaveLength(2);
    harness.gunboat.dispose();
  });

  it('selects an exposed defense when the player is behind cover', async () => {
    await initRapier();
    const harness = sceneHarness({
      getVolleyTargets: () => [
        { id: 'player', kind: 'player', exposed: true },
        { id: 'generator', kind: 'structure', exposed: true },
        { id: 'auto-1', kind: 'turret', exposed: true },
        { id: 'hidden', kind: 'turret', exposed: false },
      ],
      canDamageVolleyTarget: (id) => id !== 'player',
    });
    harness.gunboat.spawn();
    advanceScene(harness.gunboat, 10.45);
    advanceScene(harness.gunboat, 0.9);
    expect(harness.hits).toEqual([
      { id: 'auto-1', amount: 10 },
      { id: 'auto-1', amount: 10 },
    ]);
    harness.gunboat.dispose();
  });

  it('does not launch when every candidate is covered', async () => {
    await initRapier();
    const harness = sceneHarness({ canDamageVolleyTarget: () => false });
    harness.gunboat.spawn();
    advanceScene(harness.gunboat, 10.45);
    expect(harness.gunboat.pendingShellCount).toBe(0);
    expect(harness.hits).toHaveLength(0);
    harness.gunboat.dispose();
  });

  it('warns before launch and a moving player can dodge the captured aim point', async () => {
    await initRapier();
    let target = new THREE.Vector3(0, 5, 0);
    let warnings = 0;
    const harness = sceneHarness({
      getVolleyTargetPosition: () => target,
      onTelegraph: () => warnings++,
    });
    harness.gunboat.spawn();
    for (let i = 0; i < 560; i++) harness.gunboat.fixedUpdate(1 / 60);
    expect(harness.gunboat.telegraphActive).toBe(true);
    expect(warnings).toBe(1);
    expect(harness.gunboat.pendingShellCount).toBe(0);
    for (let i = 0; i < 68; i++) harness.gunboat.fixedUpdate(1 / 60);
    expect(harness.gunboat.pendingShellCount).toBe(2);
    target = new THREE.Vector3(2, 5, 0);
    for (let i = 0; i < 55; i++) harness.gunboat.fixedUpdate(1 / 60);
    expect(harness.hits).toHaveLength(0);
    harness.gunboat.dispose();
  });

  it('reuses a fixed shell/telegraph geometry pool across repeated volleys', async () => {
    await initRapier();
    const harness = sceneHarness();
    const geometries = () => {
      const ids: string[] = [];
      harness.gunboat.group.traverse((o) => {
        if (o instanceof THREE.Line) ids.push(o.geometry.uuid);
      });
      return ids;
    };
    const before = geometries();
    harness.gunboat.spawn();
    for (let i = 0; i < 60 * 25; i++) harness.gunboat.fixedUpdate(1 / 60);
    expect(geometries()).toEqual(before);
    expect(harness.hits.length).toBeGreaterThanOrEqual(6);
    expect(harness.gunboat.pendingShellCount).toBeLessThanOrEqual(2);
    harness.gunboat.dispose();
  });

  it('checks LOS at impact and preserves the launch target snapshot', async () => {
    await initRapier();
    let target = new THREE.Vector3(0, 5, 0);
    const aimed: THREE.Vector3[] = [];
    let covered = false;
    const harness = sceneHarness({
      getVolleyTargetPosition: () => target,
      canDamageVolleyTarget: (_id, _origin, impactTarget) => {
        aimed.push(impactTarget.clone());
        return !covered;
      },
    });
    harness.gunboat.spawn();
    advanceScene(harness.gunboat, 10.45);
    expect(harness.gunboat.pendingShellCount).toBe(2);
    covered = true;
    target = new THREE.Vector3(20, 5, 20);
    advanceScene(harness.gunboat, 0.9);
    expect(harness.hits).toHaveLength(0);
    expect(aimed[0]?.toArray()).toEqual([0, 5, 0]);
    harness.gunboat.dispose();
  });

  it('blocks a shell through a real Rapier cover collider', async () => {
    await initRapier();
    const harness = sceneHarness();
    const blockerBody = harness.physics.createDrivenBody(new THREE.Vector3(-9, 4.5, 7));
    harness.physics.addBoxTo(blockerBody, new THREE.Vector3(3, 3, 3), new THREE.Vector3());
    const blocked = sceneHarness({
      canDamageVolleyTarget: (id, origin, target) => {
        const delta = target.clone().sub(origin);
        const distance = delta.length();
        const hit = harness.physics.raycast(origin, delta.normalize(), distance);
        return !hit || (hit.userData !== undefined && id === 'player');
      },
    });
    blocked.gunboat.spawn();
    advanceScene(blocked.gunboat, 11.35);
    expect(blocked.hits).toHaveLength(0);
    blocked.gunboat.dispose();
    harness.physics.removeBody(blockerBody);
  });

  it('removes colliders and tolerates terminal callback clear', async () => {
    await initRapier();
    const current: { scene: GunboatScene | null } = { scene: null };
    const harness = sceneHarness({
      onEnded: () => current.scene?.clear(),
    });
    const gunboat = harness.gunboat;
    current.scene = gunboat;
    gunboat.spawn();
    const colliders = harness.physics.colliderCount;
    advanceScene(gunboat, 6.45);
    gunboat.damage('weapon', 999);
    gunboat.damage('engine', 999);
    advanceScene(gunboat, 5);
    expect(gunboat.snapshot).toBeNull();
    expect(harness.physics.colliderCount).toBe(colliders - 3);
    gunboat.dispose();
  });

  it('removes disabled subsystem hitboxes while keeping the live hull target', async () => {
    await initRapier();
    const { gunboat, physics } = sceneHarness();
    gunboat.spawn();
    expect(physics.colliderCount).toBe(3);
    gunboat.damage('engine', 160);
    expect(physics.colliderCount).toBe(2);
    expect(gunboat.getTargetPosition('engine')).toBeNull();
    expect(gunboat.getTargetPosition('weapon')).not.toBeNull();
    gunboat.damage('weapon', 120);
    expect(physics.colliderCount).toBe(1);
    expect(gunboat.getTargetPosition('weapon')).toBeNull();
    expect(gunboat.getTargetPosition('hull')).not.toBeNull();
    gunboat.dispose();
    expect(physics.colliderCount).toBe(0);
  });

  it('provides a complete fallback semantic hierarchy and approved muzzle position', () => {
    const visual = buildGunboatModel(stubMaterials());
    visual.root.updateMatrixWorld(true);
    expect(visual.root.userData.authored).toBeUndefined();
    expect(visual.root.getObjectByName('GunboatGunYaw')?.position.toArray()).toEqual([
      0, 3.2, -1.7,
    ]);
    expect(visual.pitch.position.y).toBe(0.4);
    expect(visual.muzzle.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([0, 3.6, -3.5]);
    expect(visual.root.getObjectByName('GunboatRoot')).toBeDefined();
    expect(visual.root.getObjectByName('GunboatMuzzle')).toBe(visual.muzzle);
    expect(visual.root.getObjectByName('WeaponDamageAnchor')).toBe(visual.weaponTarget);
    expect(visual.root.getObjectByName('EngineDamageAnchor')).toBe(visual.engineTarget);
    expect(visual.root.getObjectByName('EngineExhaust')).toBe(visual.engineExhaust);
    expect(visual.root.getObjectByName('WeaponDisabled')).toBe(visual.weaponDisabled);
    expect(visual.root.getObjectByName('EngineDisabled')).toBe(visual.engineDisabled);
  });
  it('approaches, telegraphs, and enters broadside with deterministic volleys', () => {
    let state = createGunboatEncounter('starboard');
    state = advance(state, 5.25);
    expect(state.phase).toBe('telegraph');
    state = advance(state, 1.2);
    expect(state.phase).toBe('broadside');
    state = advance(state, 4);
    expect(state.volleySerial).toBe(1);
  });

  it('stops future volleys when weapon is disabled and retreats', () => {
    let state = createGunboatEncounter();
    state = advance(state, 6.45);
    state = damageGunboatEncounter(state, 'weapon', 999);
    const before = state.volleySerial;
    state = advance(state, 4);
    expect(state.volleySerial).toBe(before);
    expect(state.phase).toBe('ended');
    expect(state.outcome).toBe('escaped');
  });

  it('cancels retreat when the engine is disabled during retreat', () => {
    let state = advance(createGunboatEncounter(), 6.45);
    state = damageGunboatEncounter(state, 'weapon', 999);
    expect(state.phase).toBe('retreat');
    state = damageGunboatEncounter(state, 'engine', 999);
    expect(state.phase).toBe('broadside');
    state = advance(state, 5);
    expect(state.phase).toBe('ended');
    expect(state.outcome).toBe('weapon-and-engine');
  });

  it('ends after both subsystems are disabled and preserves save round trips', () => {
    let state = createGunboatEncounter();
    state = advance(state, 6.45);
    state = damageGunboatEncounter(state, 'weapon', 999);
    state = damageGunboatEncounter(state, 'engine', 999);
    state = advance(state, 5);
    expect(state.phase).toBe('ended');
    expect(state.outcome).toBe('weapon-and-engine');
    expect(restoreGunboatEncounter(serialiseGunboatEncounter(state))).toEqual(state);
  });

  it('kills immediately on hull damage and clamps invalid damage time', () => {
    const state = damageGunboatEncounter(createGunboatEncounter(), 'hull', 9999);
    expect(state.phase).toBe('destroyed');
    expect(state.outcome).toBe('hull');
    expect(stepGunboatEncounter(state, -10)).toEqual(state);
    expect(restoreGunboatEncounter({ phase: 'broadside', hullHealth: Number.NaN })).toMatchObject({
      phase: 'ended',
      outcome: null,
    });
    expect(stepGunboatEncounter(createGunboatEncounter(), 100000).volleySerial).toBeLessThanOrEqual(
      1,
    );
  });
});
