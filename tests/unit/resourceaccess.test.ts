import { describe, it, expect, vi } from 'vitest';
import { Container } from '@/items/Container';
import { ResourceAccess, type CrateRef } from '@/items/ResourceAccess';
import { EventBus } from '@/core/events/EventBus';

const origin = { x: 0, y: 0, z: 0 };

function make(crates: CrateRef[] = []) {
  const bus = new EventBus();
  const inventory = new Container(10);
  const access = new ResourceAccess(
    inventory,
    () => crates,
    () => origin,
    bus,
    6,
  );
  return { bus, inventory, access };
}

const crateAt = (distance: number, fill?: (c: Container) => void): CrateRef => {
  const container = new Container(10);
  fill?.(container);
  return { container, position: { x: distance, y: 0, z: 0 } };
};

describe('counting', () => {
  it('counts the inventory alone', () => {
    const { inventory, access } = make();
    inventory.add('scrap', 25);
    expect(access.count('scrap')).toBe(25);
  });

  it('counts a crate within reach', () => {
    const crate = crateAt(2, (c) => c.add('scrap', 40));
    const { inventory, access } = make([crate]);
    inventory.add('scrap', 10);
    expect(access.count('scrap')).toBe(50);
  });

  it('ignores a crate beyond reach', () => {
    const crate = crateAt(20, (c) => c.add('scrap', 40));
    const { access } = make([crate]);
    expect(access.count('scrap')).toBe(0);
  });
});

describe('affordability', () => {
  it('handles a multi-item cost', () => {
    const { inventory, access } = make();
    inventory.add('scrap', 30);
    inventory.add('components', 4);
    expect(access.canAfford({ scrap: 30, components: 4 })).toBe(true);
    expect(access.canAfford({ scrap: 31, components: 4 })).toBe(false);
  });

  it('fails when only one component of the cost is short', () => {
    const { inventory, access } = make();
    inventory.add('scrap', 100);
    inventory.add('components', 1);
    expect(access.canAfford({ scrap: 10, components: 4 })).toBe(false);
  });

  it('treats an empty cost as affordable', () => {
    expect(make().access.canAfford({})).toBe(true);
  });
});

describe('consume', () => {
  it('is all or nothing across items', () => {
    const { inventory, access } = make();
    inventory.add('scrap', 50);
    inventory.add('components', 1);

    expect(access.consume({ scrap: 10, components: 4 })).toBe(false);
    // The scrap must NOT have been taken just because it was available.
    expect(inventory.count('scrap')).toBe(50);
    expect(inventory.count('components')).toBe(1);
  });

  it('draws from the inventory before crates', () => {
    const crate = crateAt(2, (c) => c.add('scrap', 100));
    const { inventory, access } = make([crate]);
    inventory.add('scrap', 40);

    access.consume({ scrap: 30 });
    expect(inventory.count('scrap')).toBe(10);
    expect(crate.container.count('scrap')).toBe(100);
  });

  it('spans inventory and crate when neither alone suffices', () => {
    const crate = crateAt(3, (c) => c.add('scrap', 30));
    const { inventory, access } = make([crate]);
    inventory.add('scrap', 20);

    expect(access.consume({ scrap: 45 })).toBe(true);
    expect(access.count('scrap')).toBe(5);
    expect(inventory.count('scrap')).toBe(0);
  });

  it('drains the nearer crate first', () => {
    const near = crateAt(1, (c) => c.add('scrap', 20));
    const far = crateAt(5, (c) => c.add('scrap', 20));
    const { access } = make([far, near]);

    access.consume({ scrap: 20 });
    expect(near.container.count('scrap')).toBe(0);
    expect(far.container.count('scrap')).toBe(20);
  });

  it('emits inventory:changed on a successful consume only', () => {
    const { bus, inventory, access } = make();
    inventory.add('scrap', 10);
    const fn = vi.fn();
    bus.on('inventory:changed', fn);

    access.consume({ scrap: 500 });
    expect(fn).not.toHaveBeenCalled();

    access.consume({ scrap: 5 });
    expect(fn).toHaveBeenCalledWith({ scrap: 5 });
  });
});

describe('deposit', () => {
  it('fills the inventory first', () => {
    const crate = crateAt(2);
    const { inventory, access } = make([crate]);
    access.deposit('scrap', 20);
    expect(inventory.count('scrap')).toBe(20);
    expect(crate.container.count('scrap')).toBe(0);
  });

  it('overflows into a reachable crate', () => {
    const crate = crateAt(2);
    const { inventory, access } = make([crate]);
    // 10 slots x 100 = 1000 capacity in the inventory.
    expect(access.deposit('scrap', 1200)).toBe(0);
    expect(inventory.count('scrap')).toBe(1000);
    expect(crate.container.count('scrap')).toBe(200);
  });

  it('returns what does not fit anywhere', () => {
    const { access } = make();
    expect(access.deposit('scrap', 1500)).toBe(500);
  });
});

describe('atomic exchange', () => {
  it('can free an ingredient slot before placing output', () => {
    const { inventory, access } = make();
    inventory.restore([{ itemId: 'greens', count: 1 }, ...new Array(9).fill(null)]);
    expect(access.exchange({ greens: 1 }, { rations: 1 })).toBe(true);
    expect(inventory.count('greens')).toBe(0);
    expect(inventory.count('rations')).toBe(1);
  });

  it('leaves every container and emits no event when output still cannot fit', () => {
    const { bus, inventory, access } = make();
    // Both ingredient stacks remain non-empty after removal, so all ten
    // occupied slots still have no compatible or empty output slot.
    inventory.add('greens', 2);
    inventory.add('water', 2);
    for (let i = 0; i < 8; i++) inventory.add('scrap', 100);
    const before = inventory.serialise();
    const changed = vi.fn();
    bus.on('inventory:changed', changed);
    expect(access.exchange({ greens: 1, water: 1 }, { rations: 1 })).toBe(false);
    expect(inventory.serialise()).toEqual(before);
    expect(changed).not.toHaveBeenCalled();
  });

  it('uses reachable crates but excludes an out-of-range ingredient source', () => {
    const near = crateAt(2, (c) => c.add('water', 1));
    const far = crateAt(20, (c) => c.add('greens', 1));
    const { inventory, access } = make([near, far]);
    for (let i = 0; i < 10; i++) inventory.add('scrap', 100);
    expect(access.exchange({ greens: 1, water: 1 }, { rations: 1 })).toBe(false);
    expect(inventory.count('greens')).toBe(0);
    expect(near.container.count('water')).toBe(1);
    expect(far.container.count('greens')).toBe(1);
  });

  it('exchanges ingredients split between the player and nearest crate', () => {
    const near = crateAt(2, (c) => c.add('water', 1));
    const far = crateAt(5, (c) => c.add('water', 1));
    const { inventory, access } = make([far, near]);
    inventory.add('greens', 1);

    expect(access.exchange({ greens: 1, water: 1 }, { rations: 1 })).toBe(true);
    expect(inventory.count('greens')).toBe(0);
    expect(inventory.count('rations')).toBe(1);
    expect(near.container.count('water')).toBe(0);
    expect(far.container.count('water')).toBe(1);
  });

  it('rejects malformed costs without mutation or events', () => {
    const { bus, inventory, access } = make();
    inventory.add('greens', 1);
    inventory.add('water', 1);
    const before = inventory.serialise();
    const changed = vi.fn();
    bus.on('inventory:changed', changed);
    const malformed = [
      [{ greens: -1 }, { rations: 1 }],
      [{ greens: 1.5 }, { rations: 1 }],
      [{ unknown: 1 }, { rations: 1 }],
      [{ greens: 1 }, { unknown: 1 }],
      [[], { rations: 1 }],
    ] as const;
    for (const [inputs, output] of malformed) {
      expect(access.canExchange(inputs as never, output as never)).toBe(false);
      expect(access.exchange(inputs as never, output as never)).toBe(false);
    }
    expect(inventory.serialise()).toEqual(before);
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('describe', () => {
  it('renders a single-item cost', () => {
    expect(make().access.describe({ scrap: 8 })).toBe('8 scrap metal');
  });

  it('renders a multi-item cost', () => {
    expect(make().access.describe({ scrap: 30, components: 4 })).toContain('30 scrap metal');
    expect(make().access.describe({ scrap: 30, components: 4 })).toContain('4 components');
  });

  it('renders an empty cost as free', () => {
    expect(make().access.describe({})).toBe('free');
  });
});
