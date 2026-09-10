import type { Vec3Like } from '@/core/events/GameEvents';

/** An aim point is committed before firing: dodging never gets silently re-targeted. */
export class RangedWindup {
  target: Vec3Like | null = null;
  private elapsed = 0;
  private fired = 0;
  constructor(readonly settings: { windup: number; shots: number; shotInterval: number }) {}

  get charge(): number {
    return Math.min(1, this.elapsed / this.settings.windup);
  }
  begin(target: Vec3Like): void {
    this.target = { ...target };
    this.elapsed = 0;
    this.fired = 0;
  }
  /** At most one shot per step, including after a hitch. */
  step(dt: number): boolean {
    if (!this.target || this.complete) return false;
    this.elapsed += dt;
    if (this.elapsed < this.settings.windup + this.fired * this.settings.shotInterval) return false;
    this.fired++;
    return true;
  }
  get complete(): boolean {
    return this.fired >= this.settings.shots;
  }
  reset(): void {
    this.target = null;
    this.elapsed = 0;
    this.fired = 0;
  }
}
