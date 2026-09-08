/**
 * Bounded development diagnostics for one playable session.
 *
 * This collector has no clock of its own: Game advances it only while the
 * opening is complete and simulation is active. It deliberately stores four
 * resource samples and at most 64 named milestones, so a long run cannot turn
 * diagnostics into an unbounded telemetry buffer.
 */
export interface SessionMetricSample {
  scrap: number;
  components: number;
  fuel: number;
  powerCapacity: number;
  powerDraw: number;
  speed: number;
}

export interface SessionMetricMilestone {
  name: string;
  atSeconds: number;
  detail?: Record<string, string | number | boolean>;
}

export interface SessionMetricsSnapshot {
  playableSeconds: number;
  milestones: readonly SessionMetricMilestone[];
  samples: readonly (SessionMetricSample & { atSeconds: number })[];
}

const SAMPLE_AT = [0, 300, 900, 1800] as const;
const MAX_MILESTONES = 64;

export class SessionMetrics {
  private playableSecondsValue = 0;
  private readonly milestoneValues: SessionMetricMilestone[] = [];
  private readonly milestoneNames = new Set<string>();
  private readonly sampleValues: (SessionMetricSample & { atSeconds: number })[] = [];

  /** Advance by active playable time and capture any crossed sample marks. */
  advance(dt: number, sample: SessionMetricSample): void {
    const current = sanitiseSample(sample);
    if (this.sampleValues.length === 0) this.captureSample(0, current);

    const delta = finiteNonNegative(dt);
    const before = this.playableSecondsValue;
    const rawAfter = before + delta;
    const after = Number.isFinite(rawAfter) ? rawAfter : Number.MAX_VALUE;
    for (const atSeconds of SAMPLE_AT) {
      if (atSeconds <= before || atSeconds > after || this.sampleValues.some((s) => s.atSeconds === atSeconds)) continue;
      this.captureSample(atSeconds, current);
    }
    this.playableSecondsValue = after;
  }

  /** Record a named edge once; repeated event delivery is ignored. */
  mark(name: string, detail?: Record<string, string | number | boolean>): void {
    if (typeof name !== 'string' || name.length === 0 || this.milestoneNames.has(name)) return;
    if (this.milestoneValues.length >= MAX_MILESTONES) return;
    this.milestoneNames.add(name);
    const cleanDetail = sanitiseDetail(detail);
    this.milestoneValues.push({
      name,
      atSeconds: this.playableSecondsValue,
      ...(cleanDetail ? { detail: cleanDetail } : {}),
    });
  }

  snapshot(): SessionMetricsSnapshot {
    return {
      playableSeconds: this.playableSecondsValue,
      milestones: this.milestoneValues.map((milestone) => ({
        ...milestone,
        ...(milestone.detail ? { detail: { ...milestone.detail } } : {}),
      })),
      samples: this.sampleValues.map((sample) => ({ ...sample })),
    };
  }

  /** Start a fresh diagnostic run without affecting gameplay state. */
  reset(): void {
    this.playableSecondsValue = 0;
    this.milestoneValues.length = 0;
    this.milestoneNames.clear();
    this.sampleValues.length = 0;
  }

  private captureSample(atSeconds: number, sample: SessionMetricSample): void {
    if (this.sampleValues.length >= SAMPLE_AT.length) return;
    this.sampleValues.push({ ...sample, atSeconds });
  }
}

function sanitiseSample(sample: SessionMetricSample): SessionMetricSample {
  return {
    scrap: finiteNonNegative(sample?.scrap),
    components: finiteNonNegative(sample?.components),
    fuel: finiteNonNegative(sample?.fuel),
    powerCapacity: finiteNonNegative(sample?.powerCapacity),
    powerDraw: finiteNonNegative(sample?.powerDraw),
    speed: finiteNonNegative(sample?.speed),
  };
}

function sanitiseDetail(
  detail: Record<string, string | number | boolean> | undefined,
): Record<string, string | number | boolean> | undefined {
  if (!detail || typeof detail !== 'object') return undefined;
  const clean: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (typeof value === 'string' || typeof value === 'boolean') clean[key] = value;
    else if (typeof value === 'number') clean[key] = Number.isFinite(value) ? value : 0;
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

function finiteNonNegative(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}
