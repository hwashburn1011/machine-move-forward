import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Player } from '@/player/Player';
import { EventBus } from '@/core/events/EventBus';
import { PhysicsWorld, initRapier } from '@/core/physics/PhysicsWorld';
import type { InputManager } from '@/core/input/InputManager';
import type { Materials } from '@/art/Materials';
import { PLAYER_WALK_SPEED } from '@/game/constants';

beforeAll(initRapier);
function fixture() {
  const physics = new PhysicsWorld();
  const material = new THREE.MeshBasicMaterial();
  const materials = {
    hull: material,
    hullDark: material,
    deckPlate: material,
    accent: material,
  } as unknown as Materials;
  physics.addFixedBox(new THREE.Vector3(8, 0.1, 8), new THREE.Vector3(0, -0.1, 0));
  const player = new Player(
    new THREE.Scene(),
    physics,
    new EventBus(),
    materials,
    new THREE.Vector3(0, 1, 0),
  );
  const step = (forward = false) => {
    physics.step();
    player.fixedUpdate(
      1 / 60,
      {
        isDown: (action: string) => action === 'forward' && forward,
        consumePressed: () => false,
      } as unknown as InputManager,
      0,
    );
  };
  const close = () => {
    player.dispose();
    physics.dispose();
    material.dispose();
  };
  return { physics, player, step, close };
}

describe('resolved presentation motion', () => {
  it('stops the gait at a real wall without changing movement intent used by gameplay', () => {
    const { physics, player, step, close } = fixture();
    physics.addFixedBox(new THREE.Vector3(3, 2, 0.1), new THREE.Vector3(0, 1, -1));
    for (let i = 0; i < 90; i++) step(true);
    const motion = player.presentationState.velocity;
    expect(Math.hypot(motion.x, motion.z)).toBeLessThan(0.15);
    expect(player.worldPosition.z).toBeGreaterThan(-0.6);
    expect(player.speed).toBe(PLAYER_WALK_SPEED);
    player.teleport(new THREE.Vector3(2, 1, 2));
    const teleported = player.presentationState.velocity;
    expect(Math.hypot(teleported.x, teleported.y, teleported.z)).toBe(0);
    close();
  });

  it('excludes applied deck carry from idle animation velocity', () => {
    const { player, step, close } = fixture();
    player.carry.x = 0.01;
    player.carry.z = -0.015;
    for (let i = 0; i < 60; i++) step();
    expect(player.worldPosition.x).toBeCloseTo(0.6, 4);
    const motion = player.presentationState.velocity;
    // Rapier's float solver leaves sub-millimetre/s residuals, far below gait deadzone.
    expect(Math.hypot(motion.x, motion.z)).toBeLessThan(0.001);
    close();
  });
});
