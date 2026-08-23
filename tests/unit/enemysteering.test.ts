import { describe, it, expect } from 'vitest';
import {
  FAN_OFFSETS,
  PROBE_RANGE,
  steerAround,
  type FanProbe,
} from '@/enemies/EnemySteering';

/** A fan reading where every sampled direction is wide open. */
const clear = (): FanProbe[] => FAN_OFFSETS.map((angle) => ({ angle, distance: null }));

/** A fan where `blocked` returns a short distance and everything else is open. */
const fanWith = (blocked: (angle: number) => number | null): FanProbe[] =>
  FAN_OFFSETS.map((angle) => ({ angle, distance: blocked(angle) }));

const length = (v: { x: number; z: number }) => Math.hypot(v.x, v.z);

/** Signed turn from `a` to `b`, positive clockwise about +Y. */
const turn = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);

const NORTH = { x: 0, z: 1 };

describe('the fan', () => {
  it('samples every direction with gaps under 45 degrees', () => {
    // An opening must not be able to hide between two probes.
    const sorted = [...FAN_OFFSETS].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]! - sorted[i - 1]!).toBeLessThan(Math.PI / 4);
    }
  });

  it('is symmetric, so neither side is structurally favoured', () => {
    for (const angle of FAN_OFFSETS) {
      expect(FAN_OFFSETS.some((other) => Math.abs(other + angle) < 1e-9)).toBe(true);
    }
  });
});

describe('an unobstructed path', () => {
  it('goes straight at the target', () => {
    const out = steerAround(0, 1, clear());
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.z).toBeCloseTo(1, 6);
    expect(out.turn).toBe(0);
  });

  it('normalises a desired heading that is not unit length', () => {
    expect(length(steerAround(0, 5, clear()))).toBeCloseTo(1, 6);
  });

  it('holds course even when something is beside it', () => {
    // Brushing past a wall is not a reason to turn.
    const out = steerAround(0, 1, fanWith((a) => (Math.abs(a) > 1.5 ? 0.2 : null)));
    expect(out.turn).toBe(0);
  });
});

describe('an obstacle ahead', () => {
  it('turns toward the open side', () => {
    // Everything from straight ahead round to the right is walled off.
    const out = steerAround(0, 1, fanWith((a) => (a >= -0.1 ? 0.2 : null)));
    expect(turn(NORTH, out)).toBeLessThan(0);
    expect(length(out)).toBeCloseTo(1, 6);
  });

  it('escapes a corner by looking wider than the blockage', () => {
    // Blocked ahead AND on the near diagonals — the case three whiskers wedged
    // on. Only the widest probes are open, and it must pick one of them.
    const out = steerAround(0, 1, fanWith((a) => (Math.abs(a) < 1.5 ? 0.15 : null)));
    expect(Math.abs(out.turn)).toBeGreaterThanOrEqual(1.5);
    expect(length(out)).toBeCloseTo(1, 6);
  });

  it('prefers the more open of two escapes', () => {
    const out = steerAround(
      0,
      1,
      fanWith((a) => (a === 0 ? 0.15 : a > 0 ? 1.5 : 0.3)),
    );
    expect(turn(NORTH, out)).toBeGreaterThan(0);
  });

  it('never chooses a direction it cannot walk down', () => {
    // One escape, at a wide angle; everything else is hard against something.
    const out = steerAround(0, 1, fanWith((a) => (Math.abs(a - 2.0) < 1e-9 ? null : 0.02)));
    expect(out.turn).toBeCloseTo(2.0, 6);
  });

  it('always returns a unit heading', () => {
    for (const d of [0, 0.05, 0.4, 1.0, PROBE_RANGE]) {
      expect(length(steerAround(0, 1, fanWith(() => d)))).toBeCloseTo(1, 6);
    }
  });
});

describe('commitment', () => {
  it('breaks a tie toward the side it already chose', () => {
    // Perfectly symmetric blockage: without a nudge this alternates every tick
    // and the enemy walks on the spot.
    const symmetric = fanWith((a) => (Math.abs(a) < 0.1 ? 0.2 : null));
    const left = steerAround(0, 1, symmetric, { previousTurn: -1.2 });
    const right = steerAround(0, 1, symmetric, { previousTurn: 1.2 });
    expect(Math.sign(left.turn)).toBe(-1);
    expect(Math.sign(right.turn)).toBe(1);
  });

  it('does not override a genuinely better route', () => {
    // Committed left, but left is now walled and right is wide open.
    const out = steerAround(
      0,
      1,
      fanWith((a) => (a <= 0 ? 0.05 : null)),
      { previousTurn: -2.0 },
    );
    expect(out.turn).toBeGreaterThan(0);
  });

  it('does not bias the straight-ahead choice', () => {
    const out = steerAround(0, 1, clear(), { previousTurn: 2.0 });
    expect(out.turn).toBe(0);
  });
});

describe('degenerate input', () => {
  it('survives standing exactly on the target', () => {
    const out = steerAround(0, 0, clear());
    expect(Number.isFinite(out.x)).toBe(true);
    expect(Number.isFinite(out.z)).toBe(true);
  });

  it('survives an empty fan', () => {
    const out = steerAround(0, 1, []);
    expect(out.z).toBeCloseTo(1, 6);
  });
});
