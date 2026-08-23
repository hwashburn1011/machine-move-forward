import { hashSeed } from '@/core/math/Random';

/**
 * Deterministic per-chunk seed (handoff section 25).
 *
 * Every chunk's content derives from this, so reloading a save at the same
 * distance reproduces the identical world without storing any chunk data.
 */
export function chunkSeed(worldSeed: string, chunkIndex: number): number {
  return hashSeed(worldSeed, 'chunk', chunkIndex);
}

/** Sub-seed for one aspect of a chunk, so props and terrain do not correlate. */
export function chunkAspectSeed(worldSeed: string, chunkIndex: number, aspect: string): number {
  return hashSeed(worldSeed, 'chunk', chunkIndex, aspect);
}
