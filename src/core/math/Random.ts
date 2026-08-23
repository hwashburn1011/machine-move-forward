/**
 * Deterministic pseudo-random number generation.
 *
 * `Math.random` is banned anywhere world state must survive save/load. Every
 * world feature derives from `worldSeed + chunkIndex`, so an identical seed
 * must always reproduce an identical world.
 */

/** mulberry32 — fast, small, and statistically fine for world generation. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Force a non-zero uint32 so a seed of 0 still advances.
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer, inclusive on both ends. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Signed uniform in [-magnitude, magnitude). */
  signed(magnitude = 1): number {
    return (this.next() * 2 - 1) * magnitude;
  }
}

/**
 * FNV-1a over the string form of each part. Stable across sessions and
 * platforms, which is what makes seeded world generation reproducible.
 */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    // Separator byte, so ('a', 'bc') and ('ab', 'c') cannot collide.
    h ^= 0x2f;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
