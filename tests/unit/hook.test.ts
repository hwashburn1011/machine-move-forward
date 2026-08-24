import { describe, it, expect } from 'vitest';
import { HOOK_SPEED, stepHook, type HookState } from '@/salvage/Hook';

const OUT: HookState = { distance: 0, phase: 'out' };

describe('the thrown hook', () => {
  it('flies outward at its speed', () => {
    expect(stepHook(OUT, 0.1, 40).distance).toBeCloseTo(HOOK_SPEED * 0.1, 6);
  });

  it('turns around at the end of its reach rather than sailing past', () => {
    // A hook that never turns leaves the cable stretched across the desert.
    const s = stepHook({ distance: 39, phase: 'out' }, 1, 40);
    expect(s.phase).toBe('back');
    expect(s.distance).toBe(40);
  });

  it('comes back in and finishes at the player', () => {
    const s = stepHook({ distance: 0.5, phase: 'back' }, 1, 40);
    expect(s.phase).toBe('done');
    expect(s.distance).toBe(0);
  });

  it('never overshoots into negative distance', () => {
    // A negative distance would put the hook behind the player and draw the
    // cable out the wrong side of them.
    expect(stepHook({ distance: 1, phase: 'back' }, 10, 40).distance).toBe(0);
  });

  it('stays finished once finished', () => {
    const done: HookState = { distance: 0, phase: 'done' };
    expect(stepHook(done, 0.5, 40)).toEqual(done);
  });

  it('always completes a throw, however short the reach', () => {
    // Pressing the key has to produce a visible out-and-back every time, or
    // there is no way to learn where the reel points.
    let s: HookState = OUT;
    let frames = 0;
    while (s.phase !== 'done' && frames < 1000) {
      s = stepHook(s, 1 / 60, 6);
      frames++;
    }
    expect(s.phase).toBe('done');
    expect(frames).toBeLessThan(200);
  });

  it('ignores a negative frame time instead of flying backwards', () => {
    expect(stepHook(OUT, -1, 40).distance).toBe(0);
  });
});
