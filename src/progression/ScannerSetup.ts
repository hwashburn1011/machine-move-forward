export const SCANNER_ACTIVE_SECONDS = 180;
export const SCANNER_SAFE_DELAY_SECONDS = 3;

export type ScannerPhase =
  'awaiting-receiver' | 'awaiting-module' | 'installed' | 'scanning' | 'contact-ready' | 'consumed';

export interface ScannerSave {
  format: 1;
  phase: ScannerPhase;
  elapsedS: number;
  pendingDelayS: number;
}

export interface ScannerSnapshot extends ScannerSave {
  progress: number;
  canStart: boolean;
}

export interface ScannerStartContext {
  powered: boolean;
  alive: boolean;
  aboard: boolean;
  stable: boolean;
  encounterActive: boolean;
}

export type ScannerRefusal =
  | 'receiver-required'
  | 'module-required'
  | 'already-installed'
  | 'already-started'
  | 'power-required'
  | 'player-unavailable'
  | 'unsafe-boundary';

export type ScannerEvent = 'scan-started' | 'contact-ready';

const PHASES: readonly ScannerPhase[] = [
  'awaiting-receiver',
  'awaiting-module',
  'installed',
  'scanning',
  'contact-ready',
  'consumed',
];

const finiteNonnegative = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** Pure state for the opening scanner; Game owns power, inventory, and story presentation. */
export class ScannerSetup {
  private phase: ScannerPhase = 'awaiting-receiver';
  private elapsedS = 0;
  private pendingDelayS = 0;
  private contactEmitted = false;

  get currentPhase(): ScannerPhase {
    return this.phase;
  }

  get installed(): boolean {
    return ['installed', 'scanning', 'contact-ready', 'consumed'].includes(this.phase);
  }

  get started(): boolean {
    return ['scanning', 'contact-ready', 'consumed'].includes(this.phase);
  }

  snapshot(): ScannerSnapshot {
    return {
      format: 1,
      phase: this.phase,
      elapsedS: this.elapsedS,
      pendingDelayS: this.pendingDelayS,
      progress: Math.min(1, this.elapsedS / SCANNER_ACTIVE_SECONDS),
      canStart: this.phase === 'installed',
    };
  }

  receive(): boolean {
    if (this.phase !== 'awaiting-receiver') return false;
    this.phase = 'awaiting-module';
    return true;
  }

  install(moduleOwned: boolean): boolean {
    if (this.phase !== 'awaiting-module' || !moduleOwned) return false;
    this.phase = 'installed';
    return true;
  }

  start(
    context: ScannerStartContext,
  ): { ok: true; event: 'scan-started' } | { ok: false; reason: ScannerRefusal } {
    if (this.phase === 'awaiting-receiver') return { ok: false, reason: 'receiver-required' };
    if (this.phase === 'awaiting-module') return { ok: false, reason: 'module-required' };
    if (this.phase !== 'installed') return { ok: false, reason: 'already-started' };
    if (!context.powered) return { ok: false, reason: 'power-required' };
    if (!context.alive || !context.aboard) return { ok: false, reason: 'player-unavailable' };
    if (!context.stable || context.encounterActive) return { ok: false, reason: 'unsafe-boundary' };
    this.phase = 'scanning';
    return { ok: true, event: 'scan-started' };
  }

  update(dt: number, context: ScannerStartContext): ScannerEvent[] {
    if (!Number.isFinite(dt) || dt <= 0 || this.phase === 'consumed') return [];
    if (this.phase !== 'scanning' && this.phase !== 'contact-ready') return [];
    if (
      !context.alive ||
      !context.aboard ||
      !context.stable ||
      context.encounterActive ||
      (this.phase === 'scanning' && !context.powered)
    )
      return [];
    const events: ScannerEvent[] = [];
    if (this.phase === 'scanning') {
      this.elapsedS = Math.min(SCANNER_ACTIVE_SECONDS, this.elapsedS + dt);
      if (this.elapsedS >= SCANNER_ACTIVE_SECONDS) {
        this.phase = 'contact-ready';
        this.pendingDelayS = SCANNER_SAFE_DELAY_SECONDS;
        this.contactEmitted = false;
      }
    } else if (this.phase === 'contact-ready') {
      this.pendingDelayS = Math.max(0, this.pendingDelayS - dt);
      if (this.pendingDelayS <= 0 && !this.contactEmitted) {
        this.contactEmitted = true;
        events.push('contact-ready');
      }
    }
    return events;
  }

  consume(): boolean {
    if (this.phase !== 'contact-ready' || this.pendingDelayS > 0) return false;
    this.phase = 'consumed';
    this.contactEmitted = false;
    return true;
  }

  restore(
    raw: unknown,
    legacy?: { signalProgress?: number; currentDistance?: number; signalStartedAt?: number },
  ): void {
    this.phase = 'awaiting-receiver';
    this.elapsedS = 0;
    this.pendingDelayS = 0;
    this.contactEmitted = false;
    if (raw && typeof raw === 'object') {
      const value = raw as Partial<ScannerSave>;
      if (value.format === 1 && PHASES.includes(value.phase as ScannerPhase)) {
        const elapsed = finiteNonnegative(value.elapsedS);
        const delay = finiteNonnegative(value.pendingDelayS);
        const phase = value.phase as ScannerPhase;
        const valid =
          elapsed !== null &&
          delay !== null &&
          ((['awaiting-receiver', 'awaiting-module', 'installed'].includes(phase) &&
            elapsed === 0 &&
            delay === 0) ||
            (phase === 'scanning' && elapsed < SCANNER_ACTIVE_SECONDS && delay === 0) ||
            (phase === 'contact-ready' &&
              elapsed === SCANNER_ACTIVE_SECONDS &&
              delay <= SCANNER_SAFE_DELAY_SECONDS) ||
            (phase === 'consumed' && elapsed === SCANNER_ACTIVE_SECONDS && delay === 0));
        if (valid) {
          this.phase = phase;
          this.elapsedS = elapsed!;
          this.pendingDelayS = phase === 'contact-ready' ? delay! : 0;
          this.contactEmitted = false;
          return;
        }
      }
    }
    const legacyDistance = legacy?.currentDistance;
    const legacyOrigin = legacy?.signalStartedAt;
    const progress =
      typeof legacy?.signalProgress === 'number'
        ? legacy.signalProgress
        : Number.isFinite(legacyDistance) && Number.isFinite(legacyOrigin)
          ? ((legacyDistance as number) - (legacyOrigin as number)) / 2200
          : Number.isFinite(legacyDistance)
            ? 0
            : undefined;
    if (typeof progress === 'number' && Number.isFinite(progress)) {
      const clamped = Math.max(0, Math.min(1, progress));
      this.phase = clamped >= 1 ? 'contact-ready' : 'scanning';
      this.elapsedS = clamped * SCANNER_ACTIVE_SECONDS;
      this.pendingDelayS = clamped >= 1 ? SCANNER_SAFE_DELAY_SECONDS : 0;
      this.contactEmitted = false;
    }
  }

  toSave(): ScannerSave {
    return {
      format: 1,
      phase: this.phase,
      elapsedS: this.elapsedS,
      pendingDelayS: this.pendingDelayS,
    };
  }
}
