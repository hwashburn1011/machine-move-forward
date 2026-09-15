export type EndingPhase = 'available' | 'committed' | 'arrival' | 'credits' | 'complete';
export interface EndingSave {
  format: 1;
  phase: EndingPhase;
  committedAtDistance: number | null;
  arrivalElapsedS: number;
}
export type EndingEffect =
  | { type: 'lock-course'; bearingDeg: number; remainingM: number }
  | { type: 'request-sanctuary'; active: boolean }
  | { type: 'begin-arrival' }
  | { type: 'show-credits' }
  | { type: 'enter-keep-walking' };
export interface EndingContext {
  eligible: boolean;
  currentDistance: number;
  meridianBearingDeg: number;
  stable: boolean;
}
export interface CommitTicket {
  readonly id: number;
  readonly distance: number;
  readonly bearingDeg: number;
}
const phases: EndingPhase[] = ['available', 'committed', 'arrival', 'credits', 'complete'];
const TIME_EPSILON = 1e-9;

export class EndingDirector {
  private current: EndingPhase = 'available';
  private distance: number | null = null;
  private arrivalElapsedS = 0;
  private ticket: CommitTicket | null = null;
  private nextTicket = 1;
  get phase(): EndingPhase {
    return this.current;
  }
  get snapshot(): Readonly<EndingSave> {
    return Object.freeze({
      format: 1 as const,
      phase: this.current,
      committedAtDistance: this.distance,
      arrivalElapsedS: this.arrivalElapsedS,
    });
  }
  prepareCommit(
    context: EndingContext,
  ):
    | { ok: true; ticket: CommitTicket }
    | { ok: false; reason: 'unavailable' | 'unstable' | 'invalid-distance' } {
    this.ticket = null;
    if (!context.eligible || this.current !== 'available')
      return { ok: false, reason: 'unavailable' };
    if (!context.stable) return { ok: false, reason: 'unstable' };
    if (!Number.isFinite(context.currentDistance) || context.currentDistance < 0)
      return { ok: false, reason: 'invalid-distance' };
    if (
      !Number.isFinite(context.meridianBearingDeg) ||
      context.meridianBearingDeg < -45 ||
      context.meridianBearingDeg > 45
    )
      return { ok: false, reason: 'unstable' };
    const ticket: CommitTicket = {
      id: this.nextTicket++,
      distance: context.currentDistance,
      bearingDeg: context.meridianBearingDeg,
    };
    this.ticket = Object.freeze(ticket);
    return { ok: true, ticket: this.ticket };
  }
  checkpointSucceeded(ticket: CommitTicket, context: EndingContext): EndingEffect[] {
    if (
      !this.ticket ||
      ticket !== this.ticket ||
      this.current !== 'available' ||
      !context.eligible ||
      !context.stable ||
      !Number.isFinite(context.currentDistance) ||
      context.currentDistance < 0 ||
      Math.abs(context.currentDistance - ticket.distance) > 1 ||
      !Number.isFinite(context.meridianBearingDeg) ||
      context.meridianBearingDeg < -45 ||
      context.meridianBearingDeg > 45 ||
      context.meridianBearingDeg !== ticket.bearingDeg
    ) {
      if (this.ticket === ticket) this.ticket = null;
      return [];
    }
    this.ticket = null;
    this.current = 'committed';
    this.distance = ticket.distance;
    this.arrivalElapsedS = 0;
    return [
      { type: 'lock-course', bearingDeg: ticket.bearingDeg, remainingM: 400 },
      { type: 'request-sanctuary', active: true },
    ];
  }
  checkpointFailed(ticket: CommitTicket): void {
    if (this.ticket === ticket) this.ticket = null;
  }
  update(input: { currentDistance: number; elapsedSimS: number }): EndingEffect[] {
    if (!Number.isFinite(input.currentDistance)) return [];
    const effects: EndingEffect[] = [];
    if (
      this.current === 'committed' &&
      this.distance !== null &&
      input.currentDistance >= this.distance + 400
    ) {
      this.current = 'arrival';
      effects.push({ type: 'begin-arrival' });
    } else if (this.current === 'arrival') {
      this.arrivalElapsedS +=
        Number.isFinite(input.elapsedSimS) && input.elapsedSimS > 0 ? input.elapsedSimS : 0;
      if (this.arrivalElapsedS >= 12 - TIME_EPSILON) {
        this.arrivalElapsedS = 12;
        this.current = 'credits';
        effects.push({ type: 'show-credits' });
      }
    }
    return effects;
  }
  skip(): EndingEffect[] {
    if (this.current === 'available' || this.current === 'complete') return [];
    this.current = 'complete';
    this.ticket = null;
    return [{ type: 'request-sanctuary', active: false }, { type: 'enter-keep-walking' }];
  }
  acknowledgeCredits(): EndingEffect[] {
    if (this.current !== 'credits') return [];
    this.current = 'complete';
    return [{ type: 'request-sanctuary', active: false }, { type: 'enter-keep-walking' }];
  }
  toSave(): EndingSave {
    return { ...this.snapshot };
  }
  restore(save: unknown, eligible: boolean): void {
    this.ticket = null;
    this.current = 'available';
    this.distance = null;
    this.arrivalElapsedS = 0;
    if (!eligible || !save || typeof save !== 'object') return;
    const raw = save as Partial<EndingSave>;
    if (raw.format !== 1 || !phases.includes(raw.phase as EndingPhase)) return;
    if (
      raw.phase !== 'available' &&
      (typeof raw.committedAtDistance !== 'number' ||
        !Number.isFinite(raw.committedAtDistance) ||
        raw.committedAtDistance < 0)
    )
      return;
    if (!Number.isFinite(raw.arrivalElapsedS) || raw.arrivalElapsedS! < 0) return;
    if (raw.phase === 'available') {
      this.current = 'available';
      this.distance = null;
      this.arrivalElapsedS = 0;
      return;
    }
    if (raw.phase === 'complete' || raw.phase === 'credits') {
      this.current = raw.phase;
      this.distance = raw.committedAtDistance!;
      this.arrivalElapsedS = Math.min(12, raw.arrivalElapsedS!);
      return;
    }
    this.current = raw.phase!;
    this.distance = raw.committedAtDistance!;
    this.arrivalElapsedS = raw.phase === 'committed' ? 0 : Math.min(12, raw.arrivalElapsedS!);
  }
}
