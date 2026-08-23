import { hashSeed } from './Random';

/**
 * CPU-side deterministic noise, used for prop scatter and any generation that
 * must match across save/load. The terrain shader implements the equivalent
 * functions in GLSL for the GPU side.
 */

/** Deterministic hash of an integer lattice point to [-1, 1]. */
function latticeValue(ix: number, iy: number, seed: number): number {
  let h = seed ^ 0x27d4eb2d;
  h = Math.imul(h ^ (ix | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (iy | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 2147483648) - 1;
}

/** Quintic smoothstep — C2 continuous, so fBm derivatives stay smooth. */
function smooth(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Bilinear-interpolated value noise. Returns [-1, 1]. */
export function valueNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);

  const v00 = latticeValue(x0, y0, seed);
  const v10 = latticeValue(x0 + 1, y0, seed);
  const v01 = latticeValue(x0, y0 + 1, seed);
  const v11 = latticeValue(x0 + 1, y0 + 1, seed);

  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy);
}

/**
 * Fractal Brownian motion. Normalised by total amplitude, so the result cannot
 * leave [-1, 1] at any octave count.
 */
export function fbm2D(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let total = 0;

  for (let o = 0; o < octaves; o++) {
    // Decorrelate octaves so they do not visibly line up.
    sum += valueNoise2D(x * frequency, y * frequency, hashSeed(seed, o)) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return total === 0 ? 0 : sum / total;
}

/**
 * Ridged variant — sharp crests instead of rounded hills. Returns [0, 1].
 * Used for dune ridge lines.
 */
export function ridged2D(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let total = 0;

  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(valueNoise2D(x * frequency, y * frequency, hashSeed(seed, o)));
    sum += n * n * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return total === 0 ? 0 : sum / total;
}
