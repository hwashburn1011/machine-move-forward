import type { EventBus } from '@/core/events/EventBus';
import { REFUND_FRACTION, STARTING_SCRAP } from '@/data/build-pieces';

/**
 * The scrap counter.
 *
 * Deliberately not an inventory. Milestone 4 brings storage and Milestone 5
 * brings collection; building a real economy now would mean building it twice.
 * This exists so the build system's cost path is exercised for real rather
 * than stubbed.
 */
export class Resources {
  private value: number;

  constructor(
    private readonly bus: EventBus,
    private readonly starting: number = STARTING_SCRAP,
  ) {
    this.value = starting;
  }

  get scrap(): number {
    return this.value;
  }

  canAfford(amount: number): boolean {
    return amount <= this.value;
  }

  /** Deduct. Returns false and changes nothing if short or given a negative. */
  spend(amount: number): boolean {
    // Guarded explicitly: a negative spend that silently credits the player is
    // the kind of bug that only surfaces once something else wires a UI to it.
    if (amount < 0) return false;
    if (!this.canAfford(amount)) return false;

    this.value -= amount;
    this.emit();
    return true;
  }

  grant(amount: number): void {
    if (amount <= 0) return;
    this.value += amount;
    this.emit();
  }

  /** Pay back part of a piece's cost. Returns the amount actually credited. */
  refund(originalCost: number): number {
    const amount = Math.floor(Math.max(0, originalCost) * REFUND_FRACTION);
    this.value += amount;
    this.emit();
    return amount;
  }

  reset(amount: number = this.starting): void {
    this.value = amount;
    this.emit();
  }

  private emit(): void {
    this.bus.emit('resources:changed', { scrap: this.value });
  }
}
