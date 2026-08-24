import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { initRapier, PhysicsWorld } from '@/core/physics/PhysicsWorld';
import {
  carryDelta,
  transformPoint,
  untransformPoint,
  MAX_HEAVE,
  MAX_TILT,
  REST_POSE,
  type BodyPose,
} from '@/machine/MachineBody';
import {
  DECK_HEIGHT,
  DECK_PLATE_HALF,
  DECK_SURFACE_Y,
  FIXED_DT,
  PLAYER_CAPSULE_HALF_HEIGHT,
  PLAYER_CAPSULE_RADIUS,
} from '@/game/constants';

/**
 * Platform carrying, against real Rapier.
 *
 * The spec is blunt about this one (section 10): it is the difference between
 * a machine that walks and a machine that shakes its passengers off, and it
 * must be measured with the body oscillating and no gait or legs present,
 * before anything is hung on it.
 *
 * The rig is a deck plate on a driven body and a character standing on it —
 * the same body type, the same controller settings, and the same pose maths
 * the machine uses, with everything else stripped away. Two things are asked
 * of it, and they are the two ways this fails:
 *
 *   - the character keeps a constant height ABOVE THE DECK, not a constant
 *     height in the world, so a rising deck lifts them instead of engulfing
 *     them;
 *   - the character does not travel across the deck over a long run, because
 *     a bias of a millimetre a step is a player in the sand a minute later.
 *
 * Both are measured in machine space — the pose undone — because that is what
 * "standing still on the deck" means while the deck itself is moving.
 */

const HALF = new THREE.Vector3(5, DECK_PLATE_HALF, 8);
const ZERO = new THREE.Vector3(0, 0, 0);
/** The player's ground-sticking push, from `Player.fixedUpdate`. */
const REST_PUSH = -2;

interface Wobble {
  /** Metres of heave. */
  heave?: number;
  /** Radians of pitch and roll. */
  tilt?: number;
  /** Seconds per cycle. */
  period?: number;
  /** Radians of phase, so tilt need not be in step with heave. */
  pitchPhase?: number;
  rollPhase?: number;
}

interface Run {
  /** Widest gap between the character's highest and lowest place on the deck. */
  heightBand: number;
  /** How far across the deck they ended up from where they started. */
  drift: number;
  grounded: boolean;
}

/**
 * Stand a character on an oscillating deck for a number of whole cycles.
 *
 * Whole cycles, and eased in from rest, so the pose ends where it began: any
 * remaining displacement is a ratchet rather than a phase left over.
 */
function stand(where: THREE.Vector3, cycles: number, wobble: Wobble = {}): Run {
  const { heave = MAX_HEAVE, tilt = MAX_TILT, period = 2, pitchPhase = 0, rollPhase = 0 } = wobble;

  const physics = new PhysicsWorld();
  const deck = physics.createDrivenBody(new THREE.Vector3(0, DECK_HEIGHT, 0));
  physics.addBoxTo(deck, HALF, ZERO);
  const deckRest = { x: 0, y: DECK_HEIGHT, z: 0 };

  const handle = physics.addCharacter(PLAYER_CAPSULE_RADIUS, PLAYER_CAPSULE_HALF_HEIGHT, where);
  const position = where.clone();

  const poseAt = (t: number): BodyPose => {
    // Eased in over the first cycle: a body that snaps to full tilt in one
    // step is not a gait, and the snap would be measured as drift.
    const k = Math.min(1, t / period);
    const w = (2 * Math.PI * t) / period;
    return {
      heave: k * heave * Math.sin(w),
      pitch: k * tilt * Math.sin(w + pitchPhase),
      roll: k * tilt * Math.sin(w + rollPhase),
    };
  };

  const pitchQuat = new THREE.Quaternion();
  const rollQuat = new THREE.Quaternion();
  const poseQuat = new THREE.Quaternion();
  const scratch = new THREE.Vector3();
  const drive = (pose: BodyPose): void => {
    // What `Machine.applyPose` does to every one of its bodies.
    rollQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), pose.roll);
    pitchQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pose.pitch);
    poseQuat.copy(pitchQuat).multiply(rollQuat);
    const moved = transformPoint(deckRest, pose);
    deck.setTranslation(scratch.set(moved.x, moved.y, moved.z), true);
    deck.setRotation(poseQuat, true);
  };

  let pose = REST_POSE;
  let previousPose = REST_POSE;
  let vy = 0;
  let grounded = false;
  const own = new THREE.Vector3();

  const settle = Math.round(1.5 / FIXED_DT);
  const steps = Math.round((cycles * period) / FIXED_DT);
  let start: { x: number; y: number; z: number } | null = null;
  let low = Infinity;
  let high = -Infinity;
  let local = { x: 0, y: 0, z: 0 };

  for (let i = -settle; i < steps; i++) {
    // The machine poses itself for this step BEFORE anything standing on it
    // moves, so the carry belongs to the step it is applied in.
    if (i >= 0) {
      previousPose = pose;
      pose = poseAt((i + 1) * FIXED_DT);
    }
    const carry = carryDelta(position, previousPose, pose);

    // `Player.fixedUpdate`'s vertical rule: rest slightly negative so the
    // controller keeps finding the ground.
    if (grounded && vy <= 0) vy = REST_PUSH;
    else vy += -22 * FIXED_DT;
    own.set(0, vy * FIXED_DT, 0);

    grounded = physics.moveCharacter(handle, position, own, carry);
    if (grounded && vy < 0) vy = 0;

    drive(pose);
    physics.step();

    if (i >= 0) {
      local = untransformPoint(position, pose);
      start ??= local;
      if (local.y < low) low = local.y;
      if (local.y > high) high = local.y;
    }
  }

  const from = start as { x: number; y: number; z: number };
  return {
    heightBand: high - low,
    drift: Math.hypot(local.x - from.x, local.z - from.z),
    grounded,
  };
}

/** The stern, where tilt moves the deck most, and where the spec says to measure. */
const STERN = new THREE.Vector3(0, DECK_SURFACE_Y + PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS, 6);
const AMIDSHIPS = new THREE.Vector3(0, STERN.y, 0);
const QUARTER = new THREE.Vector3(-4, STERN.y, 6);

describe('standing on a moving deck', () => {
  beforeAll(async () => {
    await initRapier();
  });

  it('rises and falls with a heaving deck instead of being left behind', () => {
    // The failure this catches: the deck's rise is added to a movement already
    // dominated by the ground-sticking push, so the controller resolves it as
    // "down", and the deck climbs THROUGH the character. They track it
    // downward, where gravity does the work, and not upward at all — which
    // reads as the deck breathing around a player nailed to the sky.
    const run = stand(STERN, 5, { tilt: 0 });
    expect(run.grounded).toBe(true);
    expect(run.heightBand).toBeLessThan(0.03);
  });

  it('holds its height at the stern while the body pitches and rolls', () => {
    const run = stand(STERN, 5);
    expect(run.grounded).toBe(true);
    expect(run.heightBand).toBeLessThan(0.03);
  });

  it('holds its height at the quarter, where tilt moves the deck most', () => {
    const run = stand(QUARTER, 5, { pitchPhase: Math.PI / 2 });
    expect(run.grounded).toBe(true);
    expect(run.heightBand).toBeLessThan(0.03);
  });

  it('does not travel across the deck over a long run', () => {
    // Forty cycles is a minute and a bit of walking. Before the carry was
    // made rigid this was 0.6m — a player who started amidships would be at
    // the rail.
    const run = stand(STERN, 40, { pitchPhase: Math.PI / 2, rollPhase: -Math.PI / 2 });
    expect(run.drift).toBeLessThan(0.02);
  });

  it('does not drift faster the longer it runs', () => {
    // A ratchet accumulates; a wander does not. Eight minutes of continuous
    // oscillation is long enough that the difference is unmistakable — at the
    // rate this used to ratchet, the player would be some 40m astern of the
    // machine by here.
    const long = stand(STERN, 240, { pitchPhase: Math.PI / 2, rollPhase: -Math.PI / 2 });
    expect(long.drift).toBeLessThan(0.02);
  });

  it('holds a passenger standing on the pivot itself to a few centimetres', () => {
    // Amidships is the one awkward spot: the body turns about the origin, so
    // there is almost no carry there to hold anyone in place, and what is left
    // is the controller's own resolution against a tilting surface. It wanders
    // a couple of centimetres and comes back rather than accumulating —
    // measured at 0.030m after 80 cycles and 0.012m after 240 — and a step off
    // the pivot in any direction drops it to a millimetre.
    //
    // This is the residual the spec's section 4.4 left open, and it is small
    // enough to be the shift underfoot that a tilting deck ought to have.
    const long = stand(AMIDSHIPS, 240, { pitchPhase: Math.PI / 2, rollPhase: -Math.PI / 2 });
    expect(long.drift).toBeLessThan(0.1);

    const astep = stand(new THREE.Vector3(0.5, AMIDSHIPS.y, 0.5), 80, {
      pitchPhase: Math.PI / 2,
      rollPhase: -Math.PI / 2,
    });
    expect(astep.drift).toBeLessThan(0.01);
  });
});
