import type { EventBus } from '@/core/events/EventBus';
import type { Vec3Like } from '@/core/events/GameEvents';

/** Health restored by one repair kit. */
export const REPAIR_KIT_HEAL = 40;

/** Player health and stamina. Emits rather than being polled for changes. */
export class PlayerStats {
  readonly maxHealth = 100;
  readonly maxStamina = 100;

  private hp = 100;
  private sp = 100;
  private deathAnnounced = false;
  private grace = 0;

  constructor(private readonly bus: EventBus) {}

  get health(): number {
    return this.hp;
  }

  get stamina(): number {
    return this.sp;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  /** God mode, for the debug actions. */
  invulnerable = false;

  /** Seconds of respawn protection left. */
  get graceRemaining(): number {
    return this.grace;
  }

  /**
   * Protect a freshly respawned player.
   *
   * Kept separate from `invulnerable` on purpose: that flag is god mode, and
   * a grace period expiring must never switch it off. Takes the longer of two
   * overlapping grants rather than the latest, so a short one cannot cut a
   * long one short.
   */
  grantGrace(seconds: number): void {
    this.grace = Math.max(this.grace, Math.max(0, seconds));
  }

  /** Advance the grace clock. Called from the player's fixed step. */
  tick(dt: number): void {
    if (this.grace > 0) this.grace = Math.max(0, this.grace - dt);
  }

  damage(amount: number, source: string, position: Vec3Like = { x: 0, y: 0, z: 0 }): void {
    if (this.invulnerable || this.grace > 0 || !this.alive) return;

    this.hp = Math.max(0, this.hp - Math.max(0, amount));
    this.bus.emit('player:damaged', { amount, remaining: this.hp, source });

    // Guarded: repeated damage at zero must not re-announce death.
    if (this.hp === 0 && !this.deathAnnounced) {
      this.deathAnnounced = true;
      this.bus.emit('player:died', { position });
    }
  }

  heal(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.min(this.maxHealth, this.hp + Math.max(0, amount));
  }

  /**
   * Spend a repair kit. Returns false if it would have been wasted, so the
   * caller knows not to consume the item.
   *
   * Refused at full health on purpose: a misclick that burns a kit for nothing
   * is worse than a click that does nothing.
   */
  useRepairKit(): boolean {
    if (!this.alive) return false;
    if (this.hp >= this.maxHealth) return false;
    this.heal(REPAIR_KIT_HEAL);
    return true;
  }

  drainStamina(amount: number): void {
    this.sp = Math.max(0, this.sp - amount);
  }

  recoverStamina(amount: number): void {
    this.sp = Math.min(this.maxStamina, this.sp + amount);
  }

  reset(): void {
    this.hp = this.maxHealth;
    this.sp = this.maxStamina;
    this.deathAnnounced = false;
    this.grace = 0;
  }
}
