import { describe, it, expect } from 'vitest';
import { Rng, hashSeed } from '@/core/math/Random';

describe('Rng', () => {
  it('produces an identical sequence for an identical seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces a different sequence for a different seed', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it('still advances when seeded with zero', () => {
    const rng = new Rng(0);
    const a = rng.next();
    const b = rng.next();
    expect(a).not.toBe(b);
  });

  it('stays within [0, 1)', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('range() respects bounds', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 500; i++) {
      const v = rng.range(-3, 9);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(9);
    }
  });

  it('int() is inclusive on both ends and hits every value', () => {
    const rng = new Rng(4);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rng.int(0, 3));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it('pick() returns a member of the array', () => {
    const rng = new Rng(11);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 50; i++) expect(items).toContain(rng.pick(items));
  });

  it('pick() throws on an empty array rather than returning undefined', () => {
    expect(() => new Rng(1).pick([])).toThrow();
  });
});

describe('hashSeed', () => {
  it('is stable across calls', () => {
    expect(hashSeed('world', 4)).toBe(hashSeed('world', 4));
  });

  it('separates different inputs', () => {
    expect(hashSeed('world', 4)).not.toBe(hashSeed('world', 5));
    expect(hashSeed('a', 1)).not.toBe(hashSeed('b', 1));
  });

  it('separates inputs that would collide without a separator', () => {
    expect(hashSeed('a', 'bc')).not.toBe(hashSeed('ab', 'c'));
  });

  it('returns a non-negative 32-bit integer', () => {
    const h = hashSeed('anything', 123);
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
});
