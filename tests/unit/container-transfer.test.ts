import { describe, expect, it } from 'vitest';
import { Container } from '@/items/Container';
import { depositMatching, sortContainer, takeAll } from '@/items/ContainerTransfer';

describe('bulk container transfers', () => {
  it('takeAll conserves mixed stacks and reports capacity leftovers', () => {
    const source = new Container(4),
      destination = new Container(1);
    source.add('components', 12);
    source.add('scrap', 40);
    destination.add('fuel', 3);
    const result = takeAll(source, destination);
    expect(result.moved).toBe(0);
    expect(result.leftovers).toBe(52);
    expect(source.count('components')).toBe(12);
    expect(source.count('scrap')).toBe(40);
  });
  it('depositMatching snapshots destination item types', () => {
    const source = new Container(4),
      destination = new Container(4);
    source.add('scrap', 30);
    source.add('fuel', 9);
    destination.add('scrap', 10);
    const result = depositMatching(source, destination);
    expect(result.byItem).toEqual({ scrap: 30 });
    expect(source.count('fuel')).toBe(9);
  });
  it('sorts deterministically while preserving totals', () => {
    const c = new Container(6);
    c.add('fuel', 2);
    c.add('scrap', 120);
    c.add('components', 4);
    const before = c.totalWeight();
    sortContainer(c);
    expect(c.totalWeight()).toBe(before);
    expect(c.slots.filter(Boolean).map((s) => s!.itemId)).toEqual([
      'components',
      'fuel',
      'scrap',
      'scrap',
    ]);
  });
  it('rejects self transfers', () => {
    const c = new Container(2);
    c.add('scrap', 4);
    expect(takeAll(c, c)).toEqual({ moved: 0, leftovers: 0, byItem: {} });
  });
  it('does not consume valid units through malformed slots', () => {
    const source = new Container(3),
      destination = new Container(3);
    source.slots[0] = { itemId: 'scrap', count: 999 };
    source.slots[1] = { itemId: 'scrap', count: 7 };
    const result = takeAll(source, destination);
    expect(result.moved).toBe(7);
    expect(source.slots[0]?.count).toBe(999);
    expect(source.slots[1]).toBeNull();
  });
  it('leaves malformed entries and valid inventory intact when sorting', () => {
    const c = new Container(3);
    c.add('fuel', 2);
    c.slots[2] = { itemId: 'scrap', count: 0 };
    const before = c.serialise();
    sortContainer(c);
    expect(c.serialise()).toEqual(before);
  });
});
