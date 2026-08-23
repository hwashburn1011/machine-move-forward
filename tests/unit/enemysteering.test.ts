import { describe, it, expect } from 'vitest';
import {
  FAN_OFFSETS,
  PROBE_RANGE,
  steerAround,
  shoulderOrigins,
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

describe('probing a direction at body width', () => {
  it('puts one origin on the centre line and one at each shoulder', () => {
    const origins = shoulderOrigins(0, 1, 0.38);
    expect(origins).toHaveLength(3);
    expect(origins[0]).toEqual({ x: 0, z: 0 });
  });

  it('offsets the shoulders perpendicular to the heading', () => {
    // A sign or axis slip here probes ahead and behind instead of side to
    // side, which looks like a working fan and measures nothing new.
    const headings: [number, number][] = [
      [0, 1],
      [1, 0],
      [Math.SQRT1_2, Math.SQRT1_2],
      [-0.6, 0.8],
    ];
    for (const [dx, dz] of headings) {
      for (const o of shoulderOrigins(dx, dz, 0.38).slice(1)) {
        expect(o.x * dx + o.z * dz).toBeCloseTo(0, 6);
      }
    }
  });

  it('offsets them by exactly the body half-width, one each way', () => {
const [, left, right] = shoulderOrigins(Math.SQRT1_2, Math.SQRT1_2, 0.38);
    if (!left || !right) throw new Error('expected three origins');
    expect(Math.hypot(left.x, left.z)).toBeCloseTo(0.38, 6);
    expect(Math.hypot(right.x, right.z)).toBeCloseTo(0.38, 6);
    // Opposite sides, not the same side twice.
    expect(left.x).toBeCloseTo(-right.x, 6);
    expect(left.z).toBeCloseTo(-right.z, 6);
  });

  it('is what makes a gap narrower than the body readable at all', () => {
    // The deck leaves a 0.65m slot between the generator and the engine. A
    // centre ray runs straight down it; a shoulder at 0.38 does not.
const [, left, right] = shoulderOrigins(0, -1, 0.38);
    if (!left || !right) throw new Error('expected three origins');
    expect(Math.abs(left.x)).toBeGreaterThan(0.65 / 2);
    expect(Math.abs(right.x)).toBeGreaterThan(0.65 / 2);
  });
});

describe('backing out of a wedge', () => {
  /** Boxed in: every direction obstructed, the best of them pointing backwards. */
  const boxedIn = (): FanProbe[] => [
    { angle: 0, distance: 0.03 },
    { angle: -0.5, distance: 0.32 },
    { angle: 0.5, distance: 0.15 },
    { angle: -1.0, distance: 0.46 },
    { angle: 1.0, distance: 0.29 },
    { angle: -1.5, distance: 0.47 },
    { angle: 1.5, distance: 0.38 },
    { angle: -2.0, distance: 0.25 },
    { angle: 2.0, distance: 0.51 },
  ];

  it('normally prefers a worse-but-forward opening', () => {
    // The default weighting is what walks it into the pinch in the first
    // place, and is right everywhere else.
    expect(steerAround(0.33, -0.94, boxedIn()).turn).toBe(-1);
  });

  it('takes the most open direction when stuck, whatever it points at', () => {
    // Alignment is what got it here. Once wedged, the only thing that matters
    // is which way has room.
    expect(steerAround(0.33, -0.94, boxedIn(), { stuck: true }).turn).toBe(2);
  });

  it('still returns a unit heading when stuck', () => {
    const h = steerAround(0.33, -0.94, boxedIn(), { stuck: true });
    expect(Math.hypot(h.x, h.z)).toBeCloseTo(1, 6);
  });

  it('leaves an unobstructed fan alone even when stuck', () => {
    // Stuck against something the fan cannot see is not a reason to walk off
    // in an arbitrary direction; with everything equally open, forward wins.
    expect(steerAround(0, 1, clear(), { stuck: true }).turn).toBe(0);
  });
});
