import { describe, expect, it } from 'vitest';
import { SessionMetrics, type SessionMetricSample } from '@/game/SessionMetrics';

const sample: SessionMetricSample = {
  scrap: 260,
  components: 0,
  fuel: 60,
  powerCapacity: 16,
  powerDraw: 0,
  speed: 7.5,
};

describe('SessionMetrics', () => {
  it('uses active elapsed time and captures 0/300/900/1800 thresholds', () => {
    const metrics = new SessionMetrics();
    metrics.advance(10, sample);
    metrics.advance(290, { ...sample, scrap: 240 });
    metrics.advance(600, { ...sample, scrap: 200 });
    metrics.advance(900, { ...sample, scrap: 150 });

    const snapshot = metrics.snapshot();
    expect(snapshot.playableSeconds).toBe(1800);
    expect(snapshot.samples.map((entry) => entry.atSeconds)).toEqual([0, 300, 900, 1800]);
    expect(snapshot.samples[1]?.scrap).toBe(240);
    expect(snapshot.samples[3]?.scrap).toBe(150);
  });

  it('records each milestone once at current playable time', () => {
    const metrics = new SessionMetrics();
    metrics.advance(12, sample);
    metrics.mark('radio-found', { distance: 42, tutorial: true });
    metrics.advance(5, sample);
    metrics.mark('radio-found', { distance: 99 });

    expect(metrics.snapshot().milestones).toEqual([{
      name: 'radio-found',
      atSeconds: 12,
      detail: { distance: 42, tutorial: true },
    }]);
  });

  it('does not count external pause time because callers own the active clock', () => {
    const metrics = new SessionMetrics();
    metrics.advance(30, sample);
    // No advance call represents a paused panel or opening transition.
    metrics.mark('panel-opened');
    expect(metrics.snapshot().playableSeconds).toBe(30);
    expect(metrics.snapshot().milestones[0]?.atSeconds).toBe(30);
  });

  it('sanitises bad inputs, bounds milestones, and resets cleanly', () => {
    const metrics = new SessionMetrics();
    metrics.advance(Number.NaN, {
      scrap: Number.POSITIVE_INFINITY,
      components: -4,
      fuel: Number.NaN,
      powerCapacity: 16,
      powerDraw: -1,
      speed: 2,
    });
    for (let i = 0; i < 80; i++) metrics.mark(`edge-${i}`);

    const bounded = metrics.snapshot();
    expect(bounded.playableSeconds).toBe(0);
    expect(bounded.samples[0]).toMatchObject({ scrap: 0, components: 0, fuel: 0, powerDraw: 0 });
    expect(bounded.milestones).toHaveLength(64);

    metrics.reset();
    expect(metrics.snapshot()).toEqual({ playableSeconds: 0, milestones: [], samples: [] });
    metrics.advance(0, sample);
    expect(metrics.snapshot().samples).toHaveLength(1);
  });
});
