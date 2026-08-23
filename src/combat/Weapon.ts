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

export class Weapon {
  ammoInMag: number;
  reserveAmmo: number;

  private lastFireTime = -Infinity;
  private reloadEndsAt: number | null = null;

  constructor(readonly def: WeaponDefinition) {
    this.ammoInMag = def.magazineSize;
    this.reserveAmmo = def.startingReserve;
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
    if (this.ammoInMag >= this.def.magazineSize) return false;
    if (this.reserveAmmo <= 0) return false;
    this.reloadEndsAt = now + this.def.reloadTime;
    return true;
  }

  /** Returns true on the tick the reload completes. */
  fixedUpdate(now: number): boolean {
    if (this.reloadEndsAt === null || now < this.reloadEndsAt) return false;

    const wanted = this.def.magazineSize - this.ammoInMag;
    const moved = Math.min(wanted, this.reserveAmmo);
    this.ammoInMag += moved;
    this.reserveAmmo -= moved;
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
}
