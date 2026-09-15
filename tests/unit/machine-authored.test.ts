import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import type { LoadedModel } from '@/art/ModelLoader';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { Machine } from '@/machine/Machine';

function stubMaterials(): Materials {
  const material = new THREE.MeshStandardMaterial();
  return {
    hull: material,
    hullDark: material,
    bareSteel: material,
    rustedSteel: material,
    rubber: material,
    accent: material,
    hazard: material,
  } as unknown as Materials;
}

function modelWith(...roots: string[]): LoadedModel {
  const scene = new THREE.Group();
  for (const name of roots) {
    const root = new THREE.Group();
    root.name = name;
    root.add(
      new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial()),
    );
    scene.add(root);
  }
  return { scene, clips: [] };
}

describe('authored machine skin replacement', () => {
  it('restores hull collision to the saved journey without carrying the loaded player', async () => {
    await initRapier();
    const physics = new PhysicsWorld();
    const machine = new Machine(new THREE.Scene(), physics, stubMaterials());
    machine.setPose({ heave: 0.1, pitch: 0.04, roll: -0.04 });
    machine.fixedUpdate(0);
    const speed = machine.speed;
    machine.restoreJourneyPose(2713.6375924137337);
    expect(machine.currentPose).toEqual(machine.poseAt(2713.6375924137337));
    const carry = machine.carryFor({ x: 1, y: 15.8, z: -4 });
    expect(Math.hypot(carry.x, carry.y, carry.z)).toBeLessThan(1e-10);
    expect(machine.speed).toBe(speed);
    const floor = machine.group.getObjectByName('Nomad floor 0')!;
    const worldFloor = floor.getWorldPosition(new THREE.Vector3());
    expect(
      physics.world.bodies
        .getAll()
        .some(
          (body) => new THREE.Vector3().copy(body.translation()).distanceTo(worldFloor) < 0.0001,
        ),
    ).toBe(true);
    const standing = machine.group.localToWorld(new THREE.Vector3(0.8, 14.83, -4.464));
    standing.y += 0.99;
    expect(physics.capsuleFits(standing, 0.34, 0.62)).toBe(true);
    expect(physics.hasCapsuleSupport(standing, 0.34, 0.62)).toBe(true);
    machine.dispose();
    physics.dispose();
  });

  it('keeps deck collision aligned with visible floors when a stopped machine leans after damage', async () => {
    await initRapier();
    const physics = new PhysicsWorld();
    const machine = new Machine(new THREE.Scene(), physics, stubMaterials());
    const floor = machine.group.getObjectByName('Nomad floor 0')!;
    const body = physics.world.bodies
      .getAll()
      .find((b) => new THREE.Vector3().copy(b.translation()).distanceTo(floor.position) < 0.001)!;
    expect(body).toBeDefined();
    machine.damage.damage('leg-front-left', 180);
    machine.fixedUpdate(0);
    machine.group.updateMatrixWorld(true);
    expect(machine.group.quaternion.z).not.toBe(0);
    expect(
      new THREE.Vector3()
        .copy(body.translation())
        .distanceTo(floor.getWorldPosition(new THREE.Vector3())),
    ).toBeLessThan(0.0001);
    machine.dispose();
    physics.dispose();
  });

  it('clones the Nomad and restores fallback decks without duplicate collision on reapply', async () => {
    await initRapier();
    const physics = new PhysicsWorld();
    const machine = new Machine(new THREE.Scene(), physics, stubMaterials());
    const model = modelWith('IronNomad_FourLegWalker');
    const collision = modelWith('IronNomad_StaticCollision');
    const before = physics.bodyCount;
    for (let i = 0; i < 2; i++) {
      machine.applyAuthoredDetailModel(model, collision);
      expect(physics.bodyCount).toBe(before + 1);
      expect(machine.group.getObjectByName('Nomad floor 0')?.visible).toBe(false);
      expect(machine.group.getObjectByName('engine')?.visible).toBe(true);
      expect(model.scene.getObjectByName('IronNomad_FourLegWalker')?.parent).toBe(model.scene);
    }
    machine.applyAuthoredDetailModel(modelWith('old-incompatible-hull'));
    expect(physics.bodyCount).toBe(before);
    expect(machine.group.getObjectByName('Nomad floor 0')?.visible).toBe(true);
    expect(machine.group.getObjectByName('authored-machine-details')).toBeUndefined();
    machine.dispose();
    physics.dispose();
  });

  it('disposes procedural geometry without disposing loader-owned source geometry', async () => {
    await initRapier();
    const physics = new PhysicsWorld();
    const scene = new THREE.Scene();
    const materials = stubMaterials();
    const machine = new Machine(scene, physics, materials);
    const model = modelWith('IronNomad_FourLegWalker');
    const sourceMesh = model.scene.getObjectByName('IronNomad_FourLegWalker')
      ?.children[0] as THREE.Mesh;
    let sourceDisposed = 0;
    sourceMesh.geometry.addEventListener('dispose', () => sourceDisposed++);
    const fallback = machine.group.getObjectByName('engine') as THREE.Mesh;
    let fallbackDisposed = 0;
    fallback.geometry.addEventListener('dispose', () => fallbackDisposed++);

    machine.applyAuthoredDetailModel(model);
    machine.dispose();
    machine.dispose();

    expect(sourceDisposed).toBe(0);
    expect(fallbackDisposed).toBe(1);
    expect(scene.getObjectById(machine.group.id)).toBeUndefined();

    physics.dispose();
    for (const material of Object.values(materials)) material?.dispose();
  });
});
