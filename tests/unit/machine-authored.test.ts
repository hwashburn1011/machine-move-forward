import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import type { LoadedModel } from '@/art/ModelLoader';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { Machine } from '@/machine/Machine';
import { DECK_SURFACE_Y, LEVEL_HEIGHT } from '@/game/constants';

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
    const standing = machine.group.localToWorld(new THREE.Vector3(0.8, DECK_SURFACE_Y, -4.464));
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

  it('physically supports the v3 perimeter and both port side stair flights', async () => {
    await initRapier();
    const physics = new PhysicsWorld();
    const machine = new Machine(new THREE.Scene(), physics, stubMaterials());
    const assertPerimeterSupport = () => {
      for (const level of [-2, -1, 0]) {
        for (const at of [
          new THREE.Vector3(
            level === 0 ? 11.5 : 12.5,
            DECK_SURFACE_Y + level * LEVEL_HEIGHT + 0.99,
            0,
          ),
          new THREE.Vector3(
            0,
            DECK_SURFACE_Y + level * LEVEL_HEIGHT + 0.99,
            level === 0 ? 13.5 : 14.5,
          ),
        ]) {
          const label = `level ${level} at ${at.x},${at.z}`;
          expect(physics.capsuleFits(at, 0.34, 0.62), label).toBe(true);
          expect(physics.hasCapsuleSupport(at, 0.34, 0.62), label).toBe(true);
        }
      }
    };

    assertPerimeterSupport();
    for (const level of [-2, -1] as const) {
      for (const z of [0]) {
        const progress = level === -2 ? (z + 3) / 6 : (3 - z) / 6;
        const y = DECK_SURFACE_Y + LEVEL_HEIGHT * level + 1.1 + LEVEL_HEIGHT * progress;
        const at = new THREE.Vector3(-12, y, z);
        expect(physics.capsuleFits(at, 0.34, 0.62), `side stair ${level} fit at ${z}`).toBe(true);
      }
    }
    expect(machine.group.getObjectByName('Nomad side stair lower-middle')).toBeDefined();
    expect(machine.group.getObjectByName('Nomad side stair middle-upper')).toBeDefined();
    expect(machine.group.getObjectByName('Nomad side stair rail lower-middle')).toBeDefined();
    expect(machine.group.getObjectByName('Nomad side stair rail middle-upper')).toBeDefined();
    machine.applyAuthoredDetailModel(
      modelWith('IronNomad_FourLegWalker'),
      modelWith('IronNomad_StaticCollision'),
    );
    expect(machine.group.getObjectByName('Nomad perimeter floor 0 starboard')?.visible).toBe(false);
    assertPerimeterSupport();
    machine.dispose();
    physics.dispose();
  });

  it('walks a capsule up and back down the runtime side flight', async () => {
    await initRapier();
    const physics = new PhysicsWorld();
    const machine = new Machine(new THREE.Scene(), physics, stubMaterials());
    const position = new THREE.Vector3(-12, DECK_SURFACE_Y - LEVEL_HEIGHT * 2 + 1.1, -3.6);
    const character = physics.addCharacter(0.34, 0.62, position);
    for (let i = 0; i < 70; i++) {
      physics.moveCharacter(character, position, new THREE.Vector3(0, -0.02, 0.1), {
        x: 0,
        y: 0,
        z: 0,
      });
      physics.step();
    }
    expect(position.z).toBeGreaterThan(0.8);
    expect(position.y).toBeGreaterThan(DECK_SURFACE_Y - LEVEL_HEIGHT * 2 + 3.2);
    for (let i = 0; i < 70; i++) {
      physics.moveCharacter(character, position, new THREE.Vector3(0, -0.02, -0.1), {
        x: 0,
        y: 0,
        z: 0,
      });
      physics.step();
    }
    expect(position.z).toBeLessThan(-1.8);
    expect(position.y).toBeLessThan(DECK_SURFACE_Y - LEVEL_HEIGHT * 2 + 1.6);
    physics.removeCharacter(character);

    const upperPosition = new THREE.Vector3(-12, DECK_SURFACE_Y - LEVEL_HEIGHT + 1.1 + 0.2, -3.6);
    const upperCharacter = physics.addCharacter(0.34, 0.62, upperPosition);
    for (let i = 0; i < 70; i++) {
      physics.moveCharacter(upperCharacter, upperPosition, new THREE.Vector3(0, -0.02, 0.1), {
        x: 0,
        y: 0,
        z: 0,
      });
      physics.step();
    }
    expect(upperPosition.z).toBeGreaterThan(0.8);
    expect(upperPosition.y).toBeGreaterThan(DECK_SURFACE_Y - LEVEL_HEIGHT + 1.5);
    for (let i = 0; i < 70; i++) {
      physics.moveCharacter(upperCharacter, upperPosition, new THREE.Vector3(0, -0.02, -0.1), {
        x: 0,
        y: 0,
        z: 0,
      });
      physics.step();
    }
    expect(upperPosition.z).toBeLessThan(-1.8);
    physics.removeCharacter(upperCharacter);

    const bypassPosition = new THREE.Vector3(-14, DECK_SURFACE_Y - LEVEL_HEIGHT * 2 + 1.1, -4.0);
    const bypassCharacter = physics.addCharacter(0.34, 0.62, bypassPosition);
    for (let i = 0; i < 110; i++) {
      physics.moveCharacter(bypassCharacter, bypassPosition, new THREE.Vector3(0, -0.02, 0.1), {
        x: 0,
        y: 0,
        z: 0,
      });
      physics.step();
    }
    expect(bypassPosition.z).toBeGreaterThan(4.0);
    expect(bypassPosition.y).toBeGreaterThan(DECK_SURFACE_Y - LEVEL_HEIGHT * 2 + 0.6);
    physics.removeCharacter(bypassCharacter);
    machine.dispose();
    physics.dispose();
  });

  it('keeps the upper gate closed until the gangway is opened', async () => {
    await initRapier();
    const physics = new PhysicsWorld();
    const machine = new Machine(new THREE.Scene(), physics, stubMaterials());
    const crossing = new THREE.Vector3(12, DECK_SURFACE_Y + 1.1, 0);
    expect(physics.capsuleFits(crossing, 0.34, 0.62)).toBe(false);
    machine.setExpeditionGangwayOpen(true);
    expect(physics.capsuleFits(crossing, 0.34, 0.62)).toBe(true);
    const lowerSurface = DECK_SURFACE_Y - LEVEL_HEIGHT * 2;
    expect(physics.capsuleFits(new THREE.Vector3(-15.4, lowerSurface + 1.1, 0), 0.34, 0.62)).toBe(
      false,
    );
    expect(physics.capsuleFits(new THREE.Vector3(0, lowerSurface + 1.1, -15.4), 0.34, 0.62)).toBe(
      false,
    );
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
