import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';

beforeAll(initRapier);

describe('physics helper ownership', () => {
  it('keeps body and collider counts stable across 100 equipment replacements', () => {
    const physics = new PhysicsWorld();
    const half = new THREE.Vector3(0.5, 0.5, 0.5);
    const position = new THREE.Vector3(0, 1, 0);
    let current = physics.addFixedBox(half, position);
    for (let i = 0; i < 100; i++) {
      const next = physics.addFixedBoxRotated(half, position, new THREE.Quaternion());
      physics.removeCollider(current);
      current = next;
      expect(physics.bodyCount).toBe(1);
      expect(physics.colliderCount).toBe(1);
    }
    physics.removeCollider(current);
    expect(physics.bodyCount).toBe(0);
    expect(physics.colliderCount).toBe(0);
    physics.dispose();
  });

  it('retains an explicitly owned shared body after its last shape is removed', () => {
    const physics = new PhysicsWorld();
    const body = physics.createDrivenBody();
    const shape = physics.addBoxTo(body, new THREE.Vector3(1, 1, 1), new THREE.Vector3());
    physics.removeCollider(shape);
    expect(physics.bodyCount).toBe(1);
    expect(body.isValid()).toBe(true);
    physics.removeBody(body);
    expect(physics.bodyCount).toBe(0);
    physics.dispose();
  });
});
