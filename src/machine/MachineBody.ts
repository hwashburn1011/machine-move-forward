/**
 * The machine's body pose — heave, pitch and roll about the world origin.
 *
 * Pure: numbers in, a pose and transformed points out. No Three.js and no
 * Rapier, so every rule here is testable in node like `NavGraph`, `EnemyAI`
 * and `EnemySteering`.
 *
 * This exists because a walking machine has to move its body while still
 * holding people up. The colliders that make the deck solid are written from
 * this pose every fixed step, and anything standing on the deck is carried by
 * the delta between one step's pose and the next — see
 * `docs/superpowers/specs/2026-08-24-walking-machine-design.md` section 4.
 *
 * The machine still holds station at the world origin. These are bounded
 * oscillations about it, not travel: the float-precision and shadow-camera
 * reasons for pinning the machine there (handoff section 6) are untouched.
 */

export interface BodyPose {
  /** Vertical displacement, metres. Positive is up. */
  heave: number;
  /** Nose-up rotation about X, radians. */
  pitch: number;
  /** Starboard-down rotation about Z, radians. */
  roll: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const REST_POSE: BodyPose = { heave: 0, pitch: 0, roll: 0 };

/**
 * Hard bounds on how far the body may move.
 *
 * The deck is a shooting platform and a build surface before it is a
 * spectacle. Past these, aiming suffers and the deck stops reading as somewhere
 * you can work. Enforced in `clampPose` rather than trusted to callers, so a
 * mis-tuned gait cannot throw the player off.
 */
export const MAX_HEAVE = 0.12;
export const MAX_TILT = 1.5 * (Math.PI / 180);

export function clampPose(pose: BodyPose): BodyPose {
  return {
    heave: clamp(pose.heave, -MAX_HEAVE, MAX_HEAVE),
    pitch: clamp(pose.pitch, -MAX_TILT, MAX_TILT),
    roll: clamp(pose.roll, -MAX_TILT, MAX_TILT),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Where a point rigidly attached to the machine ends up under a pose.
 *
 * Small-angle rotations applied about the world origin, then heave. Exact
 * trigonometry rather than a linearisation: the angles are small enough that
 * it would not matter visually, but a collider pose that disagrees with the
 * renderer's own matrix by even a millimetre is a class of bug that is
 * miserable to chase, and `Math.sin` is not the expensive part of a frame.
 */
export function transformPoint(local: Vec3, pose: BodyPose): Vec3 {
  const cp = Math.cos(pose.pitch);
  const sp = Math.sin(pose.pitch);
  const cr = Math.cos(pose.roll);
  const sr = Math.sin(pose.roll);

  // Roll about Z, then pitch about X. Same order the renderer composes them.
  const x1 = local.x * cr - local.y * sr;
  const y1 = local.x * sr + local.y * cr;
  const z1 = local.z;

  const y2 = y1 * cp - z1 * sp;
  const z2 = y1 * sp + z1 * cp;

  return { x: x1, y: y2 + pose.heave, z: z2 };
}

/**
 * How far a point attached to the machine moved between two poses.
 *
 * This is what carries a character standing on the deck. Rapier's character
 * controller does not move a body when the platform beneath it moves, so
 * without applying this the deck slides out from under anything on it — the
 * player sinks through a rising deck, or is left hanging by a falling one.
 *
 * Taken at the character's own position rather than the deck's centre, because
 * under pitch and roll the deck's extremities move far more than its middle:
 * at 8m out, 1.5 degrees is about 21cm.
 */
export function carryDelta(point: Vec3, from: BodyPose, to: BodyPose): Vec3 {
  const a = transformPoint(point, from);
  const b = transformPoint(point, to);
  return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
}

/** Are two poses close enough that nothing needs rewriting this step? */
export function poseEquals(a: BodyPose, b: BodyPose, epsilon = 1e-7): boolean {
  return (
    Math.abs(a.heave - b.heave) < epsilon &&
    Math.abs(a.pitch - b.pitch) < epsilon &&
    Math.abs(a.roll - b.roll) < epsilon
  );
}
