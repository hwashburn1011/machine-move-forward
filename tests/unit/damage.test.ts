import { describe, it, expect } from 'vitest';
import { computeDamage } from '@/combat/DamageSystem';

describe('computeDamage', () => {
  it('deals full damage inside the falloff start', () => {
    expect(computeDamage(24, 10, 120, 45)).toBe(24);
    expect(computeDamage(24, 45, 120, 45)).toBe(24);
  });

  it('falls off linearly between falloffStart and range', () => {
    const mid = computeDamage(24, 45 + (120 - 45) / 2, 120, 45);
    expect(mid).toBeCloseTo(12, 5);
  });

  it('deals zero beyond range', () => {
    expect(computeDamage(24, 120.1, 120, 45)).toBe(0);
    expect(computeDamage(24, 5000, 120, 45)).toBe(0);
  });

  it('reaches zero exactly at max range', () => {
    expect(computeDamage(24, 120, 120, 45)).toBeCloseTo(0, 6);
  });

  it('subtracts armour before applying falloff', () => {
    // 24 - 10 = 14 at point blank; halfway out that is 7, not (24/2 - 10).
    expect(computeDamage(24, 10, 120, 45, 10)).toBe(14);
    expect(computeDamage(24, 82.5, 120, 45, 10)).toBeCloseTo(7, 5);
  });

  it('never returns negative damage when armour exceeds damage', () => {
    expect(computeDamage(10, 5, 120, 45, 50)).toBe(0);
  });

  it('never returns a negative value at any distance', () => {
    for (let d = 0; d <= 200; d += 3) {
      expect(computeDamage(24, d, 120, 45, 6)).toBeGreaterThanOrEqual(0);
    }
  });

  it('decreases monotonically with distance', () => {
    let previous = Infinity;
    for (let d = 0; d <= 130; d += 2) {
      const dmg = computeDamage(24, d, 120, 45);
      expect(dmg).toBeLessThanOrEqual(previous + 1e-9);
      previous = dmg;
    }
  });

  it('is deterministic', () => {
    expect(computeDamage(24, 61.5, 120, 45, 3)).toBe(computeDamage(24, 61.5, 120, 45, 3));
  });

  it('handles a zero-width falloff band without dividing by zero', () => {
    expect(Number.isFinite(computeDamage(24, 50, 45, 45))).toBe(true);
  });
});
