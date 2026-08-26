/**
 * The survival layer's numbers (roadmap Phase 4).
 *
 * Data only, like `power.ts` and `subsystems.ts`. Every later tuning pass —
 * Phase 15's difficulty work most of all — moves numbers in this file and
 * nothing else, which is the entire reason it is separate from the model that
 * reads it.
 *
 * **The one thing here that is not a knob** is what these numbers CANNOT do.
 * Running dry slows a sprint and halves a heal; it never deals damage, never
 * kills, and never stops the machine. That is a spec-level promise from the
 * roadmap's Act I and it is asserted in `tests/unit/needs.test.ts` rather than
 * merely written down here.
 */

import type { ItemId } from './items';
import type { PieceId } from './build-pieces';

/** Both meters run 0..100. One number, so the HUD can draw them identically. */
export const NEEDS_MAX = 100;

/**
 * Simulated minutes a full meter takes to empty if it is ignored entirely.
 *
 * Long enough that a player can build, fight and salvage without being
 * interrupted, short enough that a session touches the loop at least twice.
 * Both meters share it: two clocks running at different speeds would mean the
 * player is always a few minutes from one errand or the other, which is the
 * nagging version of this feature rather than the pleasant one.
 */
export const DRAIN_EMPTY_MINUTES = 25;

export const HYDRATION_DRAIN_PER_S = NEEDS_MAX / (DRAIN_EMPTY_MINUTES * 60);
export const NOURISHMENT_DRAIN_PER_S = NEEDS_MAX / (DRAIN_EMPTY_MINUTES * 60);

/**
 * Points one drink or one meal puts back.
 *
 * Deliberately not a full refill: topping up at 50% has to be worth doing, or
 * the loop collapses into "drink at zero" and the meters may as well be a
 * timer with two states.
 */
export const RESTORE_PER_USE = 60;

/** Stamina recovery multiplier while nourishment sits at zero. */
export const EMPTY_STAMINA_SCALE = 0.5;

/** Healing multiplier while nourishment sits at zero — a kit mends half. */
export const EMPTY_HEAL_SCALE = 0.5;

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------

/**
 * What a build piece produces on a timer, if anything.
 *
 * Exactly the shape `powerRoleOf` has, and for the same reason: `BuildSystem`
 * holds no switch it can get out of step with, and Phase 8's rare producer
 * variants are another line here rather than another call site.
 *
 * `null` is the answer for almost everything, and deliberately the default.
 */
export interface ProducerRole {
  itemId: ItemId;
  /** Simulated seconds per unit produced. */
  periodS: number;
  /** Units it will hold before it stops. Full means idle, not overflowing. */
  capacity: number;
  /**
   * Whether it needs the lights on to run.
   *
   * The condenser does — it is registered as a powered consumer through
   * `powerRoleOf` — and the planter deliberately does not. One of each is what
   * makes the pair legible: a device that stops when the generator sheds, and
   * a device that carries on regardless of it.
   */
  needsPower: boolean;
}

/**
 * Simulated seconds the condenser takes to wring one litre out of the air.
 *
 * Sized against `DRAIN_EMPTY_MINUTES`: one condenser left alone for as long as
 * a meter takes to empty makes considerably more than the one drink that meter
 * needs, so the device is a background comfort rather than a treadmill.
 */
export const CONDENSER_PERIOD_S = 90;

/** And the planter, per bunch of greens. Slower: food is the longer loop. */
export const PLANTER_PERIOD_S = 150;

export function producerRoleOf(piece: PieceId): ProducerRole | null {
  switch (piece) {
    case 'condenser':
      // One litre at a time. A single output slot is what makes the condenser
      // something you visit rather than something you harvest.
      return { itemId: 'water', periodS: CONDENSER_PERIOD_S, capacity: 1, needsPower: true };
    case 'planter':
      // Three, so a long crossing can be left to it while the player fights.
      return { itemId: 'greens', periodS: PLANTER_PERIOD_S, capacity: 3, needsPower: false };
    default:
      return null;
  }
}

/** Does this piece produce anything at all? Read by the interaction pass. */
export function isProducer(piece: PieceId): boolean {
  return producerRoleOf(piece) !== null;
}
