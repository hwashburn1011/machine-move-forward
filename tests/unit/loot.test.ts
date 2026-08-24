import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/math/Random';
import { rollDrops, type DropEntry } from '@/enemies/Loot';

/**
 * What a dead scavenger is worth.
 *
 * Pure and seeded: loot that varies between two runs of the same seed would
 * make the harnesses non-deterministic, and a drop table that can roll a
 * negative or fractional count reaches the inventory as a corrupt stack.
 */
describe('rolling a drop table', () => {
  const ALWAYS: DropEntry[] = [{ id: 'scrap', min: 8, max: 16 }];
  const SOMETIMES: DropEntry[] = [{ id: 'components', min: 1, max: 1, chance: 0.25 }];

  it('always yields an entry with no chance attached', () => {
    for (let seed = 0; seed < 40; seed++) {
      const got = rollDrops(ALWAYS, new Rng(seed));
      expect(got).toHaveLength(1);
      expect(got[0]!.id).toBe('scrap');
    }
  });

  it('stays inside the range it was given', () => {
    for (let seed = 0; seed < 200; seed++) {
      const [drop] = rollDrops(ALWAYS, new Rng(seed));
      expect(drop!.count).toBeGreaterThanOrEqual(8);
      expect(drop!.count).toBeLessThanOrEqual(16);
    }
  });

  it('yields whole items only', () => {
    for (let seed = 0; seed < 60; seed++) {
      const [drop] = rollDrops(ALWAYS, new Rng(seed));
      expect(Number.isInteger(drop!.count)).toBe(true);
    }
  });

  it('honours a chance, without being all-or-nothing', () => {
    let hits = 0;
    for (let seed = 0; seed < 400; seed++) {
      if (rollDrops(SOMETIMES, new Rng(seed)).length > 0) hits++;
    }
    // 25% of 400 is 100. Wide bounds: this asserts the chance is wired up at
    // all, not that the generator is perfectly uniform.
    expect(hits).toBeGreaterThan(40);
    expect(hits).toBeLessThan(180);
  });

  it('is repeatable for a seed', () => {
    // The harnesses replay fixed seeds; loot that differs between two runs of
    // the same seed would make them flaky in a way that is miserable to chase.
    const a = rollDrops([...ALWAYS, ...SOMETIMES], new Rng(1234));
    const b = rollDrops([...ALWAYS, ...SOMETIMES], new Rng(1234));
    expect(a).toEqual(b);
  });

  it('never yields an empty or negative stack', () => {
    const silly: DropEntry[] = [{ id: 'scrap', min: -5, max: 0 }];
    for (const drop of rollDrops(silly, new Rng(7))) {
      expect(drop.count).toBeGreaterThan(0);
    }
  });

  it('returns nothing for an empty table rather than throwing', () => {
    expect(rollDrops([], new Rng(3))).toEqual([]);
  });
});
