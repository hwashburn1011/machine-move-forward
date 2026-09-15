import type { EventBus } from '@/core/events/EventBus';
import { ITEMS, type ItemCost, type ItemId } from '@/data/items';
import { Container } from './Container';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Just enough for reach and transfer — the build system need not know what a crate is. */
export interface CrateRef {
  container: Container;
  position: Vec3Like;
}

export const DEFAULT_REACH = 6;

/**
 * One aggregate view over the player's inventory plus every storage crate
 * within reach.
 *
 * Replaces the Milestone 3 scrap counter. Building and crafting both spend
 * through this, so there is exactly one answer to "how much scrap do I have".
 */
export class ResourceAccess {
  constructor(
    private readonly inventory: Container,
    private readonly crates: () => CrateRef[],
    private readonly playerPos: () => Vec3Like,
    private readonly bus: EventBus,
    private readonly reach: number = DEFAULT_REACH,
  ) {}

  /** Crates within reach, nearest first. */
  private reachable(): Container[] {
    const p = this.playerPos();
    return this.crates()
      .map((crate) => ({
        crate,
        d: Math.hypot(crate.position.x - p.x, crate.position.y - p.y, crate.position.z - p.z),
      }))
      .filter((entry) => entry.d <= this.reach)
      .sort((a, b) => a.d - b.d)
      .map((entry) => entry.crate.container);
  }

  /** Inventory first, then crates by distance. */
  private sources(): Container[] {
    return [this.inventory, ...this.reachable()];
  }

  count(itemId: ItemId): number {
    let total = 0;
    for (const source of this.sources()) total += source.count(itemId);
    return total;
  }

  canAfford(cost: ItemCost): boolean {
    for (const [itemId, needed] of Object.entries(cost) as [ItemId, number][]) {
      if (needed > 0 && this.count(itemId) < needed) return false;
    }
    return true;
  }

  /**
   * Spend a cost. All or nothing.
   *
   * A partial spend that takes the scrap, finds no components, and leaves the
   * piece unplaced is strictly worse than a refusal.
   */
  consume(cost: ItemCost): boolean {
    if (!this.canAfford(cost)) return false;

    const sources = this.sources();
    for (const [itemId, needed] of Object.entries(cost) as [ItemId, number][]) {
      let remaining = needed;
      for (const source of sources) {
        if (remaining <= 0) break;
        remaining -= source.remove(itemId, remaining);
      }
    }

    this.emit();
    return true;
  }

  /** Store items. Returns the leftover that would not fit anywhere. */
  deposit(itemId: ItemId, count: number): number {
    let remaining = count;
    for (const source of this.sources()) {
      if (remaining <= 0) break;
      remaining = source.add(itemId, remaining);
    }
    if (remaining !== count) this.emit();
    return remaining;
  }

  /** Total room across the inventory and reachable crates. */
  roomFor(itemId: ItemId): number {
    let room = 0;
    for (const source of this.sources()) room += source.roomFor(itemId);
    return room;
  }

  canDepositAll(items: ItemCost, excluded?: ReadonlySet<Container>): boolean {
    return this.planDeposit(items, excluded) !== null;
  }

  /**
   * Test an ingredient removal and output deposit as one transaction.  This
   * deliberately simulates both sides on private clones: an ingredient can
   * free its slot, but no live container is touched until the complete
   * exchange fits.
   */
  canExchange(inputs: ItemCost, output: ItemCost): boolean {
    return this.planExchange(inputs, output) !== null;
  }

  /** Remove inputs and deposit output atomically, emitting one inventory event. */
  exchange(inputs: ItemCost, output: ItemCost): boolean {
    const plan = this.planExchange(inputs, output);
    if (!plan) return false;
    for (const entry of plan) entry.original.restore(entry.clone.serialise());
    this.emit();
    return true;
  }

  depositAll(items: ItemCost, excluded?: ReadonlySet<Container>): boolean {
    const plan = this.planDeposit(items, excluded);
    if (!plan) return false;
    for (const entry of plan) entry.original.restore(entry.clone.serialise());
    this.emit();
    return true;
  }

  /** "8 scrap" or "30 scrap, 4 components", for the build HUD. */
  describe(cost: ItemCost): string {
    const parts = (Object.entries(cost) as [ItemId, number][])
      .filter(([, n]) => n > 0)
      .map(([itemId, n]) => `${n} ${ITEMS[itemId].name.toLowerCase()}`);
    return parts.length > 0 ? parts.join(', ') : 'free';
  }

  private emit(): void {
    this.bus.emit('inventory:changed', { scrap: this.count('scrap') });
  }

  private planDeposit(
    items: ItemCost,
    excluded?: ReadonlySet<Container>,
  ): { original: Container; clone: Container }[] | null {
    if (!items || typeof items !== 'object') return null;
    for (const [id, count] of Object.entries(items)) {
      if (
        !Object.prototype.hasOwnProperty.call(ITEMS, id) ||
        !Number.isSafeInteger(count) ||
        count < 0
      ) {
        return null;
      }
    }
    const unique = [...new Set(this.sources())].filter((source) => !excluded?.has(source));
    const plan = unique.map((original) => {
      const clone = new Container(original.capacity);
      clone.restore(original.serialise());
      return { original, clone };
    });
    for (const [id, count] of Object.entries(items) as [ItemId, number][]) {
      let remaining = count;
      for (const entry of plan) {
        if (remaining <= 0) break;
        remaining = entry.clone.add(id, remaining);
      }
      if (remaining > 0) return null;
    }
    return plan;
  }

  private planExchange(
    inputs: ItemCost,
    output: ItemCost,
  ): { original: Container; clone: Container }[] | null {
    const inputPlan = this.validateCost(inputs);
    const outputPlan = this.validateCost(output);
    if (!inputPlan || !outputPlan) return null;
    const unique = [...new Set(this.sources())];
    const plan = unique.map((original) => {
      const clone = new Container(original.capacity);
      clone.restore(original.serialise());
      return { original, clone };
    });
    for (const [id, count] of inputPlan) {
      let remaining = count;
      for (const entry of plan) {
        if (remaining <= 0) break;
        remaining -= entry.clone.remove(id, remaining);
      }
      if (remaining > 0) return null;
    }
    for (const [id, count] of outputPlan) {
      let remaining = count;
      for (const entry of plan) {
        if (remaining <= 0) break;
        remaining = entry.clone.add(id, remaining);
      }
      if (remaining > 0) return null;
    }
    return plan;
  }

  private validateCost(cost: ItemCost): [ItemId, number][] | null {
    if (!cost || typeof cost !== 'object' || Array.isArray(cost)) return null;
    const entries = Object.entries(cost) as [string, number][];
    for (const [id, count] of entries) {
      if (
        !Object.prototype.hasOwnProperty.call(ITEMS, id) ||
        !Number.isSafeInteger(count) ||
        count < 0
      ) {
        return null;
      }
    }
    return entries as [ItemId, number][];
  }
}
