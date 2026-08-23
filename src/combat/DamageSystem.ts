/**
 * Damage arithmetic. Pure and fully tested — every other combat system routes
 * through this, so a mistake here is a mistake everywhere.
 */

/**
 * Damage after armour and distance falloff.
 *
 * Armour subtracts first, then falloff scales what is left. Doing it the other
 * way round would make armour scale with range, which is not what a flat
 * armour value should mean.
 */
export function computeDamage(
  baseDamage: number,
  distance: number,
  range: number,
  falloffStart: number,
  armor = 0,
): number {
  if (distance > range) return 0;

  const afterArmor = Math.max(0, baseDamage - armor);
  if (afterArmor === 0) return 0;

  if (distance <= falloffStart) return afterArmor;

  // Linear from full damage at falloffStart to zero at range.
  const span = range - falloffStart;
  if (span <= 0) return afterArmor;
  const t = (distance - falloffStart) / span;
  return Math.max(0, afterArmor * (1 - t));
}
