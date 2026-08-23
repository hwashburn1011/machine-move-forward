import { hashSeed, Rng } from '@/core/math/Random';
import { MAX_ACTIVE_ENEMIES, SPAWN_INTERVAL_M } from '@/data/enemies';

/**
 * Distance-driven arrivals (spec 2026-08-23-enemy-spawner-design.md).
 *
 * Pure: plain numbers in, a decision out, no Three.js and no Rapier. This is
 * NOT the threat director — there is no escalation curve and no wave
 * composition here, and adding a fake one would only have to be unpicked when
 * the real director arrives.
 */

export interface SpawnRequest {
  defId: string;
}

export interface Bounds {
  halfWidth: number;
  halfLength: number;
  /** World Y to place arrivals at. */
  deckY: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Metres in from the deck lip, so arrivals land on the deck and not the edge. */
export const SPAWN_EDGE_INSET = 0.6;

/** Candidate points considered per spawn, one per octant of the perimeter. */
const OCTANTS = 8;

export class EnemySpawner {
  private readonly rng: Rng;
  private threshold: number;

  constructor(
    seed: string,
    private readonly intervalM: number = SPAWN_INTERVAL_M,
    private readonly maxActive: number = MAX_ACTIVE_ENEMIES,
  ) {
    this.rng = new Rng(hashSeed(seed, 'enemy-spawner'));
    this.threshold = this.boundaryAfter(0);
  }

  /** The distance at which the next arrival is due. */
  get nextSpawnAt(): number {
    return this.threshold;
  }

  /**
   * One decision per call. Null when it is not yet time, or the deck is full.
   *
   * At most one spawn however far the distance jumped: a 500m debug skip or a
   * save loaded at 10km must not discharge a backlog onto the deck at once.
   */
  update(distance: number, activeCount: number): SpawnRequest | null {
    if (distance < this.threshold) return null;

    // Refused, not forgotten: the threshold deliberately does not advance, so
    // the held arrival lands as soon as one of the four dies. Advancing here
    // would reward the player for letting them live.
    if (activeCount >= this.maxActive) return null;

    this.threshold = this.boundaryAfter(distance);
    return { defId: 'scavenger' };
  }

  /** Re-derive the threshold from a distance. Used on save load. */
  resync(distance: number): void {
    this.threshold = this.boundaryAfter(distance);
  }

  /**
   * `perimeterSpawnPoint` fed from this spawner's own RNG, so one seed drives
   * both timing and placement.
   *
   * `isBlocked` is an optional keep-out predicate (e.g. the machine's own
   * equipment footprint) — see `perimeterSpawnPoint` below. Null when every
   * candidate was rejected.
   */
  placementFor(
    bounds: Bounds,
    playerPos: Vec3Like,
    isBlocked?: (p: Vec3Like) => boolean,
  ): Vec3Like | null {
    return perimeterSpawnPoint(bounds, playerPos, this.rng, isBlocked);
  }

  /** The first interval boundary strictly ahead of `distance`. */
  private boundaryAfter(distance: number): number {
    return (Math.floor(distance / this.intervalM) + 1) * this.intervalM;
  }
}

/**
 * A deck-edge point, biased away from the player.
 *
 * One candidate per octant with jitter inside it, rather than free sampling:
 * fixed octants mean coverage never depends on how lucky the RNG was, and the
 * jitter stops arrivals landing on the same eight marks forever. Taking the
 * furthest candidate costs nothing and removes the case where a scavenger
 * materialises inside the player's face.
 *
 * `isBlocked` is an optional keep-out predicate: a candidate it rejects is
 * skipped entirely, even if it would otherwise be the furthest from the
 * player. This is how a caller keeps arrivals out of machine geometry (the
 * prow, the engine block) without this function knowing anything about that
 * geometry — it stays pure. Returns null if every candidate was rejected.
 */
export function perimeterSpawnPoint(
  bounds: Bounds,
  playerPos: Vec3Like,
  rng: Rng,
  isBlocked?: (p: Vec3Like) => boolean,
): Vec3Like | null {
  let best: Vec3Like | null = null;
  let bestDistance = -1;

  for (let i = 0; i < OCTANTS; i++) {
    const point = pointOnPerimeter(bounds, (i + rng.next()) / OCTANTS);
    if (isBlocked?.(point)) continue;
    const d = Math.hypot(point.x - playerPos.x, point.z - playerPos.z);
    if (d > bestDistance) {
      bestDistance = d;
      best = point;
    }
  }

  return best;
}

/** `t` in [0,1) walked around the inset deck edge from the -X/-Z corner. */
function pointOnPerimeter(bounds: Bounds, t: number): Vec3Like {
  const hw = Math.max(0, bounds.halfWidth - SPAWN_EDGE_INSET);
  const hl = Math.max(0, bounds.halfLength - SPAWN_EDGE_INSET);
  const w = hw * 2;
  const l = hl * 2;

  let s = (((t % 1) + 1) % 1) * ((w + l) * 2);

  if (s < w) return { x: -hw + s, y: bounds.deckY, z: -hl };
  s -= w;
  if (s < l) return { x: hw, y: bounds.deckY, z: -hl + s };
  s -= l;
  if (s < w) return { x: hw - s, y: bounds.deckY, z: hl };
  s -= w;
  return { x: -hw, y: bounds.deckY, z: hl - s };
}
