import { describe, expect, it } from 'vitest';
import { RouteChart, type RouteContact } from '@/navigation/RouteChart';

const salvage = (mode?: 'secure' | 'broadcast' | 'defended'): RouteContact => ({
  id: 'route-contact-1',
  slot: 1,
  kind: 'salvage-wreck',
  atDistanceM: 700,
  worldX: 0,
  confidence: 1,
  hazard: 'hostile',
  detectedAtM: 250,
  expiresAtM: 880,
  state: 'docked',
  ...(mode ? { salvageMode: mode } : {}),
  rewards: [
    { type: 'item', itemId: 'scrap', remaining: mode === 'defended' ? 48 : 24 },
    { type: 'item', itemId: 'components', remaining: mode === 'defended' ? 6 : 2 },
  ],
});

describe('RouteChart salvage risk choice', () => {
  it.each([
    [0, 6],
    [20, 4],
    [48, 0],
    [0, 0],
  ])('preserves defended remainder %i/%i across reload', (scrap, components) => {
    const active = salvage('defended');
    active.rewards[0]!.remaining = scrap;
    active.rewards[1]!.remaining = components;
    if (!scrap && !components) active.state = 'visited';
    const chart = new RouteChart();
    chart.restore({ format: 1, nextSlot: 2, discovered: [], visited: [], missed: [], active });
    expect(chart.contact?.salvageMode).toBe('defended');
    expect(chart.contact?.rewards.map((r) => r.remaining)).toEqual([scrap, components]);
    expect(chart.resolveSalvage(active.id)).toBe(false);
  });

  it('aborts a failed broadcast without granting the deep locker bonus', () => {
    const chart = new RouteChart();
    chart.restore({
      format: 1,
      nextSlot: 2,
      discovered: [],
      visited: [],
      missed: [],
      active: salvage(),
    });
    chart.chooseSalvage('route-contact-1', 'broadcast');
    expect(chart.abortSalvage('wrong-contact')).toBe(false);
    expect(chart.abortSalvage('route-contact-1')).toBe(true);
    expect(chart.resolveSalvage('route-contact-1')).toBe(false);
    expect(chart.contact?.rewards.map((r) => r.remaining)).toEqual([24, 2]);
  });
  it('chooses secure or broadcast once, while legacy reward callers stay secure', () => {
    const chart = new RouteChart();
    chart.restore({
      format: 1,
      nextSlot: 2,
      discovered: ['route-contact-1'],
      visited: [],
      missed: [],
      active: salvage(),
    });
    expect(chart.chooseSalvage('route-contact-1', 'secure')).toEqual({ ok: true, mode: 'secure' });
    expect(chart.chooseSalvage('route-contact-1', 'broadcast')).toEqual({
      ok: false,
      reason: 'already-chosen',
    });
    const claim = chart.requestReward('route-contact-1');
    expect(claim?.count).toBe(24);
  });

  it('blocks broadcast claims until defended, then upgrades rewards once', () => {
    const chart = new RouteChart();
    chart.restore({
      format: 1,
      nextSlot: 2,
      discovered: ['route-contact-1'],
      visited: [],
      missed: [],
      active: salvage(),
    });
    expect(chart.chooseSalvage('route-contact-1', 'broadcast').ok).toBe(true);
    expect(chart.requestReward('route-contact-1')).toBeNull();
    expect(chart.resolveSalvage('route-contact-1')).toBe(true);
    expect(chart.resolveSalvage('route-contact-1')).toBe(false);
    expect(chart.requestReward('route-contact-1')?.count).toBe(48);
  });

  it('normalizes a persisted broadcast to secure and preserves defended caps', () => {
    const broadcast = new RouteChart();
    broadcast.restore({
      format: 1,
      nextSlot: 2,
      discovered: [],
      visited: [],
      missed: [],
      active: salvage('broadcast'),
    });
    expect(broadcast.contact?.salvageMode).toBe('secure');
    expect(broadcast.requestReward('route-contact-1')?.count).toBe(24);

    const defended = new RouteChart();
    defended.restore({
      format: 1,
      nextSlot: 2,
      discovered: [],
      visited: [],
      missed: [],
      active: salvage('defended'),
    });
    expect(defended.contact?.salvageMode).toBe('defended');
    expect(defended.requestReward('route-contact-1')?.count).toBe(48);
  });

  it('keeps a partial legacy remainder and rejects malformed or competing claims', () => {
    const chart = new RouteChart();
    chart.restore({
      format: 1,
      nextSlot: 2,
      discovered: [],
      visited: [],
      missed: [],
      active: {
        ...salvage(),
        state: 'docked',
        rewards: [
          { type: 'item', itemId: 'scrap', remaining: 7 },
          { type: 'item', itemId: 'components', remaining: 1 },
        ],
      },
    });
    expect(chart.contact?.salvageMode).toBe('secure');
    const claim = chart.requestReward('route-contact-1')!;
    expect(chart.requestReward('route-contact-2')).toBeNull();
    expect(chart.resolveReward(claim.token, 0)?.acceptedCount).toBe(0);
    expect(chart.requestReward('route-contact-1')?.count).toBe(7);
    const bad = new RouteChart();
    bad.restore({
      format: 1,
      nextSlot: 2,
      discovered: [],
      visited: [],
      missed: [],
      active: { ...salvage(), salvageMode: 'risky' as never },
    });
    expect(bad.contact).toBeNull();
  });
});
