import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/math/Random';
import {
  EnemySpawner,
  perimeterSpawnPoint,
  SPAWN_EDGE_INSET,
  type Bounds,
} from '@/enemies/EnemySpawner';

const INTERVAL = 250;
const CAP = 4;

const spawner = () => new EnemySpawner('test-seed', INTERVAL, CAP);

/** The real machine: 10m x 16m, deck at 2.4 plus a metre of drop. */
const BOUNDS: Bounds = { halfWidth: 5, halfLength: 8, deckY: 3.4 };
const ORIGIN = { x: 0, y: 0, z: 0 };

describe('pacing', () => {
  it('does not spawn before the first threshold', () => {
    const s = spawner();
    expect(s.nextSpawnAt).toBe(INTERVAL);
    expect(s.update(0, 0)).toBeNull();
    expect(s.update(INTERVAL - 0.1, 0)).toBeNull();
  });

  it('spawns exactly once at the threshold', () => {
    const s = spawner();
    expect(s.update(INTERVAL, 0)?.defId).toBe('scavenger');
    expect(s.update(INTERVAL, 0)).toBeNull();
  });

  it('advances the threshold past the distance that triggered it', () => {
    const s = spawner();
    s.update(INTERVAL, 0);
    expect(s.nextSpawnAt).toBe(INTERVAL * 2);
  });

  it('spawns only once when the distance jumps several intervals', () => {
    const s = spawner();
    // The F7 skip moves 500m at a stroke and a save can load anywhere.
    // Neither may discharge a backlog onto the deck.
    expect(s.update(INTERVAL * 4 + 10, 0)).not.toBeNull();
    expect(s.update(INTERVAL * 4 + 10, 0)).toBeNull();
    expect(s.nextSpawnAt).toBeGreaterThan(INTERVAL * 4 + 10);
  });
});

describe('the concurrent cap', () => {
  it('refuses at the cap', () => {
    const s = spawner();
    expect(s.update(INTERVAL, CAP)).toBeNull();
  });

  it('holds a refused spawn rather than forgetting it', () => {
    const s = spawner();
    s.update(INTERVAL, CAP);
    // Letting four live must not quietly buy the player a lull.
    expect(s.nextSpawnAt).toBe(INTERVAL);
    expect(s.update(INTERVAL, CAP - 1)).not.toBeNull();
  });
});

describe('resync', () => {
  it('takes the next boundary ahead of a loaded distance', () => {
    const s = spawner();
    s.resync(1000);
    expect(s.nextSpawnAt).toBe(1250);
  });

  it('leaves no backlog to discharge', () => {
    const s = spawner();
    s.resync(1000);
    expect(s.update(1000, 0)).toBeNull();
  });

  it('lands strictly ahead even on an exact boundary', () => {
    const s = spawner();
    s.resync(INTERVAL);
    expect(s.nextSpawnAt).toBe(INTERVAL * 2);
  });
});

describe('spawn points', () => {
  it('sits on the deck perimeter, inset from the lip', () => {
    for (let i = 0; i < 32; i++) {
      const p = perimeterSpawnPoint(BOUNDS, ORIGIN, new Rng(i));
      const onX = Math.abs(Math.abs(p.x) - (BOUNDS.halfWidth - SPAWN_EDGE_INSET)) < 1e-9;
      const onZ = Math.abs(Math.abs(p.z) - (BOUNDS.halfLength - SPAWN_EDGE_INSET)) < 1e-9;
      // Every point is on one of the four inset edges, and none is off the deck.
      expect(onX || onZ).toBe(true);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(BOUNDS.halfWidth);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(BOUNDS.halfLength);
    }
  });

  it('spawns at the given deck height', () => {
    expect(perimeterSpawnPoint(BOUNDS, ORIGIN, new Rng(7)).y).toBe(BOUNDS.deckY);
  });

  it('biases away from the player', () => {
    for (let i = 0; i < 16; i++) {
      // Player pinned at the -Z end: arrivals belong at the far end.
      const p = perimeterSpawnPoint(BOUNDS, { x: 0, y: 0, z: -BOUNDS.halfLength }, new Rng(i));
      expect(p.z).toBeGreaterThan(0);
    }
  });

  it('is reproducible for a given seed', () => {
    const a = perimeterSpawnPoint(BOUNDS, { x: 1, y: 0, z: 2 }, new Rng(99));
    const b = perimeterSpawnPoint(BOUNDS, { x: 1, y: 0, z: 2 }, new Rng(99));
    expect(a).toEqual(b);
  });

  it("drives placement from the spawner's own seed", () => {
    const a = new EnemySpawner('same', INTERVAL, CAP).placementFor(BOUNDS, ORIGIN);
    const b = new EnemySpawner('same', INTERVAL, CAP).placementFor(BOUNDS, ORIGIN);
    expect(a).toEqual(b);
  });
});
