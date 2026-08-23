/**
 * Local obstacle avoidance for enemies.
 *
 * Pure: probe readings in, a heading out. No Three.js, no Rapier — the caller
 * does the raycasting, so every steering rule here is testable in node.
 *
 * This is deliberately NOT pathfinding. It samples a fan of directions and
 * picks the most promising one each tick, which is enough for a deck whose
 * obstacles are a handful of blocks, and cheap enough to run every tick. The
 * real navmesh belongs to the boarding milestone with the rest of the pathing
 * work.
 *
 * An earlier version cast three whiskers and turned ninety degrees off the
 * desired heading when the middle one hit. It wedged in corners: the direction
 * it turned into was blocked too, and with only three probes no sampled
 * direction was actually open. Measured, half of all scavengers never crossed
 * the deck. Sampling a wide fan and scoring it fixes that, because the escape
 * route is among the directions actually looked at.
 */

/** Metres a probe reaches. */
export const PROBE_RANGE = 1.6;

/**
 * Directions sampled, as radians either side of the desired heading.
 *
 * Spread out to ±115°, wide enough to find a way back out of a corner, at an
 * even 0.5 rad spacing. Evenly spaced because a widening gap is where an
 * opening hides: an earlier ±115° fan of seven left a 46° gap at the outside,
 * which is wider than a scavenger and therefore wider than the escape route it
 * was meant to find.
 */
export const FAN_OFFSETS: readonly number[] = [
  0, -0.5, 0.5, -1.0, 1.0, -1.5, 1.5, -2.0, 2.0,
];

/**
 * The three points a direction is probed from: the centre line, and one at
 * each shoulder.
 *
 * A single centre ray answers "is there anything directly ahead", which is not
 * the question. The deck's equipment leaves slots 0.65m and 0.70m wide against
 * a 0.72m body — a ray runs straight down them and reports clear, and the
 * scavenger that believed it walks in and stops, still reading clear ahead
 * while it is physically wedged. Probing at the body's own width is what makes
 * a gap too narrow to use distinguishable from one that is fine.
 *
 * Returned as offsets from the enemy, in the ground plane.
 */
export function shoulderOrigins(
  dirX: number,
  dirZ: number,
  halfWidth: number,
): { x: number; z: number }[] {
  // Perpendicular to the heading, in the ground plane.
  const px = -dirZ;
  const pz = dirX;
  return [
    { x: 0, z: 0 },
    { x: -px * halfWidth, z: -pz * halfWidth },
    { x: px * halfWidth, z: pz * halfWidth },
  ];
}

export interface FanProbe {
  /** Radians from the desired heading. */
  angle: number;
  /** Distance to what it hit, or null when it reached nothing. */
  distance: number | null;
}

export interface Heading {
  x: number;
  z: number;
  /** The offset chosen, for feeding back as `previousTurn` next tick. */
  turn: number;
}

export interface SteerOptions {
  probeRange?: number;
  /**
   * The offset chosen last tick.
   *
   * Two routes around an obstacle are often scored within a hair of each
   * other, and without a nudge toward the previous choice an enemy alternates
   * between them and walks on the spot.
   */
  previousTurn?: number;
  /**
   * Wedged: pick the most open direction and ignore where it points.
   *
   * The deck's equipment leaves pinches a scavenger can slide into and then
   * cannot move in any direction at all — the character controller returns
   * exactly zero however good the heading is. Alignment is what walked it in
   * there, so while it is stuck the only thing worth ranking is room.
   */
  stuck?: boolean;
}

/** How much a same-side choice is favoured, as a fraction of the score range. */
const COMMITMENT_BONUS = 0.08;

/**
 * The heading to actually travel along, given where the enemy wants to go and
 * how far it can see in each sampled direction.
 */
export function steerAround(
  desiredX: number,
  desiredZ: number,
  fan: readonly FanProbe[],
  options: SteerOptions = {},
): Heading {
  const probeRange = options.probeRange ?? PROBE_RANGE;
  const previousTurn = options.previousTurn ?? 0;
  const stuck = options.stuck ?? false;

  const length = Math.hypot(desiredX, desiredZ);
  // Standing exactly on the target. Any answer is arbitrary; NaN is not, and
  // it would poison the character controller downstream.
  if (length < 1e-6) return { x: 0, z: 1, turn: 0 };

  const x = desiredX / length;
  const z = desiredZ / length;
  if (fan.length === 0) return { x, z, turn: 0 };

  // Commitment only applies while actually avoiding something. Left ungated,
  // the bonus is enough to beat straight-ahead on its own, and an enemy with
  // an open path in front of it wanders off at an angle for no reason.
  const forward = fan.find((probe) => probe.angle === 0);
  const avoiding = forward !== undefined && forward.distance !== null;
  const committed = avoiding && previousTurn !== 0;

  let bestScore = -Infinity;
  let bestAngle = 0;

  for (const probe of fan) {
    const openness = Math.min(probe.distance ?? probeRange, probeRange) / probeRange;

    // Openness gates, alignment ranks. A direction you cannot walk down is
    // worthless however well it points at the player, so openness multiplies
    // rather than adds — and straight ahead while clear always wins outright.
    // Wedged, alignment drops out entirely: backwards with room beats forwards
    // without, which is the whole point of backing out.
    let score = stuck ? openness : openness * (0.5 + 0.5 * Math.cos(probe.angle));

    if (committed && Math.sign(probe.angle) === Math.sign(previousTurn)) {
      score += COMMITMENT_BONUS;
    }

    if (score > bestScore) {
      bestScore = score;
      bestAngle = probe.angle;
    }
  }

  const sin = Math.sin(bestAngle);
  const cos = Math.cos(bestAngle);
  return { x: x * cos - z * sin, z: x * sin + z * cos, turn: bestAngle };
}
