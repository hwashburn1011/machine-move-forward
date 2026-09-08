import { describe, expect, it } from 'vitest';
import { RepairSystem, REPAIR_SECONDS, type RepairTarget } from '@/interaction/RepairSystem';

const target = (over: Partial<RepairTarget> = {}): RepairTarget => ({
  id: 'bp-1',
  kind: 'structure',
  pieceId: 'wall',
  missingFraction: 1,
  ...over,
});

/** A purse that always pays, recording what it was asked for. */
const rich = () => {
  const spent: number[] = [];
  return {
    spent,
    canAfford: () => true,
    consume: (cost: { scrap?: number }) => {
      spent.push(cost.scrap ?? 0);
      return true;
    },
  };
};

const broke = () => ({ canAfford: () => false, consume: () => false });

describe('holding E to mend something', () => {
  it('does nothing at all when nothing is targeted', () => {
    const r = new RepairSystem();
    expect(r.update(0.5, null, true, rich()).completed).toBe(false);
    expect(r.progress).toBe(0);
  });

  it('does nothing while the key is not held', () => {
    const r = new RepairSystem();
    r.update(0.5, target(), false, rich());
    expect(r.progress).toBe(0);
  });

  it('fills over the hold duration and completes exactly once', () => {
    const r = new RepairSystem();
    const purse = rich();
    r.update(REPAIR_SECONDS / 2, target(), true, purse);
    expect(r.progress).toBeCloseTo(0.5, 5);
    expect(purse.spent).toEqual([]);

    const done = r.update(REPAIR_SECONDS / 2 + 0.01, target(), true, purse);
    expect(done.completed).toBe(true);
    expect(purse.spent).toHaveLength(1);

    // Still holding: it must not mend again on the very next frame.
    const after = r.update(0.016, target(), true, purse);
    expect(after.completed).toBe(false);
    expect(purse.spent).toHaveLength(1);
  });

  it('charges only on completion, so letting go early costs nothing', () => {
    const r = new RepairSystem();
    const purse = rich();
    r.update(REPAIR_SECONDS * 0.9, target(), true, purse);
    r.update(0.016, target(), false, purse);
    expect(purse.spent).toEqual([]);
    expect(r.progress).toBe(0);
  });

  it('refuses to start when the player cannot pay', () => {
    // Draining a hold and THEN saying no would be the cruellest possible UI.
    const r = new RepairSystem();
    const tick = r.update(REPAIR_SECONDS, target(), true, broke());
    expect(tick.completed).toBe(false);
    expect(tick.blocked).toBe('cannot-afford');
    expect(r.progress).toBe(0);
  });

  it('abandons progress when the player turns to a different target', () => {
    const r = new RepairSystem();
    const purse = rich();
    r.update(REPAIR_SECONDS * 0.9, target({ id: 'bp-1' }), true, purse);
    r.update(0.016, target({ id: 'bp-2' }), true, purse);
    expect(r.progress).toBeLessThan(0.1);
    expect(purse.spent).toEqual([]);
  });

  it('will not start on something already whole', () => {
    const r = new RepairSystem();
    const tick = r.update(REPAIR_SECONDS, target({ missingFraction: 0 }), true, rich());
    expect(tick.completed).toBe(false);
    expect(tick.blocked).toBe('undamaged');
  });
});
