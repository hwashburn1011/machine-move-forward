export type CourseTier = 0 | 1 | 2 | 3;
export type CourseRefusal =
  'locked' | 'unpowered' | 'off-machine' | 'unstable' | 'unavailable' | 'invalid';

export interface CourseContext {
  powered: boolean;
  playerOnMachine: boolean;
  stable: boolean;
  locked: boolean;
}

export interface CourseSnapshot {
  tier: CourseTier;
  bearingDeg: number;
  desiredDeg: number;
  throttle: number;
  lateralM: number;
}

const LIMITS: Record<CourseTier, number> = { 0: 0, 1: 12, 2: 28, 3: 45 };
const TURN_RATE = 1.6;
const finite = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
const tierValue = (value: number): CourseTier =>
  value >= 3 ? 3 : value >= 2 ? 2 : value >= 1 ? 1 : 0;
const normalizeBearing = (value: number): number => {
  let bearing = value % 360;
  if (bearing > 180) bearing -= 360;
  if (bearing < -180) bearing += 360;
  return bearing;
};

export class CourseController {
  private tierValue: CourseTier = 0;
  private bearingValue = 0;
  private desiredValue = 0;
  private throttleValue = 1;
  private lateralValue = 0;

  get snapshot(): CourseSnapshot {
    return {
      tier: this.tierValue,
      bearingDeg: this.bearingValue,
      desiredDeg: this.desiredValue,
      throttle: this.throttleValue,
      lateralM: this.lateralValue,
    };
  }

  setTier(tier: CourseTier | number): CourseSnapshot {
    this.tierValue = tierValue(finite(tier, 0));
    const limit = LIMITS[this.tierValue];
    this.bearingValue = clamp(this.bearingValue, -limit, limit);
    this.desiredValue = clamp(this.desiredValue, -limit, limit);
    return this.snapshot;
  }

  setDesiredBearing(
    degrees: number,
    context: CourseContext,
  ): { ok: true } | { ok: false; reason: CourseRefusal } {
    if (!Number.isFinite(degrees)) return { ok: false, reason: 'invalid' };
    const refusal = this.refusal(context);
    if (refusal) return { ok: false, reason: refusal };
    if (this.tierValue < 1) return { ok: false, reason: 'unavailable' };
    const limit = LIMITS[this.tierValue];
    this.desiredValue = clamp(normalizeBearing(degrees), -limit, limit);
    return { ok: true };
  }

  setThrottle(
    value: number,
    context: CourseContext,
  ): { ok: true } | { ok: false; reason: CourseRefusal } {
    if (!Number.isFinite(value)) return { ok: false, reason: 'invalid' };
    const refusal = this.refusal(context);
    if (refusal) return { ok: false, reason: refusal };
    if (this.tierValue < 1) return { ok: false, reason: 'unavailable' };
    this.throttleValue = clamp(value, 0.35, 1);
    return { ok: true };
  }

  fixedUpdate(dt: number, forwardDeltaM: number): { forwardM: number; lateralM: number } {
    const forwardM = Math.max(0, finite(forwardDeltaM, 0));
    if (!Number.isFinite(dt) || dt <= 0 || forwardM === 0) return { forwardM, lateralM: 0 };
    const maxTurn = TURN_RATE * dt;
    const difference = this.desiredValue - this.bearingValue;
    this.bearingValue += clamp(difference, -maxTurn, maxTurn);
    const lateralM = Math.tan((this.bearingValue * Math.PI) / 180) * forwardM;
    this.lateralValue += lateralM;
    return { forwardM, lateralM };
  }

  holdCourse(): void {
    this.bearingValue = 0;
    this.desiredValue = 0;
  }

  toSave(): CourseSnapshot {
    return this.snapshot;
  }

  restore(data: Partial<CourseSnapshot> | null | undefined): void {
    this.tierValue = 0;
    this.bearingValue = this.desiredValue = this.lateralValue = 0;
    this.throttleValue = 1;
    if (!data || typeof data !== 'object') return;
    this.tierValue = tierValue(finite(data.tier ?? 0, 0));
    const limit = LIMITS[this.tierValue];
    this.bearingValue = clamp(normalizeBearing(finite(data.bearingDeg ?? 0, 0)), -limit, limit);
    this.desiredValue = clamp(normalizeBearing(finite(data.desiredDeg ?? 0, 0)), -limit, limit);
    this.throttleValue = clamp(finite(data.throttle ?? 1, 1), 0.35, 1);
    this.lateralValue = finite(data.lateralM ?? 0, 0);
  }

  private refusal(context: CourseContext): CourseRefusal | null {
    if (context.locked) return 'locked';
    if (!context.powered) return 'unpowered';
    if (!context.playerOnMachine) return 'off-machine';
    if (!context.stable) return 'unstable';
    return null;
  }
}
