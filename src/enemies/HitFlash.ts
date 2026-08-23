/**
 * The shape of an enemy's hit flash.
 *
 * Pure, and separate from the material handling, because the failure modes are
 * silent ones: a curve that never quite reaches zero leaves every scavenger
 * permanently lit, and one that divides by a zero duration puts NaN into an
 * emissive colour and blanks the enemy out of the scene entirely.
 */

/** Seconds a scavenger stays lit after being shot. */
export const FLASH_SECONDS = 0.16;

/**
 * Fraction of the flash held at full brightness before it starts to decay.
 *
 * A pure decay can be stepped clean over between two frames on a slow machine,
 * so the hit that killed something registers as nothing at all. Holding the
 * first fraction guarantees at least one frame shows it.
 */
const HOLD = 0.35;

/**
 * How lit the enemy is, 1 at the moment of impact down to 0 at the end.
 *
 * Clamped at both ends: before impact it reads as full rather than
 * extrapolating past 1, and after the end it reads as 0 rather than going
 * negative and driving the emissive the wrong way.
 */
export function flashIntensity(elapsed: number, duration: number): number {
  if (duration <= 0) return 0;
  if (elapsed <= 0) return 1;
  if (elapsed >= duration) return 0;

  const t = elapsed / duration;
  if (t <= HOLD) return 1;
  return 1 - (t - HOLD) / (1 - HOLD);
}
