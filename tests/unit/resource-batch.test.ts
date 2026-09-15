import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/events/EventBus';
import { ITEMS } from '@/data/items';
import { Container } from '@/items/Container';
import { ResourceAccess, type CrateRef } from '@/items/ResourceAccess';

const origin = { x: 0, y: 0, z: 0 };

function accessFor(inventory: Container, crates: CrateRef[] = []) {
  return {
    bus: new EventBus(),
    inventory,
    crates,
  };
}

function makeAccess(inventory: Container, crates: CrateRef[] = []) {
  const state = accessFor(inventory, crates);
  return {
    ...state,
    access: new ResourceAccess(
      inventory,
      () => state.crates,
      () => origin,
      state.bus,
      6,
    ),
  };
}

function crateAt(distance: number, capacity = 4): CrateRef {
  return { container: new Container(capacity), position: { x: distance, y: 0, z: 0 } };
}

describe('ResourceAccess batch deposits', () => {
  it('does not double-count one empty slot between different item types', () => {
    const { access, inventory } = makeAccess(new Container(1));

    expect(access.canDepositAll({ water: 1 })).toBe(true);
    expect(access.canDepositAll({ greens: 1 })).toBe(true);
    expect(access.canDepositAll({ water: 1, greens: 1 })).toBe(false);

    const before = inventory.serialise();
    expect(access.depositAll({ water: 1, greens: 1, rations: 1 })).toBe(false);
    expect(inventory.serialise()).toEqual(before);
  });

  it('tops up compatible partial stacks before claiming an empty slot', () => {
    const inventory = new Container(2);
    inventory.add('water', ITEMS.water.stackSize - 1);
    const { access } = makeAccess(inventory);

    expect(access.depositAll({ water: 1, greens: 1 })).toBe(true);
    expect(inventory.count('water')).toBe(ITEMS.water.stackSize);
    expect(inventory.count('greens')).toBe(1);
  });

  it('leaves every source and emits nothing when a batch cannot fit', () => {
    const inventory = new Container(1);
    const crate = crateAt(2, 1);
    const { access, bus } = makeAccess(inventory, [crate]);
    const beforeInventory = inventory.serialise();
    const beforeCrate = crate.container.serialise();
    const changed = vi.fn();
    bus.on('inventory:changed', changed);

    expect(access.depositAll({ water: 1, greens: 1, rations: 1 })).toBe(false);
    expect(inventory.serialise()).toEqual(beforeInventory);
    expect(crate.container.serialise()).toEqual(beforeCrate);
    expect(changed).not.toHaveBeenCalled();
  });

  it('rejects malformed counts and unknown item IDs without mutation or events', () => {
    const inventory = new Container(2);
    const { access, bus } = makeAccess(inventory);
    const changed = vi.fn();
    bus.on('inventory:changed', changed);
    const before = inventory.serialise();

    for (const invalid of [
      { water: -1 },
      { water: 1.5 },
      { water: Number.NaN },
      { water: Number.POSITIVE_INFINITY },
      { water: Number.MAX_SAFE_INTEGER + 1 },
      { mystery: 1 },
    ]) {
      expect(access.canDepositAll(invalid as never)).toBe(false);
      expect(access.depositAll(invalid as never)).toBe(false);
    }

    expect(inventory.serialise()).toEqual(before);
    expect(changed).not.toHaveBeenCalled();
  });

  it('excludes out-of-reach crates from the transaction', () => {
    const inventory = new Container(1);
    const distant = crateAt(7, 1);
    const { access } = makeAccess(inventory, [distant]);

    expect(access.canDepositAll({ water: 1, greens: 1 })).toBe(false);
    expect(access.depositAll({ water: 1, greens: 1 })).toBe(false);
    expect(distant.container.serialise()).toEqual([null]);
  });

  it('deduplicates repeated references to the same reachable crate', () => {
    const inventory = new Container(0);
    const crate = crateAt(2, 1);
    const { access } = makeAccess(inventory, [crate, crate]);
    const before = crate.container.serialise();

    expect(access.canDepositAll({ water: 1, greens: 1 })).toBe(false);
    expect(access.depositAll({ water: 1, greens: 1 })).toBe(false);
    expect(crate.container.serialise()).toEqual(before);
  });

  it('can exclude containers that will be removed by the caller', () => {
    const inventory = new Container(0);
    const crate = crateAt(2, 1);
    const { access } = makeAccess(inventory, [crate]);
    const excluded = new Set([crate.container]);

    expect(access.canDepositAll({ water: 1 })).toBe(true);
    expect(access.canDepositAll({ water: 1 }, excluded)).toBe(false);
    expect(access.depositAll({ water: 1 }, excluded)).toBe(false);
    expect(crate.container.serialise()).toEqual([null]);
  });

  it('emits once after all containers contain the committed batch', () => {
    const inventory = new Container(1);
    const crate = crateAt(2, 1);
    const { access, bus } = makeAccess(inventory, [crate]);
    const snapshots: Array<[number, number]> = [];
    bus.on('inventory:changed', () => {
      snapshots.push([inventory.count('water'), crate.container.count('greens')]);
    });

    expect(access.depositAll({ water: 1, greens: 1 })).toBe(true);
    expect(snapshots).toEqual([[1, 1]]);
    expect(inventory.count('water') + crate.container.count('water')).toBe(1);
    expect(inventory.count('greens') + crate.container.count('greens')).toBe(1);
  });
});
