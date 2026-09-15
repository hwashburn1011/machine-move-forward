import { describe, expect, it } from 'vitest';
import { Weapon } from '@/combat/Weapon';
import { WEAPONS } from '@/data/weapons';
import { applyAttachment } from '@/data/weapon-loadouts';

const purse = (scrap: number, components: number) => {
  const state = { scrap, components };
  return {
    state,
    canAfford: (cost: { scrap: number; components: number }) =>
      state.scrap >= cost.scrap && state.components >= cost.components,
    consume: (cost: { scrap: number; components: number }) => {
      if (state.scrap < cost.scrap || state.components < cost.components) return false;
      state.scrap -= cost.scrap;
      state.components -= cost.components;
      return true;
    },
  };
};

describe('weapon loadouts', () => {
  it('preserves the base definition for unknown or wrong-weapon attachments', () => {
    expect(applyAttachment(WEAPONS.rifle!, 'shotgun-scatter-brake')).toBe(WEAPONS.rifle);
    expect(applyAttachment(WEAPONS.shotgun!, 'rifle-stabilizer')).toBe(WEAPONS.shotgun);
    expect(applyAttachment(WEAPONS.rifle!, 'future-attachment' as never)).toBe(WEAPONS.rifle);
  });

  it('charges once and permits free swaps only among researched attachments', () => {
    const weapon = new Weapon(WEAPONS.rifle!);
    const funds = purse(24, 16);
    expect(weapon.setAttachment('rifle-stabilizer')).toEqual({
      ok: false,
      reason: 'not-researched',
    });
    expect(weapon.researchAttachment('rifle-stabilizer', funds)).toEqual({ ok: true });
    expect(funds.state).toEqual({ scrap: 12, components: 8 });
    expect(weapon.researchAttachment('rifle-stabilizer', funds)).toEqual({
      ok: false,
      reason: 'already-researched',
    });
    expect(weapon.setAttachment('rifle-stabilizer')).toEqual({ ok: true });
    expect(weapon.effectiveDef).toBe(weapon.effectiveDef);
    expect(weapon.effectiveDef.spread).toBeCloseTo(WEAPONS.rifle!.spread * 0.55);
    expect(weapon.effectiveDef.aimSpread).toBeCloseTo(WEAPONS.rifle!.aimSpread * 0.55);
    expect(weapon.setAttachment(null)).toEqual({ ok: true });
  });

  it('cannot charge twice when a resource notification re-enters the same purchase', () => {
    const weapon = new Weapon(WEAPONS.rifle!);
    const funds = purse(24, 16);
    let nested: ReturnType<typeof weapon.researchAttachment> | null = null;
    const consume = funds.consume;
    funds.consume = (cost) => {
      const committed = consume(cost);
      if (committed) nested = weapon.researchAttachment('rifle-stabilizer', funds);
      return committed;
    };

    expect(weapon.researchAttachment('rifle-stabilizer', funds)).toEqual({ ok: true });
    expect(nested).toEqual({ ok: false, reason: 'already-researched' });
    expect(funds.state).toEqual({ scrap: 12, components: 8 });
    expect(weapon.researchedAttachments).toEqual(['rifle-stabilizer']);
  });

  it('preserves base definition and restores only known compatible attachments', () => {
    const weapon = new Weapon(WEAPONS.shotgun!);
    const funds = purse(12, 8);
    weapon.researchAttachment('shotgun-choke', funds);
    weapon.setAttachment('shotgun-choke');
    const save = weapon.serialise();
    expect(weapon.def).toBe(WEAPONS.shotgun);
    expect(save.attachments?.active).toBe('shotgun-choke');
    const restored = new Weapon(WEAPONS.shotgun!);
    restored.restore({
      ...save,
      attachments: { researched: ['rifle-burst-cam', 'shotgun-choke'], active: 'rifle-burst-cam' },
    });
    expect(restored.installedAttachment).toBeNull();
    expect(restored.researchedAttachments).toEqual(['shotgun-choke']);
  });

  it('continues a burst at 12 shots/s after trigger release and cancels explicitly', () => {
    const weapon = new Weapon(WEAPONS.rifle!);
    const funds = purse(12, 8);
    weapon.researchAttachment('rifle-burst-cam', funds);
    weapon.setAttachment('rifle-burst-cam');
    expect(weapon.tryFire(0, true)).toBe(true);
    expect(weapon.hasPendingBurst).toBe(true);
    expect(weapon.tryFire(0.01, false)).toBe(false);
    expect(weapon.tryFire(1 / 12, false)).toBe(true);
    expect(weapon.tryFire(2 / 12, false)).toBe(true);
    expect(weapon.hasPendingBurst).toBe(false);
    expect(weapon.tryFire(2 / 12 + 0.49, true)).toBe(false);
    expect(weapon.tryFire(2 / 12 + 0.5, true)).toBe(true);
    expect(weapon.tryFire(Number.NaN)).toBe(false);
    weapon.tryFire(1, true);
    weapon.cancelBurst();
    expect(weapon.hasPendingBurst).toBe(false);
  });

  it.each([30, 60, 144])('anchors burst cadence without accumulating %i Hz tick delay', (hz) => {
    const weapon = new Weapon(WEAPONS.rifle!);
    const funds = purse(12, 8);
    weapon.researchAttachment('rifle-burst-cam', funds);
    weapon.setAttachment('rifle-burst-cam');
    const times: number[] = [];
    const dt = 1 / hz;
    for (let step = 0; step <= Math.ceil(hz); step++) {
      const now = step * dt;
      if (weapon.tryFire(now, step === 0)) times.push(now);
      if (times.length === 3) break;
    }
    expect(times).toHaveLength(3);
    expect(times[1]!).toBeGreaterThanOrEqual(1 / 12 - 1e-6);
    expect(times[1]!).toBeLessThan(1 / 12 + dt + 1e-6);
    // The third deadline stays at 2/12 rather than being based on the delayed
    // second tick. At 30 Hz that distinguishes 1/6 from a drifted 1/5 second.
    expect(times[2]!).toBeLessThan(1 / 6 + dt);
  });

  it('cancels a pending burst when reload is attempted and ignores malformed saves', () => {
    const weapon = new Weapon(WEAPONS.rifle!);
    const funds = purse(12, 8);
    weapon.researchAttachment('rifle-burst-cam', funds);
    weapon.setAttachment('rifle-burst-cam');
    weapon.tryFire(0);
    expect(weapon.startReload(0.01)).toBe(true);
    expect(weapon.hasPendingBurst).toBe(false);
    const fresh = new Weapon(WEAPONS.rifle!);
    fresh.restore({
      id: 'rifle',
      ammoInMag: Infinity,
      reserveAmmo: -4,
      magazineBonus: Infinity,
      attachments: { researched: {} as never, active: 'rifle-burst-cam' },
    });
    expect(fresh.ammoInMag).toBe(fresh.effectiveMagazineSize);
    expect(fresh.reserveAmmo).toBe(0);
    expect(fresh.installedAttachment).toBeNull();
  });
});
