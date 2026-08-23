import { describe, it, expect } from 'vitest';
import { deckBearingName } from '@/ui/DeckBearing';

/**
 * Naming a spot on the deck, so a boarding alert can say where.
 *
 * Machine-relative rather than player-relative on purpose: "aft" stays true
 * while you spin on the spot looking for what is hitting you, and it is the
 * word that tells you which way to walk.
 */
describe('naming a place on the deck', () => {
  // The starting machine: 10m across, 16m long, prow at -Z.
  const W = 5;
  const L = 8;
  const name = (x: number, z: number) => deckBearingName(x, z, W, L);

  it('names the ends', () => {
    expect(name(0, -7)).toBe('the bow');
    expect(name(0, 7)).toBe('the stern');
  });

  it('names the sides', () => {
    expect(name(-4, 0)).toBe('the port rail');
    expect(name(4, 0)).toBe('the starboard rail');
  });

  it('names the corners the way a ship would', () => {
    expect(name(-4, -7)).toBe('the port bow');
    expect(name(4, -7)).toBe('the starboard bow');
    expect(name(-4, 7)).toBe('the port quarter');
    expect(name(4, 7)).toBe('the starboard quarter');
  });

  it('calls the middle amidships', () => {
    expect(name(0, 0)).toBe('amidships');
  });

  it('does not call a spot near the centreline port or starboard', () => {
    // Scavengers board at the deck edge, so anything this file calls a side
    // had better actually be at a side.
    expect(name(0.4, 0)).toBe('amidships');
    expect(name(-0.4, 0)).toBe('amidships');
  });

  it('scales with the deck rather than hard-coding the starting hull', () => {
    // The machine grows as the player builds; a threshold in absolute metres
    // would drift into calling half the deck "the bow".
    // -5 is the bow of a 16m hull and only a quarter of the way up a 40m one.
    expect(deckBearingName(0, -5, W, L)).toBe('the bow');
    expect(deckBearingName(0, -5, W, 20)).toBe('amidships');
    expect(deckBearingName(0, -18, W, 20)).toBe('the bow');
  });

  it('survives a degenerate zero-size deck', () => {
    // A divide by zero here would put NaN into a HUD string.
    expect(typeof deckBearingName(0, 0, 0, 0)).toBe('string');
  });
});
