export interface ProducerSave {
  /** Simulated seconds accumulated toward the next unit. */
  progress: number;
  stored: number;
  /** `BuildPieceInstance.state` is an open bag, so this must be assignable. */
  [key: string]: unknown;
}

/**
 * A device that makes one thing on a timer.
 *
 * PURE, in the idiom `MachinePower`, `MachineDamage` and `Needs` share: plain
 * numbers in, a count out, no Three, no Rapier, no bus and no clock of its own.
 * `BuildSystem` owns one per condenser and per planter and steps them from the
 * fixed update; `Game` turns the counts into bus events.
 *
 * One class for both devices, which is the point. The condenser and the
 * planter differ in three numbers — what they make, how long it takes, and how
 * much they hold — and those live in `data/needs.ts`. Phase 8's rarer variants
 * and Phase 9's destination rewards are more rows in that table rather than
 * more classes here.
 *
 * **A full device stops rather than banking.** The timer does not creep on
 * behind a full store, so claiming never dumps a backlog the player never
 * watched being made — and coming back to a planter after an hour finds three
 * bunches of greens, not sixty.
 */
export class Producer {
  private accumulated = 0;
  private held = 0;

  constructor(
    private readonly period: number,
    private readonly capacity: number,
  ) {}

  get stored(): number {
    return this.held;
  }

  /** Simulated seconds toward the next unit. Drives the interaction prompt. */
  get progress(): number {
    return this.accumulated;
  }

  /** 0..1 toward the next unit, for anything that wants to draw a bar. */
  get fraction(): number {
    return this.period > 0 ? Math.min(1, this.accumulated / this.period) : 0;
  }

  get isFull(): boolean {
    return this.held >= this.capacity;
  }

  /**
   * Advance the timer. Returns the units produced by THIS step.
   *
   * `running` is the whole of the device's gating: the condenser passes
   * `power.isPowered(id)` and the planter passes `true`. A step larger than a
   * frame — a harness warping time, a tab that was in the background — yields
   * every whole unit it earned, up to capacity, rather than one.
   */
  fixedUpdate(dt: number, running: boolean): number {
    if (!running) return 0;
    if (!(dt > 0)) return 0;
    if (this.isFull) return 0;

    this.accumulated += dt;
    if (this.period <= 0) return 0;

    let made = 0;
    while (this.accumulated >= this.period && this.held < this.capacity) {
      this.accumulated -= this.period;
      this.held += 1;
      made += 1;
    }
    // Filling up mid-step must not leave a stack of periods banked in the
    // accumulator; see the class comment.
    if (this.isFull) this.accumulated = Math.min(this.accumulated, this.period);
    return made;
  }

  /**
   * Take up to `limit` units out. Returns how many were actually taken.
   *
   * The limit exists because the player's bag can be full: handing them three
   * units and dropping two on the deck is worse than leaving them in the box.
   */
  claim(limit = Number.POSITIVE_INFINITY): number {
    const taken = Math.max(0, Math.min(this.held, Math.floor(limit)));
    this.held -= taken;
    return taken;
  }

  toSave(): ProducerSave {
    return { progress: this.accumulated, stored: this.held };
  }

  /** Absent means an empty, unstarted device — a piece built before this phase. */
  restore(saved: ProducerSave | undefined): void {
    if (!saved) {
      this.accumulated = 0;
      this.held = 0;
      return;
    }
    this.accumulated = clamp(saved.progress, 0, this.period);
    this.held = Math.floor(clamp(saved.stored, 0, this.capacity));
  }
}

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.max(low, Math.min(high, value));
}
