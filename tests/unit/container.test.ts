import { describe, it, expect } from 'vitest';
import { Container } from '@/items/Container';
import { ITEMS } from '@/data/items';

const SCRAP_STACK = ITEMS.scrap.stackSize; // 100

describe('Container basics', () => {
  it('starts with capacity empty slots', () => {
    const c = new Container(5);
    expect(c.capacity).toBe(5);
    expect(c.slots).toHaveLength(5);
    expect(c.slots.every((s) => s === null)).toBe(true);
  });

  it('adds into one slot and reports no leftover', () => {
    const c = new Container(3);
    expect(c.add('scrap', 20)).toBe(0);
    expect(c.count('scrap')).toBe(20);
    expect(c.slots.filter(Boolean)).toHaveLength(1);
  });

  it('opens a second slot past one stack', () => {
    const c = new Container(3);
    c.add('scrap', SCRAP_STACK + 20);
    expect(c.slots.filter(Boolean)).toHaveLength(2);
    expect(c.count('scrap')).toBe(SCRAP_STACK + 20);
  });

  it('tops up a partial stack before opening a new slot', () => {
    const c = new Container(5);
    c.add('scrap', 60);
    c.add('scrap', 60);
    // 120 must be 100 + 20 across two slots, never 60 + 60 across two plus a third.
    expect(c.slots.filter(Boolean)).toHaveLength(2);
    expect(c.slots[0]?.count).toBe(SCRAP_STACK);
    expect(c.slots[1]?.count).toBe(20);
  });

  it('returns the exact leftover past total capacity', () => {
    const c = new Container(2);
    const leftover = c.add('scrap', SCRAP_STACK * 2 + 35);
    expect(leftover).toBe(35);
    expect(c.count('scrap')).toBe(SCRAP_STACK * 2);
  });

  it('returns everything when the container is full', () => {
    const c = new Container(1);
    c.add('scrap', SCRAP_STACK);
    expect(c.add('scrap', 10)).toBe(10);
    expect(c.count('scrap')).toBe(SCRAP_STACK);
  });

  it('treats zero and negative adds as no-ops', () => {
    const c = new Container(2);
    expect(c.add('scrap', 0)).toBe(0);
    expect(c.add('scrap', -5)).toBe(0);
    expect(c.count('scrap')).toBe(0);
  });

  it('keeps different item types in separate slots', () => {
    const c = new Container(3);
    c.add('scrap', 10);
    c.add('components', 10);
    expect(c.slots.filter(Boolean)).toHaveLength(2);
    expect(c.count('scrap')).toBe(10);
    expect(c.count('components')).toBe(10);
  });
});

describe('Container removal', () => {
  it('removes from a single stack', () => {
    const c = new Container(3);
    c.add('scrap', 50);
    expect(c.remove('scrap', 20)).toBe(20);
    expect(c.count('scrap')).toBe(30);
  });

  it('removes across stacks and clears emptied slots', () => {
    const c = new Container(3);
    c.add('scrap', SCRAP_STACK + 30);
    expect(c.remove('scrap', SCRAP_STACK + 10)).toBe(SCRAP_STACK + 10);
    expect(c.count('scrap')).toBe(20);
    expect(c.slots.filter(Boolean)).toHaveLength(1);
  });

  it('returns only what was present when asked for more', () => {
    const c = new Container(3);
    c.add('scrap', 15);
    expect(c.remove('scrap', 100)).toBe(15);
    expect(c.count('scrap')).toBe(0);
    expect(c.slots.every((s) => s === null)).toBe(true);
  });

  it('removing an absent item takes nothing', () => {
    const c = new Container(3);
    c.add('scrap', 15);
    expect(c.remove('fuel', 5)).toBe(0);
    expect(c.count('scrap')).toBe(15);
  });
});

describe('Container queries', () => {
  it('has() is inclusive at exactly the amount', () => {
    const c = new Container(3);
    c.add('scrap', 10);
    expect(c.has('scrap', 10)).toBe(true);
    expect(c.has('scrap', 11)).toBe(false);
  });

  it('totalWeight sums count times unit weight', () => {
    const c = new Container(3);
    c.add('scrap', 10); // 1.0 each
    c.add('components', 5); // 2.0 each
    expect(c.totalWeight()).toBeCloseTo(20, 6);
  });

  it('isFull needs every slot occupied and every stack capped', () => {
    const c = new Container(2);
    c.add('scrap', SCRAP_STACK);
    expect(c.isFull()).toBe(false); // one slot still free
    c.add('scrap', 5);
    expect(c.isFull()).toBe(false); // second stack not capped
    c.add('scrap', SCRAP_STACK - 5);
    expect(c.isFull()).toBe(true);
  });

  it('roomFor accounts for partial stacks and empty slots', () => {
    const c = new Container(2);
    c.add('scrap', 40);
    expect(c.roomFor('scrap')).toBe(SCRAP_STACK - 40 + SCRAP_STACK);
  });
});

describe('Container transfer', () => {
  it('moves a whole stack across', () => {
    const a = new Container(2);
    const b = new Container(2);
    a.add('scrap', 30);
    expect(a.moveTo(b, 0)).toBe(0);
    expect(a.count('scrap')).toBe(0);
    expect(b.count('scrap')).toBe(30);
  });

  it('moves a partial amount and leaves the rest', () => {
    const a = new Container(2);
    const b = new Container(2);
    a.add('scrap', 30);
    a.moveTo(b, 0, 10);
    expect(a.count('scrap')).toBe(20);
    expect(b.count('scrap')).toBe(10);
  });

  it('leaves the source unchanged when the target is full', () => {
    const a = new Container(2);
    const b = new Container(1);
    a.add('scrap', 30);
    b.add('scrap', SCRAP_STACK);
    expect(a.moveTo(b, 0)).toBe(30);
    expect(a.count('scrap')).toBe(30);
  });

  it('moving an empty slot does nothing', () => {
    const a = new Container(2);
    const b = new Container(2);
    expect(a.moveTo(b, 0)).toBe(0);
  });
});

describe('Container persistence', () => {
  it('round-trips exactly', () => {
    const a = new Container(4);
    a.add('scrap', 130);
    a.add('components', 7);

    const b = new Container(4);
    b.restore(a.serialise());
    expect(b.serialise()).toEqual(a.serialise());
    expect(b.count('scrap')).toBe(130);
    expect(b.count('components')).toBe(7);
  });

  it('restore replaces rather than merges', () => {
    const a = new Container(4);
    a.add('fuel', 9);
    a.restore(new Container(4).serialise());
    expect(a.count('fuel')).toBe(0);
  });

  it('serialise returns a copy', () => {
    const a = new Container(2);
    a.add('scrap', 10);
    const snapshot = a.serialise();
    snapshot[0]!.count = 999;
    expect(a.count('scrap')).toBe(10);
  });
});
