import { describe, expect, it } from 'vitest';
import {
  WORLD_COURSE_BAND_WIDTH,
  WorldCourseBands,
  courseBandIndex,
  courseBandSeed,
  renderXAt,
  worldXAt,
} from '@/world/WorldCourse';

describe('world course coordinates', () => {
  it('round-trips permanent and rendered X at large positive and negative offsets', () => {
    for (const lateral of [-100_000.25, -256, -0.5, 0, 255.9, 256, 90_000.75]) {
      for (const worldX of [-317, 0, 42.5, 901]) {
        expect(worldXAt(renderXAt(worldX, lateral), lateral)).toBeCloseTo(worldX, 10);
      }
    }
    expect(worldXAt(12, Number.NaN)).toBe(12);
  });

  it('uses floor-defined bands and preserves the original seed for band zero', () => {
    expect(courseBandIndex(0)).toBe(0);
    expect(courseBandIndex(255.999)).toBe(0);
    expect(courseBandIndex(256)).toBe(1);
    expect(courseBandIndex(-0.001)).toBe(-1);
    expect(courseBandIndex(-256)).toBe(-1);
    expect(courseBandIndex(-256.001)).toBe(-2);
    expect(courseBandSeed('nomad', 0)).toBe('nomad');
    expect(courseBandSeed('nomad', -2)).toBe('nomad:x-band:-2');
  });

  it('keeps three adjacent bands and recycles only the trailing slot at a boundary', () => {
    const bands = new WorldCourseBands();
    expect(bands.slots.map((slot) => slot.bandIndex)).toEqual([-1, 0, 1]);
    expect(bands.advance(255).length).toBe(0);

    const recycled = bands.advance(256);
    expect(recycled).toHaveLength(1);
    expect(recycled[0]?.bandIndex).toBe(2);
    expect([...bands.slots].map((slot) => slot.bandIndex).sort((a, b) => a - b)).toEqual([0, 1, 2]);
    for (const slot of bands.slots)
      expect(slot.renderX).toBe(slot.bandIndex * WORLD_COURSE_BAND_WIDTH - 256);
  });

  it('derives a large jump directly without duplicate bands or accumulated transforms', () => {
    const bands = new WorldCourseBands();
    expect(bands.advance(10_000)).toHaveLength(3);
    expect([...bands.slots].map((slot) => slot.bandIndex).sort((a, b) => a - b)).toEqual([
      38, 39, 40,
    ]);
    expect(new Set(bands.slots.map((slot) => slot.bandIndex)).size).toBe(3);

    const first = bands.slots.map((slot) => ({ ...slot }));
    expect(bands.advance(10_000)).toHaveLength(0);
    expect(bands.slots).toEqual(first);
  });

  it('resets negative offsets to canonical adjacent bands', () => {
    const bands = new WorldCourseBands();
    bands.reset(-257);
    expect(bands.lateral).toBe(-257);
    expect(bands.slots.map((slot) => slot.bandIndex)).toEqual([-3, -2, -1]);
    for (const slot of bands.slots)
      expect(slot.renderX).toBe(slot.bandIndex * WORLD_COURSE_BAND_WIDTH + 257);
  });
});
