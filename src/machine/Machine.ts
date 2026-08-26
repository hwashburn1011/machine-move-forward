import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
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
import { MachineLegs } from './MachineLegs';
import { gaitPose } from './Gait';
import { AUTOSTEP_HEIGHT, GRID_MAX_X, GRID_MAX_Z, GRID_MIN_X, GRID_MIN_Z } from '@/game/constants';
import type { Cell } from '@/building/BuildGrid';
import { deckCells, type FixedLink } from '@/enemies/NavGraph';
import { MachineMovement } from './MachineMovement';
import { MachineDamage } from './MachineDamage';
import { MachinePower } from './MachinePower';
import {
  carryDelta,
  clampPose,
  poseEquals,
  REST_POSE,
  type BodyPose,
  transformPoint,
  untransformPoint,
  type Vec3,
} from './MachineBody';

/** Axes the body rotates about. Module-level so no allocation per step. */
const RIGHT_X = new THREE.Vector3(1, 0, 0);
const FORWARD_Z = new THREE.Vector3(0, 0, 1);

/**
 * How far off the origin the machine may sit before it counts as drift rather
 * than gait. Comfortably above MAX_HEAVE, far below anything that would matter
 * to float precision or the shadow camera.
 */
const MAX_STATION_KEEPING = 0.5;

/** Colliders sit at their body's own origin in this layout. */
const ZERO = new THREE.Vector3(0, 0, 0);

/**
 * Project the machine's own colliders onto level-0 grid cells.
 *
 * Derived rather than hardcoded: a hardcoded list would silently rot the
 * moment the machine layout changes, and the failure mode is subtle — the
 * player could build inside the engine.
 *
 * Exported for its own test. The rot this guards against turned out to run
 * both ways: a collider added for a good reason can quietly take deck away.
 */
export function projectEquipmentCells(
  colliders: { half: THREE.Vector3; center: THREE.Vector3; blocksBuild?: boolean }[],
): Cell[] {
  const seen = new Set<string>();
  const cells: Cell[] = [];

  for (const c of colliders) {
    // Solid to bodies, invisible here, by the collider's own declaration. The
    // railings are the case: 12cm of steel lying along a cell boundary, which
    // containment charges two full columns and a row for. See `MachineBuild`.
    if (c.blocksBuild === false) continue;
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
  readonly damage = new MachineDamage();
  /**
   * Generation, draw and the fuel tank.
   *
   * Owned here beside `damage` and for the same reason: both are pure models
   * of the machine's own condition that half a dozen systems read every frame,
   * and both are ticked from `Game`'s fixed step.
   */
  readonly power = new MachinePower();
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
  private pose: BodyPose = REST_POSE;
  private previousPose: BodyPose = REST_POSE;
  private writtenPose: BodyPose = REST_POSE;
  private readonly bodies: RAPIER.RigidBody[] = [];
  private readonly restPositions: THREE.Vector3[] = [];
  private readonly restRotations: THREE.Quaternion[] = [];
  private readonly scratchPos = new THREE.Vector3();
  private readonly scratchQuat = new THREE.Quaternion();
  private readonly poseOrigin = new THREE.Vector3();
  private readonly poseQuat = new THREE.Quaternion();
  private readonly pitchQuat = new THREE.Quaternion();
  private readonly rollQuat = new THREE.Quaternion();
  private readonly legs: MachineLegs;
  private readonly scratchFoot = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    physics: PhysicsWorld,
    materials: Materials,
  ) {
    const build = buildMachine(materials);
    this.group = build.group;

    // Set once, then never written again.
    this.group.position.set(0, 0, 0);
    scene.add(this.group);

    // Hung off the machine's own group, so the body pose carries the legs with
    // the hull rather than leaving them behind when it heaves.
    this.legs = new MachineLegs(materials);
    this.group.add(this.legs.object3D);

    // EXPERIMENT 2 (spec 4.3): DYNAMIC bodies, locked and gravity-free, so they
    // behave like fixed ones while still generating contacts against the
    // kinematic player. Experiment 1 proved the blocker is the body TYPE:
    // one kinematic body per collider failed exactly as one shared body did.
    this.bodies = [];
    for (const c of build.colliders) {
      const rot =
        c.rotX === undefined
          ? undefined
          : new THREE.Quaternion().setFromEuler(new THREE.Euler(c.rotX, 0, 0));
      const body = physics.createDrivenBody(c.center, rot);
      physics.addBoxTo(body, c.half, ZERO, undefined, { kind: 'machine' });
      this.bodies.push(body);
      // Rest pose, so the body transform can be applied to it every step.
      this.restPositions.push(c.center.clone());
      this.restRotations.push(rot ? rot.clone() : new THREE.Quaternion());
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
   * Walk the legs to a distance travelled, and say which feet planted.
   *
   * Driven from the RENDERED distance, not the simulated one: the world slides
   * on past its last fixed step every frame, and a foot placed against the
   * simulation's distance skates against the sand by up to 0.125m at speed —
   * which is precisely the cue this whole feature exists to sell.
   */
  updateVisuals(renderedDistance: number): readonly number[] {
    return this.legs.setDistance(renderedDistance);
  }

  /**
   * Where a world point would be if the body were standing still.
   *
   * The machine's pose, undone. This is what the camera follows instead of the
   * player themselves, and it is the whole of "the machine may move, the view
   * may not" (spec section 2).
   *
   * The camera is not attached to the machine, so nothing here displaces it
   * directly — but it follows the player, the player is carried by the deck,
   * and so every millimetre the deck heaves reaches the view by the back door.
   * With four legs a quarter cycle apart the body bobs FOUR times per stride,
   * about 4.6Hz at cruise, and a few millimetres of view bob at 4.6Hz is
   * genuinely unpleasant to sit behind — measured, and reported as a headache
   * within a minute of watching it.
   *
   * Taking the pose off the anchor separates the two cleanly. The deck still
   * moves in physics, so it can still be felt where feeling it is the point —
   * a list underfoot, a shot thrown off, a boarding vehicle latched to a hull
   * that is genuinely tilting — and the view stays level regardless of how
   * hard the body is worked.
   */
  steadyPoint(world: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const steady = untransformPoint(world, this.pose);
    return out.set(steady.x, steady.y, steady.z);
  }

  /** Where a foot is in the world, for the print it presses into the sand. */
  footPosition(leg: number): THREE.Vector3 {
    return this.legs.footPosition(leg, this.scratchFoot);
  }

  /**
   * The pose the gait puts the body in at this distance.
   *
   * Here rather than in `Game` so that what drives the colliders and what
   * drives the legs come from one place and cannot disagree.
   */
  poseAt(distance: number): BodyPose {
    return gaitPose(distance);
  }

  get speed(): number {
    return this.movement.currentSpeed;
  }

  /**
   * Set the body's pose for this step. Clamped, so a mis-tuned gait cannot
   * throw anyone off the deck.
   */
  setPose(next: BodyPose): void {
    this.previousPose = this.pose;
    this.pose = clampPose(next);
  }

  get currentPose(): BodyPose {
    return this.pose;
  }

  /**
   * How far a point attached to the machine moved this step.
   *
   * Anything standing on the deck must be moved by this, because Rapier's
   * character controller does not carry a body when its platform moves.
   * Sampled at the character's own position: under tilt the deck's edges move
   * far more than its middle.
   */
  carryFor(point: Vec3): Vec3 {
    return carryDelta(point, this.previousPose, this.pose);
  }

  /** True while the body is doing nothing, so callers can skip the work. */
  get isAtRest(): boolean {
    return poseEquals(this.pose, this.previousPose) && poseEquals(this.pose, REST_POSE);
  }

  private applyPose(): void {
    // Only touch the physics body when the pose actually changed. Rewriting a
    // kinematic body's target every step -- even to the identical pose -- makes
    // Rapier treat it as a moving platform, and the character controller then
    // resolves against that motion and pins anything standing on it. Measured:
    // the player was grounded and could not walk. While the machine is not
    // walking, this leaves the body untouched and it behaves exactly as the
    // fixed bodies it replaced.
    if (poseEquals(this.pose, this.writtenPose)) return;
    this.writtenPose = this.pose;

    // Roll about Z, then pitch about X -- the same order MachineBody composes
    // them, so the colliders and the rendered hull cannot disagree.
    // The gait's own roll still heaves; the list is added on top, so a damaged
    // machine still walks rather than merely leaning. NOT written into
    // `this.pose.roll` — the gait owns that field and recomputes it every
    // frame from the stride, so a value added there is both overwritten and,
    // until it is, fed back into the next stride.
    this.rollQuat.setFromAxisAngle(FORWARD_Z, this.pose.roll + this.damage.lean);
    this.pitchQuat.setFromAxisAngle(RIGHT_X, this.pose.pitch);
    this.poseQuat.copy(this.pitchQuat).multiply(this.rollQuat);
    this.poseOrigin.set(0, this.pose.heave, 0);

    this.group.position.copy(this.poseOrigin);
    this.group.quaternion.copy(this.poseQuat);

    // Colliders follow the same transform, so the deck you stand on stays the
    // deck you see. setTranslation/setRotation teleport a body directly, which
    // is how a locked dynamic body is driven -- the solver will not move it.
    for (let i = 0; i < this.bodies.length; i++) {
      const rest = this.restPositions[i] as THREE.Vector3;
      const moved = transformPoint(rest, this.pose);
      this.scratchPos.set(moved.x, moved.y, moved.z);
      this.scratchQuat.copy(this.poseQuat).multiply(this.restRotations[i] as THREE.Quaternion);
      (this.bodies[i] as RAPIER.RigidBody).setTranslation(this.scratchPos, true);
      (this.bodies[i] as RAPIER.RigidBody).setRotation(this.scratchQuat, true);
    }
  }

  fixedUpdate(dt: number): void {
    // Pushed in BEFORE the step, so the speed model reads this frame's damage
    // rather than last frame's.
    this.movement.enginePower = this.damage.enginePower;
    this.movement.legScale = this.damage.speedScale;
    this.movement.fixedUpdate(dt);
    this.applyPose();

    // A BOUND, not equality with zero. The machine holds station at the
    // origin, but a walking body heaves and tilts about it, so the guard has
    // to permit oscillation while still catching actual drift -- which is the
    // failure that would quietly degrade chunk recycling, shadows and player
    // physics (handoff section 6).
    if (import.meta.env.DEV && this.group.position.lengthSq() > MAX_STATION_KEEPING ** 2) {
      throw new Error(
        'Machine left the origin. The world must scroll instead — see handoff section 6.',
      );
    }
  }
}
