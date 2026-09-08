import { describe, it, expect } from 'vitest';
import {
  carryDelta,
  clampPose,
  untransformPoint,
  MAX_HEAVE,
  MAX_TILT,
  poseEquals,
  REST_POSE,
  transformPoint,
  type BodyPose,
} from '@/machine/MachineBody';

/**
 * The body pose a walking machine moves through, and the carry delta that
 * stops it dropping its passengers.
 *
 * The failure this guards is specific: Rapier's character controller does not
 * move a character when the platform under it moves. Get the delta wrong and
 * the player sinks through a rising deck or hangs above a falling one.
 */

const DECK_CORNER = { x: 5, y: 3.69, z: 8 };

describe('clampPose', () => {
  it('leaves a pose inside the bounds alone', () => {
    const pose: BodyPose = { heave: 0.05, pitch: 0.01, roll: -0.01 };
    expect(clampPose(pose)).toEqual(pose);
  });

  it('clamps heave in both directions', () => {
    expect(clampPose({ heave: 9, pitch: 0, roll: 0 }).heave).toBe(MAX_HEAVE);
    expect(clampPose({ heave: -9, pitch: 0, roll: 0 }).heave).toBe(-MAX_HEAVE);
  });

  it('clamps tilt in both directions', () => {
    const wild: BodyPose = { heave: 0, pitch: 3, roll: -3 };
    expect(clampPose(wild).pitch).toBe(MAX_TILT);
    expect(clampPose(wild).roll).toBe(-MAX_TILT);
  });

  it('holds the deck to a workable platform — a degree and a half, not ten', () => {
    // If this ever loosens, aiming and building on the deck get worse. It
    // should be a deliberate decision, not a drift.
    expect(MAX_TILT).toBeLessThan(2 * (Math.PI / 180));
    expect(MAX_HEAVE).toBeLessThan(0.2);
  });
});

describe('transformPoint', () => {
  it('is the identity at rest', () => {
    expect(transformPoint(DECK_CORNER, REST_POSE)).toEqual(DECK_CORNER);
  });

  it('heave moves every point by the same amount', () => {
    const pose: BodyPose = { heave: 0.1, pitch: 0, roll: 0 };
    for (const p of [DECK_CORNER, { x: 0, y: 0, z: 0 }, { x: -5, y: 1, z: -8 }]) {
      expect(transformPoint(p, pose).y - p.y).toBeCloseTo(0.1, 12);
    }
  });

  it('leaves the origin fixed under tilt — the machine holds station', () => {
    const pose: BodyPose = { heave: 0, pitch: MAX_TILT, roll: MAX_TILT };
    const moved = transformPoint({ x: 0, y: 0, z: 0 }, pose);
    expect(moved.x).toBeCloseTo(0, 12);
    expect(moved.y).toBeCloseTo(0, 12);
    expect(moved.z).toBeCloseTo(0, 12);
  });

  it('pitch moves the bow and stern in opposite directions', () => {
    const pose: BodyPose = { heave: 0, pitch: MAX_TILT, roll: 0 };
    const bow = transformPoint({ x: 0, y: 0, z: -8 }, pose);
    const stern = transformPoint({ x: 0, y: 0, z: 8 }, pose);
    expect(Math.sign(bow.y)).toBe(-Math.sign(stern.y));
  });

  it('roll moves port and starboard in opposite directions', () => {
    const pose: BodyPose = { heave: 0, pitch: 0, roll: MAX_TILT };
    const port = transformPoint({ x: -5, y: 0, z: 0 }, pose);
    const starboard = transformPoint({ x: 5, y: 0, z: 0 }, pose);
    expect(Math.sign(port.y)).toBe(-Math.sign(starboard.y));
  });

  it('preserves distance from the origin — it is a rigid motion', () => {
    const pose: BodyPose = { heave: 0, pitch: MAX_TILT, roll: -MAX_TILT };
    const p = DECK_CORNER;
    const before = Math.hypot(p.x, p.y, p.z);
    const after = transformPoint(p, pose);
    expect(Math.hypot(after.x, after.y, after.z)).toBeCloseTo(before, 10);
  });
});

describe('carryDelta', () => {
  it('is zero when the pose does not change', () => {
    const pose: BodyPose = { heave: 0.05, pitch: 0.01, roll: 0.01 };
    const d = carryDelta(DECK_CORNER, pose, pose);
    expect(d.x).toBeCloseTo(0, 12);
    expect(d.y).toBeCloseTo(0, 12);
    expect(d.z).toBeCloseTo(0, 12);
  });

  it('matches heave exactly, everywhere on the deck', () => {
    const d = carryDelta(DECK_CORNER, REST_POSE, { heave: 0.08, pitch: 0, roll: 0 });
    expect(d.y).toBeCloseTo(0.08, 12);
  });

  it('is much larger at the deck edge than at its centre under tilt', () => {
    // The whole reason the delta is sampled at the character's own position:
    // a single deck-centre value would be wrong by most of its magnitude.
    const tilted: BodyPose = { heave: 0, pitch: MAX_TILT, roll: 0 };
    const middle = carryDelta({ x: 0, y: 0, z: 0 }, REST_POSE, tilted);
    const edge = carryDelta({ x: 0, y: 0, z: 8 }, REST_POSE, tilted);
    expect(Math.abs(middle.y)).toBeCloseTo(0, 10);
    // 8m at 1.5 degrees is about 21cm — far more than a capsule's skin.
    expect(Math.abs(edge.y)).toBeGreaterThan(0.15);
  });

  it('puts a point back exactly where it started when the pose reverses', () => {
    // Follow the deltas, as a carried character does: out to a pose and back
    // to rest must land on the same plank, not merely travel the same
    // distance. The two are only the same thing if the delta is taken at the
    // point's real place on the machine.
    const a: BodyPose = { heave: 0.02, pitch: 0.01, roll: -0.005 };
    const out = carryDelta(DECK_CORNER, REST_POSE, a);
    const moved = { x: DECK_CORNER.x + out.x, y: DECK_CORNER.y + out.y, z: DECK_CORNER.z + out.z };
    const back = carryDelta(moved, a, REST_POSE);

    expect(moved.x + back.x).toBeCloseTo(DECK_CORNER.x, 12);
    expect(moved.y + back.y).toBeCloseTo(DECK_CORNER.y, 12);
    expect(moved.z + back.z).toBeCloseTo(DECK_CORNER.z, 12);
  });

  it('carries a point as the machine would carry it, from any pose', () => {
    // The delta is asked for at a WORLD position. Reading that position as a
    // machine-local coordinate is only right while the machine is at rest;
    // once it is tilted, the same numbers name a different plank, and the
    // error is a bias that integrates into a ratchet.
    const from: BodyPose = { heave: 0.07, pitch: MAX_TILT, roll: -MAX_TILT };
    const to: BodyPose = { heave: -0.03, pitch: -MAX_TILT, roll: MAX_TILT };

    const local = { x: 2, y: 3.69, z: 6 };
    const world = transformPoint(local, from);
    const d = carryDelta(world, from, to);
    const expected = transformPoint(local, to);

    expect(world.x + d.x).toBeCloseTo(expected.x, 12);
    expect(world.y + d.y).toBeCloseTo(expected.y, 12);
    expect(world.z + d.z).toBeCloseTo(expected.z, 12);
  });

  it('returns a carried point to exactly where it started over a closed cycle', () => {
    // A gait is periodic. The point must FOLLOW its own deltas here, because
    // that is what a character does: each step it stands somewhere new, and
    // the next delta is asked for there. A version of this test that re-asks
    // at a fixed point passes even when the game ratchets the player off the
    // stern.
    const poses: BodyPose[] = [];
    const steps = 240;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      poses.push({
        heave: Math.sin(t) * MAX_HEAVE,
        pitch: Math.sin(t * 2) * MAX_TILT,
        roll: Math.cos(t) * MAX_TILT - MAX_TILT,
      });
    }

    let p = { ...DECK_CORNER };
    for (let i = 0; i < poses.length - 1; i++) {
      const d = carryDelta(p, poses[i] as BodyPose, poses[i + 1] as BodyPose);
      p = { x: p.x + d.x, y: p.y + d.y, z: p.z + d.z };
    }

    expect(p.x).toBeCloseTo(DECK_CORNER.x, 9);
    expect(p.y).toBeCloseTo(DECK_CORNER.y, 9);
    expect(p.z).toBeCloseTo(DECK_CORNER.z, 9);
  });
});

describe('untransformPoint', () => {
  it('undoes transformPoint, so a world position can be read as a place on the deck', () => {
    const pose: BodyPose = { heave: 0.11, pitch: MAX_TILT, roll: -MAX_TILT };
    const back = untransformPoint(transformPoint(DECK_CORNER, pose), pose);
    expect(back.x).toBeCloseTo(DECK_CORNER.x, 12);
    expect(back.y).toBeCloseTo(DECK_CORNER.y, 12);
    expect(back.z).toBeCloseTo(DECK_CORNER.z, 12);
  });

  it('is the identity at rest', () => {
    expect(untransformPoint(DECK_CORNER, REST_POSE)).toEqual(DECK_CORNER);
  });
});

describe('poseEquals', () => {
  it('spots an unchanged pose so a still machine rewrites nothing', () => {
    expect(poseEquals(REST_POSE, REST_POSE)).toBe(true);
  });

  it('spots a changed one', () => {
    expect(poseEquals(REST_POSE, { heave: 0.01, pitch: 0, roll: 0 })).toBe(false);
  });
});
