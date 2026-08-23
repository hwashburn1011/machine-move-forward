import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/math/Random';
import {
  EnemySpawner,
  perimeterSpawnPoint,
  SPAWN_EDGE_INSET,
  type Bounds,
  type Vec3Like,
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
      // No keep-out predicate supplied: nothing is blocked, so this must
      // still return a point (never null).
      const p = perimeterSpawnPoint(BOUNDS, ORIGIN, new Rng(i))!;
      const onX = Math.abs(Math.abs(p.x) - (BOUNDS.halfWidth - SPAWN_EDGE_INSET)) < 1e-9;
      const onZ = Math.abs(Math.abs(p.z) - (BOUNDS.halfLength - SPAWN_EDGE_INSET)) < 1e-9;
      // Every point is on one of the four inset edges, and none is off the deck.
      expect(onX || onZ).toBe(true);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(BOUNDS.halfWidth);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(BOUNDS.halfLength);
    }
  });

  it('spawns at the given deck height', () => {
    expect(perimeterSpawnPoint(BOUNDS, ORIGIN, new Rng(7))!.y).toBe(BOUNDS.deckY);
  });

  it('biases away from the player', () => {
    for (let i = 0; i < 16; i++) {
      // Player pinned at the -Z end: arrivals belong at the far end.
      const p = perimeterSpawnPoint(BOUNDS, { x: 0, y: 0, z: -BOUNDS.halfLength }, new Rng(i))!;
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

describe('the keep-out predicate', () => {
  // The real prow collider (src/machine/MachineGeometry.ts `prowBlock`,
  // confirmed against source): half-extents (4.5, 0.55, 0.8) centred at
  // (0, 3.04, -7.4) with DECK_HEIGHT 2.4. That gives:
  //   x in [-4.5, 4.5], y in [2.49, 3.59], z in [-8.2, -6.6]
  // The whole front edge of BOUNDS's inset perimeter ring (z = -7.4) sits
  // inside this box on all three axes — this is finding 1 of the review.
  const PROW = { xMin: -4.5, xMax: 4.5, yMin: 2.49, yMax: 3.59, zMin: -8.2, zMax: -6.6 };
  const insideProw = (p: Vec3Like): boolean =>
    p.x >= PROW.xMin && p.x <= PROW.xMax &&
    p.y >= PROW.yMin && p.y <= PROW.yMax &&
    p.z >= PROW.zMin && p.z <= PROW.zMax;

  it('never places an arrival inside the prow, for any player position on the whole deck', () => {
    // Sweep the whole deck, including z > 0 (the rear half) — no existing
    // placement test before this one exercises that half, which is exactly
    // why the prow bug survived: `perimeterSpawnPoint` picks the candidate
    // furthest from the player, so a player anywhere in the rear half makes
    // the (blocked) front edge the winning candidate every time.
    let sawNonNull = 0;
    let total = 0;

    for (let pz = -BOUNDS.halfLength; pz <= BOUNDS.halfLength; pz += 1) {
      for (let px = -BOUNDS.halfWidth; px <= BOUNDS.halfWidth; px += 1) {
        for (let seed = 0; seed < 6; seed++) {
          total++;
          const p = perimeterSpawnPoint(
            BOUNDS,
            { x: px, y: 0, z: pz },
            new Rng(seed),
            insideProw,
          );
          if (p === null) continue;
          sawNonNull++;
          expect(insideProw(p)).toBe(false);
        }
      }
    }

    // The predicate must actually be exercised, not just accepted and
    // ignored — if every candidate came back blocked (or the predicate was
    // silently never consulted), this sweep would prove nothing.
    expect(sawNonNull).toBeGreaterThan(0);
    expect(sawNonNull).toBe(total);
  });
});
