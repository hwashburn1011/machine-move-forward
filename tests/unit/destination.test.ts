import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DECK_SURFACE_Y } from '@/game/constants';
import { Destination } from '@/story/Destination';
import { RELAY_FOUNDRY, WRECK_ONE } from '@/data/story';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS } from '@/game/constants';

describe('Destination', () => {
  it('reconfigures definition and Rapier body without leaving old colliders or pickup visuals', async () => {
    await initRapier();
    const physics = new PhysicsWorld();
    const scene = new THREE.Scene();
    const model = new THREE.Group();
    const oldGyro = new THREE.Group();
    oldGyro.name = 'CourseGyro';
    model.add(oldGyro);
    const destination = new Destination({
      scene,
      physics,
      model,
      definition: WRECK_ONE,
      arrivalDistance: 700,
    });
    destination.setActive(true);
    destination.setDocked(true);
    destination.syncProgress({ journalsRead: [], uniqueIds: ['course-gyro'] });
    expect(oldGyro.visible).toBe(false);
    destination.setActive(false);
    expect(destination.configure(RELAY_FOUNDRY)).toBe(true);
    expect(destination.root.position.x).toBe(15);
    destination.setActive(true);
    destination.setDocked(true);
    expect(
      destination.interactables.some((item) => item.id === 'relay-foundry-salvage-controller'),
    ).toBe(true);
    destination.syncProgress({
      journalsRead: [],
      uniqueIds: ['salvage-controller', 'tracking-servo'],
    });
    expect(destination.interactables.some((item) => item.kind === 'unique')).toBe(false);
    destination.dispose();
    physics.step();
    expect(scene.children).not.toContain(destination.root);
    physics.dispose();
  });
  it('scrolls by absolute distance until docking pins the wreck at the machine', () => {
    const scene = new THREE.Scene();
    const destination = new Destination({ scene, arrivalDistance: 700 });
    destination.fixedUpdate(650);
    expect(destination.root.position.z).toBe(-50);
    destination.setActive(true);
    destination.setDocked(true);
    destination.fixedUpdate(702);
    expect(destination.root.position.x).toBe(14);
    expect(destination.root.position.y).toBe(DECK_SURFACE_Y);
    expect(destination.root.position.z).toBe(0);
    destination.dispose();
    expect(scene.children).not.toContain(destination.root);
  });

  it('keeps the gangway disabled until docking and exposes safe containment checks', () => {
    const destination = new Destination({ scene: new THREE.Scene(), arrivalDistance: 700 });
    destination.fixedUpdate(700);
    expect(destination.gangwayEnabled).toBe(false);
    expect(destination.root.visible).toBe(false);
    expect(destination.interactables).toHaveLength(0);
    expect(destination.containsPlayer(new THREE.Vector3(12, DECK_SURFACE_Y + 1, 0))).toBe(false);
    expect(destination.containsPlayer(new THREE.Vector3(0, DECK_SURFACE_Y + 1, 0))).toBe(false);
    destination.setActive(true);
    expect(destination.interactables).toHaveLength(0);
    destination.setDocked(true);
    expect(destination.gangwayEnabled).toBe(true);
    expect(destination.containsPlayer(new THREE.Vector3(12, DECK_SURFACE_Y + 1, 0))).toBe(true);
    expect(destination.containsPlayer(new THREE.Vector3(7.7, DECK_SURFACE_Y + 0.5, 0))).toBe(true);
    destination.dispose();
  });

  it('keeps interaction positions tied to the docked set-piece', () => {
    const destination = new Destination({ scene: new THREE.Scene(), arrivalDistance: 700 });
    expect(destination.interactables).toHaveLength(0);
    destination.setActive(true);
    destination.setDocked(true);
    const before = destination.interactables[0]?.position.z;
    destination.fixedUpdate(650);
    expect(destination.root.position.z).toBe(0);
    expect(destination.interactables[0]?.position.z).toBeCloseTo(before ?? 0, 10);
    destination.dispose();
  });

  it('requires activation before docking and preserves progress across reactivation', () => {
    const destination = new Destination({ scene: new THREE.Scene(), arrivalDistance: 700 });
    destination.setDocked(true);
    expect(destination.docked).toBe(false);
    expect(destination.gangwayEnabled).toBe(false);

    destination.setActive(true);
    destination.setDocked(true);
    expect(destination.interactables.some((item) => item.kind === 'unique')).toBe(true);
    destination.syncProgress({
      uniqueCollected: true,
      journalsRead: ['wreck-one-journal-cargo'],
    });
    expect(destination.interactables.some((item) => item.kind === 'unique')).toBe(false);
    expect(
      destination.interactables.find((item) => item.id === 'wreck-one-journal-cargo')?.label,
    ).toMatch(/^Reread /);

    destination.setActive(false);
    expect(destination.docked).toBe(false);
    expect(destination.interactables).toHaveLength(0);
    destination.setActive(true);
    destination.setDocked(true);
    expect(destination.interactables.some((item) => item.kind === 'unique')).toBe(false);
    destination.dispose();
  });

  it('syncs CourseGyro scene visibility with collected progress across reactivation', () => {
    const scene = new THREE.Scene();
    const model = new THREE.Group();
    const gyro = new THREE.Group();
    gyro.name = 'CourseGyro';
    model.add(gyro);
    const destination = new Destination({ scene, model, arrivalDistance: 700 });

    destination.setActive(true);
    destination.setDocked(true);
    expect(gyro.visible).toBe(true);

    destination.syncProgress({ uniqueCollected: true, journalsRead: [] });
    expect(gyro.visible).toBe(false);

    destination.setActive(false);
    destination.syncProgress({ uniqueCollected: false, journalsRead: [] });
    destination.setActive(true);
    destination.setDocked(true);
    expect(gyro.visible).toBe(true);
    destination.dispose();
  });

  it('lets a real character controller cross the enabled gangway into the wreck', async () => {
    await initRapier();
    const physics = new PhysicsWorld();
    // The destination owns the gangway and wreck floor; this box represents
    // the fixed machine deck ending at x=5, leaving the one metre approach gap.
    physics.addFixedBox(
      new THREE.Vector3(7, 0.1, 8),
      new THREE.Vector3(0, DECK_SURFACE_Y - 0.1, 0),
    );
    const destination = new Destination({
      scene: new THREE.Scene(),
      physics,
      arrivalDistance: 700,
    });
    destination.fixedUpdate(700);
    const probeOrigin = new THREE.Vector3(14, DECK_SURFACE_Y + 5, 0);
    const down = new THREE.Vector3(0, -1, 0);
    expect(physics.raycast(probeOrigin, down, 10)).toBeNull();
    destination.setActive(true);
    expect(physics.raycast(probeOrigin, down, 10)).toBeNull();
    destination.setDocked(true);
    physics.step();
    expect(physics.raycast(probeOrigin, down, 10)).not.toBeNull();
    const position = new THREE.Vector3(
      5.5,
      DECK_SURFACE_Y + PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS + 0.05,
      0,
    );
    const character = physics.addCharacter(
      PLAYER_CAPSULE_RADIUS,
      PLAYER_CAPSULE_HALF_HEIGHT,
      position,
    );
    for (let frame = 0; frame < 240; frame++) {
      physics.moveCharacter(character, position, new THREE.Vector3(0.06, -0.05, 0), {
        x: 0,
        y: 0,
        z: 0,
      });
      physics.step();
    }
    // Crossing the internal bulkhead at world x=14 is part of the same clear
    // z=0 route; the outer wall at x=18 is the expected final stop.
    expect(position.x).toBeGreaterThan(17);
    expect(destination.containsPlayer({ x: position.x, y: position.y, z: position.z })).toBe(true);
    destination.setActive(false);
    physics.step();
    expect(physics.raycast(probeOrigin, down, 10)).toBeNull();
    destination.dispose();
    physics.dispose();
  });
});
