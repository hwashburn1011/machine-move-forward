import * as THREE from 'three';
import { fbm2D, valueNoise2D } from '@/core/math/Noise';
import { hashSeed, Rng } from '@/core/math/Random';

/**
 * Procedural textures, generated in code.
 *
 * The project ships no texture files, so every surface detail on the machine
 * comes from here. Generators write into plain Uint8Array first and are
 * wrapped in DataTexture separately, which keeps them unit-testable in node
 * where there is no WebGL context.
 *
 * Colour maps must be tagged SRGBColorSpace and data maps (normal, roughness)
 * must stay linear. Getting that backwards is the classic washed-out-materials
 * bug, so the wrappers below set it rather than leaving it to callers.
 */

type RGB = readonly [number, number, number];

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** Tileable fBm: blends across the wrap so edges match. */
function tileableFbm(x: number, y: number, size: number, freq: number, seed: number): number {
  const s = freq / size;
  const fx = x * s;
  const fy = y * s;
  const wrap = freq;
  // Four-corner blend gives a seamless tile at the cost of some contrast.
  const a = fbm2D(fx, fy, seed);
  const b = fbm2D(fx - wrap, fy, seed);
  const c = fbm2D(fx, fy - wrap, seed);
  const d = fbm2D(fx - wrap, fy - wrap, seed);
  const u = x / size;
  const v = y / size;
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Patchy oxidation over steel, with high-frequency speckle. */
export function generateRust(size: number, seed: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const rng = new Rng(hashSeed('rust', seed));
  const speckleSeed = hashSeed('rust-speckle', seed);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const patch = tileableFbm(x, y, size, 4, hashSeed('rust-patch', seed)) * 0.5 + 0.5;
      const fine = tileableFbm(x, y, size, 18, speckleSeed) * 0.5 + 0.5;

      // Rust eats into steel in blotches rather than evenly.
      const rustAmount = Math.max(0, Math.min(1, (patch - 0.35) * 2.2 + fine * 0.25));

      const steel: RGB = [0.36, 0.37, 0.38];
      const oxide: RGB = [0.55, 0.24, 0.08];
      const grit = (fine - 0.5) * 0.12;

      const i = (y * size + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const v = steel[ch]! * (1 - rustAmount) + oxide[ch]! * rustAmount + grit;
        data[i + ch] = clamp255(v * 255);
      }
      data[i + 3] = 255;
    }
  }
  void rng;
  return data;
}

/**
 * Flat paint with panel-scale value drift and worn edges.
 *
 * `base` should sit near white — this is a detail map, and the material's
 * `color` carries the actual hue. Passing a dark base here multiplies against
 * a dark palette colour and produces mud.
 */
export function generatePaintedMetal(size: number, seed: number, base: RGB): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const driftSeed = hashSeed('paint-drift', seed);
  const wearSeed = hashSeed('paint-wear', seed);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Slow drift keeps large painted areas from looking like flat vinyl.
      const drift = tileableFbm(x, y, size, 3, driftSeed) * 0.09;
      const wear = Math.max(0, tileableFbm(x, y, size, 12, wearSeed)) ** 3 * 0.5;

      const i = (y * size + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        // Wear exposes bare metal, which is lighter and desaturated.
        const worn = base[ch]! * (1 - wear) + 0.5 * wear;
        data[i + ch] = clamp255((worn + drift) * 255);
      }
      data[i + 3] = 255;
    }
  }
  return data;
}

/** Low-frequency dark mask, multiplied over other maps to break up cleanliness. */
export function generateGrime(size: number, seed: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const s = hashSeed('grime', seed);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = tileableFbm(x, y, size, 5, s) * 0.5 + 0.5;
      const streak = valueNoise2D(x * 0.04, y * 0.3, hashSeed('grime-streak', seed)) * 0.12;
      const v = Math.max(0, Math.min(1, 0.80 + n * 0.20 + streak));

      const i = (y * size + x) * 4;
      data[i] = clamp255(v * 255);
      data[i + 1] = clamp255(v * 250);
      data[i + 2] = clamp255(v * 240);
      data[i + 3] = 255;
    }
  }
  return data;
}

/** Walked-on deck plating: a raised tread pattern with wear down the middle. */
export function generateDeckPlate(size: number, seed: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const s = hashSeed('deck', seed);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;

      // Diamond tread: two offset diagonal bars.
      const d1 = Math.abs(((u * 4 + v * 4) % 1) - 0.5);
      const d2 = Math.abs(((u * 4 - v * 4 + 8) % 1) - 0.5);
      const tread = Math.max(0, 0.34 - Math.min(d1, d2)) * 2.6;

      // Plate seams every quarter.
      const seamX = Math.abs(((u * 2) % 1) - 0.5) > 0.485 ? 1 : 0;
      const seamY = Math.abs(((v * 2) % 1) - 0.5) > 0.485 ? 1 : 0;
      const seam = Math.max(seamX, seamY);

      const grime = tileableFbm(x, y, size, 6, s) * 0.5 + 0.5;
      // Detail-map range, not albedo: the palette colour supplies the hue,
      // so this must sit near white or the two multiply into mud.
      let val = 0.86 + tread * 0.12 - seam * 0.22 + (grime - 0.5) * 0.12;
      val = Math.max(0, Math.min(1, val));

      const i = (y * size + x) * 4;
      data[i] = clamp255(val * 255);
      data[i + 1] = clamp255(val * 248);
      data[i + 2] = clamp255(val * 232);
      data[i + 3] = 255;
    }
  }
  return data;
}

/**
 * Sobel-derived tangent-space normal map. A flat height field yields
 * (128, 128, 255) — straight up — which is what the unit test pins.
 */
export function generateNormalFromHeight(
  height: Float32Array,
  size: number,
  strength: number,
): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => {
    const wx = ((x % size) + size) % size;
    const wy = ((y % size) + size) % size;
    return height[wy * size + wx] ?? 0;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = at(x - 1, y - 1);
      const t = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const l = at(x - 1, y);
      const r = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const b = at(x, y + 1);
      const br = at(x + 1, y + 1);

      const dx = tl + 2 * l + bl - (tr + 2 * r + br);
      const dy = tl + 2 * t + tr - (bl + 2 * b + br);

      let nx = dx * strength;
      let ny = dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;

      const i = (y * size + x) * 4;
      data[i] = clamp255((nx * 0.5 + 0.5) * 255);
      data[i + 1] = clamp255((ny * 0.5 + 0.5) * 255);
      data[i + 2] = clamp255((nz / len) * 0.5 * 255 + 127.5);
      data[i + 3] = 255;
    }
  }
  return data;
}

// ---------------------------------------------------------------------------
// DataTexture wrappers
// ---------------------------------------------------------------------------

function toTexture(data: Uint8Array, size: number, srgb: boolean): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export const TextureFactory = {
  rust: (size = 256, seed = 1) => toTexture(generateRust(size, seed), size, true),
  paintedMetal: (size = 256, seed = 1, base: RGB = [0.4, 0.45, 0.35]) =>
    toTexture(generatePaintedMetal(size, seed, base), size, true),
  grime: (size = 256, seed = 1) => toTexture(generateGrime(size, seed), size, true),
  deckPlate: (size = 256, seed = 1) => toTexture(generateDeckPlate(size, seed), size, true),

  /** Normal maps are data, not colour — they must stay linear. */
  normalFromHeight: (height: Float32Array, size: number, strength = 2) =>
    toTexture(generateNormalFromHeight(height, size, strength), size, false),

  /** Convenience: a normal map derived from tileable fBm. */
  noiseNormal: (size = 256, seed = 1, freq = 8, strength = 2) => {
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        h[y * size + x] = tileableFbm(x, y, size, freq, hashSeed('nnorm', seed));
      }
    }
    return toTexture(generateNormalFromHeight(h, size, strength), size, false);
  },
};
