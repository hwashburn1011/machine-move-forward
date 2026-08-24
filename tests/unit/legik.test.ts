import { describe, it, expect } from 'vitest';
import { legJoints, solveLeg, solveTwoBone, twoBoneFoot } from '@/machine/LegIK';
import { footAt } from '@/machine/Gait';
import { LEGS, LOWER_LEG, STRIDE_LENGTH, UPPER_LEG, type LegDefinition } from '@/data/gait';

/**
 * Two-bone inverse kinematics, solved analytically.
 *
 * Analytic rather than iterative because two bones have a closed form, and a
 * closed form can be checked the only way that really counts: put the angles
 * back through forward kinematics and see whether the foot lands on the
 * target. Every reachability test here is that round trip.
 */

const U = UPPER_LEG;
const L = LOWER_LEG;

describe('two bones in a plane', () => {
  it('puts the foot exactly on a reachable target', () => {
    const targets = [
      { x: 0, y: -2.4 },
      { x: 1.2, y: -2.4 },
      { x: -1.98, y: -2.4 },
      { x: 0.4, y: -1.2 },
      { x: -0.9, y: -3.0 },
      { x: 2.2, y: -1.1 },
    ];
    for (const t of targets) {
      const solved = solveTwoBone(t.x, t.y, U, L);
      const foot = twoBoneFoot(solved, U, L);
      expect(solved.reached).toBe(true);
      expect(foot.x).toBeCloseTo(t.x, 9);
      expect(foot.y).toBeCloseTo(t.y, 9);
    }
  });

  it('clamps rather than exploding when the target is out of reach', () => {
    // Asked for the impossible, a solver either produces NaN — which poisons a
    // transform and blanks the mesh — or stretches straight toward the target
    // and stops. The second is the one a player would forgive.
    const solved = solveTwoBone(0, -(U + L) * 3, U, L);
    expect(solved.reached).toBe(false);
    expect(Number.isFinite(solved.hip)).toBe(true);
    expect(Number.isFinite(solved.knee)).toBe(true);

    const foot = twoBoneFoot(solved, U, L);
    // Straight down, and no further than the leg is long.
    expect(foot.x).toBeCloseTo(0, 9);
    expect(Math.hypot(foot.x, foot.y)).toBeLessThanOrEqual(U + L + 1e-9);
    expect(Math.hypot(foot.x, foot.y)).toBeGreaterThan((U + L) * 0.9);
  });

  it('points at an unreachable target rather than somewhere else entirely', () => {
    const far = { x: 6, y: -6 };
    const foot = twoBoneFoot(solveTwoBone(far.x, far.y, U, L), U, L);
    const wanted = Math.atan2(far.x, -far.y);
    const got = Math.atan2(foot.x, -foot.y);
    expect(got).toBeCloseTo(wanted, 6);
  });

  it('survives a target folded right back onto the hip', () => {
    // Two equal bones can fold to zero length, which is the other singularity.
    const solved = solveTwoBone(0, 0, U, L);
    expect(Number.isFinite(solved.hip)).toBe(true);
    expect(Number.isFinite(solved.knee)).toBe(true);
    expect(Number.isFinite(twoBoneFoot(solved, U, L).x)).toBe(true);
  });

  it('bends the knee aft, the way a machine leg reads', () => {
    // Both mirror solutions put the foot on the target; only one of them looks
    // like a walker. Aft, so the leg reads as a hind leg rather than a knee
    // buckling forward under load.
    const solved = solveTwoBone(0, -2.4, U, L);
    const knee = {
      x: U * Math.sin(solved.hip),
      y: -U * Math.cos(solved.hip),
    };
    expect(knee.x).toBeLessThan(0);
  });

  it('straightens as the target gets further away', () => {
    const near = solveTwoBone(0, -2.0, U, L);
    const far = solveTwoBone(0, -3.2, U, L);
    expect(Math.abs(far.knee)).toBeLessThan(Math.abs(near.knee));
  });
});

describe('a leg on the machine', () => {
  it('lands the foot on the target it was given, in machine space', () => {
    const leg = LEGS[0] as LegDefinition;
    for (const target of [
      { x: leg.hip.x, y: 0, z: leg.hip.z },
      { x: leg.hip.x, y: 0, z: leg.hip.z - 1.9 },
      { x: leg.hip.x, y: 0.5, z: leg.hip.z + 1.9 },
      { x: leg.hip.x - 0.6, y: 0.2, z: leg.hip.z + 0.4 },
    ]) {
      const solved = solveLeg(leg.hip, target, U, L);
      const { foot } = legJoints(leg.hip, solved, U, L);
      expect(solved.reached).toBe(true);
      expect(foot.x).toBeCloseTo(target.x, 9);
      expect(foot.y).toBeCloseTo(target.y, 9);
      expect(foot.z).toBeCloseTo(target.z, 9);
    }
  });

  it('puts the knee between the hip and the foot, never past either', () => {
    const leg = LEGS[1] as LegDefinition;
    const target = { x: leg.hip.x, y: 0, z: leg.hip.z - 1.5 };
    const { knee, foot } = legJoints(leg.hip, solveLeg(leg.hip, target, U, L), U, L);
    expect(Math.hypot(knee.x - leg.hip.x, knee.y - leg.hip.y, knee.z - leg.hip.z)).toBeCloseTo(U, 9);
    expect(Math.hypot(foot.x - knee.x, foot.y - knee.y, foot.z - knee.z)).toBeCloseTo(L, 9);
  });

  it('splays outward to reach a foot placed wide of the hip', () => {
    const leg = LEGS[1] as LegDefinition;
    const wide = { x: leg.hip.x + 0.8, y: 0, z: leg.hip.z };
    const under = { x: leg.hip.x, y: 0, z: leg.hip.z };
    expect(Math.abs(solveLeg(leg.hip, wide, U, L).splay)).toBeGreaterThan(
      Math.abs(solveLeg(leg.hip, under, U, L).splay),
    );
  });
});

describe('the gait and the legs together', () => {
  it('never asks for a foot the leg cannot reach, at any point in the stride', () => {
    // The two modules only work if the gait's excursion and the leg's length
    // agree. If this fails, a leg snaps straight somewhere in the cycle, which
    // is the most visible failure either module has.
    for (const leg of LEGS) {
      for (let i = 0; i < 720; i++) {
        const d = (i / 720) * STRIDE_LENGTH;
        const target = footAt(d, leg);
        const solved = solveLeg(leg.hip, target, U, L);
        expect(solved.reached).toBe(true);

        const { foot } = legJoints(leg.hip, solved, U, L);
        expect(Math.hypot(foot.x - target.x, foot.y - target.y, foot.z - target.z)).toBeLessThan(
          1e-9,
        );
      }
    }
  });

  it('keeps some bend in the knee all the way through, so nothing pops', () => {
    // A leg that reaches full extension has no bend left to lose, and that is
    // where analytic IK produces its worst jumps.
    for (const leg of LEGS) {
      for (let i = 0; i < 360; i++) {
        const d = (i / 360) * STRIDE_LENGTH;
        const solved = solveLeg(leg.hip, footAt(d, leg), U, L);
        expect(Math.abs(solved.knee)).toBeGreaterThan(0.25);
      }
    }
  });

  it('moves the joints smoothly, never jumping between steps', () => {
    const step = STRIDE_LENGTH / 4000;
    for (const leg of LEGS) {
      for (let i = 0; i < 4000; i++) {
        const d = (i / 4000) * STRIDE_LENGTH;
        const a = solveLeg(leg.hip, footAt(d, leg), U, L);
        const b = solveLeg(leg.hip, footAt(d + step, leg), U, L);
        expect(Math.abs(b.hip - a.hip)).toBeLessThan(0.02);
        expect(Math.abs(b.knee - a.knee)).toBeLessThan(0.02);
        expect(Math.abs(b.splay - a.splay)).toBeLessThan(0.02);
      }
    }
  });
});
