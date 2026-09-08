import { describe, expect, it } from 'vitest';
import { EarlyRadioDrop } from '@/progression/EarlyRadioDrop';

describe('EarlyRadioDrop', () => {
  it('waits for a successful post-opening chest and pays the fixed bonus once', () => {
    const drop = new EarlyRadioDrop();
    expect(drop.onSalvageChestOpened(18, 42)).toEqual({ granted: false });
    drop.arm(10);
    expect(drop.onSalvageChestOpened(18, 42)).toEqual({ granted: true, cache: { scrap: 12, fuel: 4 } });
    expect(drop.onSalvageChestOpened(20, 180)).toEqual({ granted: false });
  });

  it('restores missing or old saves as eligible for the next chest', () => {
    const old = new EarlyRadioDrop();
    old.restore(undefined);
    expect(old.isPending).toBe(true);
    const found = new EarlyRadioDrop();
    found.arm(10);
    found.onSalvageChestOpened(18, 42);
    const loaded = new EarlyRadioDrop();
    loaded.restore(found.toSave());
    expect(loaded.radioFound).toBe(true);
    expect(loaded.foundAtDistance).toBe(42);
    expect(loaded.isPending).toBe(false);
  });

  it('restores pending eligibility and records the playable distance/time', () => {
    const drop = new EarlyRadioDrop();
    drop.restore(undefined);
    expect(drop.isPending).toBe(true);
    drop.onSalvageChestOpened(23.5, 44);
    expect(drop.toSave()).toMatchObject({
      status: 'found',
      foundAtSimTime: 23.5,
      foundAtDistance: 44,
      eligibleChestsOpened: 1,
    });
  });
});
