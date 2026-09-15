import { hashSeed, Rng } from '@/core/math/Random';

export type DustPhase = 'clear' | 'forecast' | 'front' | 'clearing';
export type DustFrontPhase = DustPhase;
export interface DustFrontSave {
  format: 1;
  phase: DustPhase;
  elapsedS: number;
  nextAtM: number;
  sequence: number;
}
export interface DustFrontInput {
  dt: number;
  distanceM: number;
  safeToAdvance: boolean;
}
export interface DustFrontView {
  phase: DustPhase;
  elapsedS: number;
  remainingS: number;
  intensity: number;
  hydrationDrainMultiplier: number;
}
export interface DustFrontTickContext {
  distanceM: number;
  eligible: boolean;
}
const FORECAST_S = 35;
const FRONT_S = 70;
const CLEARING_S = 20;
const FIRST_RUNWAY_M = 600;
const finiteNonNegative = (value: number): boolean => Number.isFinite(value) && value >= 0;

export class DustFrontDirector {
  private readonly seed: string;
  private phase: DustPhase = 'clear';
  private elapsedS = 0;
  private nextAtM = FIRST_RUNWAY_M;
  private sequence = 0;
  constructor(seed: string | number) {
    this.seed = String(seed);
  }
  reset(currentDistanceM = 0): void {
    if (!finiteNonNegative(currentDistanceM)) return;
    this.phase = 'clear';
    this.elapsedS = 0;
    this.sequence = 0;
    this.nextAtM = currentDistanceM + FIRST_RUNWAY_M;
  }
  snapshot(): DustFrontView {
    const duration =
      this.phase === 'forecast'
        ? FORECAST_S
        : this.phase === 'front'
          ? FRONT_S
          : this.phase === 'clearing'
            ? CLEARING_S
            : 0;
    const rise = Math.min(1, this.elapsedS / 10);
    const intensity =
      this.phase === 'front'
        ? rise * rise * (3 - 2 * rise)
        : this.phase === 'clearing'
          ? Math.max(0, 1 - this.elapsedS / CLEARING_S)
          : 0;
    return {
      phase: this.phase,
      elapsedS: this.elapsedS,
      remainingS: Math.max(0, duration - this.elapsedS),
      intensity,
      hydrationDrainMultiplier: 1 + intensity * 0.5,
    };
  }
  update(input: DustFrontInput): DustFrontView {
    if (
      !finiteNonNegative(input.dt) ||
      !finiteNonNegative(input.distanceM) ||
      typeof input.safeToAdvance !== 'boolean'
    )
      return this.snapshot();
    if (!input.safeToAdvance || input.dt === 0) return this.snapshot();
    let remaining = input.dt;
    while (remaining > 0) {
      if (this.phase === 'clear') {
        if (input.distanceM < this.nextAtM) break;
        this.phase = 'forecast';
        this.elapsedS = 0;
      }
      const duration =
        this.phase === 'forecast' ? FORECAST_S : this.phase === 'front' ? FRONT_S : CLEARING_S;
      const step = Math.min(remaining, duration - this.elapsedS);
      this.elapsedS += step;
      remaining -= step;
      if (this.elapsedS < duration) break;
      if (this.phase === 'forecast') {
        this.phase = 'front';
        this.elapsedS = 0;
      } else if (this.phase === 'front') {
        this.phase = 'clearing';
        this.elapsedS = 0;
      } else {
        this.phase = 'clear';
        this.elapsedS = 0;
        this.sequence += 1;
        this.nextAtM =
          input.distanceM +
          new Rng(hashSeed(this.seed, 'dust-front', this.sequence)).range(1800, 2400);
      }
    }
    return this.snapshot();
  }
  tick(dt: number, context: DustFrontTickContext): DustFrontView {
    return this.update({ dt, distanceM: context.distanceM, safeToAdvance: context.eligible });
  }
  toSave(): DustFrontSave {
    return {
      format: 1,
      phase: this.phase,
      elapsedS: this.elapsedS,
      nextAtM: this.nextAtM,
      sequence: this.sequence,
    };
  }
  restore(raw: unknown, currentDistanceM: number): void {
    if (!finiteNonNegative(currentDistanceM) || !raw || typeof raw !== 'object') {
      this.reset(currentDistanceM);
      return;
    }
    const save = raw as Partial<DustFrontSave>;
    const phases: DustPhase[] = ['clear', 'forecast', 'front', 'clearing'];
    const elapsed = save.elapsedS;
    const nextAt = save.nextAtM;
    const sequence = save.sequence;
    const duration =
      save.phase === 'forecast'
        ? FORECAST_S
        : save.phase === 'front'
          ? FRONT_S
          : save.phase === 'clearing'
            ? CLEARING_S
            : 0;
    if (
      save.format !== 1 ||
      !phases.includes(save.phase as DustPhase) ||
      !finiteNonNegative(elapsed ?? -1) ||
      elapsed! > duration ||
      !finiteNonNegative(nextAt ?? -1) ||
      !Number.isSafeInteger(sequence) ||
      sequence! < 0
    ) {
      this.reset(currentDistanceM);
      return;
    }
    this.phase = save.phase as DustPhase;
    this.elapsedS = elapsed!;
    this.nextAtM = nextAt!;
    this.sequence = sequence!;
  }
}
