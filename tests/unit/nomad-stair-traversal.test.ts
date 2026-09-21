import { beforeAll, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { buildIronNomad } from '@/machine/IronNomadGeometry';

beforeAll(initRapier);

function physicsWithNomad(): PhysicsWorld {
  const material = new THREE.MeshBasicMaterial();
  const materials = new Proxy({}, { get: () => material }) as Materials;
  const build = buildIronNomad(materials);
  const physics = new PhysicsWorld();
  for (const collider of build.colliders) {
    const rotation =
      collider.rotX === undefined
        ? undefined
        : new THREE.Quaternion().setFromEuler(new THREE.Euler(collider.rotX, 0, 0));
    const body = physics.createDrivenBody(collider.center, rotation);
    physics.addBoxTo(body, collider.half, new THREE.Vector3());
  }
  physics.step();
  material.dispose();
  return physics;
}

function walk(physics: PhysicsWorld, start: THREE.Vector3, deltaZ: number): THREE.Vector3 {
  const character = physics.addCharacter(0.34, 0.65, start);
  const position = start.clone();
  for (let i = 0; i < 150; i++) {
    physics.moveCharacter(character, position, new THREE.Vector3(0, -0.03, deltaZ), {
      x: 0,
      y: 0,
      z: 0,
    });
    physics.step();
  }
  physics.removeCharacter(character);
  return position;
}

function box(
  physics: PhysicsWorld,
  center: THREE.Vector3,
  half: THREE.Vector3,
  rotation?: THREE.Quaternion,
): void {
  const body = physics.createDrivenBody(center, rotation);
  physics.addBoxTo(body, half, new THREE.Vector3());
}

function obstacleCourse(options: {
  steepRamp?: boolean;
  ceiling?: boolean;
  wall?: boolean;
}): PhysicsWorld {
  const physics = new PhysicsWorld();
  box(physics, new THREE.Vector3(0, -0.09, -1.5), new THREE.Vector3(2, 0.09, 2.5));
  if (options.wall) box(physics, new THREE.Vector3(0, 1, 0), new THREE.Vector3(2, 1, 0.1));
  else {
    const angle = options.steepRamp ? Math.PI / 3 : Math.atan2(3, 4);
    const run = options.steepRamp ? 2 : 4;
    const rise = Math.tan(angle) * run;
    box(
      physics,
      new THREE.Vector3(0, rise / 2, 0),
      new THREE.Vector3(1, 0.06, Math.hypot(run, rise) / 2),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-angle, 0, 0)),
    );
    if (options.ceiling)
      box(physics, new THREE.Vector3(0, 2.15, 0), new THREE.Vector3(1.5, 0.1, 2));
  }
  physics.step();
  return physics;
}

it('traverses both Nomad stair ramps with normal grounded gravity', () => {
  const physics = physicsWithNomad();
  const lowerToMiddle = walk(physics, new THREE.Vector3(-2, 9.9, -3.5), 0.05);
  const middleToUpper = walk(physics, new THREE.Vector3(-2, 13.5, -3.5), 0.05);
  const upperToMiddle = walk(physics, new THREE.Vector3(-2, 17.1, 3.5), -0.05);

  expect(lowerToMiddle.z).toBeGreaterThan(2.2);
  expect(lowerToMiddle.y).toBeGreaterThan(12);
  expect(middleToUpper.z).toBeGreaterThan(2.2);
  expect(middleToUpper.y).toBeGreaterThan(15.6);
  expect(upperToMiddle.z).toBeLessThan(-2.2);
  expect(upperToMiddle.y).toBeGreaterThan(12.5);
  physics.dispose();
});

it('does not turn the uphill retry into wall or steep-slope climbing', () => {
  const wall = obstacleCourse({ wall: true });
  const wallResult = walk(wall, new THREE.Vector3(0, 0.99, -1), 0.05);
  expect(wallResult.z).toBeLessThan(-0.4);
  expect(wallResult.y).toBeLessThan(1.1);
  wall.dispose();

  const steep = obstacleCourse({ steepRamp: true });
  const steepResult = walk(steep, new THREE.Vector3(0, 0.99, -1.8), 0.05);
  expect(steepResult.z).toBeLessThan(-0.8);
  expect(steepResult.y).toBeLessThan(1.4);
  steep.dispose();
});

it('does not bypass a low ceiling while retrying a climbable slope', () => {
  const physics = obstacleCourse({ ceiling: true });
  const result = walk(physics, new THREE.Vector3(0, 0.99, -2.8), 0.05);
  expect(result.z).toBeLessThan(-1.3);
  expect(result.y).toBeLessThan(1.15);
  physics.dispose();
});
