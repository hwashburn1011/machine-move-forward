import { describe, it, expect } from 'vitest';
import { valueNoise2D, fbm2D } from '@/core/math/Noise';

describe('valueNoise2D', () => {
  it('is deterministic', () => {
    expect(valueNoise2D(1.5, -2.25, 42)).toBe(valueNoise2D(1.5, -2.25, 42));
  });

  it('stays within [-1, 1]', () => {
    for (let i = 0; i < 2000; i++) {
      const v = valueNoise2D(i * 0.37, i * -0.11, 3);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is continuous: nearby inputs give nearby outputs', () => {
    const a = valueNoise2D(10, 10, 5);
    const b = valueNoise2D(10.001, 10, 5);
    expect(Math.abs(a - b)).toBeLessThan(0.05);
  });

  it('is continuous across integer lattice boundaries', () => {
    const a = valueNoise2D(6.999, 3.5, 5);
    const b = valueNoise2D(7.001, 3.5, 5);
    expect(Math.abs(a - b)).toBeLessThan(0.05);
  });

  it('varies with seed', () => {
    expect(valueNoise2D(3, 3, 1)).not.toBe(valueNoise2D(3, 3, 2));
  });

  it('actually varies across the domain', () => {
    const samples = Array.from({ length: 200 }, (_, i) => valueNoise2D(i * 0.5, 0, 2));
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.3);
  });
});

describe('fbm2D', () => {
  it('is deterministic', () => {
    expect(fbm2D(0.5, 0.5, 9)).toBe(fbm2D(0.5, 0.5, 9));
  });

  it('stays within [-1, 1] at the default octave count', () => {
    for (let i = 0; i < 1000; i++) {
      const v = fbm2D(i * 0.13, i * 0.29, 8);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('stays within [-1, 1] at a high octave count', () => {
    for (let i = 0; i < 500; i++) {
      const v = fbm2D(i * 0.07, i * 0.19, 4, 8);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('actually varies across the domain', () => {
    const samples = Array.from({ length: 200 }, (_, i) => fbm2D(i * 0.5, 0, 2));
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.3);
  });
});
