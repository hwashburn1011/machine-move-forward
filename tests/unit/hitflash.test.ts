import { describe, it, expect } from 'vitest';
import { FLASH_SECONDS, flashIntensity } from '@/enemies/HitFlash';

/**
 * The shape of a hit flash.
 *
 * Pure, because the failure modes here are silent: a curve that never reaches
 * zero leaves every scavenger permanently lit, and one that divides by a zero
 * duration puts NaN into a material and blanks the enemy entirely.
 */
describe('hit flash curve', () => {
  const D = FLASH_SECONDS;

  it('is full brightness at the moment of impact', () => {
    expect(flashIntensity(0, D)).toBe(1);
  });

  it('holds briefly, so a hit registers even on a slow frame', () => {
    // At 30fps a single frame is 33ms. A curve that has already decayed by
    // then can be skipped over entirely between two frames.
    expect(flashIntensity(0.033, D)).toBe(1);
  });

  it('is fully out by the end', () => {
    expect(flashIntensity(D, D)).toBe(0);
  });

  it('stays out afterwards rather than going negative', () => {
    // A negative intensity would drive emissive the wrong way and darken the
    // enemy below its own material.
    expect(flashIntensity(D * 3, D)).toBe(0);
  });

  it('never exceeds full brightness before impact', () => {
    expect(flashIntensity(-1, D)).toBe(1);
  });

  it('decays without ever brightening again', () => {
    let previous = Infinity;
    for (let t = 0; t <= D * 1.2; t += D / 40) {
      const v = flashIntensity(t, D);
      expect(v).toBeLessThanOrEqual(previous + 1e-9);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      previous = v;
    }
  });

  it('survives a zero duration instead of returning NaN', () => {
    expect(Number.isFinite(flashIntensity(0, 0))).toBe(true);
    expect(flashIntensity(0, 0)).toBe(0);
  });
});
