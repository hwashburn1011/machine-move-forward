import { describe, it, expect } from 'vitest';
import { REEL_CONE_COS, REEL_RANGE, pickReelTarget, type ReelCandidate } from '@/salvage/Reel';

/**
 * Choosing what the reel grabs.
 *
 * Pure, because aiming bugs are quiet: a sign slip grabs the chest behind you,
 * and a cone compared the wrong way round either grabs nothing or grabs
 * everything on the deck.
 */
const at = (x: number, y: number, z: number, id = 'c'): ReelCandidate => ({
  id,
  x,
  y,
  z,
});

// Standing at the origin, looking down -Z.
const FROM = { x: 0, y: 0, z: 0 };
const AHEAD = { x: 0, y: 0, z: -1 };

describe('picking a reel target', () => {
  it('takes a chest dead ahead', () => {
    expect(pickReelTarget([at(0, 0, -10)], FROM, AHEAD)?.id).toBe('c');
  });

  it('ignores one behind you', () => {
    // The sign error that would make the reel snatch over your shoulder.
    expect(pickReelTarget([at(0, 0, 10)], FROM, AHEAD)).toBeNull();
  });

  it('ignores one beyond reach', () => {
    expect(pickReelTarget([at(0, 0, -(REEL_RANGE + 5))], FROM, AHEAD)).toBeNull();
  });

  it('ignores one well off to the side', () => {
    // Ninety degrees off the aim: outside any sane cone.
    expect(pickReelTarget([at(10, 0, 0)], FROM, AHEAD)).toBeNull();
  });

  it('takes the closest when several are in the cone', () => {
    const got = pickReelTarget(
      [at(0, 0, -30, 'far'), at(0, 0, -8, 'near'), at(0, 0, -18, 'mid')],
      FROM,
      AHEAD,
    );
    expect(got?.id).toBe('near');
  });

  it('measures the cone from the aim, not from an axis', () => {
    // Looking down +X now. A chest on +X must be takeable.
    expect(pickReelTarget([at(12, 0, 0)], FROM, { x: 1, y: 0, z: 0 })?.id).toBe('c');
  });

  it('returns null for an empty field rather than throwing', () => {
    expect(pickReelTarget([], FROM, AHEAD)).toBeNull();
  });

  it('survives a zero-length aim', () => {
    // Can happen for a frame if the camera direction is read mid-reset.
    expect(() => pickReelTarget([at(0, 0, -5)], FROM, { x: 0, y: 0, z: 0 })).not.toThrow();
  });

  it('has a cone tight enough to be aimed rather than sprayed', () => {
    // A wide cone makes the reel a hoover; this pins the intent.
    expect(REEL_CONE_COS).toBeGreaterThan(0.85);
  });
});
