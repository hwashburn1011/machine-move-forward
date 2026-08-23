import type { EventBus } from '@/core/events/EventBus';
import { ITEMS, type ItemCost, type ItemId } from '@/data/items';
import type { Container } from './Container';

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
        d: Math.hypot(
          crate.position.x - p.x,
          crate.position.y - p.y,
          crate.position.z - p.z,
        ),
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
}
