import { describe, it, expect, vi } from 'vitest';
import { Resources } from '@/progression/Resources';
import { EventBus } from '@/core/events/EventBus';

const make = (starting = 400) => {
  const bus = new EventBus();
  return { bus, res: new Resources(bus, starting) };
};

describe('Resources', () => {
  it('starts at the given amount', () => {
    expect(make(250).res.scrap).toBe(250);
  });

  it('canAfford is inclusive at exactly the balance', () => {
    const { res } = make(50);
    expect(res.canAfford(50)).toBe(true);
    expect(res.canAfford(51)).toBe(false);
  });

  it('spend deducts and reports success', () => {
    const { res } = make(100);
    expect(res.spend(30)).toBe(true);
    expect(res.scrap).toBe(70);
  });

  it('spend refuses when short and leaves the balance untouched', () => {
    const { res } = make(10);
    expect(res.spend(30)).toBe(false);
    expect(res.scrap).toBe(10);
  });

  it('spending exactly the balance succeeds and empties it', () => {
    const { res } = make(30);
    expect(res.spend(30)).toBe(true);
    expect(res.scrap).toBe(0);
  });

  it('spend(0) succeeds without changing anything', () => {
    const { res } = make(10);
    expect(res.spend(0)).toBe(true);
    expect(res.scrap).toBe(10);
  });

  it('rejects a negative spend rather than crediting it', () => {
    const { res } = make(10);
    expect(res.spend(-50)).toBe(false);
    expect(res.scrap).toBe(10);
  });

  it('grant adds', () => {
    const { res } = make(10);
    res.grant(250);
    expect(res.scrap).toBe(260);
  });

  it('ignores a negative grant', () => {
    const { res } = make(10);
    res.grant(-5);
    expect(res.scrap).toBe(10);
  });

  it('refund returns 60 percent, floored', () => {
    const { res } = make(0);
    // 12 * 0.6 = 7.2 -> 7, proving floor rather than round.
    expect(res.refund(12)).toBe(7);
    expect(res.scrap).toBe(7);
  });

  it('refund of a cheap piece can be zero rather than negative', () => {
    const { res } = make(0);
    expect(res.refund(1)).toBe(0);
    expect(res.scrap).toBe(0);
  });

  it('emits resources:changed on every mutation', () => {
    const { bus, res } = make(100);
    const fn = vi.fn();
    bus.on('resources:changed', fn);
    res.spend(10);
    res.grant(5);
    res.refund(20);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn).toHaveBeenLastCalledWith({ scrap: res.scrap });
  });

  it('emits nothing when a spend is refused', () => {
    const { bus, res } = make(5);
    const fn = vi.fn();
    bus.on('resources:changed', fn);
    res.spend(500);
    expect(fn).not.toHaveBeenCalled();
  });

  it('reset restores the starting amount', () => {
    const { res } = make(400);
    res.spend(300);
    res.reset();
    expect(res.scrap).toBe(400);
  });

  it('reset can override the amount', () => {
    const { res } = make(400);
    res.reset(42);
    expect(res.scrap).toBe(42);
  });
});
