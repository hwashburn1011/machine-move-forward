import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CaretakerActor } from '@/companion/CaretakerActor';
import type { CaretakerWaypoint } from '@/companion/CaretakerPortals';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';

describe('CaretakerActor', () => {
  it('is carried while idle, falls under gravity, moves physically and disables its body on reset', async () => {
    await initRapier();
    const physics = new PhysicsWorld();
    physics.addFixedBox(new THREE.Vector3(8, 0.1, 8), new THREE.Vector3(0, -0.1, 0));
    physics.step();
    const model = new THREE.Group();
    const wheel = new THREE.Group();
    wheel.name = 'L12WheelL0';
    model.add(wheel);
    const motions: boolean[] = [];
    const actor = new CaretakerActor(
      {
        physics,
        machine: { carryFor: () => ({ x: 0.01, y: 0, z: 0 }) },
        routeFor: (_from: THREE.Vector3, target: THREE.Vector3) => [target.clone()],
        onMotion: ({ moving }: { moving: boolean }) => motions.push(moving),
      } as never,
      model,
    );
    const bodiesBeforeSpawn = physics.bodyCount;
    actor.spawn(new THREE.Vector3(0, 0, 0));
    for (let i = 0; i < 60; i++) {
      actor.fixedUpdate(1 / 60, null);
      physics.step();
    }
    expect(actor.position.x).toBeCloseTo(0.6, 3);
    expect(actor.position.y).toBeCloseTo(0, 1);
    expect(actor.status).toBe('waiting');

    const target = new THREE.Vector3(actor.position.x, 0, 2);
    for (let i = 0; i < 150 && !actor.reached(target); i++) {
      target.x += 0.01;
      actor.fixedUpdate(1 / 60, target);
      physics.step();
    }
    expect(actor.reached(target)).toBe(true);
    expect(wheel.rotation.x).toBeGreaterThan(0);
    expect(motions).toContain(true);

    actor.reset();
    expect(actor.status).toBe('despawned');
    expect(model.visible).toBe(false);
    expect(physics.bodyCount).toBe(bodiesBeforeSpawn);
    actor.dispose();
    expect(physics.bodyCount).toBe(bodiesBeforeSpawn - 1);
    expect(() => actor.dispose()).not.toThrow();
    expect(physics.bodyCount).toBe(bodiesBeforeSpawn - 1);
  });

  it('never reports a null or incomplete route as reached', async () => {
    await initRapier();
    const physics = new PhysicsWorld();
    const actor = new CaretakerActor({
      physics,
      machine: { carryFor: () => ({ x: 0, y: 0, z: 0 }) },
      routeFor: () => null,
    } as never);
    actor.spawn(new THREE.Vector3(0, 2, 0));
    const target = new THREE.Vector3(2, 2, 0);
    expect(actor.canReach(target)).toBe(false);
    actor.fixedUpdate(1 / 60, target);
    expect(actor.status).toBe('waiting');
    expect(actor.reached(target)).toBe(false);
    actor.dispose();
  });

  it('reaches a clear service point without steering around an obstacle beyond it', async () => {
    await initRapier();
    const physics = new PhysicsWorld();
    physics.addFixedBox(new THREE.Vector3(6, 0.1, 6), new THREE.Vector3(0, -0.1, 0));
    // The obstacle is physically clear of the actor at the goal, but lies inside
    // the old fixed 1.6 m probe and represents the station being serviced.
    physics.addFixedBox(new THREE.Vector3(0.8, 0.8, 0.8), new THREE.Vector3(0, 0.8, 2.2));
    physics.step();
    const actor = new CaretakerActor({
      physics,
      machine: { carryFor: () => ({ x: 0, y: 0, z: 0 }) },
      routeFor: (_from: THREE.Vector3, target: THREE.Vector3) => [target.clone()],
    } as never);
    actor.spawn(new THREE.Vector3(0, 0, 0));
    const target = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < 180 && !actor.reached(target); i++) {
      actor.fixedUpdate(1 / 60, target);
      physics.step();
    }
    expect(actor.reached(target)).toBe(true);
    expect(Math.abs(actor.position.x)).toBeLessThan(0.15);
    actor.dispose();
  });

  it('drops a cached route and replans immediately when the build graph version changes', async () => {
    await initRapier();
    const physics = new PhysicsWorld();
    physics.addFixedBox(new THREE.Vector3(6, 0.1, 6), new THREE.Vector3(0, -0.1, 0));
    physics.step();
    let version = 0;
    let calls = 0;
    const actor = new CaretakerActor({
      physics,
      machine: { carryFor: () => ({ x: 0, y: 0, z: 0 }) },
      routeVersion: () => version,
      routeFor: (_from: THREE.Vector3, target: THREE.Vector3) => {
        calls++;
        return [target.clone()];
      },
    } as never);
    actor.spawn(new THREE.Vector3(0, 0, 0));
    const target = new THREE.Vector3(0, 0, 2);
    actor.fixedUpdate(1 / 60, target);
    expect(calls).toBe(1);
    actor.fixedUpdate(1 / 60, target);
    expect(calls).toBe(1);
    version++;
    actor.fixedUpdate(1 / 60, target);
    expect(calls).toBe(2);
    actor.dispose();
  });

  it('commits portal waypoints while target drift waits for the portal exit', async () => {
    await initRapier();
    const physics = new PhysicsWorld();
    physics.addFixedBox(new THREE.Vector3(6, 0.1, 6), new THREE.Vector3(0, -0.1, 0));
    physics.step();
    let calls = 0;
    const routeFor = (_from: THREE.Vector3, target: THREE.Vector3): CaretakerWaypoint[] => {
      calls++;
      const entry = new THREE.Vector3(0, 0, 0.5) as CaretakerWaypoint;
      entry.portalId = 'nomad:-1:up';
      const exit = new THREE.Vector3(0, 0, 1) as CaretakerWaypoint;
      exit.portalId = entry.portalId;
      exit.portalExit = true;
      return [entry, exit, target.clone() as CaretakerWaypoint];
    };
    const actor = new CaretakerActor({
      physics,
      machine: { carryFor: () => ({ x: 0, y: 0, z: 0 }) },
      routeFor,
    } as never);
    actor.spawn(new THREE.Vector3(0, 0, 0));
    actor.fixedUpdate(1 / 60, new THREE.Vector3(0, 0, 2));
    physics.step();
    actor.fixedUpdate(1 / 60, new THREE.Vector3(0, 0, 3));
    expect(calls).toBe(1);
    actor.fixedUpdate(1 / 60, null);
    expect(actor.status).toBe('waiting');
    actor.dispose();
  });

  it('does not consume a portal exit at the ordinary half-metre tolerance', () => {
    const handle = {
      collider: { setEnabled: () => undefined },
      body: {
        setTranslation: () => undefined,
        setNextKinematicTranslation: () => undefined,
      },
    } as never;
    let calls = 0;
    const physics = {
      addCharacter: () => handle,
      removeCharacter: () => undefined,
      moveCharacter: () => false,
      raycast: () => null,
    } as never;
    const actor = new CaretakerActor({
      physics,
      machine: { carryFor: () => ({ x: 0, y: 0, z: 0 }) },
      routeFor: (_from: THREE.Vector3, target: THREE.Vector3): CaretakerWaypoint[] => {
        calls++;
        const exit = new THREE.Vector3(0, 0, 0.45) as CaretakerWaypoint;
        exit.portalId = 'nomad:exit';
        exit.precise = true;
        return [exit, target.clone() as CaretakerWaypoint];
      },
    } as never);
    actor.spawn(new THREE.Vector3(0, 0, 0));
    actor.fixedUpdate(1 / 60, new THREE.Vector3(0, 0, 2));
    actor.fixedUpdate(1 / 60, new THREE.Vector3(0, 0, 3));
    expect(calls).toBe(1);
    actor.dispose();
  });
});
