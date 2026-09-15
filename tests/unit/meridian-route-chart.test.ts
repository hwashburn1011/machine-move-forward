import { describe, expect, it } from 'vitest';
import { RouteChart, type RouteContact } from '@/navigation/RouteChart';

const commitContext = (distanceM: number, lateralM = 0) => ({
  distanceM,
  lateralM,
  maxBearingDeg: 89,
  fuelPerM: 1,
  poweredHelm: true,
  safe: true,
  storyPriority: false,
});

function finishDocked(chart: RouteChart, contact: RouteContact): void {
  expect(chart.commit(contact.id, commitContext(contact.detectedAtM)).ok).toBe(true);
  expect(chart.markDocked(contact.id)).toBe(true);
  let claim = chart.requestReward(contact.id);
  while (claim) {
    const result = chart.resolveReward(claim.token, claim.count);
    expect(result).not.toBeNull();
    if (result?.completed) break;
    claim = chart.requestReward(contact.id);
  }
  expect(chart.depart(contact.id)).toBe(true);
}

function observeAndFinish(chart: RouteChart, seed: string, tier: number, distanceM: number) {
  const contact = chart.observe(seed, {
    distanceM,
    lateralM: 0,
    storyPriority: false,
    tier,
  });
  expect(contact).not.toBeNull();
  finishDocked(chart, contact!);
  return contact!;
}

describe('tiered Meridian route chart', () => {
  it('keeps tier two deterministic and widens every third tier three depot', () => {
    const tier2Signs = new Set<number>();
    const tier3Signs = new Set<number>();
    for (const seed of [
      'meridian-tier-a',
      'meridian-tier-b',
      'meridian-tier-c',
      'meridian-tier-d',
    ]) {
      const tier2 = new RouteChart();
      const depot2 = tier2.observe(seed, {
        distanceM: 1650,
        lateralM: 0,
        storyPriority: false,
        tier: 2,
      })!;
      expect(depot2.kind).toBe('repair-depot');
      expect(Math.abs(depot2.worldX)).toBeGreaterThanOrEqual(120);
      expect(Math.abs(depot2.worldX)).toBeLessThanOrEqual(150);
      tier2Signs.add(Math.sign(depot2.worldX));

      const tier3 = new RouteChart();
      const depot3 = tier3.observe(seed, {
        distanceM: 1650,
        lateralM: 0,
        storyPriority: false,
        tier: 3,
      })!;
      expect(depot3.kind).toBe('repair-depot');
      expect(Math.abs(depot3.worldX)).toBeGreaterThanOrEqual(265);
      expect(Math.abs(depot3.worldX)).toBeLessThanOrEqual(290);
      tier3Signs.add(Math.sign(depot3.worldX));
    }
    expect(tier2Signs).toEqual(new Set([-1, 1]));
    expect(tier3Signs).toEqual(new Set([-1, 1]));
  });

  it('uses the final tier-three footprint for the 45/28 degree reach boundary', () => {
    const chart = new RouteChart();
    observeAndFinish(chart, 'meridian-reach', 3, 250);
    observeAndFinish(chart, 'meridian-reach', 3, 950);
    const depot = chart.observe('meridian-reach', {
      distanceM: 1650,
      lateralM: 0,
      storyPriority: false,
      tier: 3,
    });
    expect(depot?.kind).toBe('repair-depot');

    // The +14m gangway offset leaves a tier-three depot just beyond 28 degrees
    // at its 450m runway, while the 45 degree steering envelope can reach it.
    expect(
      chart.preview(depot!.id, {
        distanceM: 1650,
        lateralM: 14,
        maxBearingDeg: 45,
        fuelPerM: 1,
      })?.reachable,
    ).toBe(true);
    expect(
      chart.preview(depot!.id, {
        distanceM: 1650,
        lateralM: 14,
        maxBearingDeg: 28,
        fuelPerM: 1,
      })?.reachable,
    ).toBe(false);
  });

  it('round-trips an undocked tier-two contact without changing coordinates or rewards', () => {
    const chart = new RouteChart();
    const first = chart.observe('meridian-save', {
      distanceM: 250,
      lateralM: 0,
      storyPriority: false,
      tier: 2,
    })!;
    const saved = chart.toSave();
    const restored = new RouteChart();
    restored.restore(saved);
    expect(restored.contact).toEqual(first);
    expect(restored.toSave().active?.rewards).toEqual(first.rewards);
  });
});
