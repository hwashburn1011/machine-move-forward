import { ITEMS, type ItemId, type ItemStack } from '@/data/items';

/**
 * Slotted stack storage (handoff section 12).
 *
 * Pure: no Three.js, no Rapier. Used identically by the player and by storage
 * crates, so there is exactly one implementation of the rules that decide
 * whether an item fits.
 */
export class Container {
  readonly slots: (ItemStack | null)[];

  constructor(readonly capacity: number) {
    this.slots = new Array<ItemStack | null>(capacity).fill(null);
  }

  /**
   * Add what fits. Returns the leftover that did not.
   *
   * Two passes on purpose: partial stacks of the same item are topped up
   * before any empty slot is claimed. A single-pass version ends up scattering
   * three half-full stacks of the same thing across the inventory.
   */
  add(itemId: ItemId, count: number): number {
    if (count <= 0) return Math.max(0, count);

    const stackSize = ITEMS[itemId].stackSize;
    let remaining = count;

    for (const slot of this.slots) {
      if (remaining === 0) break;
      if (!slot || slot.itemId !== itemId) continue;
      const room = stackSize - slot.count;
      if (room <= 0) continue;
      const moved = Math.min(room, remaining);
      slot.count += moved;
      remaining -= moved;
    }

    for (let i = 0; i < this.slots.length; i++) {
      if (remaining === 0) break;
      if (this.slots[i]) continue;
      const moved = Math.min(stackSize, remaining);
      this.slots[i] = { itemId, count: moved };
      remaining -= moved;
    }

    return remaining;
  }

  /** Remove what is present. Returns how much was actually taken. */
  remove(itemId: ItemId, count: number): number {
    if (count <= 0) return 0;

    let remaining = count;
    for (let i = 0; i < this.slots.length; i++) {
      if (remaining === 0) break;
      const slot = this.slots[i];
      if (!slot || slot.itemId !== itemId) continue;

      const taken = Math.min(slot.count, remaining);
      slot.count -= taken;
      remaining -= taken;
      if (slot.count === 0) this.slots[i] = null;
    }

    return count - remaining;
  }

  count(itemId: ItemId): number {
    let total = 0;
    for (const slot of this.slots) {
      if (slot?.itemId === itemId) total += slot.count;
    }
    return total;
  }

  has(itemId: ItemId, count: number): boolean {
    return this.count(itemId) >= count;
  }

  totalWeight(): number {
    let total = 0;
    for (const slot of this.slots) {
      if (slot) total += slot.count * ITEMS[slot.itemId].weight;
    }
    return total;
  }

  /** True only when no slot is free AND every stack is at its cap. */
  isFull(): boolean {
    return this.slots.every(
      (slot) => slot !== null && slot.count >= ITEMS[slot.itemId].stackSize,
    );
  }

  /** How much of an item could still be accepted. */
  roomFor(itemId: ItemId): number {
    const stackSize = ITEMS[itemId].stackSize;
    let room = 0;
    for (const slot of this.slots) {
      if (!slot) room += stackSize;
      else if (slot.itemId === itemId) room += stackSize - slot.count;
    }
    return room;
  }

  /**
   * Move a slot's contents into another container. Returns the leftover left
   * behind, which stays in the source slot.
   */
  moveTo(other: Container, slotIndex: number, count?: number): number {
    const slot = this.slots[slotIndex];
    if (!slot) return 0;

    const wanted = count === undefined ? slot.count : Math.min(count, slot.count);
    if (wanted <= 0) return 0;

    const leftover = other.add(slot.itemId, wanted);
    const moved = wanted - leftover;
    if (moved > 0) {
      slot.count -= moved;
      if (slot.count === 0) this.slots[slotIndex] = null;
    }
    return leftover;
  }

  /** A deep copy, so callers cannot mutate the container through it. */
  serialise(): (ItemStack | null)[] {
    return this.slots.map((slot) => (slot ? { ...slot } : null));
  }

  /** Replace all contents. Not a merge. */
  restore(slots: (ItemStack | null)[]): void {
    for (let i = 0; i < this.capacity; i++) {
      const incoming = slots[i];
      this.slots[i] = incoming ? { ...incoming } : null;
    }
  }

  clear(): void {
    this.slots.fill(null);
  }
}
