import { structureRepairCost, subsystemRepairCost } from '@/building/RepairPricing';
import type { PieceId } from '@/data/build-pieces';
import type { SubsystemId } from '@/data/subsystems';
import type { ItemCost } from '@/data/items';

/**
 * Seconds of held E for one repair.
 *
 * Load-bearing rather than flavour: mending the engine mid-wave means standing
 * still and exposed, and that is what makes being stopped a scramble instead
 * of a chore. Tapping would make the stop condition a formality.
 */
export const REPAIR_SECONDS = 1.6;

export interface RepairTarget {
  id: string;
  kind: 'structure' | 'subsystem';
  /** Set when kind is 'structure'. */
  pieceId?: PieceId;
  /** 0 when whole, 1 when destroyed. */
  missingFraction: number;
}

/** Anything that can be asked to pay. `ResourceAccess` satisfies it. */
export interface Purse {
  canAfford(cost: ItemCost): boolean;
  consume(cost: ItemCost): boolean;
}

export interface RepairTick {
  completed: boolean;
  cost: ItemCost | null;
  blocked: 'cannot-afford' | 'undamaged' | null;
}

const NOTHING: RepairTick = { completed: false, cost: null, blocked: null };

export function costOf(target: RepairTarget): ItemCost {
  return target.kind === 'subsystem'
    ? subsystemRepairCost(target.id as SubsystemId, target.missingFraction)
    : structureRepairCost(target.pieceId as PieceId, target.missingFraction);
}

/**
 * The hold-to-repair driver.
 *
 * Pure: it is handed the target, the key state and a purse rather than
 * finding any of them, so the whole of it can be reasoned about in node.
 */
export class RepairSystem {
  private held = 0;
  private activeId: string | null = null;
  /** Set on the frame a repair lands, cleared when the key is released. */
  private spent = false;

  get progress(): number {
    return Math.min(1, this.held / REPAIR_SECONDS);
  }

  update(dt: number, target: RepairTarget | null, holding: boolean, purse: Purse): RepairTick {
    if (!target || !holding) {
      this.reset();
      return NOTHING;
    }

    // Turning to a different thing abandons the hold rather than inheriting it.
    if (target.id !== this.activeId) {
      this.held = 0;
      this.spent = false;
      this.activeId = target.id;
    }

    if (target.missingFraction <= 0) {
      this.held = 0;
      return { completed: false, cost: null, blocked: 'undamaged' };
    }

    const cost = costOf(target);

    // Checked BEFORE the hold accumulates. Draining a hold and only then
    // saying no would be the cruellest available reading of this interaction.
    if (!purse.canAfford(cost)) {
      this.held = 0;
      return { completed: false, cost, blocked: 'cannot-afford' };
    }

    if (this.spent) return { completed: false, cost, blocked: null };

    this.held += dt;
    if (this.held < REPAIR_SECONDS) return { completed: false, cost, blocked: null };

    this.spent = true;
    this.held = 0;
    if (!purse.consume(cost)) return { completed: false, cost, blocked: 'cannot-afford' };
    return { completed: true, cost, blocked: null };
  }

  private reset(): void {
    this.held = 0;
    this.activeId = null;
    this.spent = false;
  }
}
