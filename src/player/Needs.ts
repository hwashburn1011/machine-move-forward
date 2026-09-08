import {
  EMPTY_HEAL_SCALE,
  EMPTY_STAMINA_SCALE,
  HYDRATION_DRAIN_PER_S,
  NEEDS_MAX,
  NOURISHMENT_DRAIN_PER_S,
  RESTORE_PER_USE,
} from '@/data/needs';

export interface NeedsSave {
  hydration: number;
  nourishment: number;
}

/**
 * Two meters, and the three gates they open and close.
 *
 * PURE, in the idiom `MachinePower` and `MachineDamage` established: plain
 * numbers in, plain numbers out, no Three, no Rapier, no clock and no event
 * bus. `Game` polls it and puts the meter changes on the bus, which is what
 * lets the whole model be run at sixty steps a second in node.
 *
 * **It is a model of pressure, not of punishment.** It reads nothing and can
 * reach nothing: it holds no reference to the player, their health, or the
 * machine, and the gates it exposes are all multiplicative and all bounded
 * above zero. Running dry slows a sprint and halves a heal. There is no path
 * through this file that costs anyone a hit point, and there is a test that
 * says so by reading this source.
 *
 * The gates flip at EXACTLY zero rather than on a curve, and that is a
 * legibility decision. A sprint that gets gradually worse as a bar creeps down
 * is a bar the player has to watch; a sprint that works right up until the bar
 * is empty is a bar they can ignore until it matters.
 */
export class Needs {
  private water = NEEDS_MAX;
  private food = NEEDS_MAX;

  get hydration(): number {
    return this.water;
  }

  get nourishment(): number {
    return this.food;
  }

  /**
   * Advance both meters. Negative or zero steps do nothing — a paused frame
   * must not hand back what a running one took.
   */
  fixedUpdate(dt: number): void {
    if (!(dt > 0)) return;
    this.water = Math.max(0, this.water - HYDRATION_DRAIN_PER_S * dt);
    this.food = Math.max(0, this.food - NOURISHMENT_DRAIN_PER_S * dt);
  }

  drink(): void {
    this.water = Math.min(NEEDS_MAX, this.water + RESTORE_PER_USE);
  }

  eat(): void {
    this.food = Math.min(NEEDS_MAX, this.food + RESTORE_PER_USE);
  }

  /** Walking is never gated. Only the sprint is, and only at empty. */
  get canSprint(): boolean {
    return this.water > 0;
  }

  get staminaRecoveryScale(): number {
    return this.food > 0 ? 1 : EMPTY_STAMINA_SCALE;
  }

  get healScale(): number {
    return this.food > 0 ? 1 : EMPTY_HEAL_SCALE;
  }

  toSave(): NeedsSave {
    return { hydration: this.water, nourishment: this.food };
  }

  /**
   * Absent means full, and that is the whole of the migration story.
   *
   * Every save written before this phase reads back as a rested player, which
   * is the only reading that is not a punishment for having played earlier —
   * the same argument `MachinePower.restore` makes about the fuel tank.
   */
  restore(saved: NeedsSave | undefined): void {
    this.water = saved ? clamp(saved.hydration) : NEEDS_MAX;
    this.food = saved ? clamp(saved.nourishment) : NEEDS_MAX;
  }

  /** A fresh game starts rested, the way a fresh life starts whole. */
  reset(): void {
    this.water = NEEDS_MAX;
    this.food = NEEDS_MAX;
  }
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return NEEDS_MAX;
  return Math.max(0, Math.min(NEEDS_MAX, value));
}
