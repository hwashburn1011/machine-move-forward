import * as THREE from 'three';
import type { Materials } from '@/art/Materials';
import type { PhysicsWorld } from '@/core/physics/PhysicsWorld';
import {
  CHARACTER_DROP_Y,
  DECK_HEIGHT,
  GRID_TILE,
  MACHINE_TILES_X,
  MACHINE_TILES_Z,
} from '@/game/constants';
import { buildMachine } from './MachineGeometry';
import { AUTOSTEP_HEIGHT, GRID_MAX_X, GRID_MAX_Z, GRID_MIN_X, GRID_MIN_Z } from '@/game/constants';
import type { Cell } from '@/building/BuildGrid';
import { deckCells } from '@/enemies/NavGraph';
import { MachineMovement } from './MachineMovement';

/**
 * Project the machine's own colliders onto level-0 grid cells.
 *
 * Derived rather than hardcoded: a hardcoded list would silently rot the
 * moment the machine layout changes, and the failure mode is subtle — the
 * player could build inside the engine.
 */
function projectEquipmentCells(
  colliders: { half: THREE.Vector3; center: THREE.Vector3 }[],
): Cell[] {
  const seen = new Set<string>();
  const cells: Cell[] = [];

  for (const c of colliders) {
    // The deck slab itself spans everything and must not block the whole grid;
    // only obstacles standing ON the deck count.
    const isDeckSlab = c.half.y < 0.2 && c.half.x > 4;
    if (isDeckSlab) continue;
    // Only count things the player cannot simply step onto. The tread housings
    // stand about 0.31m proud of the deck, which is under the character
    // controller's 0.45m autostep — a curb, not an obstruction. Blocking those
    // would cost two full columns of buildable deck down each side of the
    // machine for something the player walks straight over.
    if (c.center.y + c.half.y <= DECK_HEIGHT + AUTOSTEP_HEIGHT) continue;

    const minX = Math.round((c.center.x - c.half.x) / GRID_TILE);
    const maxX = Math.round((c.center.x + c.half.x) / GRID_TILE);
    const minZ = Math.round((c.center.z - c.half.z) / GRID_TILE);
    const maxZ = Math.round((c.center.z + c.half.z) / GRID_TILE);

    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        if (x < GRID_MIN_X || x > GRID_MAX_X || z < GRID_MIN_Z || z > GRID_MAX_Z) continue;
        const key = `${x},${z}`;
        if (seen.has(key)) continue;
        seen.add(key);
        cells.push({ x, y: 0, z });
      }
    }
  }

  return cells;
}

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
  /** Level-0 cells the starting equipment sits in. Unbuildable. */
  readonly equipmentCells: Cell[];
  /** Level-0 cells over the bare deck. Walkable, whether or not built on. */
  readonly deckCells: Cell[];

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

    this.equipmentCells = projectEquipmentCells(build.colliders);

    // Derived from the deck's own bounds, so it cannot drift out of step with
    // the machine's actual size the way a hardcoded cell range would.
    this.deckCells = deckCells({
      minX: this.deckBounds.min.x,
      maxX: this.deckBounds.max.x,
      minZ: this.deckBounds.min.z,
      maxZ: this.deckBounds.max.z,
    });

    // Rough starting mass: structure plus the section 49 loadout.
    this.movement.totalWeight = 12000;
  }

  /**
   * Spawn point on the open mid-deck. Kept clear of the equipment blocks:
   * spawning against one pins the third-person camera hard against it.
   */
  get deckSpawn(): THREE.Vector3 {
    return new THREE.Vector3(0, CHARACTER_DROP_Y, -1.0);
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
