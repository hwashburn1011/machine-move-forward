import { describe, expect, it } from 'vitest';
import { DustFrontDirector } from '@/world/DustFrontDirector';

describe('DustFrontDirector', () => {
  it.each([30, 60, 144])('crosses every phase consistently at %i Hz', (hz) => {
    const stepped = new DustFrontDirector('cadence');
    const reference = new DustFrontDirector('cadence');
    for (const seconds of [45.5, 65, 15]) {
      for (let i = 0; i < seconds * hz; i++)
        stepped.tick(1 / hz, { distanceM: 600, eligible: true });
      reference.tick(seconds, { distanceM: 600, eligible: true });
      expect(stepped.snapshot().phase).toBe(reference.snapshot().phase);
      expect(stepped.snapshot().intensity).toBeCloseTo(reference.snapshot().intensity, 7);
      expect(stepped.snapshot().remainingS).toBeCloseTo(reference.snapshot().remainingS, 7);
      expect(stepped.toSave().nextAtM).toBe(reference.toSave().nextAtM);
    }
  });

  it('holds the first 600m runway and runs deterministic phases', () => {
    const a = new DustFrontDirector('storm');
    const b = new DustFrontDirector('storm');
    a.reset(10);
    b.reset(10);
    expect(a.snapshot().phase).toBe('clear');
    expect(a.snapshot().remainingS).toBe(0);
    a.tick(1, { distanceM: 609, eligible: true });
    expect(a.snapshot().phase).toBe('clear');
    a.tick(1, { distanceM: 610, eligible: true });
    expect(a.snapshot().phase).toBe('forecast');
    a.tick(35, { distanceM: 610, eligible: true });
    expect(a.snapshot().phase).toBe('front');
    expect(a.snapshot().intensity).toBeGreaterThan(0);
    expect(a.snapshot().intensity).toBeLessThan(0.1);
    a.tick(10, { distanceM: 610, eligible: true });
    expect(a.snapshot().intensity).toBeGreaterThan(0.9);
    a.tick(70 + 20, { distanceM: 610, eligible: true });
    b.tick(1, { distanceM: 610, eligible: true });
    b.tick(35, { distanceM: 610, eligible: true });
    b.tick(100, { distanceM: 610, eligible: true });
    expect(a.toSave().nextAtM).toBe(b.toSave().nextAtM);
  });

  it('freezes and defers due starts while ineligible', () => {
    const d = new DustFrontDirector('paused');
    d.tick(1, { distanceM: 600, eligible: false });
    expect(d.snapshot().phase).toBe('clear');
    d.tick(1, { distanceM: 600, eligible: true });
    expect(d.snapshot().phase).toBe('forecast');
    const before = d.snapshot();
    d.tick(20, { distanceM: 600, eligible: false });
    expect(d.snapshot()).toEqual(before);
  });

  it('restores exactly and rejects corrupt or legacy saves conservatively', () => {
    const source = new DustFrontDirector('save');
    source.tick(1, { distanceM: 600, eligible: true });
    source.tick(7.25, { distanceM: 600, eligible: true });
    const restored = new DustFrontDirector('save');
    restored.restore(source.toSave(), 600);
    expect(restored.snapshot()).toEqual(source.snapshot());
    restored.restore({ format: 1, phase: 'front' }, 42);
    expect(restored.snapshot()).toEqual(new DustFrontDirector('save').snapshot());
  });

  it('does not mutate state for invalid input and is tick-rate independent', () => {
    const d = new DustFrontDirector('invalid');
    const before = d.toSave();
    d.tick(-1, { distanceM: 600, eligible: true });
    d.tick(Number.NaN, { distanceM: 600, eligible: true });
    d.tick(1, { distanceM: Number.POSITIVE_INFINITY, eligible: true });
    expect(d.toSave()).toEqual(before);
    const slow = new DustFrontDirector('rate');
    const fast = new DustFrontDirector('rate');
    for (let i = 0; i < 60; i++) slow.tick(1 / 60, { distanceM: 600, eligible: true });
    for (let i = 0; i < 144; i++) fast.tick(1 / 144, { distanceM: 600, eligible: true });
    expect(fast.snapshot().phase).toBe(slow.snapshot().phase);
    expect(fast.snapshot().remainingS).toBeCloseTo(slow.snapshot().remainingS, 8);
  });
});
