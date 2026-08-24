import { INFINITE_AMMO } from '@/game/constants';
import type { WeaponDefinition } from '@/data/weapons';

/**
 * Runtime state for one weapon. The definition stays immutable; everything
 * that changes during play lives here.
 */
/**
 * Tolerance on the fire-rate comparison. Shot times accumulate as floats, so a
 * shot arriving exactly on cadence can land a hair under the interval and be
 * silently dropped. Far smaller than any perceptible timing difference.
 */
const FIRE_EPSILON = 1e-6;

/** How much the extended magazine adds, as a fraction of the base size. */
export const MAGAZINE_MOD_FRACTION = 0.5;

/** Everything about a weapon that changes during play, for the save file. */
export interface WeaponSave {
  id: string;
  ammoInMag: number;
  reserveAmmo: number;
  magazineBonus: number;
}

export class Weapon {
  ammoInMag: number;
  reserveAmmo: number;

  /**
   * Extra rounds from a fitted mod.
   *
   * Runtime state, kept off the definition on purpose: the definition is
   * shared by every instance, so modding one weapon there would silently mod
   * every future one too.
   */
  magazineBonus = 0;

  /**
   * Reload without drawing on the reserve.
   *
   * Per weapon rather than read from the constant at each use, so a test can
   * exercise the finite path without reaching into module state.
   */
  infiniteReserve = INFINITE_AMMO;

  private lastFireTime = -Infinity;
  private reloadEndsAt: number | null = null;

  constructor(readonly def: WeaponDefinition) {
    this.ammoInMag = def.magazineSize;
    this.reserveAmmo = def.startingReserve;
  }

  /** Base size plus whatever a mod has added. */
  get effectiveMagazineSize(): number {
    return this.def.magazineSize + this.magazineBonus;
  }

  /**
   * Fit the extended magazine. Returns false if one is already fitted.
   *
   * One per weapon: without the guard the mod stacks, and a player with five
   * of them ends up never reloading.
   */
  applyMagazineMod(): boolean {
    if (this.magazineBonus > 0) return false;
    this.magazineBonus = Math.floor(this.def.magazineSize * MAGAZINE_MOD_FRACTION);
    return true;
  }

  get reloading(): boolean {
    return this.reloadEndsAt !== null;
  }

  get isEmpty(): boolean {
    return this.ammoInMag === 0;
  }

  /** Seconds between shots. */
  get fireInterval(): number {
    return 1 / this.def.fireRate;
  }

  canFire(now: number): boolean {
    if (this.reloading) return false;
    if (this.ammoInMag <= 0) return false;
    return now - this.lastFireTime >= this.fireInterval - FIRE_EPSILON;
  }

  /** Consume a shot. Returns false if the shot could not be taken. */
  tryFire(now: number): boolean {
    if (!this.canFire(now)) return false;
    this.ammoInMag--;
    this.lastFireTime = now;
    return true;
  }

  /** Returns true if a reload actually started. */
  startReload(now: number): boolean {
    if (this.reloading) return false;
    if (this.ammoInMag >= this.effectiveMagazineSize) return false;
    if (!this.infiniteReserve && this.reserveAmmo <= 0) return false;
    this.reloadEndsAt = now + this.def.reloadTime;
    return true;
  }

  /** Returns true on the tick the reload completes. */
  fixedUpdate(now: number): boolean {
    if (this.reloadEndsAt === null || now < this.reloadEndsAt) return false;

    const wanted = this.effectiveMagazineSize - this.ammoInMag;
    const moved = this.infiniteReserve ? wanted : Math.min(wanted, this.reserveAmmo);
    this.ammoInMag += moved;
    if (!this.infiniteReserve) this.reserveAmmo -= moved;
    this.reloadEndsAt = null;
    return true;
  }

  addReserve(amount: number): void {
    this.reserveAmmo = Math.max(0, this.reserveAmmo + amount);
  }

  /** Cancel an in-flight reload, e.g. on weapon swap. */
  cancelReload(): void {
    this.reloadEndsAt = null;
  }

  serialise(): WeaponSave {
    return {
      id: this.def.id,
      ammoInMag: this.ammoInMag,
      reserveAmmo: this.reserveAmmo,
      magazineBonus: this.magazineBonus,
    };
  }

  restore(save: WeaponSave): void {
    this.magazineBonus = Math.max(0, save.magazineBonus ?? 0);
    // Clamped after the bonus is back, or a save taken with a mod fitted would
    // lose the rounds the mod was holding.
    this.ammoInMag = Math.min(Math.max(0, save.ammoInMag), this.effectiveMagazineSize);
    this.reserveAmmo = Math.max(0, save.reserveAmmo);
    this.cancelReload();
  }
}
