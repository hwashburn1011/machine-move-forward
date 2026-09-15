import { describe, expect, it } from 'vitest';
import { ROUTE_CONTACT_RUNWAY_M, RouteChart } from '@/navigation/RouteChart';

const observation = (distanceM: number, lateralM = 0, storyPriority = false, tier?: number) => ({
  distanceM,
  lateralM,
  storyPriority,
  ...(tier === undefined ? {} : { tier }),
});
const context = (distanceM: number, lateralM = 0) => ({
  distanceM,
  lateralM,
  maxBearingDeg: 12,
  fuelPerM: 0.2,
  poweredHelm: true,
  safe: true,
  storyPriority: false,
});

function reachDock(chart: RouteChart, id: string, distanceM: number, lateralM = 0) {
  expect(chart.commit(id, context(distanceM, lateralM)).ok).toBe(true);
  expect(chart.markDocked(id)).toBe(true);
}

describe('RouteChart', () => {
  it('detects with a 450m runway at arbitrary lateral world positions', () => {
    const chart = new RouteChart();
    expect(chart.observe('seed', observation(249, 100_000))).toBeNull();
    const contact = chart.observe('seed', observation(250, 100_000))!;
    expect(contact.atDistanceM - contact.detectedAtM).toBe(ROUTE_CONTACT_RUNWAY_M);
    expect(Math.abs(contact.worldX - 100_000)).toBeGreaterThanOrEqual(45);
    expect(Math.abs(contact.worldX - 100_000)).toBeLessThanOrEqual(70);
  });

  it('continues deterministic 700m slots beyond the first three', () => {
    const a = new RouteChart();
    const b = new RouteChart();
    for (let slot = 1; slot <= 6; slot++) {
      const distance = slot * 700 - 450;
      const ca = a.observe('same', observation(distance))!;
      const cb = b.observe('same', observation(distance))!;
      expect(ca).toEqual(cb);
      reachDock(a, ca.id, distance, ca.worldX);
      reachDock(b, cb.id, distance, cb.worldX);
      while (a.contact?.state !== 'visited') {
        const x = a.requestReward(ca.id)!;
        a.resolveReward(x.token, x.count);
        const y = b.requestReward(cb.id)!;
        b.resolveReward(y.token, y.count);
      }
      expect(a.depart(ca.id)).toBe(true);
      expect(b.depart(cb.id)).toBe(true);
      a.observe('same', observation(distance + 1));
      b.observe('same', observation(distance + 1));
    }
    expect(a.snapshot.visited).toHaveLength(6);
  });

  it('previews and rejects an unreachable or unsafe commitment', () => {
    const chart = new RouteChart();
    const c = chart.observe('s', observation(250))!;
    const p = chart.preview(c.id, {
      distanceM: 250,
      lateralM: 0,
      maxBearingDeg: 1,
      fuelPerM: 0.2,
    })!;
    expect(p.reachable).toBe(false);
    expect(chart.commit(c.id, { ...context(250), maxBearingDeg: 1 })).toEqual({
      ok: false,
      reason: 'out-of-range',
    });
    expect(chart.commit(c.id, { ...context(250, c.worldX), safe: false })).toEqual({
      ok: false,
      reason: 'unsafe',
    });
  });

  it('suspends one pending contact for story and rebases it afterward', () => {
    const chart = new RouteChart();
    const before = chart.observe('s', observation(250, 40))!;
    expect(chart.observe('s', observation(300, 40, true))).toBeNull();
    expect(chart.contact?.state).toBe('suspended');
    expect(chart.observe('s', observation(5000, 900, false))?.atDistanceM).toBe(5400);
    expect(chart.contact?.worldX).toBe(before.worldX);
  });

  it('accounts partial and zero-capacity item rewards without duplication', () => {
    const chart = new RouteChart();
    let contact = chart.observe('water-seed', observation(250))!;
    for (let n = 0; contact.kind !== 'water-cache' && n < 12; n++) {
      reachDock(chart, contact.id, 250, contact.worldX);
      while (chart.contact?.state !== 'visited') {
        const claim = chart.requestReward(contact.id)!;
        chart.resolveReward(claim.token, claim.count);
      }
      chart.depart(contact.id);
      contact = chart.observe('water-seed', observation(contact.atDistanceM + 250))!;
    }
    expect(contact.kind).toBe('water-cache');
    reachDock(chart, contact.id, contact.detectedAtM, contact.worldX);
    const first = chart.requestReward(contact.id)!;
    expect(chart.requestReward(contact.id)).toEqual(first);
    expect(chart.resolveReward('wrong', 4)).toBeNull();
    expect(chart.resolveReward(first.token, 0)?.acceptedCount).toBe(0);
    expect(chart.requestReward(contact.id)?.count).toBe(4);
    const partial = chart.requestReward(contact.id)!;
    expect(chart.resolveReward(partial.token, 2)?.acceptedCount).toBe(2);
    expect(chart.requestReward(contact.id)?.count).toBe(2);
    const rest = chart.requestReward(contact.id)!;
    chart.resolveReward(rest.token, 2);
    expect(chart.canDepart(contact.id)).toBe(true);
    expect(chart.requestReward(contact.id)).toBeNull();
    expect(chart.contact?.state).toBe('visited');
    expect(chart.observe('water-seed', observation(contact.atDistanceM + 10))?.id).toBe(contact.id);
    expect(chart.depart(contact.id)).toBe(true);
    expect(chart.contact).toBeNull();
  });

  it('persists exact remainder and discards only the in-flight token', () => {
    const chart = new RouteChart();
    const c = chart.observe('s', observation(250))!;
    reachDock(chart, c.id, 250, c.worldX);
    const claim = chart.requestReward(c.id)!;
    if (claim.type === 'item') chart.resolveReward(claim.token, Math.min(1, claim.count));
    chart.requestReward(c.id);
    const restored = new RouteChart();
    restored.restore(chart.toSave());
    expect(restored.contact).toEqual(chart.contact);
    expect(restored.requestReward(c.id)).not.toBeNull();
  });

  it('resolves memorials as facts and expires only unsuspended travel contacts', () => {
    const chart = new RouteChart();
    let c = chart.observe('memorial-seed', observation(250))!;
    for (let n = 0; c.kind !== 'memorial' && n < 12; n++) {
      reachDock(chart, c.id, c.detectedAtM, c.worldX);
      while (chart.contact?.state !== 'visited') {
        const claim = chart.requestReward(c.id)!;
        chart.resolveReward(claim.token, claim.count);
      }
      chart.depart(c.id);
      c = chart.observe('memorial-seed', observation(c.atDistanceM + 250))!;
    }
    expect(c.kind).toBe('memorial');
    reachDock(chart, c.id, c.detectedAtM, c.worldX);
    expect(chart.requestReward(c.id)).toMatchObject({
      type: 'journal',
      factId: 'memorial-transmission',
    });

    const missed = new RouteChart();
    const m = missed.observe('s', observation(250))!;
    expect(missed.observe('s', observation(m.expiresAtM + 1))).toBeNull();
    expect(missed.snapshot.missed).toContain(m.id);
    expect(missed.observe('s', observation(950))?.slot).toBe(2);
  });

  it('rejects malformed active saves without constraining finite worldX', () => {
    const chart = new RouteChart();
    const c = chart.observe('s', observation(250, -9e12))!;
    const save = chart.toSave();
    const restored = new RouteChart();
    restored.restore(save);
    expect(restored.contact?.worldX).toBe(c.worldX);
    restored.restore({ ...save, active: { ...save.active!, worldX: Number.NaN } });
    expect(restored.contact).toBeNull();
  });

  it('cancels only an active approach and leaves its opportunity and rewards intact', () => {
    const chart = new RouteChart();
    const contact = chart.observe('cancel', observation(250))!;
    const rewards = contact.rewards;
    expect(chart.commit(contact.id, context(250, contact.worldX)).ok).toBe(true);
    expect(chart.cancelApproach('another-contact')).toBe(false);
    expect(chart.cancelApproach(contact.id)).toBe(true);
    expect(chart.contact).toMatchObject({ id: contact.id, state: 'detected', rewards });
    expect(chart.cancelApproach(contact.id)).toBe(false);
    expect(chart.markDocked(contact.id)).toBe(false);
    expect(chart.commit(contact.id, context(250, contact.worldX)).ok).toBe(true);
    expect(chart.cancelApproach(contact.id)).toBe(true);
    expect(chart.observe('cancel', observation(contact.expiresAtM + 1))).toBeNull();
    expect(chart.snapshot.missed).toContain(contact.id);
  });

  it('keeps an armed slot when a fixed step crosses its detection boundary', () => {
    const chart = new RouteChart();
    expect(chart.observe('seed', observation(249))).toBeNull();
    expect(chart.observe('seed', observation(251))?.slot).toBe(1);
  });

  it('requires explicit abandonment to depart with unclaimed rewards', () => {
    const chart = new RouteChart();
    const c = chart.observe('s', observation(250))!;
    reachDock(chart, c.id, 250, c.worldX);
    expect(chart.canDepart(c.id)).toBe(true);
    expect(chart.depart(c.id)).toBe(false);
    expect(chart.depart(c.id, true)).toBe(true);
  });

  it('skips a late stale slot and still supplies a full runway', () => {
    const chart = new RouteChart();
    expect(chart.observe('late', observation(699))).toBeNull();
    const c = chart.observe('late', observation(950))!;
    expect(c.slot).toBe(2);
    expect(c.atDistanceM - 950).toBe(450);
  });

  it('invalidates an acknowledged claim token before issuing the next token', () => {
    const chart = new RouteChart();
    const c = chart.observe('s', observation(250))!;
    reachDock(chart, c.id, 250, c.worldX);
    const first = chart.requestReward(c.id)!;
    expect(chart.resolveReward(first.token, 0)).not.toBeNull();
    const second = chart.requestReward(c.id)!;
    expect(second.token).not.toBe(first.token);
    expect(chart.resolveReward(first.token, first.count)).toBeNull();
    expect(chart.requestReward(c.id)).toEqual(second);
  });

  it('offers deterministic tier-two repair depots every third slot at both signs', () => {
    const signs = new Set<number>();
    for (const seed of ['depot-a', 'depot-b', 'depot-c', 'depot-d']) {
      const chart = new RouteChart();
      const contact = chart.observe(seed, observation(1650, 0, false, 2))!;
      expect(contact.slot).toBe(3);
      expect(contact.kind).toBe('repair-depot');
      expect(Math.abs(contact.worldX)).toBeGreaterThanOrEqual(120);
      expect(Math.abs(contact.worldX)).toBeLessThanOrEqual(150);
      signs.add(Math.sign(contact.worldX));
    }
    expect(signs).toEqual(new Set([-1, 1]));
  });

  it('does not unlock tier-two depots for invalid or tier-one observations', () => {
    for (const tier of [1, Number.NaN, Number.POSITIVE_INFINITY, 99]) {
      const chart = new RouteChart();
      const contact = chart.observe('no-depot', observation(1650, 0, false, tier));
      expect(contact?.kind).not.toBe('repair-depot');
    }
  });

  it('transfers exactly one depot repair kit and journal, with stale claims rejected', () => {
    const chart = new RouteChart();
    const contact = chart.observe('exact-depot', observation(1650, 0, false, 2))!;
    reachDock(chart, contact.id, contact.detectedAtM, contact.worldX);
    const first = chart.requestReward(contact.id)!;
    expect(first).toMatchObject({ type: 'item', itemId: 'repair-kit', count: 1 });
    expect(chart.requestReward(contact.id)).toEqual(first);
    expect(chart.resolveReward(first.token, 1)?.completed).toBe(false);
    const journal = chart.requestReward(contact.id)!;
    expect(journal).toMatchObject({ type: 'journal', factId: 'depot-linekeeper-record', count: 1 });
    expect(chart.resolveReward(first.token, 1)).toBeNull();
    expect(chart.resolveReward(journal.token, 1)?.completed).toBe(true);
  });

  it('rejects malformed depot rewards while preserving valid old saves', () => {
    const chart = new RouteChart();
    const old = chart.observe('old', observation(1650, 0, false, 2))!;
    const save = chart.toSave();
    const restored = new RouteChart();
    restored.restore({
      ...save,
      active: { ...save.active!, rewards: [{ type: 'item', itemId: 'repair-kit', remaining: 2 }] },
    });
    expect(restored.contact).toBeNull();
    restored.restore(save);
    expect(restored.contact?.kind).toBe(old.kind);
    expect(restored.contact?.rewards).toEqual(old.rewards);
  });

  it('requires tier-two steering for both-sign far depot approaches', () => {
    const signs = new Set<number>();
    for (const seed of ['approach-a', 'approach-b', 'approach-c', 'approach-d']) {
      const chart = new RouteChart();
      const c = chart.observe(seed, observation(1650, 14, false, 2))!;
      const narrow = chart.preview(c.id, {
        distanceM: c.detectedAtM,
        lateralM: 14,
        maxBearingDeg: 12,
        fuelPerM: 0.2,
      })!;
      const wide = chart.preview(c.id, {
        distanceM: c.detectedAtM,
        lateralM: 14,
        maxBearingDeg: 28,
        fuelPerM: 0.2,
      })!;
      expect(narrow.reachable).toBe(false);
      expect(wide.reachable).toBe(true);
      signs.add(Math.sign(c.worldX - 14));
    }
    expect(signs).toEqual(new Set([-1, 1]));
  });

  it('does not restore a claimed depot kit after saving mid-transaction', () => {
    const chart = new RouteChart();
    const c = chart.observe('claim-save', observation(1650, 0, false, 2))!;
    reachDock(chart, c.id, c.detectedAtM, c.worldX);
    const kit = chart.requestReward(c.id)!;
    expect(chart.resolveReward(kit.token, 1)?.completed).toBe(false);
    const restored = new RouteChart();
    restored.restore(chart.toSave());
    const journal = restored.requestReward(c.id)!;
    expect(journal).toMatchObject({ type: 'journal', factId: 'depot-linekeeper-record' });
  });
});
