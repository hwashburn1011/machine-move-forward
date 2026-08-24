/**
 * Choosing what the salvage reel grabs.
 *
 * Pure, because aiming bugs are quiet ones: a sign slip snatches the chest
 * behind you, and a cone compared the wrong way round either grabs nothing at
 * all or grabs everything on the deck.
 */

export interface ReelCandidate {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Metres the reel can reach. */
export const REEL_RANGE = 34;

/**
 * Cosine of the half-angle the reel will accept.
 *
 * About 22 degrees. Tight enough that the reel is aimed rather than sprayed,
 * wide enough to catch a chest drifting past at 7.5 m/s without demanding
 * pixel-perfect tracking.
 */
export const REEL_CONE_COS = 0.927;

/**
 * The best thing to hook, or null when nothing qualifies.
 *
 * Nearest wins among everything inside the cone: with several chests lined up,
 * the one the player expects to get is the near one.
 */
export function pickReelTarget(
  candidates: readonly ReelCandidate[],
  from: Vec3Like,
  aim: Vec3Like,
): ReelCandidate | null {
  const aimLength = Math.hypot(aim.x, aim.y, aim.z);
  if (aimLength < 1e-6) return null;

  const ax = aim.x / aimLength;
  const ay = aim.y / aimLength;
  const az = aim.z / aimLength;

  let best: ReelCandidate | null = null;
  let bestDistance = Infinity;

  for (const c of candidates) {
    const dx = c.x - from.x;
    const dy = c.y - from.y;
    const dz = c.z - from.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 1e-6 || distance > REEL_RANGE) continue;

    // Cosine of the angle between the aim and the direction to the target.
    const alignment = (dx * ax + dy * ay + dz * az) / distance;
    if (alignment < REEL_CONE_COS) continue;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = c;
    }
  }

  return best;
}
