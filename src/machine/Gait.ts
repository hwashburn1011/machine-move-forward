/**
 * The machine's gait — distance travelled in, feet and a body pose out.
 *
 * Pure: numbers in, numbers out. No Three.js and no Rapier, so every rule here
 * is testable in node like `NavGraph`, `EnemyAI` and `EnemySteering`. Tuning
 * lives in `src/data/gait.ts`; this file is only the rules that turn it into a
 * walk.
 *
 * Two ideas carry the whole thing.
 *
 * **Distance is the clock.** Phase is a function of how far the machine has
 * travelled, never of wall time, like every other pacing decision in this
 * project. A machine that walks on a clock keeps striding when it is stopped;
 * one that walks on distance stops mid-stride and stays there, which is both
 * correct and free.
 *
 * **The machine holds station and the world scrolls past it** (handoff section
 * 6). So a foot that is genuinely planted is not still — in machine space it
 * travels with the sand, at exactly one metre per metre travelled, in
 * whichever direction the world is going. That single property is what makes
 * the difference between a walker and a hull sliding along with its legs
 * waving, and it is the first thing the tests check. The direction comes from
 * `WORLD_Z_PER_METRE` rather than from a sign written here, because a foot
 * that travels the wrong way does not read as a wrong constant, it reads as
 * the machine moonwalking.
 */

import {
  DUTY,
  FOOT_LIFT,
  FOOT_SPLAY,
  GROUND_Y,
  HEAVE_AMPLITUDE,
  LEGS,
  STANCE_EXCURSION,
  STRIDE_LENGTH,
  TILT_AMPLITUDE,
  type LegDefinition,
} from '@/data/gait';
import { WORLD_Z_PER_METRE } from '@/world/WorldManager';
import { clampPose, type BodyPose } from './MachineBody';

export interface FootPlacement {
  /** Machine space, the same frame the hips are given in. */
  x: number;
  y: number;
  z: number;
}

/**
 * Where this leg is in its stride, as a fraction of a cycle in [0, 1).
 *
 * 0 is the moment the foot plants, `DUTY` is the moment it lifts.
 */
export function legCycle(distance: number, leg: LegDefinition): number {
  const u = distance / STRIDE_LENGTH + leg.phase;
  return u - Math.floor(u);
}

/** Is this leg's foot on the ground? */
export function isPlanted(distance: number, leg: LegDefinition): boolean {
  return legCycle(distance, leg) < DUTY;
}

/**
 * Smoothstep, for the swing.
 *
 * A foot that returns at a constant rate starts and stops dead, and the jerk
 * shows: the leg snaps at both ends of the swing. Easing in and out costs
 * nothing and is the difference between a stride and a metronome.
 */
function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Where this leg's foot is, in machine space.
 *
 * Stance runs from half an excursion FORWARD of the hip to half an excursion
 * aft of it, so the leg reaches equally in both directions and neither end of
 * the step is the one that overextends. Swing carries the foot back over that
 * same ground, lifted, and returns it to exactly where it planted a stride
 * ago — otherwise the leg walks itself off the machine over a few cycles.
 */
export function footAt(distance: number, leg: LegDefinition): FootPlacement {
  const u = legCycle(distance, leg);
  // Half an excursion, signed by the way the world travels. The foot's whole
  // journey is this swinging from one end of it to the other and back:
  // `-reach` at touchdown, `+reach` at lift-off, and `-reach` again by the
  // time it has swung round.
  const reach = (WORLD_Z_PER_METRE * STANCE_EXCURSION) / 2;
  const x = leg.hip.x + leg.side * FOOT_SPLAY;

  if (u < DUTY) {
    // Planted. The world scrolls past at one metre per metre travelled, so a
    // foot that is not moving relative to the GROUND moves relative to the
    // machine at exactly that rate, in the direction the world is going.
    return {
      x,
      y: GROUND_Y,
      z: leg.hip.z + reach * (2 * (u / DUTY) - 1),
    };
  }

  // Swinging: back over the same ground, and lifted on the way.
  const v = (u - DUTY) / (1 - DUTY);
  return {
    x,
    y: GROUND_Y + FOOT_LIFT * Math.sin(Math.PI * v),
    z: leg.hip.z + reach * (1 - 2 * ease(v)),
  };
}

/**
 * How well a planted leg is holding the body up, in [0, 1].
 *
 * 1 with the foot directly under the hip, where the leg is most upright and
 * supports the body highest; 0 at the ends of the stance, where it is reaching
 * and the same leg holds the body lower. A swinging leg supports nothing.
 *
 * This is a cue, not a load model. The machine's real weight distribution is
 * not simulated and does not need to be — what a player reads is which corners
 * of the deck are being held up, and this is that, in the cheapest honest form.
 */
function support(distance: number, leg: LegDefinition): number {
  if (!isPlanted(distance, leg)) return 0;
  const reach = Math.abs(footAt(distance, leg).z - leg.hip.z);
  return 1 - reach / (STANCE_EXCURSION / 2);
}

/** One leg's worth of the three signals the body pose is read from. */
interface Loading {
  /** Mean support across all legs: how well held up the machine is overall. */
  mean: number;
  /** Starboard support less port. */
  side: number;
  /** Aft support less forward. */
  end: number;
}

function loadingAt(distance: number, legs: readonly LegDefinition[]): Loading {
  let total = 0;
  let side = 0;
  let end = 0;
  for (const leg of legs) {
    const s = support(distance, leg);
    total += s;
    side += leg.side * s;
    end += leg.end * s;
  }
  return { mean: total / (legs.length || 1), side, end };
}

/**
 * The range each signal actually covers over one stride, measured once.
 *
 * Everything about the shape of these signals depends on the duty factor and
 * on where the legs sit in the cycle, both of which are tuning. Rather than
 * bake in gains that silently stop meaning what they say the moment someone
 * changes a phase, the module measures its own output over a cycle and scales
 * it to the amplitudes in `src/data/gait.ts`. Those then mean literally "how
 * far the body moves", which is the only form a number like that can be tuned
 * by eye in.
 *
 * A cycle is a cycle regardless of how fast it is walked, so this is
 * calculated once for a given set of legs and cached.
 */
interface Calibration {
  restMean: number;
  meanSwing: number;
  sideSwing: number;
  endSwing: number;
}

const calibrations = new WeakMap<readonly LegDefinition[], Calibration>();

function calibrate(legs: readonly LegDefinition[]): Calibration {
  const cached = calibrations.get(legs);
  if (cached) return cached;

  const SAMPLES = 720;
  let lowMean = Infinity;
  let highMean = -Infinity;
  let side = 0;
  let end = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const load = loadingAt((i / SAMPLES) * STRIDE_LENGTH, legs);
    if (load.mean < lowMean) lowMean = load.mean;
    if (load.mean > highMean) highMean = load.mean;
    side = Math.max(side, Math.abs(load.side));
    end = Math.max(end, Math.abs(load.end));
  }

  const fresh: Calibration = {
    // Rest is the middle of the range, not the mean of it: what matters is
    // that the body has as much room to fall as to rise, so neither extreme
    // reaches the clamp.
    restMean: (lowMean + highMean) / 2,
    meanSwing: Math.max((highMean - lowMean) / 2, 1e-9),
    sideSwing: Math.max(side, 1e-9),
    endSwing: Math.max(end, 1e-9),
  };
  calibrations.set(legs, fresh);
  return fresh;
}

/**
 * The body pose the legs imply: heave, pitch and roll.
 *
 * Scaled rather than derived literally. A leg's own geometry would drop the
 * body the better part of a metre over a stride; the deck is a shooting
 * platform and a build surface first, and `MachineBody` caps it at 0.12m and
 * 1.5 degrees regardless. Scaling to the measured range of the signal means
 * the amplitudes in `src/data/gait.ts` are reached exactly and the clamp never
 * is.
 *
 * Nothing is lost by the legs implying more than the body does. The feet are
 * planted, the body is where the body is, and the knee takes up the
 * difference, which is what a knee is for.
 *
 * Signs are the ones a player would name: the end and the side carrying the
 * weight sit LOWER, because that is what a machine settling onto a leg looks
 * like.
 */
export function gaitPose(distance: number, legs: readonly LegDefinition[] = LEGS): BodyPose {
  const load = loadingAt(distance, legs);
  const scale = calibrate(legs);

  return clampPose({
    heave: ((load.mean - scale.restMean) / scale.meanSwing) * HEAVE_AMPLITUDE,
    // Positive pitch is nose-up, so a loaded bow wants a negative one.
    pitch: (load.end / scale.endSwing) * TILT_AMPLITUDE,
    // Positive roll raises starboard, so a loaded starboard wants a negative
    // one.
    roll: (-load.side / scale.sideSwing) * TILT_AMPLITUDE,
  });
}

/**
 * Did this leg's foot touch down between these two distances?
 *
 * For footfalls in the sand and the puff of dust at each plant, which the spec
 * wants keyed to the moment a foot lands rather than laid down every so many
 * metres (section 7).
 */
export function planted(previousDistance: number, distance: number, leg: LegDefinition): boolean {
  if (distance <= previousDistance) return false;
  // A plant is a cycle wrapping past 0. Comparing cycle positions would miss
  // any step long enough to cover a whole stride; counting completed cycles
  // cannot.
  const before = Math.floor(previousDistance / STRIDE_LENGTH + leg.phase);
  const after = Math.floor(distance / STRIDE_LENGTH + leg.phase);
  return after > before;
}
