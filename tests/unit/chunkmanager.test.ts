import { describe, it, expect } from 'vitest';
import { ChunkManager } from '@/world/ChunkManager';

const AHEAD = 6;
const BEHIND = 2;
const SIZE = 64;
const SLOTS = AHEAD + BEHIND + 1;

const make = () => new ChunkManager(AHEAD, BEHIND, SIZE);

describe('ChunkManager', () => {
  it('creates one slot per chunk position', () => {
    expect(make().slots.length).toBe(SLOTS);
  });

  it('spaces slots evenly by chunk size at distance zero', () => {
    const zs = make()
      .slots.map((s) => s.z)
      .sort((a, b) => a - b);
    for (let i = 1; i < zs.length; i++) {
      expect(zs[i]! - zs[i - 1]!).toBeCloseTo(SIZE, 6);
    }
  });

  it('spans from behind the machine to ahead of it', () => {
    const zs = make().slots.map((s) => s.z);
    expect(Math.min(...zs)).toBeCloseTo(-BEHIND * SIZE, 6);
    expect(Math.max(...zs)).toBeCloseTo(AHEAD * SIZE, 6);
  });

  it('recycles nothing when advancing less than one chunk', () => {
    const m = make();
    expect(m.advance(SIZE * 0.5)).toEqual([]);
  });

  it('recycles exactly one slot after advancing one chunk size', () => {
    const m = make();
    expect(m.advance(SIZE * 1.001).length).toBe(1);
  });

  it('recycles exactly two slots after advancing 2.5 chunk sizes', () => {
    const m = make();
    expect(m.advance(SIZE * 2.5).length).toBe(2);
  });

  it('moves a recycled slot to the far end of the ring', () => {
    const m = make();
    const before = new Map(m.slots.map((s) => [s.slotId, s.chunkIndex]));
    const [recycled] = m.advance(SIZE * 1.001);
    expect(recycled).toBeDefined();
    const previousIndex = before.get(recycled!.slotId)!;
    expect(recycled!.chunkIndex).toBe(previousIndex + SLOTS);
  });

  it('keeps every slot within a bounded Z range no matter how far it travels', () => {
    const m = make();
    const lo = -(BEHIND + 2) * SIZE;
    const hi = (AHEAD + 2) * SIZE;
    let distance = 0;
    for (let step = 0; step < 4000; step++) {
      distance += 7.3;
      m.advance(distance);
      for (const s of m.slots) {
        expect(s.z).toBeGreaterThanOrEqual(lo);
        expect(s.z).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('produces the same state from one big advance as from many small ones', () => {
    const a = make();
    const b = make();
    const target = SIZE * 37.4;

    a.advance(target);
    const steps = 500;
    for (let i = 1; i <= steps; i++) b.advance((target * i) / steps);

    const norm = (m: ChunkManager) =>
      m.slots
        .map((s) => `${s.slotId}:${s.chunkIndex}:${s.z.toFixed(4)}`)
        .sort()
        .join('|');
    expect(norm(a)).toBe(norm(b));
  });

  it('reset() reproduces the state that incremental advancing reaches', () => {
    const incremental = make();
    const target = SIZE * 23.7;
    for (let i = 1; i <= 300; i++) incremental.advance((target * i) / 300);

    const restored = make();
    restored.reset(target);

    const norm = (m: ChunkManager) =>
      m.slots
        .map((s) => `${s.slotId}:${s.chunkIndex}:${s.z.toFixed(4)}`)
        .sort()
        .join('|');
    expect(norm(restored)).toBe(norm(incremental));
  });

  it('never assigns two slots the same chunk index', () => {
    const m = make();
    for (let i = 1; i <= 200; i++) {
      m.advance(i * SIZE * 0.37);
      const indices = m.slots.map((s) => s.chunkIndex);
      expect(new Set(indices).size).toBe(SLOTS);
    }
  });

  it('advances chunk indices monotonically as distance grows', () => {
    const m = make();
    const maxAt = (d: number) => {
      m.reset(d);
      return Math.max(...m.slots.map((s) => s.chunkIndex));
    };
    expect(maxAt(SIZE * 10)).toBeGreaterThan(maxAt(0));
    expect(maxAt(SIZE * 100)).toBeGreaterThan(maxAt(SIZE * 10));
  });
});
