import { INFINITE_AMMO } from '@/game/constants';
import type { WeaponDefinition } from '@/data/weapons';
import {
  applyAttachment,
  attachmentsForWeapon,
  WEAPON_ATTACHMENTS,
  type AttachmentId,
} from '@/data/weapon-loadouts';

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
  attachments?: { researched: AttachmentId[]; active?: AttachmentId };
}
export interface AttachmentPurse {
  canAfford(cost: Readonly<{ scrap: number; components: number }>): boolean;
  consume(cost: Readonly<{ scrap: number; components: number }>): boolean;
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
  private researched = new Set<AttachmentId>();
  private activeAttachment: AttachmentId | null = null;
  private burstNextAt: number | null = null;
  private burstRemaining = 0;
  private nextBurstAllowedAt = -Infinity;
  private cachedEffectiveDef!: WeaponDefinition;
  private attachmentPurchaseInFlight = false;

  constructor(readonly def: WeaponDefinition) {
    this.ammoInMag = def.magazineSize;
    this.reserveAmmo = def.startingReserve;
    this.cachedEffectiveDef = def;
  }

  get effectiveDef(): WeaponDefinition {
    return this.cachedEffectiveDef;
  }
  get installedAttachment(): AttachmentId | null {
    return this.activeAttachment;
  }
  get researchedAttachments(): readonly AttachmentId[] {
    return [...this.researched];
  }
  get hasPendingBurst(): boolean {
    return this.burstRemaining > 0;
  }
  researchAttachment(
    id: AttachmentId,
    purse: AttachmentPurse,
  ):
    | { ok: true }
    | { ok: false; reason: 'unknown' | 'wrong-weapon' | 'already-researched' | 'unaffordable' } {
    const attachment = WEAPON_ATTACHMENTS[id];
    if (!attachment) return { ok: false, reason: 'unknown' };
    if (attachment.weaponId !== this.def.id) return { ok: false, reason: 'wrong-weapon' };
    if (this.researched.has(id) || this.attachmentPurchaseInFlight)
      return { ok: false, reason: 'already-researched' };
    if (!purse.canAfford(attachment.cost)) return { ok: false, reason: 'unaffordable' };
    this.attachmentPurchaseInFlight = true;
    try {
      if (!purse.consume(attachment.cost)) return { ok: false, reason: 'unaffordable' };
      this.researched.add(id);
      return { ok: true };
    } finally {
      this.attachmentPurchaseInFlight = false;
    }
  }
  setAttachment(
    id: AttachmentId | null,
  ): { ok: true } | { ok: false; reason: 'unknown' | 'wrong-weapon' | 'not-researched' } {
    if (id === null) {
      this.cancelReload();
      this.activeAttachment = null;
      this.refreshEffectiveDef();
      return { ok: true };
    }
    const attachment = WEAPON_ATTACHMENTS[id];
    if (!attachment) return { ok: false, reason: 'unknown' };
    if (attachment.weaponId !== this.def.id) return { ok: false, reason: 'wrong-weapon' };
    if (!this.researched.has(id)) return { ok: false, reason: 'not-researched' };
    this.cancelReload();
    this.activeAttachment = id;
    this.refreshEffectiveDef();
    return { ok: true };
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

  /** Presentation reads the same deadline that commits ammunition. */
  reloadProgress(now: number): number {
    return this.reloadEndsAt === null
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            1 - (this.reloadEndsAt - now) / Math.max(0.001, this.effectiveDef.reloadTime),
          ),
        );
  }

  get isEmpty(): boolean {
    return this.ammoInMag === 0;
  }

  /** Seconds between shots. */
  get fireInterval(): number {
    return 1 / this.effectiveDef.fireRate;
  }

  canFire(now: number): boolean {
    if (this.reloading) return false;
    if (now < this.nextBurstAllowedAt) return false;
    if (this.ammoInMag <= 0) return false;
    return now - this.lastFireTime >= this.fireInterval - FIRE_EPSILON;
  }

  /** Consume a shot. Returns false if the shot could not be taken. */
  tryFire(now: number, triggerHeld = true): boolean {
    if (!Number.isFinite(now)) return false;
    if (this.reloading) return false;
    if (this.burstRemaining > 0) {
      if (this.burstNextAt === null || now + FIRE_EPSILON < this.burstNextAt || this.ammoInMag <= 0)
        return false;
      this.ammoInMag--;
      this.burstRemaining--;
      // Keep the authored 12/s schedule anchored to the prior deadline. Using
      // `now` here accumulates one render/fixed-step quantisation delay per
      // round and makes the burst materially slower at 30 Hz than at 60 Hz.
      this.burstNextAt = this.burstRemaining > 0 ? (this.burstNextAt as number) + 1 / 12 : null;
      if (this.burstRemaining === 0) this.nextBurstAllowedAt = now + 0.5;
      return true;
    }
    if (!triggerHeld || !this.canFire(now)) return false;
    this.ammoInMag--;
    this.lastFireTime = now;
    if (this.activeAttachment === 'rifle-burst-cam') {
      this.burstRemaining = Math.min(2, this.ammoInMag);
      this.burstNextAt = this.burstRemaining > 0 ? now + 1 / 12 : null;
    }
    return true;
  }

  /** Returns true if a reload actually started. */
  startReload(now: number): boolean {
    this.cancelBurst();
    if (this.reloading) return false;
    if (this.ammoInMag >= this.effectiveMagazineSize) return false;
    if (!this.infiniteReserve && this.reserveAmmo <= 0) return false;
    this.reloadEndsAt = now + this.effectiveDef.reloadTime;
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
    this.cancelBurst();
  }
  cancelBurst(): void {
    this.burstNextAt = null;
    this.burstRemaining = 0;
    this.nextBurstAllowedAt = -Infinity;
  }

  serialise(): WeaponSave {
    return {
      id: this.def.id,
      ammoInMag: this.ammoInMag,
      reserveAmmo: this.reserveAmmo,
      magazineBonus: this.magazineBonus,
      ...(this.researched.size
        ? {
            attachments: {
              researched: [...this.researched],
              ...(this.activeAttachment ? { active: this.activeAttachment } : {}),
            },
          }
        : {}),
    };
  }

  restore(save: unknown): void {
    const raw = save && typeof save === 'object' ? (save as Partial<WeaponSave>) : {};
    const integer = (value: unknown): value is number =>
      typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
    this.magazineBonus = integer(raw.magazineBonus)
      ? Math.min(raw.magazineBonus, Math.floor(this.def.magazineSize * MAGAZINE_MOD_FRACTION))
      : 0;
    // Clamped after the bonus is back, or a save taken with a mod fitted would
    // lose the rounds the mod was holding.
    this.ammoInMag = integer(raw.ammoInMag)
      ? Math.min(raw.ammoInMag, this.effectiveMagazineSize)
      : this.effectiveMagazineSize;
    this.reserveAmmo = integer(raw.reserveAmmo) ? raw.reserveAmmo : 0;
    this.researched.clear();
    this.activeAttachment = null;
    const researched =
      raw.attachments && Array.isArray(raw.attachments.researched)
        ? raw.attachments.researched
        : [];
    for (const id of researched) {
      if (WEAPON_ATTACHMENTS[id] && attachmentsForWeapon(this.def.id).includes(id))
        this.researched.add(id);
    }
    const active = raw.attachments?.active;
    if (active && this.researched.has(active)) this.activeAttachment = active;
    this.refreshEffectiveDef();
    this.cancelReload();
  }

  private refreshEffectiveDef(): void {
    this.cachedEffectiveDef = this.activeAttachment
      ? applyAttachment(this.def, this.activeAttachment)
      : this.def;
  }
}
