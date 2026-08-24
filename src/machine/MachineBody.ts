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
 * Where a world position sits on the machine — `transformPoint` undone.
 *
 * A character's position is known in world space, but the machine's motion is
 * defined on the places it is made of. This turns the one into the other, so
 * a point can be carried by where it actually stands on the deck rather than
 * by the numbers its world position happens to share with a machine-local
 * coordinate. Those numbers agree only while the machine is at rest.
 */
export function untransformPoint(world: Vec3, pose: BodyPose): Vec3 {
  const cp = Math.cos(pose.pitch);
  const sp = Math.sin(pose.pitch);
  const cr = Math.cos(pose.roll);
  const sr = Math.sin(pose.roll);

  // Exactly the inverse of transformPoint, in reverse order: heave, pitch,
  // then roll.
  const y0 = world.y - pose.heave;
  const y1 = y0 * cp + world.z * sp;
  const z1 = -y0 * sp + world.z * cp;

  return { x: world.x * cr + y1 * sr, y: -world.x * sr + y1 * cr, z: z1 };
}

/**
 * How far a WORLD point attached to the machine moves as the pose changes.
 *
 * This is what carries a character standing on the deck. Rapier's character
 * controller does not move a body when the platform beneath it moves, so
 * without applying this the deck slides out from under anything on it — the
 * player sinks through a rising deck, or is left hanging by a falling one.
 *
 * Taken at the character's own position rather than the deck's centre, because
 * under pitch and roll the deck's extremities move far more than its middle:
 * at 8m out, 1.5 degrees is about 21cm.
 *
 * The point is found on the machine FIRST, under the pose it was standing in.
 * Transforming a world position as though it were already machine-local is
 * right only at rest; a tilted metre later the same three numbers name a
 * different plank, and the error does not cancel — it is a bias of about 7mm
 * per pose pair at the deck's edge, which integrates into a ratchet that walks
 * a standing player off the stern. Measured at ~0.6m per 40 gait cycles before
 * this was fixed.
 */
export function carryDelta(world: Vec3, from: BodyPose, to: BodyPose): Vec3 {
  const moved = transformPoint(untransformPoint(world, from), to);
  return { x: moved.x - world.x, y: moved.y - world.y, z: moved.z - world.z };
}

/** Are two poses close enough that nothing needs rewriting this step? */
export function poseEquals(a: BodyPose, b: BodyPose, epsilon = 1e-7): boolean {
  return (
    Math.abs(a.heave - b.heave) < epsilon &&
    Math.abs(a.pitch - b.pitch) < epsilon &&
    Math.abs(a.roll - b.roll) < epsilon
  );
}
