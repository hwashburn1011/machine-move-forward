import type { EventBus } from '@/core/events/EventBus';
import type { Vec3Like } from '@/core/events/GameEvents';

/** Player health and stamina. Emits rather than being polled for changes. */
export class PlayerStats {
  readonly maxHealth = 100;
  readonly maxStamina = 100;

  private hp = 100;
  private sp = 100;
  private deathAnnounced = false;

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

  damage(amount: number, source: string, position: Vec3Like = { x: 0, y: 0, z: 0 }): void {
    if (this.invulnerable || !this.alive) return;

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
  }
}
