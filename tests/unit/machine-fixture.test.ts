import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { DECK_SURFACE_Y } from '@/game/constants';
import { Machine, projectEquipmentCells } from '@/machine/Machine';
import { transformPoint } from '@/machine/MachineBody';

function stubMaterials(): { materials: Materials; material: THREE.MeshStandardMaterial } {
  const material = new THREE.MeshStandardMaterial();
  const materials = Object.fromEntries(
    [
      'hull',
      'hullDark',
      'bareSteel',
      'rustedSteel',
      'rubber',
      'accent',
      'hazard',
      'emissiveWarn',
    ].map((name) => [name, material]),
  ) as unknown as Materials;
  return { materials, material };
}

describe('machine fixture boxes', () => {
  it('reserves build cells, follows the hull, and toggles collision without replacement', async () => {
    await initRapier();
    const physics = new PhysicsWorld();
    const { materials, material } = stubMaterials();
    const machine = new Machine(new THREE.Scene(), physics, materials);
    const half = new THREE.Vector3(0.45, 0.72, 0.28);
    const center = new THREE.Vector3(0.65, DECK_SURFACE_Y + 0.72, -5.8);
    const bodyCount = physics.bodyCount;
    const colliderCount = physics.colliderCount;
    const collider = machine.addFixtureBox(half, center);
    const fixtureBody = collider.parent()!;

    expect(physics.bodyCount).toBe(bodyCount + 1);
    expect(physics.colliderCount).toBe(colliderCount + 1);
    expect(physics.getUserData(collider)).toEqual({ kind: 'machine' });
    for (const cell of projectEquipmentCells([{ half, center }])) {
      expect(machine.equipmentCells).toContainEqual(cell);
    }

    physics.step();
    const rayOrigin = center.clone().add(new THREE.Vector3(0, 0, 2));
    const towardFixture = new THREE.Vector3(0, 0, -1);
    expect(
      physics.raycast(
        rayOrigin,
        towardFixture,
        4,
        undefined,
        (candidate) => candidate === collider,
      ),
    ).not.toBeNull();
    collider.setEnabled(false);
    physics.step();
    expect(
      physics.raycast(
        rayOrigin,
        towardFixture,
        4,
        undefined,
        (candidate) => candidate === collider,
      ),
    ).toBeNull();
    expect(physics.bodyCount).toBe(bodyCount + 1);
    expect(physics.colliderCount).toBe(colliderCount + 1);

    machine.setPose({ heave: 0.1, pitch: 0.01, roll: -0.01 });
    machine.fixedUpdate(0);
    const expected = transformPoint(center, machine.currentPose);
    expect(fixtureBody.translation().x).toBeCloseTo(expected.x, 5);
    expect(fixtureBody.translation().y).toBeCloseTo(expected.y, 5);
    expect(fixtureBody.translation().z).toBeCloseTo(expected.z, 5);

    machine.dispose();
    expect(() => machine.dispose()).not.toThrow();
    physics.dispose();
    material.dispose();
  });

  it('rejects invalid fixtures before creating physics or build-grid state', async () => {
    await initRapier();
    const physics = new PhysicsWorld();
    const { materials, material } = stubMaterials();
    const machine = new Machine(new THREE.Scene(), physics, materials);
    const bodies = physics.bodyCount;
    const colliders = physics.colliderCount;
    const cells = machine.equipmentCells.map((cell) => ({ ...cell }));
    expect(() =>
      machine.addFixtureBox(
        new THREE.Vector3(0, 0.5, 0.5),
        new THREE.Vector3(0, DECK_SURFACE_Y, 0),
      ),
    ).toThrow(RangeError);
    expect(physics.bodyCount).toBe(bodies);
    expect(physics.colliderCount).toBe(colliders);
    expect(machine.equipmentCells).toEqual(cells);

    machine.dispose();
    physics.dispose();
    material.dispose();
  });
});
