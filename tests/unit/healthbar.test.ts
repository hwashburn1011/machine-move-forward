import { describe, it, expect } from 'vitest';
import { HEALTH_BANDS, healthBarColour, healthFraction } from '@/enemies/HealthBar';

/**
 * The numbers behind a scavenger's health bar.
 *
 * Pure because both halves fail silently in the scene graph: a fraction that
 * escapes 0..1 scales a sprite inside out or off the deck, and a NaN from a
 * zero-health definition removes the bar from the frame entirely.
 */
describe('health fraction', () => {
  it('is the obvious ratio in the middle', () => {
    expect(healthFraction(55, 110)).toBeCloseTo(0.5, 6);
  });

  it('is full at full health and empty at zero', () => {
    expect(healthFraction(110, 110)).toBe(1);
    expect(healthFraction(0, 110)).toBe(0);
  });

  it('clamps rather than letting a bar overrun its backing', () => {
    // Overheal is not a thing today, but a bar wider than its own background
    // is a very visible way to find out that it becomes one.
    expect(healthFraction(200, 110)).toBe(1);
    expect(healthFraction(-20, 110)).toBe(0);
  });

  it('returns zero rather than NaN for a zero-health definition', () => {
    // NaN reaches a sprite scale and the bar vanishes, which reads as "no
    // enemy there" -- the exact thing this feature exists to fix.
    expect(healthFraction(0, 0)).toBe(0);
    expect(Number.isFinite(healthFraction(10, 0))).toBe(true);
  });
});

describe('health bar colour', () => {
  it('is calm at full health and alarming at low', () => {
    expect(healthBarColour(1)).toBe(HEALTH_BANDS.healthy);
    expect(healthBarColour(0.1)).toBe(HEALTH_BANDS.critical);
  });

  it('passes through a middle band rather than snapping', () => {
    expect(healthBarColour(0.5)).toBe(HEALTH_BANDS.hurt);
  });

  it('never returns undefined for any fraction in range', () => {
    for (let f = 0; f <= 1.0001; f += 0.01) {
      expect(typeof healthBarColour(f)).toBe('number');
    }
  });

  it('is defined outside the range too, in case a caller skips clamping', () => {
    expect(typeof healthBarColour(-1)).toBe('number');
    expect(typeof healthBarColour(2)).toBe('number');
  });
});
