/**
 * Two-bone inverse kinematics for the machine's legs.
 *
 * Pure: a hip, a foot target, two bone lengths, and out come the angles that
 * connect them. No Three.js, so the whole thing is testable in node, and the
 * test that matters is a round trip — solve for a target, run the angles back
 * through forward kinematics, and the foot must land on it.
 *
 * Analytic rather than iterative. Two bones and a target have a closed-form
 * solution by the law of cosines; an iterative solver (FABRIK, CCD) would be
 * slower, approximate, and would need a convergence budget tuned per leg for
 * no benefit whatever.
 *
 * The leg has three degrees of freedom here, which is the fewest that can
 * reach a target off the machine's centreline:
 *
 *   - **splay**, a roll of the whole leg outward from the hull, which chooses
 *     the plane the leg works in;
 *   - **hip**, the upper bone's swing fore and aft within that plane;
 *   - **knee**, how far the leg is folded.
 *
 * There is no hip yaw and no ankle. The gait plants feet fore and aft of the
 * hip, which the hip angle covers exactly, and the machine does not turn
 * (spec section 9), so nothing ever asks for one.
 */

export interface TwoBoneAngles {
  /**
   * Upper bone's angle from straight down, radians. Positive swings the foot
   * forward.
   */
  hip: number;
  /**
   * How far the leg is folded at the knee, radians. Zero is a straight leg.
   */
  knee: number;
  /** False when the target was out of reach and the leg had to stretch at it. */
  reached: boolean;
}

export interface LegAngles extends TwoBoneAngles {
  /** Roll of the leg's whole plane away from the hull, radians. */
  splay: number;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Angles that put a two-bone leg's foot on a target in its own plane.
 *
 * `x` is forward of the hip, `y` is below it and therefore negative. The knee
 * folds AFT: of the two mirror solutions, only one reads as a walker's hind
 * leg rather than a knee buckling forward under load.
 *
 * An unreachable target is answered by pointing straight at it at full stretch
 * rather than by NaN. NaN in a joint angle propagates into a transform and the
 * mesh vanishes, which is a far worse failure than a leg that visibly cannot
 * quite get there — and the gait is tuned so this never happens in play.
 */
export function solveTwoBone(x: number, y: number, upper: number, lower: number): TwoBoneAngles {
  const distance = Math.hypot(x, y);
  const longest = upper + lower;
  const shortest = Math.abs(upper - lower);
  const reached = distance <= longest && distance >= shortest;
  const clamped = Math.min(Math.max(distance, shortest), longest);

  // Law of cosines for the fold. Positive, so the knee trails aft.
  const cosKnee = (clamped * clamped - upper * upper - lower * lower) / (2 * upper * lower);
  const knee = Math.acos(Math.min(1, Math.max(-1, cosKnee)));

  // Direction to the target, and how far the upper bone sits off it once the
  // lower bone has folded away from the straight line.
  const toTarget = distance > 1e-12 ? Math.atan2(x, -y) : 0;
  const offset = Math.atan2(lower * Math.sin(knee), upper + lower * Math.cos(knee));

  return { hip: toTarget - offset, knee, reached };
}

/** Where those angles actually put the foot. The inverse of `solveTwoBone`. */
export function twoBoneFoot(
  angles: TwoBoneAngles,
  upper: number,
  lower: number,
): { x: number; y: number } {
  const { hip, knee } = angles;
  return {
    x: upper * Math.sin(hip) + lower * Math.sin(hip + knee),
    y: -upper * Math.cos(hip) - lower * Math.cos(hip + knee),
  };
}

/**
 * Angles that reach a foot target given in machine space.
 *
 * The lateral part of the offset is taken up by splaying the leg's plane out
 * from the hull; what is left is a two-bone problem in that plane, with the
 * machine's fore-aft axis as its horizontal.
 *
 * Machine space has +z aft, and the plane's forward axis is the other way
 * about, which is the one sign flip in this file worth pointing at.
 */
export function solveLeg(hip: Point3, foot: Point3, upper: number, lower: number): LegAngles {
  const dx = foot.x - hip.x;
  const dy = foot.y - hip.y;
  const dz = foot.z - hip.z;

  // Splay chooses the plane: roll about the machine's fore-aft axis until the
  // plane contains the target. Positive rolls the foot toward starboard, the
  // same convention `MachineBody` uses for the hull.
  const drop = Math.hypot(dx, dy);
  const splay = drop > 1e-12 ? Math.atan2(dx, -dy) : 0;

  return { splay, ...solveTwoBone(-dz, -drop, upper, lower) };
}

/**
 * Where the knee and the foot end up, in machine space.
 *
 * The renderer needs both to place two bones, and the tests need the foot to
 * close the round trip. One definition serves both, so what is drawn and what
 * is asserted cannot drift apart.
 */
export function legJoints(
  hip: Point3,
  angles: LegAngles,
  upper: number,
  lower: number,
): { knee: Point3; foot: Point3 } {
  const sin = Math.sin(angles.splay);
  const cos = Math.cos(angles.splay);

  const place = (forward: number, drop: number): Point3 => ({
    // `drop` is negative below the hip; the splay carries it sideways.
    x: hip.x + -drop * sin,
    y: hip.y + drop * cos,
    z: hip.z - forward,
  });

  const kneeForward = upper * Math.sin(angles.hip);
  const kneeDrop = -upper * Math.cos(angles.hip);
  const foot = twoBoneFoot(angles, upper, lower);

  return { knee: place(kneeForward, kneeDrop), foot: place(foot.x, foot.y) };
}
