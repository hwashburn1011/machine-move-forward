import { describe, expect, it } from 'vitest';
import { CaretakerDirector } from '@/companion/CaretakerDirector';

const work = {
  crates: [{ id: 'c', reachable: true, items: [{ itemId: 'water', count: 1 }], spaceByItem: {} }],
  producers: [],
  gardens: [{ id: 'g', reachable: true, water: 0 }],
};
const nav = { sourceReached: true, targetReached: true, safe: true, powered: true, docked: true };
describe('CaretakerDirector', () => {
  it('runs a job through both service windows and acknowledges its token once', () => {
    const d = new CaretakerDirector();
    d.recruit();
    d.setMode('steward');
    const job = d.plan(work);
    expect(job).not.toBeNull();
    const token = d.snapshot().token!;
    d.fixedUpdate(0, nav);
    d.fixedUpdate(2, nav);
    d.fixedUpdate(0, { ...nav, sourceReached: false, targetReached: true });
    d.fixedUpdate(2, nav);
    expect(d.snapshot().phase).toBe('returning');
    expect(d.resolveJob(token, true)).toBe(true);
    expect(d.resolveJob(token, true)).toBe(false);
  });
  it('cancels work when unsafe or companion mode is selected', () => {
    const d = new CaretakerDirector();
    d.recruit();
    d.setMode('steward');
    d.plan(work);
    d.fixedUpdate(1, { ...nav, safe: false });
    expect(d.snapshot().phase).toBe('idle');
    d.setMode('companion');
    expect(d.snapshot().job).toBeNull();
  });

  it('clears recruitment, mode and refusals on reset or malformed restore', () => {
    const d = new CaretakerDirector();
    d.recruit();
    d.setMode('steward');
    d.plan(work);
    d.fixedUpdate(0, { ...nav, safe: false });
    expect(d.snapshot().refusal).toBe('unsafe');

    d.reset();
    expect(d.snapshot()).toMatchObject({
      recruited: false,
      mode: 'companion',
      phase: 'idle',
      job: null,
      token: null,
      refusal: null,
    });

    d.recruit();
    d.setMode('steward');
    d.restore({ format: 1, recruited: 'yes', mode: 'steward' });
    expect(d.snapshot()).toMatchObject({ recruited: false, mode: 'companion', refusal: null });

    d.restore({ format: 1, recruited: false, mode: 'steward' });
    expect(d.snapshot()).toMatchObject({ recruited: false, mode: 'companion' });
  });

  it('freezes issued work and rejects stale tokens after cancel and restore', () => {
    const d = new CaretakerDirector();
    d.recruit();
    d.setMode('steward');
    const first = d.plan(work)!;
    const staleToken = d.snapshot().token!;
    expect(Object.isFrozen(first)).toBe(true);
    expect(() => {
      (first as { targetId: string }).targetId = 'different';
    }).toThrow();
    expect(d.snapshot().job?.targetId).toBe('g');

    d.cancel();
    const second = d.plan(work)!;
    const liveToken = d.snapshot().token!;
    expect(liveToken).not.toBe(staleToken);
    expect(second).not.toBeNull();
    d.fixedUpdate(0, nav);
    d.fixedUpdate(2, nav);
    d.fixedUpdate(0, nav);
    d.fixedUpdate(2, nav);
    expect(d.resolveJob(staleToken, true)).toBe(false);
    expect(d.resolveJob(liveToken, true)).toBe(true);

    d.restore({ format: 1, recruited: true, mode: 'steward' });
    const afterRestore = d.plan(work);
    expect(afterRestore).not.toBeNull();
    expect(d.snapshot().token).not.toBe(liveToken);
  });

  it('enforces the successful-job cooldown using simulation time', () => {
    const d = new CaretakerDirector();
    d.recruit();
    d.setMode('steward');
    d.plan(work);
    const token = d.snapshot().token!;
    d.fixedUpdate(0, nav);
    d.fixedUpdate(2, nav);
    d.fixedUpdate(0, nav);
    d.fixedUpdate(2, nav);
    expect(d.resolveJob(token, true)).toBe(true);
    expect(d.plan(work)).toBeNull();
    d.fixedUpdate(1.999, nav);
    expect(d.plan(work)).toBeNull();
    d.fixedUpdate(0.001, nav);
    expect(d.plan(work)).not.toBeNull();
  });

  it.each(['to-source', 'service-source', 'to-target', 'service-target'] as const)(
    'cancels %s work when its live path disappears',
    (phase) => {
      const d = new CaretakerDirector();
      d.recruit();
      d.setMode('steward');
      d.plan(work);
      if (phase !== 'to-source') d.fixedUpdate(0, nav);
      if (phase === 'to-target' || phase === 'service-target') d.fixedUpdate(2, nav);
      if (phase === 'service-target') d.fixedUpdate(0, nav);
      expect(d.snapshot().phase).toBe(phase);
      d.fixedUpdate(1 / 60, { ...nav, pathAvailable: false });
      expect(d.snapshot()).toMatchObject({
        phase: 'idle',
        job: null,
        token: null,
        refusal: 'unreachable',
      });
    },
  );

  it('ignores hostile time values and advances at most one service phase per update', () => {
    const d = new CaretakerDirector();
    d.recruit();
    d.setMode('steward');
    d.plan(work);
    d.fixedUpdate(0, nav);
    const before = d.snapshot();
    d.fixedUpdate(Number.NaN, nav);
    d.fixedUpdate(Number.POSITIVE_INFINITY, nav);
    d.fixedUpdate(-1, nav);
    expect(d.snapshot()).toEqual(before);

    d.fixedUpdate(1_000_000, nav);
    expect(d.snapshot().phase).toBe('to-target');
    d.fixedUpdate(1_000_000, nav);
    expect(d.snapshot().phase).toBe('service-target');
  });
});
