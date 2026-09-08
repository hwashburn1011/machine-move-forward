/**
 * The numbers behind a scavenger's health bar.
 *
 * Pure, because both halves of this fail silently once they reach the scene
 * graph: a fraction outside 0..1 scales a sprite inside out or off the deck,
 * and a NaN from a zero-health definition removes the bar from the frame
 * altogether — which reads as "no enemy there", the exact thing the bar exists
 * to fix.
 */

/** Design width at full health; EnemyVisual maps it to a compact screen size. */
export const BAR_WIDTH = 0.86;

/** Design height, in the same units as BAR_WIDTH. */
export const BAR_HEIGHT = 0.1;

/** Colours the bar steps through as a scavenger is worn down. */
export const HEALTH_BANDS = {
  healthy: 0xd94f3a,
  hurt: 0xe8863a,
  critical: 0xffd24a,
} as const;

/** How much of the bar is filled, always within 0..1. */
export function healthFraction(current: number, max: number): number {
  if (!(max > 0)) return 0;
  const f = current / max;
  if (!Number.isFinite(f)) return 0;
  return Math.max(0, Math.min(1, f));
}

/**
 * The bar's colour at a given fill.
 *
 * Runs hot rather than the usual green-to-red: a scavenger is a threat at
 * every point on this scale, and green would read as something the player is
 * meant to leave alone. The change is there to tell them it is nearly done,
 * not to tell them it is safe.
 */
export function healthBarColour(fraction: number): number {
  if (fraction <= 0.3) return HEALTH_BANDS.critical;
  if (fraction <= 0.65) return HEALTH_BANDS.hurt;
  return HEALTH_BANDS.healthy;
}
