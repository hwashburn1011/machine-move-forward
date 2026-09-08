import { describe, it, expect } from 'vitest';
import { scrollOffset, WORLD_Z_PER_METRE } from '@/world/WorldManager';
import { BASE_MACHINE_SPEED, FIXED_DT } from '@/game/constants';

/**
 * The world scroll's sub-step offset.
 *
 * `WorldManager.fixedUpdate` advances `distance` only on the fixed step, so
 * without this the ground moves in 60Hz jumps while the player and enemies are
 * interpolated smoothly. On any display out of phase with the fixed step that
 * reads as a stutter, and entities standing on the ground appear to slide
 * against it by up to a full step of travel.
 */

describe('scrollOffset', () => {
  it('is zero when the renderer is exactly on a simulated step', () => {
    // toBeCloseTo, not toBe: the expression yields -0 and Object.is
    // distinguishes that from +0 even though they are arithmetically equal.
    expect(scrollOffset(0, BASE_MACHINE_SPEED)).toBeCloseTo(0, 10);
  });

  it('never exceeds one step of travel', () => {
    const full = Math.abs(scrollOffset(1, BASE_MACHINE_SPEED));
    expect(full).toBeCloseTo(BASE_MACHINE_SPEED * FIXED_DT, 10);
    // 7.5 m/s at 60Hz is 12.5cm — small, but exactly the size of the slide.
    expect(full).toBeLessThan(0.2);
  });

  it('scrolls the way the world goes, whichever way that is', () => {
    // Not "toward -Z". The sub-step offset and the step it is a fraction of
    // must agree about direction, and this file pinning a sign of its own was
    // one more place "forward" was written down -- which is exactly the split
    // that let the machine drive stern-first for five milestones.
    expect(scrollOffset(0.5, BASE_MACHINE_SPEED) * WORLD_Z_PER_METRE).toBeGreaterThan(0);
  });

  it('is proportional to alpha, so motion is linear within a step', () => {
    const quarter = scrollOffset(0.25, BASE_MACHINE_SPEED);
    const half = scrollOffset(0.5, BASE_MACHINE_SPEED);
    expect(half / quarter).toBeCloseTo(2, 10);
  });

  it('stops when the machine stops', () => {
    expect(scrollOffset(0.75, 0)).toBeCloseTo(0, 10);
  });
});
