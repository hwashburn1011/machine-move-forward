import { beforeAll, expect, it } from 'vitest';
import * as THREE from 'three';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';

beforeAll(initRapier);

it('skips contacts between posed hull bodies without losing character support or ray hits', () => {
  const physics = new PhysicsWorld();
  try {
    const hull = physics.createDrivenBody();
    const equipment = physics.createDrivenBody();
    const deck = physics.addBoxTo(
      hull,
      new THREE.Vector3(4, 0.2, 4),
      new THREE.Vector3(0, -0.2, 0),
    );
    const overlap = physics.addTrimeshTo(
      equipment,
      new Float32Array([-3, -0.1, -3, 3, -0.1, -3, 3, -0.1, 3, -3, -0.1, 3]),
      new Uint32Array([0, 2, 1, 0, 3, 2]),
    );
    const character = physics.addCharacter(0.3, 0.6, new THREE.Vector3(0, 0.92, 0));
    const position = new THREE.Vector3(0, 0.92, 0);
    let grounded = false;
    for (let i = 0; i < 60; i++) {
      physics.step();
      grounded = physics.moveCharacter(character, position, new THREE.Vector3(0.02, -0.04, 0), {
        x: 0,
        y: 0,
        z: 0,
      });
    }
    let internalContacts = 0;
    physics.world.contactPair(deck, overlap, () => internalContacts++);
    expect(internalContacts).toBe(0);
    expect(grounded).toBe(true);
    expect(position.x).toBeGreaterThan(1.17);
    expect(position.x).toBeLessThanOrEqual(1.21);
    expect(position.y).toBeGreaterThanOrEqual(0.9);
    expect(position.y).toBeLessThan(0.94);
    expect(
      physics.raycast(new THREE.Vector3(2, 2, 0), new THREE.Vector3(0, -1, 0), 4)?.collider,
    ).toBe(deck);
    physics.removeCharacter(character);
    physics.removeBody(hull);
    physics.removeBody(equipment);
    expect(physics.bodyCount).toBe(0);
  } finally {
    physics.dispose();
  }
});
