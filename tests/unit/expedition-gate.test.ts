import { expect, it } from 'vitest';
import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { DECK_SURFACE_Y, PLAYER_CAPSULE_HALF_HEIGHT, PLAYER_CAPSULE_RADIUS } from '@/game/constants';
import { Machine } from '@/machine/Machine';
import { Destination } from '@/story/Destination';

it('opens a real machine railing for walking across the dock, then restores the barrier', async () => {
  await initRapier();
  const physics = new PhysicsWorld();
  const scene = new THREE.Scene();
  const material = new THREE.MeshBasicMaterial();
  const materials = Object.fromEntries(
    ['bareSteel', 'deckPlate', 'emissiveWarn', 'hazard', 'hull', 'hullDark', 'rustedSteel', 'rubber']
      .map((key) => [key, material]),
  ) as unknown as Materials;
  const machine = new Machine(scene, physics, materials);
  const destination = new Destination({ scene, physics, arrivalDistance: 0 });
  destination.setActive(true);
  destination.setDocked(true);
  physics.step();
  const position = new THREE.Vector3(6.1,
    DECK_SURFACE_Y + PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS + 0.05, 0);
  const character = physics.addCharacter(PLAYER_CAPSULE_RADIUS, PLAYER_CAPSULE_HALF_HEIGHT, position);
  const walk = (dx: number, frames: number) => {
    for (let frame = 0; frame < frames; frame++) {
      physics.moveCharacter(character, position, new THREE.Vector3(dx, -0.05, 0), { x: 0, y: 0, z: 0 });
      physics.step();
    }
  };
  try {
    walk(0.06, 60);
    expect(position.x).toBeLessThan(6.7);
    machine.setExpeditionGangwayOpen(true);
    walk(0.06, 230);
    expect(position.x).toBeGreaterThan(17);
    expect(destination.containsPlayer(position)).toBe(true);
    expect(position.y).toBeGreaterThan(DECK_SURFACE_Y);
    machine.setExpeditionGangwayOpen(false);
    walk(-0.06, 250);
    expect(position.x).toBeGreaterThan(7);
    expect(position.x).toBeLessThan(7.6);
  } finally {
    destination.dispose();
    physics.dispose();
    material.dispose();
  }
});
