import { chooseCaretakerJob, type CaretakerJob, type CaretakerWorkSnapshot } from './CaretakerWork';

export type CaretakerMode = 'companion' | 'steward';
export type CaretakerJobPhase =
  'idle' | 'to-source' | 'service-source' | 'to-target' | 'service-target' | 'returning';
export interface CaretakerNavState {
  sourceReached: boolean;
  targetReached: boolean;
  homeReached?: boolean;
  safe: boolean;
  powered: boolean;
  docked: boolean;
  /** Live route/endpoint validation; absent for older callers with no active route. */
  pathAvailable?: boolean;
}
export interface CaretakerSnapshot {
  recruited: boolean;
  mode: CaretakerMode;
  phase: CaretakerJobPhase;
  job: CaretakerJob | null;
  token: number | null;
  serviceRemainingS: number;
  refusal: string | null;
}
export interface CaretakerSave {
  format: 1;
  recruited: boolean;
  mode: CaretakerMode;
}

export class CaretakerDirector {
  private recruited = false;
  private mode: CaretakerMode = 'companion';
  private phase: CaretakerJobPhase = 'idle';
  private job: CaretakerJob | null = null;
  private token: number | null = null;
  private nextToken = 1;
  private serviceRemainingS = 0;
  private refusal: string | null = null;
  private waitS = 0;
  recruit(): boolean {
    if (this.recruited) return false;
    this.recruited = true;
    return true;
  }
  setMode(mode: CaretakerMode): boolean {
    if (!this.recruited || !['companion', 'steward'].includes(mode)) return false;
    this.mode = mode;
    if (mode === 'companion') this.cancel();
    return true;
  }
  plan(snapshot: CaretakerWorkSnapshot): CaretakerJob | null {
    if (!this.recruited || this.mode !== 'steward' || this.phase !== 'idle' || this.waitS > 0)
      return null;
    const proposed = chooseCaretakerJob(snapshot);
    this.job = proposed ? Object.freeze({ ...proposed }) : null;
    if (this.job) {
      this.phase = 'to-source';
      this.token = this.nextToken++;
    }
    return this.job;
  }
  fixedUpdate(dt: number, nav: CaretakerNavState): CaretakerSnapshot {
    if (!Number.isFinite(dt) || dt < 0) return this.snapshot();
    if (!nav.safe || !nav.powered || !nav.docked || nav.pathAvailable === false) {
      this.refusal = !nav.safe
        ? 'unsafe'
        : !nav.powered
          ? 'unpowered'
          : !nav.docked
            ? 'undocked'
            : 'unreachable';
      this.cancel();
      return this.snapshot();
    }
    this.refusal = null;
    this.waitS = Math.max(0, this.waitS - dt);
    if (this.phase === 'to-source' && nav.sourceReached) {
      this.phase = 'service-source';
      this.serviceRemainingS = 2;
    } else if (this.phase === 'to-target' && nav.targetReached) {
      this.phase = 'service-target';
      this.serviceRemainingS = 2;
    } else if ((this.phase === 'service-source' || this.phase === 'service-target') && dt > 0) {
      this.serviceRemainingS = Math.max(0, this.serviceRemainingS - dt);
      if (this.serviceRemainingS === 0)
        this.phase = this.phase === 'service-source' ? 'to-target' : 'returning';
    }
    return this.snapshot();
  }
  resolveJob(token: number, success: boolean): boolean {
    if (this.token !== token || !this.job || this.phase !== 'returning') return false;
    this.job = null;
    this.token = null;
    this.phase = 'idle';
    this.waitS = success ? 2 : 0;
    return true;
  }
  cancel(): void {
    this.phase = 'idle';
    this.job = null;
    this.token = null;
    this.serviceRemainingS = 0;
    this.waitS = 0;
  }
  reset(): void {
    this.cancel();
    this.recruited = false;
    this.mode = 'companion';
    this.refusal = null;
  }
  snapshot(): CaretakerSnapshot {
    return {
      recruited: this.recruited,
      mode: this.mode,
      phase: this.phase,
      job: this.job,
      token: this.token,
      serviceRemainingS: this.serviceRemainingS,
      refusal: this.refusal,
    };
  }
  toSave(): CaretakerSave {
    return { format: 1, recruited: this.recruited, mode: this.mode };
  }
  restore(raw: unknown): void {
    this.reset();
    if (!raw || typeof raw !== 'object') return;
    const save = raw as Partial<CaretakerSave>;
    if (
      save.format !== 1 ||
      typeof save.recruited !== 'boolean' ||
      !['companion', 'steward'].includes(save.mode as string)
    )
      return;
    this.recruited = save.recruited;
    this.mode = save.recruited ? (save.mode as CaretakerMode) : 'companion';
  }
}
