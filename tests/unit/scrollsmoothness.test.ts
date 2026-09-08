import { describe, it, expect } from 'vitest';
import { GameLoop } from '@/game/GameLoop';
import { scrollOffset, WORLD_Z_PER_METRE } from '@/world/WorldManager';
import { BASE_MACHINE_SPEED, FIXED_DT } from '@/game/constants';

/**
 * The world scroll, driven by the real loop at display rates faster than the
 * simulation.
 *
 * This is the bug the render offset exists to fix, reproduced without a
 * browser. At 144Hz the renderer draws roughly 2.4 frames per 60Hz simulation
 * step, so without a sub-step offset more than half of all frames draw the
 * world at *exactly* the position the previous frame drew it — the ground
 * freezes, then jumps, while the player and enemies glide because they are
 * interpolated. A headless software renderer cannot show this, because it runs
 * slower than the fixed step and each frame spans several of them.
 */

/** Run the loop at a fixed display rate and record what each frame would draw. */
function runFrames(displayHz: number, frames: number, interpolate: boolean) {
  const frameSeconds = 1 / displayHz;
  let distance = 0;
  const drawnZ: number[] = [];

  const loop = new GameLoop({
    fixedUpdate: () => {
      distance += BASE_MACHINE_SPEED * FIXED_DT;
    },
    render: (alpha) => {
      // Which way the world goes is `WORLD_Z_PER_METRE`'s to say, not this
      // file's -- it used to write the minus sign itself, and then said so in
      // a comment quoting an arithmetic that has since moved.
      const offset = interpolate ? scrollOffset(alpha, BASE_MACHINE_SPEED) : 0;
      drawnZ.push(WORLD_Z_PER_METRE * distance + offset);
    },
  });

  for (let i = 0; i < frames; i++) loop.advance(frameSeconds);
  return drawnZ;
}

function frozenFrames(drawn: number[]): number {
  let frozen = 0;
  for (let i = 1; i < drawn.length; i++) {
    if (Math.abs(drawn[i]! - drawn[i - 1]!) < 1e-12) frozen++;
  }
  return frozen;
}

describe('world scroll smoothness at display rates above the sim rate', () => {
  it('freezes on most frames at 144Hz without the offset', () => {
    const drawn = runFrames(144, 200, false);
    const frozen = frozenFrames(drawn);
    // 144/60 = 2.4 frames per step, so ~58% of frames repeat a position.
    expect(frozen).toBeGreaterThan(drawn.length * 0.5);
  });

  it('never freezes at 144Hz with the offset', () => {
    const drawn = runFrames(144, 200, true);
    expect(frozenFrames(drawn)).toBe(0);
  });

  it('never freezes at 120Hz or 240Hz either', () => {
    expect(frozenFrames(runFrames(120, 200, true))).toBe(0);
    expect(frozenFrames(runFrames(240, 200, true))).toBe(0);
  });

  it('advances by an even amount every frame, not in bursts', () => {
    const drawn = runFrames(144, 200, true);
    const steps: number[] = [];
    for (let i = 1; i < drawn.length; i++) steps.push(Math.abs(drawn[i]! - drawn[i - 1]!));

    const expected = BASE_MACHINE_SPEED / 144;
    for (const step of steps) expect(step).toBeCloseTo(expected, 9);
  });

  it('still moves strictly forward, never backward', () => {
    const drawn = runFrames(144, 200, true);
    // Monotonic THE WAY THE WORLD GOES. A frame that drew the ground back
    // where it had already been would read as a judder whichever direction
    // that is, so the assertion is about the sign of the step, not about Z.
    for (let i = 1; i < drawn.length; i++) {
      expect((drawn[i]! - drawn[i - 1]!) * WORLD_Z_PER_METRE).toBeGreaterThan(0);
    }
  });
});
