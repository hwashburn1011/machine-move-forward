import { describe, expect, it } from 'vitest';
import {
  ambienceGain,
  INTERIOR_DUCK,
  PAD_ATTACK_S,
  PAD_DETUNE_CENTS,
  PAD_GAIN,
  PAD_ROOT_HZ,
  DRONE_FULL_GAIN,
  padPlaying,
} from '@/audio/SoundBank';
import { BuildGrid, canonicalEdge, type Cell } from '@/building/BuildGrid';
import { detectRooms, insideEnclosed } from '@/building/RoomDetector';
import type { PieceId } from '@/data/build-pieces';
import type { ThreatPhase } from '@/enemies/ThreatDirector';

const c = (x: number, y: number, z: number): Cell => ({ x, y, z });

/** One floored cell, walled on all four sides and roofed. */
function sealedRoom(at: Cell): BuildGrid<PieceId> {
  const g = new BuildGrid<PieceId>();
  g.setCell(at, 'floor');
  for (const side of ['north', 'south', 'east', 'west'] as const) {
    g.setEdge(canonicalEdge(at, side), 'wall');
  }
  g.setRoof(at, 'roof');
  return g;
}

describe('inside sounds like inside', () => {
  it('ducks the machine to half indoors and leaves it alone outdoors', () => {
    expect(ambienceGain(true)).toBe(INTERIOR_DUCK);
    expect(ambienceGain(false)).toBe(1);
  });

  it('ducks rather than silences', () => {
    // The machine is what the player is standing on. A room that cut it off
    // entirely would read as the audio breaking, not as shelter.
    expect(INTERIOR_DUCK).toBeGreaterThan(0);
    expect(INTERIOR_DUCK).toBeLessThan(1);
  });
});

describe('knowing when the player is indoors', () => {
  it('says yes inside a sealed room', () => {
    const grid = sealedRoom(c(0, 0, 0));
    expect(insideEnclosed(detectRooms(grid), c(0, 0, 0))).toBe(true);
  });

  it('says no on an open deck plate', () => {
    const grid = new BuildGrid<PieceId>();
    grid.setCell(c(0, 0, 0), 'floor');
    expect(insideEnclosed(detectRooms(grid), c(0, 0, 0))).toBe(false);
  });

  it('says no on a railed platform, which is fenced rather than enclosed', () => {
    const grid = new BuildGrid<PieceId>();
    grid.setCell(c(0, 0, 0), 'floor');
    for (const side of ['north', 'south', 'east', 'west'] as const) {
      grid.setEdge(canonicalEdge(c(0, 0, 0), side), 'railing');
    }
    grid.setRoof(c(0, 0, 0), 'roof');
    expect(insideEnclosed(detectRooms(grid), c(0, 0, 0))).toBe(false);
  });

  it('says no about a cell that is not in any room at all', () => {
    const grid = sealedRoom(c(0, 0, 0));
    expect(insideEnclosed(detectRooms(grid), c(9, 0, 9))).toBe(false);
  });

  it('says no once the roof comes off', () => {
    const grid = sealedRoom(c(0, 0, 0));
    grid.clearRoof(c(0, 0, 0));
    expect(insideEnclosed(detectRooms(grid), c(0, 0, 0))).toBe(false);
  });
});

describe('the calm pad', () => {
  it('plays in calm and in nothing else', () => {
    const phases: ThreatPhase[] = ['calm', 'buildup', 'contact', 'engagement', 'recovery'];
    for (const phase of phases) {
      expect(padPlaying(phase), phase).toBe(phase === 'calm');
    }
  });

  it('gates off the moment the director calls buildup', () => {
    // The whole design of the thing: music that stops is a warning the player
    // hears before they see anything.
    expect(padPlaying('calm')).toBe(true);
    expect(padPlaying('buildup')).toBe(false);
  });

  it('sits under the machine rather than over it', () => {
    // Music louder than the engine on the deck of a walking machine would be
    // a soundtrack rather than an atmosphere.
    expect(PAD_GAIN).toBeGreaterThan(0);
    expect(PAD_GAIN).toBeLessThan(DRONE_FULL_GAIN);
  });

  it('fades in slowly enough that nothing about it is an event', () => {
    expect(PAD_ATTACK_S).toBeGreaterThanOrEqual(2);
  });

  it('is two oscillators barely apart, not a chord', () => {
    // Detune is what makes two oscillators one voice. Past about a quarter
    // tone they stop beating and start being wrong.
    expect(PAD_DETUNE_CENTS).toBeGreaterThan(0);
    expect(PAD_DETUNE_CENTS).toBeLessThan(25);
  });

  it('is pitched low, where it will not fight the alert tones', () => {
    expect(PAD_ROOT_HZ).toBeGreaterThan(50);
    expect(PAD_ROOT_HZ).toBeLessThan(200);
  });
});
