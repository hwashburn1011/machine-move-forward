import { describe, expect, it } from 'vitest';
import { CourseController, type CourseContext } from '@/navigation/CourseController';

const ready: CourseContext = { powered: true, playerOnMachine: true, stable: true, locked: false };

describe('CourseController', () => {
  it('rate limits bearing and accumulates invariant lateral travel', () => {
    const one = new CourseController();
    const many = new CourseController();
    one.setTier(1);
    many.setTier(1);
    one.setDesiredBearing(12, ready);
    many.setDesiredBearing(12, ready);
    for (let i = 0; i < 60; i++) one.fixedUpdate(1 / 60, 10 / 60);
    for (let i = 0; i < 60; i++) many.fixedUpdate(1 / 60, 10 / 60);
    expect(many.snapshot.lateralM).toBeCloseTo(one.snapshot.lateralM, 8);
  });

  it('refuses unsafe commands and clamps tier limits', () => {
    const c = new CourseController();
    expect(c.setDesiredBearing(5, { ...ready, locked: true })).toEqual({
      ok: false,
      reason: 'locked',
    });
    expect(c.setTier(1)).toEqual(expect.objectContaining({ tier: 1 }));
    expect(c.setDesiredBearing(999, ready)).toEqual({ ok: true });
    expect(c.snapshot.desiredDeg).toBe(-12);
  });

  it('restores finite state without trusting an invalid tier or changing on zero dt', () => {
    const c = new CourseController();
    c.restore({
      tier: 99 as 0 | 1 | 2 | 3,
      bearingDeg: 40,
      desiredDeg: -40,
      throttle: NaN,
      lateralM: 3,
    });
    expect(c.snapshot.tier).toBe(3);
    expect(c.snapshot.bearingDeg).toBe(40);
    const before = c.snapshot;
    expect(c.fixedUpdate(0, 2)).toEqual({ forwardM: 2, lateralM: 0 });
    expect(c.snapshot.bearingDeg).toBe(before.bearingDeg);
  });

  it('treats a missing old course save as a fresh controller', () => {
    const c = new CourseController();
    c.setTier(1);
    c.setDesiredBearing(10, ready);
    c.fixedUpdate(1, 4);
    c.restore(undefined);
    expect(c.snapshot).toEqual({ tier: 0, bearingDeg: 0, desiredDeg: 0, throttle: 1, lateralM: 0 });
  });
});
