import { describe, expect, it } from 'vitest';
import { EndingDirector } from '@/story/EndingDirector';
const context = { eligible: true, currentDistance: 10, meridianBearingDeg: 20, stable: true };
describe('EndingDirector', () => {
  it('requires a stable eligible context and identity checked checkpoint', () => {
    const d = new EndingDirector();
    expect(d.prepareCommit({ ...context, stable: false })).toEqual({
      ok: false,
      reason: 'unstable',
    });
    const p = d.prepareCommit(context);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(d.checkpointSucceeded(p.ticket, { ...context, currentDistance: 12 })).toEqual([]);
    const retry = d.prepareCommit(context);
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(d.checkpointSucceeded(retry.ticket, context)).toHaveLength(2);
    expect(d.phase).toBe('committed');
    expect(d.checkpointSucceeded(p.ticket, context)).toEqual([]);
  });
  it('uses simulation elapsed time and has idempotent skip/credits', () => {
    const d = new EndingDirector();
    const p = d.prepareCommit(context);
    if (!p.ok) throw new Error('ticket');
    d.checkpointSucceeded(p.ticket, context);
    expect(d.update({ currentDistance: 410, elapsedSimS: 0 })).toEqual([{ type: 'begin-arrival' }]);
    for (let i = 0; i < 11; i++)
      expect(d.update({ currentDistance: 410, elapsedSimS: 1 })).toEqual([]);
    expect(d.update({ currentDistance: 410, elapsedSimS: 1 })).toEqual([{ type: 'show-credits' }]);
    expect(d.acknowledgeCredits()).toHaveLength(2);
    expect(d.acknowledgeCredits()).toEqual([]);
  });
  it('restores safe boundaries and rejects malformed or ineligible saves', () => {
    const d = new EndingDirector();
    d.restore({ format: 1, phase: 'arrival', committedAtDistance: 5, arrivalElapsedS: 9 }, true);
    expect(d.phase).toBe('arrival');
    const copy = new EndingDirector();
    copy.restore(d.snapshot, true);
    expect(copy.snapshot).toEqual(d.snapshot);
    d.restore({ format: 1, phase: 'committed', committedAtDistance: -1, arrivalElapsedS: 0 }, true);
    expect(d.phase).toBe('available');
    d.restore({ format: 1, phase: 'complete', committedAtDistance: 8, arrivalElapsedS: 0 }, false);
    expect(d.phase).toBe('available');
  });

  it('rejects forged, stale, drifted and re-used tickets without changing state', () => {
    const d = new EndingDirector();
    const prepared = d.prepareCommit(context);
    if (!prepared.ok) throw new Error('ticket');
    const forged = { ...prepared.ticket };
    d.checkpointFailed(forged);
    expect(d.phase).toBe('available');
    expect(d.checkpointSucceeded(forged, context)).toEqual([]);
    const retry = d.prepareCommit(context);
    if (!retry.ok) throw new Error('retry');
    expect(d.checkpointSucceeded(retry.ticket, { ...context, meridianBearingDeg: 21 })).toEqual([]);
    expect(d.checkpointSucceeded(retry.ticket, { ...context, eligible: false })).toEqual([]);
    const final = d.prepareCommit(context);
    if (!final.ok) throw new Error('final');
    expect(d.checkpointSucceeded(final.ticket, { ...context, currentDistance: 11 })).toHaveLength(
      2,
    );
    expect(d.checkpointSucceeded(final.ticket, context)).toEqual([]);
  });

  it('crosses the exact distance boundary and pauses on zero elapsed time', () => {
    const d = new EndingDirector();
    const p = d.prepareCommit(context);
    if (!p.ok) throw new Error('ticket');
    d.checkpointSucceeded(p.ticket, context);
    expect(d.update({ currentDistance: 409.99, elapsedSimS: 100 })).toEqual([]);
    expect(d.update({ currentDistance: 410, elapsedSimS: 99 })).toEqual([
      { type: 'begin-arrival' },
    ]);
    expect(d.update({ currentDistance: 410, elapsedSimS: 0 })).toEqual([]);
  });

  it('takes exactly twelve seconds at 30, 60 and 144 Hz', () => {
    for (const hz of [30, 60, 144]) {
      const d = new EndingDirector();
      const p = d.prepareCommit(context);
      if (!p.ok) throw new Error('ticket');
      d.checkpointSucceeded(p.ticket, context);
      d.update({ currentDistance: 410, elapsedSimS: 0 });
      for (let i = 0; i < hz * 12 - 1; i++)
        expect(d.update({ currentDistance: 410, elapsedSimS: 1 / hz })).toEqual([]);
      expect(d.update({ currentDistance: 410, elapsedSimS: 1 / hz })).toEqual([
        { type: 'show-credits' },
      ]);
    }
  });

  it('restores each legal phase and requires a commit distance for active phases', () => {
    for (const phase of ['available', 'committed', 'arrival', 'credits', 'complete'] as const) {
      const d = new EndingDirector();
      d.restore(
        {
          format: 1,
          phase,
          committedAtDistance: phase === 'available' ? null : 8,
          arrivalElapsedS: phase === 'arrival' ? 4 : phase === 'credits' ? 12 : 0,
        },
        true,
      );
      expect(d.phase).toBe(phase);
    }
    const bad = new EndingDirector();
    bad.restore(
      { format: 1, phase: 'arrival', committedAtDistance: null, arrivalElapsedS: 2 },
      true,
    );
    expect(bad.phase).toBe('available');
    for (const committedAtDistance of [null, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      bad.restore({ format: 1, phase: 'credits', committedAtDistance, arrivalElapsedS: 12 }, true);
      expect(bad.phase).toBe('available');
    }
  });

  it('makes skip and acknowledgements terminal and idempotent in every applicable phase', () => {
    const d = new EndingDirector();
    expect(d.skip()).toEqual([]);
    const p = d.prepareCommit(context);
    if (!p.ok) throw new Error('ticket');
    d.checkpointSucceeded(p.ticket, context);
    expect(d.skip()).toHaveLength(2);
    expect(d.skip()).toEqual([]);
    expect(d.acknowledgeCredits()).toEqual([]);
    const c = new EndingDirector();
    c.restore({ format: 1, phase: 'credits', committedAtDistance: 1, arrivalElapsedS: 12 }, true);
    expect(c.acknowledgeCredits()).toHaveLength(2);
    expect(c.acknowledgeCredits()).toEqual([]);
  });
});
