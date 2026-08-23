import { describe, it, expect } from 'vitest';
import {
  generateRust,
  generatePaintedMetal,
  generateGrime,
  generateNormalFromHeight,
  generateDeckPlate,
} from '@/art/TextureFactory';

const SIZE = 64;

/**
 * These test the raw pixel generators rather than the THREE.DataTexture
 * wrappers, which is why generation writes into a plain Uint8Array first —
 * there is no WebGL context in node.
 */
describe('procedural texture generators', () => {
  const generators = [
    ['rust', () => generateRust(SIZE, 1)],
    ['paintedMetal', () => generatePaintedMetal(SIZE, 1, [0.4, 0.45, 0.35])],
    ['grime', () => generateGrime(SIZE, 1)],
    ['deckPlate', () => generateDeckPlate(SIZE, 1)],
  ] as const;

  for (const [name, gen] of generators) {
    describe(name, () => {
      it('returns RGBA data of the right length', () => {
        expect(gen().length).toBe(SIZE * SIZE * 4);
      });

      it('is deterministic for the same seed', () => {
        expect(Array.from(gen())).toEqual(Array.from(gen()));
      });

      it('keeps every channel in 0..255', () => {
        for (const v of gen()) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(255);
        }
      });

      it('is fully opaque', () => {
        const data = gen();
        for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
      });

      it('actually varies rather than returning a flat fill', () => {
        const data = gen();
        const reds = new Set<number>();
        for (let i = 0; i < data.length; i += 4) reds.add(data[i]!);
        expect(reds.size).toBeGreaterThan(4);
      });
    });
  }

  it('rust differs between seeds', () => {
    expect(Array.from(generateRust(SIZE, 1))).not.toEqual(Array.from(generateRust(SIZE, 2)));
  });

  it('paintedMetal respects its base colour', () => {
    const red = generatePaintedMetal(SIZE, 3, [0.8, 0.1, 0.1]);
    const blue = generatePaintedMetal(SIZE, 3, [0.1, 0.1, 0.8]);
    let redSum = 0;
    let blueSum = 0;
    for (let i = 0; i < red.length; i += 4) {
      redSum += red[i]!;
      blueSum += blue[i]!;
    }
    expect(redSum).toBeGreaterThan(blueSum);
  });
});

describe('generateNormalFromHeight', () => {
  it('returns a straight-up normal for a flat height field', () => {
    const flat = new Float32Array(SIZE * SIZE).fill(0.5);
    const data = generateNormalFromHeight(flat, SIZE, 1);
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBeGreaterThanOrEqual(126);
      expect(data[i]).toBeLessThanOrEqual(130);
      expect(data[i + 1]).toBeGreaterThanOrEqual(126);
      expect(data[i + 1]).toBeLessThanOrEqual(130);
      expect(data[i + 2]).toBeGreaterThan(250);
    }
  });

  it('produces a non-flat normal for a sloped height field', () => {
    const sloped = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) sloped[y * SIZE + x] = x / SIZE;
    }
    const data = generateNormalFromHeight(sloped, SIZE, 1);
    // Sampled away from the wrap seam, X should be pushed off centre.
    const idx = (32 * SIZE + 32) * 4;
    expect(Math.abs(data[idx]! - 128)).toBeGreaterThan(3);
  });

  it('is deterministic', () => {
    const h = new Float32Array(SIZE * SIZE).map((_, i) => Math.sin(i * 0.1));
    expect(Array.from(generateNormalFromHeight(h, SIZE, 2))).toEqual(
      Array.from(generateNormalFromHeight(h, SIZE, 2)),
    );
  });
});
