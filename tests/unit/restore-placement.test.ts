import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { resolveRestorePlacement, type RestorePoint } from '@/player/RestorePlacement';

beforeAll(initRapier);

describe('PhysicsWorld capsule fit', () => {
  it('queries newly inserted colliders immediately and ignores sensors/self', () => {
    const physics = new PhysicsWorld();
    const floor = physics.addFixedBox(new THREE.Vector3(5, 0.1, 5), new THREE.Vector3(0, -0.1, 0));
    const player = physics.addCharacter(0.34, 0.62, new THREE.Vector3(0, 0.96, 0));
    expect(physics.capsuleFits(new THREE.Vector3(0, 0.96, 0), 0.34, 0.62, player.collider)).toBe(
      true,
    );

    const obstacle = physics.addFixedBox(
      new THREE.Vector3(0.5, 1, 0.5),
      new THREE.Vector3(0, 1, 0),
    );
    expect(physics.capsuleFits(new THREE.Vector3(0, 0.96, 0), 0.34, 0.62, player.collider)).toBe(
      false,
    );
    obstacle.setSensor(true);
    expect(physics.capsuleFits(new THREE.Vector3(0, 0.96, 0), 0.34, 0.62, player.collider)).toBe(
      true,
    );

    physics.removeCharacter(player);
    physics.removeCollider(obstacle);
    physics.removeCollider(floor);
    physics.dispose();
  });

  it('treats a resting capsule as fitting but rejects the measured embedded pose', () => {
    const physics = new PhysicsWorld();
    physics.addFixedBox(new THREE.Vector3(5, 0.1, 5), new THREE.Vector3(0, -0.1, 0));
    physics.addFixedBox(
      new THREE.Vector3(1.875, 0.9166667, 2.12),
      new THREE.Vector3(3.375, 15.7466667, -4.48),
    );
    expect(physics.capsuleFits(new THREE.Vector3(0, 0.96, 0), 0.34, 0.62)).toBe(true);
    expect(physics.hasCapsuleSupport(new THREE.Vector3(0, 0.96, 0), 0.34, 0.62)).toBe(true);
    expect(
      physics.capsuleFits(new THREE.Vector3(1.315109974, 15.804595516, -4.464025578), 0.34, 0.62),
    ).toBe(false);
    physics.dispose();
  });

  it('sees moved and disabled colliders without stepping the world', () => {
    const physics = new PhysicsWorld();
    physics.addFixedBox(new THREE.Vector3(5, 0.1, 5), new THREE.Vector3(0, -0.1, 0));
    const body = physics.createKinematicBody(new THREE.Vector3(4, 1, 0));
    const obstacle = physics.addBoxTo(body, new THREE.Vector3(0.5, 1, 0.5), new THREE.Vector3());
    const player = physics.addCharacter(0.34, 0.62, new THREE.Vector3(0, 0.96, 0));
    body.setTranslation({ x: 0, y: 1, z: 0 }, true);
    expect(physics.capsuleFits(new THREE.Vector3(0, 0.96, 0), 0.34, 0.62, player.collider)).toBe(
      false,
    );
    // The immediate setTranslation is already visible to the query; no
    // simulation step is needed (or allowed) to update the pose.
    expect(body.translation().x).toBe(0);
    obstacle.setEnabled(false);
    expect(physics.capsuleFits(new THREE.Vector3(0, 0.96, 0), 0.34, 0.62, player.collider)).toBe(
      true,
    );
    physics.removeCharacter(player);
    physics.removeBody(body);
    physics.dispose();
  });
});

describe('resolveRestorePlacement', () => {
  const origin: RestorePoint = { x: 0, y: 10, z: 0 };

  it('preserves a valid position exactly', () => {
    const point = { x: 1.315109974, y: 15.804595516, z: -4.464025578 };
    expect(
      resolveRestorePlacement({
        position: point,
        capsuleFits: () => true,
        hasDownwardSupport: () => true,
      }),
    ).toEqual(point);
  });

  it('chooses the nearest deterministic supported same-deck candidate', () => {
    const result = resolveRestorePlacement({
      position: origin,
      capsuleFits: (p) => Math.abs(p.x) > 0.1 || Math.abs(p.z) > 0.1,
      hasDownwardSupport: (p) => p.y === origin.y && p.z >= 0,
      maxHorizontalDistance: 1,
      step: 0.25,
    });
    expect(result).toEqual({ x: -0.25, y: 10, z: 0 });
  });

  it('rejects invalid saves and bounded searches with no supported landing', () => {
    expect(
      resolveRestorePlacement({
        position: { x: Number.NaN, y: 0, z: 0 },
        capsuleFits: () => true,
        hasDownwardSupport: () => true,
      }),
    ).toBeNull();
    expect(
      resolveRestorePlacement({
        position: origin,
        capsuleFits: () => false,
        hasDownwardSupport: () => true,
        maxHorizontalDistance: 2,
      }),
    ).toBeNull();
  });

  it('recovers around a real overhead obstacle onto the nearest supported deck point', () => {
    const physics = new PhysicsWorld();
    physics.addFixedBox(new THREE.Vector3(5, 0.1, 5), new THREE.Vector3(0, -0.1, 0));
    physics.addFixedBox(new THREE.Vector3(0.6, 1, 0.6), new THREE.Vector3(0, 1, 0));
    const result = resolveRestorePlacement({
      position: { x: 0, y: 0.96, z: 0 },
      capsuleFits: (p) => physics.capsuleFits(new THREE.Vector3(p.x, p.y, p.z), 0.34, 0.62),
      hasDownwardSupport: (p) =>
        physics.hasCapsuleSupport(new THREE.Vector3(p.x, p.y, p.z), 0.34, 0.62),
      maxHorizontalDistance: 2,
      step: 0.25,
    });
    expect(result).not.toBeNull();
    expect(Math.hypot(result!.x, result!.z)).toBeLessThanOrEqual(2 + 1e-6);
    expect(result!.x === 0 && result!.z === 0).toBe(false);
    expect(
      physics.capsuleFits(new THREE.Vector3(result!.x, result!.y, result!.z), 0.34, 0.62),
    ).toBe(true);
    expect(
      physics.hasCapsuleSupport(new THREE.Vector3(result!.x, result!.y, result!.z), 0.34, 0.62),
    ).toBe(true);
    physics.dispose();
  });

  it('rejects a supported-looking candidate over a real deck gap', () => {
    const physics = new PhysicsWorld();
    physics.addFixedBox(new THREE.Vector3(0.45, 0.1, 2), new THREE.Vector3(-1.1, -0.1, 0));
    physics.addFixedBox(new THREE.Vector3(0.45, 0.1, 2), new THREE.Vector3(1.1, -0.1, 0));
    physics.addFixedBox(new THREE.Vector3(0.3, 1, 0.3), new THREE.Vector3(0, 1, 0));
    const result = resolveRestorePlacement({
      position: { x: 0, y: 0.96, z: 0 },
      capsuleFits: (p) => physics.capsuleFits(new THREE.Vector3(p.x, p.y, p.z), 0.34, 0.62),
      hasDownwardSupport: (p) =>
        physics.hasCapsuleSupport(new THREE.Vector3(p.x, p.y, p.z), 0.34, 0.62),
      maxHorizontalDistance: 0.5,
      step: 0.25,
    });
    expect(result).toBeNull();
    physics.dispose();
  });
});
