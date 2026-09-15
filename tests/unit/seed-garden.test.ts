import { describe, expect, it } from 'vitest';
import { SeedGarden } from '@/building/SeedGarden';

describe('SeedGarden', () => {
  it('consumes water only on batch completion and conserves output', () => {
    const garden = new SeedGarden();
    expect(garden.loadWater(2.9)).toBe(2);
    expect(garden.fixedUpdate(179)).toBe(0);
    expect(garden.snapshot()).toEqual({ format: 1, water: 2, greens: 0, progressS: 179 });
    expect(garden.fixedUpdate(1)).toBe(3);
    expect(garden.snapshot()).toEqual({ format: 1, water: 1, greens: 3, progressS: 0 });
    expect(garden.harvest(2.9)).toBe(2);
    expect(garden.snapshot().greens).toBe(1);
  });
  it('pauses at full output and resumes without backlog', () => {
    const garden = new SeedGarden();
    garden.loadWater(2);
    garden.fixedUpdate(180);
    garden.harvest(0);
    expect(garden.fixedUpdate(180)).toBe(3);
    expect(garden.snapshot().greens).toBe(6);
    expect(garden.fixedUpdate(10000)).toBe(0);
    expect(garden.harvest(3)).toBe(3);
    expect(garden.fixedUpdate(180)).toBe(0);
    expect(garden.snapshot().greens).toBe(3);
  });
  it('handles variable and huge timesteps with bounded production', () => {
    const garden = new SeedGarden();
    garden.loadWater(2);
    expect(garden.fixedUpdate(60) + garden.fixedUpdate(60) + garden.fixedUpdate(60)).toBe(3);
    expect(garden.fixedUpdate(Number.MAX_SAFE_INTEGER)).toBe(3);
    expect(garden.snapshot().greens).toBe(6);
  });
  it('isolates snapshots and sanitizes malformed saves', () => {
    const garden = new SeedGarden();
    garden.loadWater(1);
    garden.fixedUpdate(12);
    const snap = garden.snapshot();
    (snap as { water: number }).water = 99;
    expect(garden.snapshot().water).toBe(1);
    garden.restore({ format: 99 as 1, water: 2, greens: 6, progressS: 1 });
    expect(garden.snapshot()).toEqual({ format: 1, water: 0, greens: 0, progressS: 0 });
    garden.restore({ format: 1, water: 9.8, greens: 4.9, progressS: 999 });
    expect(garden.snapshot()).toEqual({ format: 1, water: 2, greens: 4, progressS: 180 });
  });

  it('agrees across render schedules and resumes after output space is harvested', () => {
    const schedules = [30, 60, 144].map((hz) => {
      const g = new SeedGarden();
      g.loadWater(2);
      for (let frame = 0; frame < 360 * hz; frame++) g.fixedUpdate(1 / hz);
      return g.snapshot();
    });
    expect(schedules.map((s) => [s.water, s.greens, Math.round(s.progressS)])).toEqual([
      [0, 6, 0],
      [0, 6, 0],
      [0, 6, 0],
    ]);
    const g = new SeedGarden();
    g.loadWater(2);
    g.fixedUpdate(180);
    expect(g.fixedUpdate(180)).toBe(3);
    expect(g.snapshot().greens).toBe(6);
    expect(g.fixedUpdate(180)).toBe(0);
    g.harvest(3);
    g.loadWater(1);
    expect(g.fixedUpdate(180)).toBe(3);
  });

  it('saves and loads a mid-batch without changing completion timing', () => {
    const g = new SeedGarden();
    g.loadWater(1);
    g.fixedUpdate(75);
    const restored = new SeedGarden();
    restored.restore(g.snapshot());
    expect(restored.fixedUpdate(104)).toBe(0);
    expect(restored.fixedUpdate(1)).toBe(3);
  });
});
