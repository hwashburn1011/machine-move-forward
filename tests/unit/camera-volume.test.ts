import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { PlayerCamera, cameraCollisionRadius } from '@/player/PlayerCamera';
import type { InputManager } from '@/core/input/InputManager';

beforeAll(async () => {
  await initRapier();
});

describe('camera obstruction volume', () => {
  it('validates the final interpolated camera when a wall appears after its fixed step', () => {
    const physics = new PhysicsWorld();
    physics.step();
    const input = {
      consumeLook: () => ({ x: 0, y: 0 }),
      isDown: () => false,
    } as unknown as InputManager;
    const camera = new PlayerCamera(2.4, { hipFov: 80 });
    camera.fixedUpdate(1 / 60, input, new THREE.Vector3(0, 1, 0), physics);
    camera.update(1, input);
    const previousZ = camera.camera.position.z;
    physics.addFixedBox(new THREE.Vector3(2, 2, 0.1), new THREE.Vector3(0, 1, 1.5));
    physics.step();
    camera.update(0.5, input);
    const radius = cameraCollisionRadius(
      camera.camera.near,
      camera.camera.fov,
      camera.camera.aspect,
    );
    expect(camera.camera.position.z).toBeLessThan(previousZ);
    expect(camera.camera.position.z + radius).toBeLessThan(1.4);
    expect(physics.overlapsSphere(camera.camera.position, radius)).toBe(false);
    physics.dispose();
  });
  it('catches an off-axis beam that a center ray misses', () => {
    const physics = new PhysicsWorld();
    physics.addFixedBox(new THREE.Vector3(0.12, 1, 0.12), new THREE.Vector3(0.3, 0, -2));
    physics.step();
    const origin = new THREE.Vector3(0, 0, 0);
    const direction = new THREE.Vector3(0, 0, -1);
    expect(physics.raycast(origin, direction, 4)).toBeNull();
    expect(physics.sweepSphere(origin, direction, 4, 0.4)).not.toBeNull();
    physics.dispose();
  });

  it('reports initial overlap at zero and respects excluded colliders', () => {
    const physics = new PhysicsWorld();
    const obstacle = physics.addFixedBox(new THREE.Vector3(1, 1, 1), new THREE.Vector3(0, 0, 0));
    physics.step();
    const origin = new THREE.Vector3(0, 0, 0);
    expect(physics.sweepSphere(origin, new THREE.Vector3(0, 0, -1), 2, 0.3)?.distance).toBe(0);
    expect(physics.sweepSphere(origin, new THREE.Vector3(0, 0, -1), 2, 0.3, obstacle)).toBeNull();
    physics.dispose();
  });

  it('ignores sensor colliders while retaining solid blockers', () => {
    const physics = new PhysicsWorld();
    const sensorBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const sensor = physics.world.createCollider(
      RAPIER.ColliderDesc.ball(0.8).setSensor(true),
      sensorBody,
    );
    physics.addFixedBox(new THREE.Vector3(0.3, 0.3, 0.3), new THREE.Vector3(0, 0, -2));
    physics.step();
    const hit = physics.sweepSphere(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
      4,
      0.2,
    );
    expect(hit?.collider).not.toBe(sensor);
    expect(hit).not.toBeNull();
    physics.dispose();
  });

  it('expands the obstruction envelope as the near-plane radius grows', () => {
    const physics = new PhysicsWorld();
    physics.addFixedBox(new THREE.Vector3(0.08, 0.3, 0.08), new THREE.Vector3(0.28, 0, -2));
    physics.step();
    const origin = new THREE.Vector3(0, 0, 0);
    const direction = new THREE.Vector3(0, 0, -1);
    expect(physics.sweepSphere(origin, direction, 4, 0.1)).toBeNull();
    expect(physics.sweepSphere(origin, direction, 4, 0.35)).not.toBeNull();
    physics.dispose();
  });

  it('sees a blocker introduced between fixed queries after the next step', () => {
    const physics = new PhysicsWorld();
    const origin = new THREE.Vector3(0, 0, 0);
    const direction = new THREE.Vector3(0, 0, -1);
    physics.step();
    expect(physics.sweepSphere(origin, direction, 4, 0.25)).toBeNull();
    physics.addFixedBox(new THREE.Vector3(0.4, 0.4, 0.2), new THREE.Vector3(0, 0, -2));
    physics.step();
    expect(physics.sweepSphere(origin, direction, 4, 0.25)).not.toBeNull();
    physics.dispose();
  });
});
