import { describe, it, expect } from 'vitest';
import { Weapon } from '@/combat/Weapon';
import { WEAPONS } from '@/data/weapons';

const rifle = () => new Weapon(WEAPONS.rifle!);
const shotgun = () => new Weapon(WEAPONS.shotgun!);

describe('Weapon', () => {
  it('starts with a full magazine', () => {
    const w = rifle();
    expect(w.ammoInMag).toBe(w.def.magazineSize);
  });

  it('consumes a round on fire', () => {
    const w = rifle();
    expect(w.tryFire(0)).toBe(true);
    expect(w.ammoInMag).toBe(29);
  });

  it('respects the fire rate', () => {
    const w = rifle();
    expect(w.tryFire(0)).toBe(true);
    expect(w.tryFire(0.05)).toBe(false); // interval is 1/9 = 0.111s
    expect(w.tryFire(0.112)).toBe(true);
  });

  it('refuses to fire on an empty magazine', () => {
    const w = rifle();
    let t = 0;
    for (let i = 0; i < 30; i++) {
      expect(w.tryFire(t)).toBe(true);
      t += w.fireInterval;
    }
    expect(w.isEmpty).toBe(true);
    expect(w.tryFire(t)).toBe(false);
  });

  it('reloads only what the magazine is missing', () => {
    const w = rifle();
    w.tryFire(0);
    w.tryFire(1);
    expect(w.startReload(1)).toBe(true);
    w.fixedUpdate(1 + w.def.reloadTime);
    expect(w.ammoInMag).toBe(30);
    expect(w.reserveAmmo).toBe(w.def.startingReserve - 2);
  });

  it('never puts more than the magazine size in the magazine', () => {
    const w = rifle();
    for (let i = 0; i < 30; i++) w.tryFire(i * w.fireInterval);
    w.startReload(10);
    w.fixedUpdate(10 + w.def.reloadTime);
    expect(w.ammoInMag).toBe(w.def.magazineSize);
  });

  it('never takes more than the reserve holds', () => {
    const w = rifle();
    w.reserveAmmo = 4;
    for (let i = 0; i < 30; i++) w.tryFire(i * w.fireInterval);
    w.startReload(10);
    w.fixedUpdate(10 + w.def.reloadTime);
    expect(w.ammoInMag).toBe(4);
    expect(w.reserveAmmo).toBe(0);
  });

  it('refuses to reload a full magazine', () => {
    expect(rifle().startReload(0)).toBe(false);
  });

  it('refuses to reload with an empty reserve', () => {
    const w = rifle();
    w.reserveAmmo = 0;
    w.tryFire(0);
    expect(w.startReload(1)).toBe(false);
  });

  it('blocks firing while reloading', () => {
    const w = rifle();
    w.tryFire(0);
    w.startReload(0.2);
    expect(w.reloading).toBe(true);
    expect(w.tryFire(1)).toBe(false);
  });

  it('completes the reload after exactly reloadTime', () => {
    const w = rifle();
    w.tryFire(0);
    w.startReload(1);
    expect(w.fixedUpdate(1 + w.def.reloadTime - 0.01)).toBe(false);
    expect(w.reloading).toBe(true);
    expect(w.fixedUpdate(1 + w.def.reloadTime)).toBe(true);
    expect(w.reloading).toBe(false);
  });

  it('reports completion only once', () => {
    const w = rifle();
    w.tryFire(0);
    w.startReload(1);
    expect(w.fixedUpdate(5)).toBe(true);
    expect(w.fixedUpdate(6)).toBe(false);
  });

  it('cancelReload aborts without transferring ammo', () => {
    const w = rifle();
    w.tryFire(0);
    w.startReload(1);
    w.cancelReload();
    expect(w.reloading).toBe(false);
    expect(w.ammoInMag).toBe(29);
  });

  it('the shotgun definition fires nine pellets per shot', () => {
    expect(shotgun().def.pellets).toBe(9);
  });

  it('aiming has a tighter cone than the hip', () => {
    for (const w of [rifle(), shotgun()]) {
      expect(w.def.aimSpread).toBeLessThan(w.def.spread);
    }
  });
});
