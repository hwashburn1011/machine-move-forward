/**
 * Gait tuning (spec section 5).
 *
 * Data only. `Gait.ts` is the rules; this is every number a person would want
 * to argue about while watching the machine walk, in one place, because the
 * spec is explicit that stride length, duty factor and heave amplitude cannot
 * be settled from measurements and will be tuned with eyes on the screen.
 *
 * Sized against the hull that exists, not against an imagined one. The deck is
 * 10x16m at y=3.6 and the hull's underside is at y=0.6, so what a walker gets
 * to work with is the volume the tread housings used to fill: from the ground
 * up the machine's flanks. Hips sit high in that volume and the legs fold
 * under it.
 */

/** Where the ground is, absolutely, under a machine standing on flat sand. */
export const GROUND_Y = 0;

/**
 * Metres of travel per complete stride cycle.
 *
 * Phase is a function of distance, never of time (spec section 2), so this is
 * the number that decides cadence: the machine cruises at 7.5 m/s, which is a
 * shade over one cycle a second. It is bounded above by reach — the stance
 * excursion below has to stay inside what a leg can actually cover without
 * straightening — and below by taste, since a short stride reads as scurrying.
 */
export const STRIDE_LENGTH = 6.6;

/**
 * Fraction of the cycle a foot spends on the ground.
 *
 * Above 0.5, so at least two feet are always down (spec section 5). With the
 * legs a quarter cycle apart that means two or three at any moment, and the
 * changeover between them is where the weight visibly moves. Raise it to 0.75
 * and three are always down, which is steadier and slower-looking; drop it
 * below 0.5 and the machine is briefly airborne, which is a hop.
 */
export const DUTY = 0.6;

/** How far a foot travels astern during stance: the machine's step. */
export const STANCE_EXCURSION = STRIDE_LENGTH * DUTY;

/** Peak height of a foot mid-swing, above the ground it left. */
export const FOOT_LIFT = 0.5;

/** Upper and lower leg segments, metres. Equal, so the knee folds evenly. */
export const UPPER_LEG = 1.8;
export const LOWER_LEG = 1.8;

/**
 * How far a leg may reach before it counts as overextended.
 *
 * A leg at full stretch has no knee bend left to absorb anything, and IK at
 * the singularity is where two-bone solvers produce their worst pops. At the
 * stride extremes the foot is 1.98m from under the hip and 2.4m below it,
 * which is 3.11m of the 3.6m available — 86%, with the last 14% kept back.
 */
export const MAX_REACH = (UPPER_LEG + LOWER_LEG) * 0.95;

export interface LegDefinition {
  id: 'front-left' | 'front-right' | 'rear-left' | 'rear-right';
  /** Where the leg meets the hull, in machine space. */
  hip: { x: number; y: number; z: number };
  /**
   * Where this leg sits in the stride, as a fraction of a cycle.
   *
   * See `LEGS` for why these are quarters rather than the diagonal pairs the
   * spec first called for.
   */
  phase: number;
  /** -1 to port, +1 to starboard. */
  side: -1 | 1;
  /** -1 forward, +1 aft. */
  end: -1 | 1;
}

/**
 * The four legs.
 *
 * Hips at x = +/-5.2, just outside the 10m hull, and at z = +/-4.5, a 9m span
 * under a 16m body — inboard of the ends so the machine does not read as a
 * table. y = 2.4 is high on the flank, in the space the tread housings had, so
 * a 3.6m leg folds rather than dangles.
 *
 * **A lateral-sequence walk, not the diagonal pairs the spec first called
 * for.** Rear-left, front-left, rear-right, front-right, a quarter cycle
 * apart. The spec wanted diagonal pairs for cheapness and wanted the body to
 * "list slightly toward the loaded side" — and those two cannot both be had.
 * Pair the legs diagonally and each side of the machine, and each end of it,
 * holds exactly one leg from each pair at every instant. The port and
 * starboard support sums are then identical by construction, in single and
 * double support alike, so roll and pitch are not merely small: they are
 * exactly zero for the whole cycle. Measured, before this was changed.
 *
 * Quarters break that symmetry, put two or three feet down at any moment
 * rather than two or four, and read heavier — which is what section 5 wanted
 * from four legs in the first place. Going back to a trot is a change to these
 * four numbers and nothing else; the body would simply heave and never list.
 */
export const LEGS: readonly LegDefinition[] = [
  { id: 'front-left', hip: { x: -5.2, y: 2.4, z: -4.5 }, phase: 0.25, side: -1, end: -1 },
  { id: 'front-right', hip: { x: 5.2, y: 2.4, z: -4.5 }, phase: 0.75, side: 1, end: -1 },
  { id: 'rear-left', hip: { x: -5.2, y: 2.4, z: 4.5 }, phase: 0, side: -1, end: 1 },
  { id: 'rear-right', hip: { x: 5.2, y: 2.4, z: 4.5 }, phase: 0.5, side: 1, end: 1 },
];

/**
 * How far the body actually moves: peak heave, and peak tilt.
 *
 * These are the real amplitudes, not gains. `Gait.ts` measures its own signal
 * over one cycle at load and scales it to these, so changing the duty factor
 * or the leg phases cannot quietly turn the body's motion up or down, and the
 * signal never reaches `MachineBody`'s clamp — a clamped signal is a square
 * wave, and a square wave is what jitter looks like.
 *
 * Deliberately understated against what the legs imply. A leg's own geometry
 * would drop the body the better part of a metre over a stride, and the deck
 * is a shooting platform and a build surface before it is a spectacle; the
 * hard bounds are 0.12m and 1.5 degrees, and these sit just inside them.
 *
 * Nothing is lost by the legs implying more than the body does. The feet are
 * planted, the body is where the body is, and the knee absorbs the difference,
 * which is what a knee is for.
 */
export const HEAVE_AMPLITUDE = 0.1;
export const TILT_AMPLITUDE = 1.3 * (Math.PI / 180);
