import { describe, expect, it } from 'vitest';
import {
  RaidObjectiveController,
  pickRaidObjective,
  type RaidCargo,
} from '@/enemies/RaidObjectives';

describe('raid objective selection', () => {
  it('starts with assault and uses a deterministic three objective bag', () => {
    expect(pickRaidObjective('save-a', 1)).toBe('assault');
    const first = [2, 3, 4].map((wave) => pickRaidObjective('save-a', wave));
    expect(first).toEqual([2, 3, 4].map((wave) => pickRaidObjective('save-a', wave)));
    expect(new Set(first).size).toBe(3);
    expect(pickRaidObjective('save-a', 5)).toBe(pickRaidObjective('save-a', 5));
  });
});

describe('RaidObjectiveController', () => {
  const entry = { x: 1, y: 2, z: 3 };
  const assigned = (controller = new RaidObjectiveController()) => {
    expect(controller.assign('theft', 'enemy-1', 'crate-1', entry)).toBe(true);
    return controller;
  };

  it('requires the designated target and enforces bounded cargo', () => {
    const c = assigned();
    expect(c.pickup('other-crate', () => ({ itemId: 'scrap', count: 6 }))).toBeNull();
    expect(c.pickup('crate-1', () => ({ itemId: 'scrap', count: 7 }))).toBeNull();
    expect(c.snapshot?.state).toBe('intent');
    expect(c.pickup('crate-1', () => ({ itemId: 'scrap', count: 6 }))).toEqual({
      itemId: 'scrap',
      count: 6,
    });
    expect(c.pickup('crate-1', () => ({ itemId: 'fuel', count: 1 }))).toBeNull();
  });

  it('recovers cargo once and preserves leftovers in the ledger', () => {
    const c = assigned();
    c.pickup('crate-1', () => ({ itemId: 'components', count: 2 }));
    const received: RaidCargo[] = [];
    expect(c.takeCargoOnKill('other')).toBeNull();
    expect(
      c.takeCargoOnKill('enemy-1', (cargo) => {
        received.push({ ...cargo });
        return { itemId: 'components', count: 1 };
      }),
    ).toEqual({ itemId: 'components', count: 2 });
    expect(received).toEqual([{ itemId: 'components', count: 2 }]);
    expect(c.takeCargoOnKill('enemy-1')).toBeNull();
    expect(c.snapshot?.state).toBe('recovered');
    expect(c.recoveredLedger).toEqual([{ itemId: 'components', count: 1 }]);
  });

  it('treats a null recovery result as fully accepted and escape is one-shot', () => {
    const c = assigned();
    c.pickup('crate-1', () => ({ itemId: 'fuel', count: 2 }));
    expect(c.takeCargoOnKill('enemy-1', () => null)).toEqual({ itemId: 'fuel', count: 2 });
    expect(c.recoveredLedger).toEqual([]);
    expect(c.escape('enemy-1')).toBeNull();
    const d = assigned();
    d.pickup('crate-1', () => ({ itemId: 'scrap', count: 1 }));
    expect(d.escape('enemy-1')).toEqual({ itemId: 'scrap', count: 1 });
    expect(d.escape('enemy-1')).toBeNull();
  });

  it('round-trips stable identity and sanitizes malformed saves', () => {
    const c = assigned();
    c.pickup('crate-1', () => ({ itemId: 'scrap', count: 4 }));
    const save = c.toSave();
    const restored = new RaidObjectiveController();
    restored.restore({ ...save, recovered: [{ itemId: 'scrap', count: 4 }] });
    expect(restored.snapshot).toBeNull();
    expect(restored.recoveredLedger).toEqual([{ itemId: 'scrap', count: 4 }]);
    restored.restore({
      active: { ...c.snapshot!, state: 'carrying', cargo: null },
      recovered: [{ itemId: 'scrap', count: 99 }],
    });
    expect(restored.snapshot).toBeNull();
    expect(restored.recoveredLedger).toEqual([]);
  });

  it('collects recovered leftovers atomically and supports retry after full inventory', () => {
    const c = assigned();
    c.pickup('crate-1', () => ({ itemId: 'scrap', count: 6 }));
    c.takeCargoOnKill('enemy-1');
    expect(c.collectRecovered(() => ({ itemId: 'scrap', count: 6 }))).toEqual([]);
    expect(c.recoveredLedger).toEqual([{ itemId: 'scrap', count: 6 }]);
    expect(c.collectRecovered(() => ({ itemId: 'scrap', count: 2 }))).toEqual([
      { itemId: 'scrap', count: 4 },
    ]);
    expect(c.recoveredLedger).toEqual([{ itemId: 'scrap', count: 2 }]);
    expect(c.collectRecovered(() => null)).toEqual([{ itemId: 'scrap', count: 2 }]);
    expect(c.recoveredLedger).toEqual([]);
    const saved = c.toSave();
    const loaded = new RaidObjectiveController();
    loaded.restore(saved);
    expect(loaded.snapshot).toBeNull();
    expect(loaded.recoveredLedger).toEqual([]);
  });

  it('rejects a second active intent and reset clears it', () => {
    const c = assigned();
    expect(c.assign('assault', 'enemy-2', 'crate-2', entry)).toBe(false);
    c.reset();
    expect(c.snapshot).toBeNull();
    expect(c.assign('assault', 'enemy-2', 'crate-2', entry)).toBe(true);
  });
});
