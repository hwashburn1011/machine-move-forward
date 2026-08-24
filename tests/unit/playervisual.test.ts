import { describe, it, expect } from 'vitest';
import { playerGait } from '@/player/PlayerGait';

/**
 * Which clip the player's legs should be playing.
 *
 * Pure, because the failure is subtle rather than loud: a threshold slightly
 * wrong leaves the character sprinting on the spot, or sliding across the deck
 * in an idle pose, and neither throws anything.
 */
describe('choosing the player gait', () => {
  it('stands still when stopped', () => {
    expect(playerGait(0, true)).toBe('idle');
  });

  it('walks at a walking pace and runs at a running one', () => {
    expect(playerGait(2, true)).toBe('walk');
    expect(playerGait(6, true)).toBe('run');
  });

  it('does not twitch into a walk from floating-point noise', () => {
    // A stationary player still reports a hair of speed from the controller.
    expect(playerGait(0.02, true)).toBe('idle');
  });

  it('keeps the legs moving in the air rather than snapping to idle', () => {
    // Airborne with speed carried in: an idle pose mid-jump reads as a bug.
    expect(playerGait(5, false)).toBe('run');
    expect(playerGait(2, false)).toBe('walk');
  });

  it('is monotonic — more speed never gives a slower gait', () => {
    const order = { idle: 0, walk: 1, run: 2 };
    let previous = -1;
    for (let s = 0; s <= 9; s += 0.25) {
      const rank = order[playerGait(s, true)];
      expect(rank).toBeGreaterThanOrEqual(previous);
      previous = rank;
    }
  });

  it('survives a negative or non-finite speed', () => {
    expect(playerGait(-3, true)).toBe('idle');
    expect(playerGait(Number.NaN, true)).toBe('idle');
  });
});
