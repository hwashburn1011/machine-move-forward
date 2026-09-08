import { describe, expect, it } from 'vitest';
import { UPGRADE_IDS } from '@/data/upgrades';
import { UpgradeSystem, type UpgradePurse } from '@/progression/UpgradeSystem';

function purse(initial: number): UpgradePurse & { value: number; calls: number } {
  return {
    value: initial,
    calls: 0,
    canAfford: (cost) => (cost.components ?? 0) + (cost.scrap ?? 0) <= initial,
    consume(cost) {
      const amount = (cost.components ?? 0) + (cost.scrap ?? 0);
      if (amount > this.value) return false;
      this.value -= amount;
      this.calls++;
      return true;
    },
  };
}

describe('upgrade research and sockets', () => {
  it('defines exactly the six planned upgrades', () => {
    expect(UPGRADE_IDS).toEqual([
      'longstride-rams',
      'torque-clutch',
      'overwound-dynamo',
      'lean-governor',
      'heavy-breech',
      'cycler-feed',
    ]);
  });

  it('charges a research exactly once and keeps it permanent', () => {
    const p = purse(68);
    const upgrades = new UpgradeSystem();
    expect(upgrades.research('longstride-rams', p)).toEqual({ ok: true, id: 'longstride-rams' });
    expect(p.value).toBe(0);
    expect(p.calls).toBe(1);
    expect(upgrades.research('longstride-rams', p)).toMatchObject({ ok: false });
    expect(p.calls).toBe(1);
  });

  it('allows one active upgrade per branch and free swaps', () => {
    const p = purse(140);
    const upgrades = new UpgradeSystem();
    expect(upgrades.research('longstride-rams', p).ok).toBe(true);
    expect(upgrades.research('torque-clutch', p).ok).toBe(true);
    expect(upgrades.activate('longstride-rams')).toBe(true);
    expect(upgrades.activate('torque-clutch')).toBe(true);
    expect(upgrades.active('propulsion')).toBe('torque-clutch');
    expect(upgrades.swap('longstride-rams')).toBe(true);
    expect(upgrades.active('propulsion')).toBe('longstride-rams');
  });

  it('rejects unknown, unresearched, and conflicting save ids', () => {
    const upgrades = new UpgradeSystem({
      researched: ['longstride-rams', 'torque-clutch', 'not-real'] as never,
      active: { propulsion: 'torque-clutch', power: 'not-real' } as never,
    });
    expect(upgrades.researchedIds).toEqual(['longstride-rams', 'torque-clutch']);
    expect(upgrades.activeIds).toEqual(['torque-clutch']);
    expect(upgrades.activate('lean-governor')).toBe(false);
  });

  it('ignores malformed save collections without throwing', () => {
    const upgrades = new UpgradeSystem({ researched: {} as never, active: [] as never });
    expect(upgrades.researchedIds).toEqual([]);
    expect(upgrades.activeIds).toEqual([]);
  });

  it('combines active modifiers without mutating base data', () => {
    const p = purse(300);
    const upgrades = new UpgradeSystem();
    upgrades.research('longstride-rams', p);
    upgrades.research('overwound-dynamo', p);
    upgrades.research('heavy-breech', p);
    upgrades.activate('longstride-rams');
    upgrades.activate('overwound-dynamo');
    upgrades.activate('heavy-breech');
    expect(upgrades.getModifiers()).toMatchObject({
      speedMultiplier: 1.18,
      fuelBurnMultiplier: 1.25 * 1.5,
      generationBonus: 6,
      turretDamageMultiplier: 60 / 42,
      turretRateMultiplier: 0.8 / 1.2,
      turretPowerBonus: 1,
    });
  });
});
