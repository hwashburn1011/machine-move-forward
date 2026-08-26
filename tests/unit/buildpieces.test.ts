import { describe, expect, it } from 'vitest';
import {
  BUILD_PIECES,
  BUILD_PIECE_ORDER,
  isFixture,
  isStation,
  type PieceId,
} from '@/data/build-pieces';
import { DRAWS, GENERATOR_CAPACITY } from '@/data/power';

/**
 * The two pieces Phase 3 adds, and the invariants every piece has to keep.
 *
 * The generic assertions matter more than the specific ones: a new piece added
 * to the record but forgotten in the selection order is invisible in the build
 * HUD and unbuildable, which is a bug that reads as "the feature was never
 * implemented".
 */
describe('the power pieces', () => {
  it('makes the generator a station standing on a floor', () => {
    const gen = BUILD_PIECES.generator;
    expect(gen.anchor).toBe('cell');
    expect(isStation('generator')).toBe(true);
    expect(isFixture('generator')).toBe(false);
    expect(gen.cost).toEqual({ scrap: 60, components: 6 });
    expect(gen.weight).toBe(320);
  });

  it('makes the lamp a wall fixture, not a wall', () => {
    const lamp = BUILD_PIECES.lamp;
    expect(lamp.anchor).toBe('edge');
    expect(isFixture('lamp')).toBe(true);
    expect(isStation('lamp')).toBe(false);
    // A lamp is not a room boundary and does not stop anyone walking: it hangs
    // on the wall that already does both.
    expect(lamp.boundsRoom).toBe(false);
    expect(lamp.blocksNavigation).toBe(false);
    expect(lamp.cost).toEqual({ scrap: 6, components: 1 });
    expect(lamp.weight).toBe(8);
  });

  it('prices a generator well above the lamps it lights', () => {
    // The generator is the expensive, considered purchase; lamps are cheap
    // enough to hang wherever a room is dark.
    expect(BUILD_PIECES.generator.weight).toBeGreaterThan(BUILD_PIECES.lamp.weight * 10);
    expect(GENERATOR_CAPACITY / DRAWS.lamp).toBeGreaterThan(4);
  });
});

describe('build piece bookkeeping', () => {
  const ids = Object.keys(BUILD_PIECES) as PieceId[];

  it('offers every defined piece in the selection order, exactly once', () => {
    expect([...BUILD_PIECE_ORDER].sort()).toEqual([...ids].sort());
  });

  it('gives every piece a positive cost, weight and health', () => {
    for (const id of ids) {
      const def = BUILD_PIECES[id];
      expect(def.id).toBe(id);
      expect(Object.values(def.cost).some((n) => n > 0)).toBe(true);
      expect(def.weight).toBeGreaterThan(0);
      expect(def.maxHealth).toBeGreaterThan(0);
      expect(def.armor).toBeGreaterThanOrEqual(0);
    }
  });

  it('never calls a piece both a station and a fixture', () => {
    // They are different grid layers with different owner maps; a piece in
    // both would be occupied in one and vacated from the other.
    for (const id of ids) {
      expect(isStation(id) && isFixture(id)).toBe(false);
    }
  });

  it('anchors every fixture on an edge and every station in a cell', () => {
    for (const id of ids) {
      if (isFixture(id)) expect(BUILD_PIECES[id].anchor).toBe('edge');
      if (isStation(id)) expect(BUILD_PIECES[id].anchor).toBe('cell');
    }
  });
});
