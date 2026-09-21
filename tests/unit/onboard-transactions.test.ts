import { describe, expect, it } from 'vitest';
import { Container } from '@/items/Container';
import type { AttachmentPurse } from '@/combat/Weapon';
import {
  craftOnboard,
  createOnboardPurse,
  transferOnboardSlot,
  waterGardenOnboard,
  type OnboardResourceContext,
} from '@/game/OnboardTransactions';

function context(): {
  value: OnboardResourceContext;
  carried: Container;
  crate: Container;
  collector: Container;
} {
  const carried = new Container(6);
  const crate = new Container(6);
  const collector = new Container(6);
  return {
    carried,
    crate,
    collector,
    value: {
      carried,
      aboard: true,
      storage: [
        { id: 'crate-alpha', kind: 'crate', label: 'Alpha', container: crate, online: true },
        {
          id: 'collector-1',
          kind: 'collector',
          label: 'Collector',
          container: collector,
          online: true,
        },
      ],
    },
  };
}

describe('onboard transactions', () => {
  it('moves selected slots only through owned endpoints and rejects off-machine access', () => {
    const { value, carried, crate } = context();
    carried.add('scrap', 3);
    expect(transferOnboardSlot(value, 'carried', 'crate-alpha', 0)).toEqual({
      ok: true,
      moved: 3,
      leftovers: 0,
    });
    expect(crate.count('scrap')).toBe(3);
    expect(
      transferOnboardSlot({ ...value, aboard: false }, 'carried', 'crate-alpha', 0).reason,
    ).toBe('off-machine');
  });

  it('reports partial transfer explicitly when the destination has only partial room', () => {
    const { value, carried, crate } = context();
    carried.add('scrap', 5);
    crate.add('scrap', 599);
    const result = transferOnboardSlot(value, 'carried', 'crate-alpha', 0);
    expect(result).toMatchObject({ ok: false, moved: 1, leftovers: 4, reason: 'capacity' });
    expect(carried.count('scrap')).toBe(4);
    expect(crate.count('scrap')).toBe(600);
  });

  it('crafts from carried and owned crates atomically, excluding collector buffers', () => {
    const { value, carried, crate, collector } = context();
    collector.add('scrap', 99);
    crate.add('scrap', 2);
    const recipe = {
      id: 'test',
      name: 'Rounds',
      station: 'workbench' as const,
      inputs: { scrap: 2 },
      output: { itemId: 'ammo-rifle' as const, count: 30 },
    };
    const result = craftOnboard(
      value,
      [{ id: 'bench', kind: 'workbench', powered: true, healthy: true, unlocked: true }],
      'bench',
      recipe,
      'carried',
    );
    expect(result.ok).toBe(true);
    expect(carried.count('ammo-rifle')).toBe(30);
    expect(crate.count('scrap')).toBe(0);
    expect(collector.count('scrap')).toBe(99);
    const before = carried.serialise();
    const failed = craftOnboard(
      value,
      [{ id: 'bench', kind: 'workbench', powered: true, healthy: true, unlocked: true }],
      'bench',
      { ...recipe, inputs: { components: 1 } },
      'carried',
    );
    expect(failed.ok).toBe(false);
    expect(carried.serialise()).toEqual(before);
  });

  it('provides an attachment purse that debits carried then healthy crates in stable ID order', () => {
    const carried = new Container(6);
    const alpha = new Container(6);
    const zeta = new Container(6);
    const collector = new Container(6);
    const offline = new Container(6);
    carried.add('scrap', 2);
    carried.add('components', 1);
    alpha.add('scrap', 1);
    alpha.add('components', 1);
    zeta.add('scrap', 3);
    zeta.add('components', 2);
    collector.add('scrap', 99);
    collector.add('components', 99);
    offline.add('scrap', 99);
    offline.add('components', 99);
    const value: OnboardResourceContext = {
      carried,
      aboard: true,
      // Deliberately reverse the ordinary crates to prove ID ordering.
      storage: [
        { id: 'crate-zeta', kind: 'crate', label: 'Zeta', container: zeta, online: true },
        {
          id: 'collector-1',
          kind: 'collector',
          label: 'Collector',
          container: collector,
          online: true,
        },
        { id: 'crate-alpha', kind: 'crate', label: 'Alpha', container: alpha, online: true },
        { id: 'crate-offline', kind: 'crate', label: 'Offline', container: offline, online: false },
      ],
    };
    const purse: AttachmentPurse = createOnboardPurse(value);
    const before = [carried, alpha, zeta, collector, offline].map((container) =>
      container.serialise(),
    );
    expect(purse.canAfford({ scrap: 5, components: 3 })).toBe(true);
    expect(
      [carried, alpha, zeta, collector, offline].map((container) => container.serialise()),
    ).toEqual(before);
    expect(purse.consume({ scrap: 5, components: 3 })).toBe(true);
    expect({
      carried: [carried.count('scrap'), carried.count('components')],
      alpha: [alpha.count('scrap'), alpha.count('components')],
      zeta: [zeta.count('scrap'), zeta.count('components')],
      collector: [collector.count('scrap'), collector.count('components')],
      offline: [offline.count('scrap'), offline.count('components')],
    }).toEqual({
      carried: [0, 0],
      alpha: [0, 0],
      zeta: [1, 1],
      collector: [99, 99],
      offline: [99, 99],
    });
  });

  it('leaves every source unchanged when an onboard purse cannot complete the debit', () => {
    const { value, carried, crate, collector } = context();
    carried.add('scrap', 1);
    crate.add('scrap', 1);
    collector.add('scrap', 99);
    const purse = createOnboardPurse(value);
    const before = [carried, crate, collector].map((container) => container.serialise());
    expect(purse.canAfford({ scrap: 3 })).toBe(false);
    expect(purse.consume({ scrap: 3 })).toBe(false);
    expect([carried, crate, collector].map((container) => container.serialise())).toEqual(before);
  });

  it('rejects off-machine, malformed costs, and invalid endpoint registries without mutation', () => {
    const { value, carried, crate, collector } = context();
    carried.add('scrap', 5);
    crate.add('components', 5);
    const before = [carried, crate, collector].map((container) => container.serialise());
    const invalidCosts = [
      { scrap: -1 },
      { scrap: Number.NaN },
      { scrap: 0.5 },
      { unknown: 1 },
      null,
    ];
    for (const cost of invalidCosts) {
      const purse = createOnboardPurse(value);
      expect(purse.canAfford(cost as never)).toBe(false);
      expect(purse.consume(cost as never)).toBe(false);
    }
    const offboard = createOnboardPurse({ ...value, aboard: false });
    expect(offboard.canAfford({ scrap: 1 })).toBe(false);
    expect(offboard.consume({ scrap: 1 })).toBe(false);
    const duplicateEndpoint = createOnboardPurse({
      ...value,
      storage: [...value.storage, { ...value.storage[0]!, label: 'Duplicate' }],
    });
    expect(duplicateEndpoint.canAfford({ scrap: 1 })).toBe(false);
    expect(duplicateEndpoint.consume({ scrap: 1 })).toBe(false);
    expect([carried, crate, collector].map((container) => container.serialise())).toEqual(before);
  });

  it('validates finite positive amounts and rolls back garden failure', () => {
    const { value, carried } = context();
    carried.add('water', 2);
    expect(transferOnboardSlot(value, 'carried', 'crate-alpha', 0, Number.NaN)).toEqual(
      expect.objectContaining({ ok: false, reason: 'invalid-item' }),
    );
    let water = 0;
    const garden = {
      id: 'garden',
      water: 0,
      capacity: 2,
      greens: 0,
      snapshot: () => water,
      restore: (snapshot: unknown) => {
        water = snapshot as number;
      },
      addWater: (amount: number) => {
        water += amount;
        return amount;
      },
      harvest: () => 0,
    };
    expect(waterGardenOnboard(value, garden, 'carried', 1).ok).toBe(true);
    expect(carried.count('water')).toBe(1);
    expect(water).toBe(1);
  });
});
