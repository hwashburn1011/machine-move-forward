export interface SeedGardenSave {
  format: 1;
  water: number;
  greens: number;
  progressS: number;
}

const BATCH_SECONDS = 180;
const MAX_WATER = 2;
const MAX_GREENS = 6;
const COMPLETION_EPSILON = 1e-9;

/** Pure garden controller. One stored water starts one batch; completion yields three greens. */
export class SeedGarden {
  private water = 0;
  private greens = 0;
  private progressS = 0;

  loadWater(available: number): number {
    if (!Number.isFinite(available) || available <= 0) return 0;
    const accepted = Math.min(MAX_WATER - this.water, Math.floor(available));
    if (accepted > 0) this.water += accepted;
    return accepted;
  }
  fixedUpdate(dt: number): number {
    if (!Number.isFinite(dt) || dt <= 0) return 0;
    let remaining = dt;
    let made = 0;
    // At most MAX_WATER batches can complete and each completion consumes one
    // water, so this loop is bounded independently of a hostile dt value.
    while (remaining > 0 && this.water > 0 && this.greens <= MAX_GREENS - 3) {
      const needed = BATCH_SECONDS - this.progressS;
      const step = Math.min(remaining, needed);
      this.progressS += step;
      remaining -= step;
      if (this.progressS + COMPLETION_EPSILON < BATCH_SECONDS) break;
      this.progressS = 0;
      this.water -= 1;
      this.greens += 3;
      made += 3;
    }
    return made;
  }
  harvest(room: number): number {
    if (!Number.isFinite(room) || room <= 0) return 0;
    const removed = Math.min(this.greens, Math.floor(room));
    this.greens -= removed;
    return removed;
  }
  snapshot(): Readonly<SeedGardenSave> {
    return { format: 1, water: this.water, greens: this.greens, progressS: this.progressS };
  }
  restore(raw: unknown): void {
    if (!raw || typeof raw !== 'object' || (raw as { format?: unknown }).format !== 1) {
      this.water = 0;
      this.greens = 0;
      this.progressS = 0;
      return;
    }
    const save = raw as Partial<SeedGardenSave>;
    const valid = (value: unknown): value is number =>
      typeof value === 'number' && Number.isFinite(value);
    if (
      !valid(save.water) ||
      !valid(save.greens) ||
      !valid(save.progressS) ||
      save.water < 0 ||
      save.greens < 0 ||
      save.progressS < 0
    ) {
      this.water = 0;
      this.greens = 0;
      this.progressS = 0;
      return;
    }
    this.water = Math.min(MAX_WATER, Math.floor(save.water));
    this.greens = Math.min(MAX_GREENS, Math.floor(save.greens));
    this.progressS = Math.min(BATCH_SECONDS, save.progressS);
  }
}
