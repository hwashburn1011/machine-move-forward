import { describe, expect, it } from 'vitest';
import sideStairs from '@/data/iron-nomad-side-stairs.json';
import { EXPEDITION_RESERVED_AREA } from '@/game/ExpeditionBuildConflict';
import { nomadDeckBoundsAtY, nomadUpperStairExtension } from '@/story/Destination';
import { DECK_SURFACE_Y } from '@/game/constants';
import { SIDE_MAX, SIDE_MIN } from '@/salvage/SalvageField';

describe('Nomad v3 footprint contract', () => {
  it('keeps salvage outside the widened lower/middle wrap while retaining reachability', () => {
    expect(SIDE_MIN).toBeGreaterThanOrEqual(14.5);
    expect(SIDE_MAX).toBeGreaterThanOrEqual(22);
    expect(SIDE_MAX - SIDE_MIN).toBeGreaterThan(7);
  });

  it('reserves the shifted expedition gate footprint beyond the upper rim', () => {
    expect(EXPEDITION_RESERVED_AREA.minX).toBe(12);
    expect(EXPEDITION_RESERVED_AREA.maxX).toBeGreaterThanOrEqual(24);
  });

  it('accepts the upper side-stair extension without widening the whole upper deck', () => {
    expect(nomadDeckBoundsAtY(DECK_SURFACE_Y)).toMatchObject({ halfWidth: 12, halfLength: 14 });
    expect(nomadUpperStairExtension({ x: -12, y: DECK_SURFACE_Y + 0.6, z: 3.7 })).toBe(true);
    expect(nomadUpperStairExtension({ x: -12.8, y: DECK_SURFACE_Y + 0.6, z: 0 })).toBe(false);
    expect(sideStairs.upperExtension.xMin).toBe(-13);
    expect(sideStairs.upperExtension.xMax).toBe(-11);
  });
});
