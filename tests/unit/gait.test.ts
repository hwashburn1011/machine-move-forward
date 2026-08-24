import { describe, it, expect } from 'vitest';
import { footAt, gaitPose, legCycle, isPlanted } from '@/machine/Gait';
import {
  DUTY,
  FOOT_LIFT,
  GROUND_Y,
  LEGS,
  MAX_REACH,
  STANCE_EXCURSION,
  STRIDE_LENGTH,
  type LegDefinition,
} from '@/data/gait';
import { MAX_HEAVE, MAX_TILT, transformPoint } from '@/machine/MachineBody';

/**
 * The gait: distance in, feet and a body pose out.
 *
 * Pure, so all of it is testable in node like `NavGraph` and `EnemySteering`.
 * The properties here are the ones that decide whether the machine reads as
 * walking or as sliding with its legs waving:
 *
 *   - a planted foot stays planted, which means it travels astern in machine
 *     space at exactly the rate the world scrolls past. Feet that slide destroy
 *     the effect faster than no animation at all (spec section 3).
 *   - the phase comes from distance travelled, so a stopped machine stops
 *     striding instead of marching on the spot.
 *   - at least two feet are always down.
 */

const FRONT_LEFT = LEGS[0] as LegDefinition;
const REAR_RIGHT = LEGS[3] as LegDefinition;

/** The distance at which a given leg is at a given point in its cycle. */
function atCycle(leg: LegDefinition, u: number): number {
  return STRIDE_LENGTH * (u - leg.phase);
}

/** Every leg, sampled right through a cycle. */
function sweep(steps = 360): number[] {
  return Array.from({ length: steps }, (_, i) => (i / steps) * STRIDE_LENGTH);
}

/**
 * The point in the cycle where one half of the machine is most obviously
 * carrying more than the other, and which half that is.
 *
 * "Carrying more" is measured from the feet themselves: a planted foot
 * directly under its hip is holding the body up, and one reaching fore or aft
 * is holding it less. Nothing here reads the pose it is about to check.
 */
function mostLopsided(half: (leg: LegDefinition) => -1 | 1): { d: number; heavier: -1 | 1 } {
  const bearing = (d: number, which: -1 | 1): number =>
    LEGS.filter((leg) => half(leg) === which && isPlanted(d, leg)).reduce(
      (sum, leg) => sum + 1 - Math.abs(footAt(d, leg).z - leg.hip.z) / (STANCE_EXCURSION / 2),
      0,
    );

  let best = { d: 0, heavier: 1 as -1 | 1, gap: 0 };
  for (const d of sweep(720)) {
    const gap = bearing(d, 1) - bearing(d, -1);
    if (Math.abs(gap) > Math.abs(best.gap)) {
      best = { d, heavier: gap > 0 ? 1 : -1, gap };
    }
  }
  return { d: best.d, heavier: best.heavier };
}

describe('the stride cycle', () => {
  it('completes exactly one cycle per stride length', () => {
    expect(legCycle(0, FRONT_LEFT)).toBeCloseTo(legCycle(STRIDE_LENGTH, FRONT_LEFT), 12);
    expect(legCycle(0, FRONT_LEFT)).toBeCloseTo(legCycle(STRIDE_LENGTH * 7, FRONT_LEFT), 10);
    // And not two, or a half: a quarter of a stride is a quarter of a cycle,
    // wherever in the cycle it is measured from.
    for (const from of [0, 1.7, 4.4]) {
      const advance = legCycle(from + STRIDE_LENGTH / 4, FRONT_LEFT) - legCycle(from, FRONT_LEFT);
      expect(advance - Math.floor(advance)).toBeCloseTo(0.25, 12);
    }
  });

  it('does not advance while the machine is stopped', () => {
    // Distance is the clock. A gait on a wall clock keeps striding at a
    // standstill, which is the one thing that would make the machine look
    // broken rather than slow.
    const stopped = 41.3;
    for (const leg of LEGS) {
      expect(legCycle(stopped, leg)).toBe(legCycle(stopped, leg));
      expect(footAt(stopped, leg)).toEqual(footAt(stopped, leg));
    }
  });

  it('puts no two legs sharing a side or an end in step with each other', () => {
    // This is what makes weight transfer possible at all. Diagonal pairs —
    // which the spec first asked for — give each side and each end one leg
    // from each pair, so their support sums are equal by construction and the
    // body cannot list, ever. See the note on `LEGS`.
    for (const a of LEGS) {
      for (const b of LEGS) {
        if (a === b) continue;
        if (a.side !== b.side && a.end !== b.end) continue;
        expect(a.phase).not.toBe(b.phase);
      }
    }
  });

  it('spreads the four legs evenly through the cycle', () => {
    const phases = [...LEGS.map((leg) => leg.phase)].sort((x, y) => x - y);
    expect(phases).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it('keeps at least two feet on the ground at every point in the cycle', () => {
    // The duty factor's whole job. Drop below two and the machine is airborne
    // between steps, which is a hop, not a walk.
    for (const d of sweep()) {
      const down = LEGS.filter((leg) => isPlanted(d, leg)).length;
      expect(down).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('a planted foot', () => {
  it('travels astern at exactly the rate the world scrolls past', () => {
    // THE property. The machine holds station and the world moves, so a foot
    // that is genuinely still on the ground must move astern in machine space
    // at one metre per metre travelled. Anything else is a foot skating.
    const step = 0.001;
    let sampled = 0;
    for (const d of sweep(400)) {
      if (!isPlanted(d, FRONT_LEFT) || !isPlanted(d + step, FRONT_LEFT)) continue;
      const before = footAt(d, FRONT_LEFT);
      const after = footAt(d + step, FRONT_LEFT);
      expect((after.z - before.z) / step).toBeCloseTo(1, 6);
      expect(after.x - before.x).toBeCloseTo(0, 9);
      sampled++;
    }
    expect(sampled).toBeGreaterThan(100);
  });

  it('stays on the ground while it is down', () => {
    for (const d of sweep()) {
      if (!isPlanted(d, REAR_RIGHT)) continue;
      expect(footAt(d, REAR_RIGHT).y).toBeCloseTo(GROUND_Y, 12);
    }
  });

  it('plants where it lifted off, a stride earlier', () => {
    // The foot has to come back to the front of its stance, or the leg walks
    // itself off the machine over a few cycles.
    const plant = footAt(atCycle(FRONT_LEFT, 0), FRONT_LEFT);
    const next = footAt(atCycle(FRONT_LEFT, 0) + STRIDE_LENGTH, FRONT_LEFT);
    expect(next.x).toBeCloseTo(plant.x, 10);
    expect(next.z).toBeCloseTo(plant.z, 10);
  });

  it('is placed symmetrically about its hip, so the leg reaches equally both ways', () => {
    // Sampled at the ends of the stance exactly, not by sweeping: the property
    // is about where stance begins and ends, and a sweep only ever lands near
    // them.
    const touchdown = footAt(atCycle(FRONT_LEFT, 0), FRONT_LEFT).z - FRONT_LEFT.hip.z;
    const liftoff = footAt(atCycle(FRONT_LEFT, DUTY) - 1e-9, FRONT_LEFT).z - FRONT_LEFT.hip.z;
    expect(touchdown).toBeCloseTo(-STANCE_EXCURSION / 2, 9);
    expect(liftoff).toBeCloseTo(STANCE_EXCURSION / 2, 6);
  });
});

describe('a swinging foot', () => {
  it('lifts off the ground and comes back down to it', () => {
    const swinging = sweep().filter((d) => !isPlanted(d, FRONT_LEFT));
    const highest = Math.max(...swinging.map((d) => footAt(d, FRONT_LEFT).y));
    expect(highest).toBeGreaterThan(FOOT_LIFT * 0.9);
    expect(highest).toBeLessThanOrEqual(FOOT_LIFT + 1e-9);
  });

  it('never leaves the foot below the ground', () => {
    for (const leg of LEGS) {
      for (const d of sweep()) {
        expect(footAt(d, leg).y).toBeGreaterThanOrEqual(GROUND_Y - 1e-9);
      }
    }
  });

  it('does not jump when it touches down or lifts off', () => {
    // A discontinuity here is a foot teleporting, which reads as a glitch even
    // at a glance.
    const step = 1e-4;
    for (const leg of LEGS) {
      for (const d of sweep(2000)) {
        const a = footAt(d, leg);
        const b = footAt(d + step, leg);
        const moved = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        // A foot in swing covers the stance excursion in the swing fraction of
        // a stride, so this bounds the fastest it should ever move.
        expect(moved).toBeLessThan(step * 20);
      }
    }
  });

  it('keeps every foot inside what the leg can actually reach', () => {
    // If this fails, the IK is being asked for a pose that does not exist and
    // will clamp — which looks like a leg snapping straight.
    for (const leg of LEGS) {
      for (const d of sweep()) {
        const foot = footAt(d, leg);
        const reach = Math.hypot(foot.x - leg.hip.x, foot.y - leg.hip.y, foot.z - leg.hip.z);
        expect(reach).toBeLessThanOrEqual(MAX_REACH);
      }
    }
  });
});

describe('the body pose the legs produce', () => {
  it('stays inside the bounds the deck is allowed to move through', () => {
    for (const d of sweep(720)) {
      const pose = gaitPose(d);
      expect(Math.abs(pose.heave)).toBeLessThanOrEqual(MAX_HEAVE);
      expect(Math.abs(pose.pitch)).toBeLessThanOrEqual(MAX_TILT);
      expect(Math.abs(pose.roll)).toBeLessThanOrEqual(MAX_TILT);
    }
  });

  it('actually moves, rather than sitting at rest', () => {
    const heaves = sweep(720).map((d) => gaitPose(d).heave);
    const swing = Math.max(...heaves) - Math.min(...heaves);
    expect(swing).toBeGreaterThan(0.05);
  });

  it('is periodic: one stride later, the same pose', () => {
    for (const d of [0, 1.1, 3.7, 5.9]) {
      const a = gaitPose(d);
      const b = gaitPose(d + STRIDE_LENGTH);
      expect(b.heave).toBeCloseTo(a.heave, 10);
      expect(b.pitch).toBeCloseTo(a.pitch, 10);
      expect(b.roll).toBeCloseTo(a.roll, 10);
    }
  });

  it('rides highest when the feet are under the hips', () => {
    // Weight transfer, and the reason the body moves at all: a leg reaching
    // fore or aft supports the body lower than one standing straight under it.
    const underfoot = sweep(720).reduce(
      (best, d) => {
        const spread = LEGS.filter((leg) => isPlanted(d, leg)).reduce(
          (sum, leg) => sum + Math.abs(footAt(d, leg).z - leg.hip.z),
          0,
        );
        return spread < best.spread ? { d, spread } : best;
      },
      { d: 0, spread: Infinity },
    );
    const reaching = sweep(720).reduce(
      (best, d) => {
        const spread = LEGS.filter((leg) => isPlanted(d, leg)).reduce(
          (sum, leg) => sum + Math.abs(footAt(d, leg).z - leg.hip.z),
          0,
        );
        return spread > best.spread ? { d, spread } : best;
      },
      { d: 0, spread: -Infinity },
    );
    expect(gaitPose(underfoot.d).heave).toBeGreaterThan(gaitPose(reaching.d).heave);
  });

  it('lists toward the side carrying the weight', () => {
    // Spec section 3, cue two: the deck leans toward the loaded side, because
    // that is what a machine settling onto a leg looks like. Asserted through
    // `transformPoint`, so what is pinned is what a player would see rather
    // than the sign of a variable.
    const { d, heavier } = mostLopsided((leg) => leg.side);
    const pose = gaitPose(d);
    const port = transformPoint({ x: -5, y: 3.69, z: 0 }, pose);
    const starboard = transformPoint({ x: 5, y: 3.69, z: 0 }, pose);

    expect(Math.abs(pose.roll)).toBeGreaterThan(0);
    expect(heavier === 1 ? starboard.y < port.y : port.y < starboard.y).toBe(true);
  });

  it('dips the end carrying the weight', () => {
    const { d, heavier } = mostLopsided((leg) => leg.end);
    const pose = gaitPose(d);
    const bow = transformPoint({ x: 0, y: 3.69, z: -8 }, pose);
    const stern = transformPoint({ x: 0, y: 3.69, z: 8 }, pose);

    expect(Math.abs(pose.pitch)).toBeGreaterThan(0);
    expect(heavier === 1 ? stern.y < bow.y : bow.y < stern.y).toBe(true);
  });
});
