import { describe, expect, it } from 'vitest';
import {
  DRAWS,
  FUEL_BURN_PER_S,
  FUEL_TANK_CAP,
  GENERATOR_CAPACITY,
  PRIORITY_ORDER,
  STARTING_FUEL,
  type PowerPriority,
} from '@/data/power';

/**
 * The numbers the whole power economy is tuned on.
 *
 * Data-only, like `subsystems.ts` and `build-pieces.ts`. These assertions are
 * about RELATIONSHIPS rather than values: the exact burn rate is a tuning
 * knob, but a generator that cannot run the one device gated on it, or a
 * priority order that sheds the turrets before the lamps, is a broken game.
 */
describe('power data', () => {
  it('orders every priority exactly once, lowest first', () => {
    expect(PRIORITY_ORDER).toEqual(['light', 'station', 'defense']);
    // Exhaustive: a fourth class added to the type without a place in the
    // order would shed in whatever order Object.keys happened to give.
    const all: PowerPriority[] = ['light', 'station', 'defense'];
    expect([...PRIORITY_ORDER].sort()).toEqual([...all].sort());
  });

  it('prices the refinery well above a lamp', () => {
    expect(DRAWS.lamp).toBeGreaterThan(0);
    expect(DRAWS.refinery).toBeGreaterThan(DRAWS.lamp);
  });

  it('lets one generator run the refinery and a room of lamps at once', () => {
    // The bootstrap: a fresh machine with the starting generator must be able
    // to refine components AND keep some light on, or Phase 3 breaks Phase 0.
    expect(GENERATOR_CAPACITY).toBeGreaterThanOrEqual(DRAWS.refinery + 4 * DRAWS.lamp);
  });

  it('starts with fuel in the tank, and room for more', () => {
    expect(STARTING_FUEL).toBeGreaterThan(0);
    expect(STARTING_FUEL).toBeLessThan(FUEL_TANK_CAP);
  });

  it('burns slowly enough that a full tank is a session, not an errand', () => {
    expect(FUEL_BURN_PER_S).toBeGreaterThan(0);
    // Between ten minutes and two hours of lights on a full tank. Faster is a
    // chore; slower and fuel stops being a pressure at all.
    const minutes = FUEL_TANK_CAP / FUEL_BURN_PER_S / 60;
    expect(minutes).toBeGreaterThan(10);
    expect(minutes).toBeLessThan(120);
  });
});
