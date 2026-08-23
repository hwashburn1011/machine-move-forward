import { describe, it, expect } from 'vitest';
import { chunkSeed } from '@/world/WorldSeed';

describe('chunkSeed', () => {
  it('is stable for the same inputs', () => {
    expect(chunkSeed('alpha', 7)).toBe(chunkSeed('alpha', 7));
  });

  it('differs for adjacent chunk indices', () => {
    expect(chunkSeed('alpha', 7)).not.toBe(chunkSeed('alpha', 8));
  });

  it('differs for different world seeds', () => {
    expect(chunkSeed('alpha', 7)).not.toBe(chunkSeed('beta', 7));
  });

  it('handles negative chunk indices', () => {
    expect(chunkSeed('alpha', -3)).not.toBe(chunkSeed('alpha', 3));
  });

  it('returns a non-negative 32-bit integer', () => {
    const s = chunkSeed('alpha', 12345);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 32);
  });
});
