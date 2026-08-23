import { describe, it, expect } from 'vitest';
import { FIXED_DT, MAX_STEPS_PER_FRAME, GRID_TILE } from '@/game/constants';

describe('toolchain', () => {
  it('resolves the @ alias and exports a 60Hz fixed timestep', () => {
    expect(FIXED_DT).toBeCloseTo(1 / 60, 10);
  });

  it('caps simulation steps per frame', () => {
    expect(MAX_STEPS_PER_FRAME).toBeGreaterThan(1);
    expect(MAX_STEPS_PER_FRAME).toBeLessThanOrEqual(10);
  });

  it('uses the 2m build grid from the handoff', () => {
    expect(GRID_TILE).toBe(2);
  });
});
