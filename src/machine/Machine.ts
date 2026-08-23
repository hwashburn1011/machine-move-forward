import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import { DECK_HEIGHT, GRID_TILE, MACHINE_TILES_X, MACHINE_TILES_Z } from '@/game/constants';
import { buildMachine } from './MachineGeometry';
import { MachineMovement } from './MachineMovement';

/**
 * The player's machine.
 *
 * It sits at the world origin and NEVER moves. That is the load-bearing
 * assumption of the entire architecture (handoff section 6): it keeps player
 * physics stable, keeps floats small, and lets the sun's shadow camera be a
 * tight fixed box. The world scrolls past instead.
 */
export class Machine {
  readonly group: THREE.Group;
  readonly movement = new MachineMovement();
  readonly deckBounds: THREE.Box3;

  constructor(scene: THREE.Scene, physics: PhysicsWorld, materials: Materials) {
    const build = buildMachine(materials);
    this.group = build.group;

    // Set once, then never written again.
    this.group.position.set(0, 0, 0);
    scene.add(this.group);

    for (const c of build.colliders) {
      physics.addFixedBox(c.half, c.center, 0, { kind: 'machine' });
    }

    const halfW = (MACHINE_TILES_X * GRID_TILE) / 2;
    const halfL = (MACHINE_TILES_Z * GRID_TILE) / 2;
    this.deckBounds = new THREE.Box3(
      new THREE.Vector3(-halfW, DECK_HEIGHT, -halfL),
      new THREE.Vector3(halfW, DECK_HEIGHT, halfL),
    );

    // Rough starting mass: structure plus the section 49 loadout.
    this.movement.totalWeight = 12000;
  }

  /** A safe spawn/respawn point on the deck. */
  get deckSpawn(): THREE.Vector3 {
    return new THREE.Vector3(0, DECK_HEIGHT + 1.2, 3.5);
  }

  get speed(): number {
    return this.movement.currentSpeed;
  }

  fixedUpdate(dt: number): void {
    this.movement.fixedUpdate(dt);

    if (import.meta.env.DEV && this.group.position.lengthSq() !== 0) {
      // Guarded rather than merely documented: if anything ever moves the
      // machine, chunk recycling, shadows, and player physics all quietly
      // degrade instead of failing loudly.
      throw new Error(
        'Machine left the origin. The world must scroll instead — see handoff section 6.',
      );
    }
  }
}
