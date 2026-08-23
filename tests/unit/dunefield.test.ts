import { describe, it, expect } from 'vitest';
import { duneHeightAt, DUNE_PARAMS } from '@/world/DuneField';

describe('duneHeightAt', () => {
  it('is deterministic', () => {
    expect(duneHeightAt(12.5, -80.25)).toBe(duneHeightAt(12.5, -80.25));
  });

  it('stays within the amplitude the parameters allow', () => {
    const limit = DUNE_PARAMS.height + DUNE_PARAMS.ridgeHeight;
    for (let i = 0; i < 3000; i++) {
      const h = duneHeightAt(i * 3.7 - 400, i * -2.9 + 120);
      expect(Math.abs(h)).toBeLessThanOrEqual(limit);
    }
  });

  it('is continuous — no cliffs between nearby samples', () => {
    for (let i = 0; i < 400; i++) {
      const x = i * 1.7;
      const a = duneHeightAt(x, 40);
      const b = duneHeightAt(x + 0.05, 40);
      expect(Math.abs(a - b)).toBeLessThan(0.6);
    }
  });

  it('actually varies across the field', () => {
    const samples = Array.from({ length: 400 }, (_, i) => duneHeightAt(i * 6.1, i * 2.3));
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(2);
  });
});
