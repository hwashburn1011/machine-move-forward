import { describe, it, expect } from 'vitest';
import {
  CHARACTER_DROP_Y,
  DECK_HEIGHT,
  DECK_PLATE_HALF,
  DECK_SURFACE_Y,
  PLAYER_CAPSULE_HALF_HEIGHT,
  PLAYER_CAPSULE_RADIUS,
} from '@/game/constants';
import { CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS } from '@/enemies/EnemyMesh';

/**
 * Where a character capsule may be dropped from.
 *
 * `DECK_HEIGHT` is the deck plate's centre, not the surface anything stands on
 * — the plate collider is `DECK_PLATE_HALF` thick either side of it. Dropping a
 * capsule with its feet between the two puts it inside the collider, and
 * Rapier's character controller answers that by refusing to move it at all: it
 * reports grounded, reports no lateral collision, and returns zero movement for
 * the rest of the run. Enemies arrived and stood on their spawn marks.
 */
describe('dropping a character onto the deck', () => {
  it('the surface stood on is above the nominal deck height', () => {
    expect(DECK_SURFACE_Y).toBeGreaterThan(DECK_HEIGHT);
    expect(DECK_SURFACE_Y).toBeCloseTo(DECK_HEIGHT + DECK_PLATE_HALF, 6);
  });

  it('starts the player capsule feet above the surface, not inside the plate', () => {
    const feet = CHARACTER_DROP_Y - (PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS);
    expect(feet).toBeGreaterThan(DECK_SURFACE_Y);
  });

  it('starts the enemy capsule feet above the surface too', () => {
    // The two capsules differ in proportion, so clearing it for one is not
    // evidence for the other.
    const feet = CHARACTER_DROP_Y - (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS);
    expect(feet).toBeGreaterThan(DECK_SURFACE_Y);
  });

  it('clears it by enough to survive a plate that grows a little', () => {
    // A margin of a millimetre would pass the checks above and still wedge the
    // moment anything about the deck changed.
    const feet = CHARACTER_DROP_Y - (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS);
    expect(feet - DECK_SURFACE_Y).toBeGreaterThan(0.1);
  });
});
