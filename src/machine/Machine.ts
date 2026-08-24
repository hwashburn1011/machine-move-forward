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
import { buildMachine, TREAD_BELT_LENGTH } from './MachineGeometry';
import { AUTOSTEP_HEIGHT, GRID_MAX_X, GRID_MAX_Z, GRID_MIN_X, GRID_MIN_Z } from '@/game/constants';
import type { Cell } from '@/building/BuildGrid';
import { deckCells, type FixedLink } from '@/enemies/NavGraph';
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
  /**
   * Cells the MACHINE itself makes walkable, at any level: the bare deck at
   * level 0 and the engine-room floor at level -1.
   */
  readonly deckCells: Cell[];
  /**
   * Vertical connections the machine's own structure provides.
   *
   * Today that is the engine-room stair. Without it the engine room would be
   * reachable by the player and unreachable by anything hunting them, which is
   * the safe-room problem the sealed-room design deliberately avoids.
   */
  readonly fixedLinks: FixedLink[];
  private treadScroll = 0;

  constructor(
    scene: THREE.Scene,
    physics: PhysicsWorld,
    private readonly materials: Materials,
  ) {
    const build = buildMachine(materials);
    this.group = build.group;

    // Set once, then never written again.
    this.group.position.set(0, 0, 0);
    scene.add(this.group);

    for (const c of build.colliders) {
      // The engine-room stair is the one tilted box; everything else is
      // axis-aligned and takes the cheaper path.
      if (c.rotX === undefined) {
        physics.addFixedBox(c.half, c.center, 0, { kind: 'machine' });
      } else {
        physics.addFixedBoxRotated(
          c.half,
          c.center,
          new THREE.Quaternion().setFromEuler(new THREE.Euler(c.rotX, 0, 0)),
          { kind: 'machine' },
        );
      }
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
    //
    // Cells over the stairwell are then removed: there is no deck there any
    // more. Leaving them in made the graph route enemies straight across an
    // open hole, and they fell into the engine room on the way to the player.
    // The deck plates are centred on odd metres and the grid cells on even
    // ones, so a cell only PARTLY over the well is still a hole to fall
    // through — hence overlap, not containment, is the test.
    const wellMinX = -(MACHINE_TILES_X * GRID_TILE) / 2 + GRID_TILE;
    const wellMaxX = wellMinX + GRID_TILE;
    const wellMinZ = -2.0;
    const wellMaxZ = 2.0;
    const overWell = (c: Cell): boolean => {
      const cx = c.x * GRID_TILE;
      const cz = c.z * GRID_TILE;
      const half = GRID_TILE / 2;
      return (
        cx + half > wellMinX &&
        cx - half < wellMaxX &&
        cz + half > wellMinZ &&
        cz - half < wellMaxZ
      );
    };
    this.deckCells = deckCells({
      minX: this.deckBounds.min.x,
      maxX: this.deckBounds.max.x,
      minZ: this.deckBounds.min.z,
      maxZ: this.deckBounds.max.z,
    }).filter((c) => !overWell(c));

    // The engine room floor, one level down. Its interior is the hull shell
    // inset by its wall thickness, derived here the same way the deck is.
    const roomHalfW = (MACHINE_TILES_X * GRID_TILE - 0.6) / 2 - 0.3;
    const roomHalfL = (MACHINE_TILES_Z * GRID_TILE - 0.4) / 2 - 0.3;
    for (const c of deckCells({
      minX: -roomHalfW,
      maxX: roomHalfW,
      minZ: -roomHalfL,
      maxZ: roomHalfL,
    })) {
      this.deckCells.push({ x: c.x, y: -1, z: c.z });
    }

    // The stair's two ends: the first SOLID deck cell aft of the well, and the
    // engine-room cell at the ramp's foot. Cell (0,0,1) would be the natural
    // head but it sits partly over the opening and is no longer deck, so the
    // link starts one cell further aft and steering walks the last metre onto
    // the ramp.
    this.fixedLinks = [[{ x: -1, y: 0, z: 2 }, { x: -1, y: -1, z: -1 }]];

    // Rough starting mass: structure plus the section 49 loadout.
    this.movement.totalWeight = 12000;
  }

  /**
   * Spawn point on the open mid-deck.
   *
   * Kept clear of the equipment blocks: spawning against one pins the
   * third-person camera hard against it. Mid-deck also leaves room to walk
   * forward before the prow, which the drive harness relies on.
   *
   * The engine-room well is off to port, so the centreline is clear of it.
   */
  get deckSpawn(): THREE.Vector3 {
    return new THREE.Vector3(0, CHARACTER_DROP_Y, -1.0);
  }

  /**
   * Per-frame visual motion. Frame time, not the fixed step: this is what the
   * eye sees, so it must be as smooth as the display allows.
   *
   * The belts scroll at the machine's real speed, so slowing down is visible
   * on the machine itself rather than only in the HUD readout. One texture
   * repeat spans BELT_LENGTH / repeat.x metres, so an offset delta of 1.0 is
   * exactly one cleat pitch travelled.
   */
  updateVisuals(dt: number): void {
    const cleatPitch = TREAD_BELT_LENGTH / this.materials.treadMap.repeat.x;
    this.treadScroll = (this.treadScroll + (this.speed * dt) / cleatPitch) % 1;
    // Negative: the cleats travel astern as the machine drives forward, which
    // is the direction the ground passes under them.
    this.materials.treadMap.offset.x = -this.treadScroll;
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
