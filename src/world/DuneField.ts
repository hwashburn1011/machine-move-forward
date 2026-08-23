/**
 * CPU mirror of the dune height function in `terrainShader.ts`.
 *
 * Props have to sit on the sand, but the surface is displaced on the GPU, so
 * the placement code needs the same height function. These constants and the
 * shader's uniforms are deliberately fed from the same source (DUNE_PARAMS
 * below) — if they drift apart, every rock floats or sinks.
 *
 * The port is not bit-exact: the GPU runs float32 and this runs float64, so
 * heights can differ by a few millimetres. Props are seated slightly into the
 * sand to absorb that, which also just looks better than perching them on top.
 */

export const DUNE_PARAMS = {
  scale: 62,
  height: 5.2,
  ridgeHeight: 2.6,
  /** Sand is fully flattened inside this half-width, in metres. */
  corridorInner: 10,
  /** ...and fully natural beyond this one. */
  corridorOuter: 30,
} as const;

/** How far to seat props into the surface, in metres. */
export const PROP_SINK = 0.35;

const fract = (x: number) => x - Math.floor(x);

function tHash(px: number, py: number): number {
  let x = fract(px * 123.34);
  let y = fract(py * 345.45);
  const d = x * (x + 34.345) + y * (y + 34.345);
  x += d;
  y += d;
  return fract(x * y);
}

function tValueNoise(px: number, py: number): number {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;

  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);

  const a = tHash(ix, iy);
  const b = tHash(ix + 1, iy);
  const c = tHash(ix, iy + 1);
  const d = tHash(ix + 1, iy + 1);

  const top = a + (b - a) * ux;
  const bottom = c + (d - c) * ux;
  return (top + (bottom - top) * uy) * 2 - 1;
}

function tFbm(px: number, py: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let total = 0;
  let x = px;
  let y = py;
  for (let i = 0; i < octaves; i++) {
    sum += tValueNoise(x, y) * amp;
    total += amp;
    amp *= 0.5;
    x *= 2.03;
    y *= 2.03;
  }
  return sum / total;
}

function tRidged(px: number, py: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let total = 0;
  let x = px;
  let y = py;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(tValueNoise(x, y));
    sum += n * n * amp;
    total += amp;
    amp *= 0.5;
    x *= 2.03;
    y *= 2.03;
  }
  return sum / total;
}

/** World-space dune height at (x, z). Mirrors `duneHeight` in the shader. */
export function duneHeightAt(x: number, z: number): number {
  const px = x / DUNE_PARAMS.scale;
  const pz = z / DUNE_PARAMS.scale;
  const broad = tFbm(px, pz, 4) * DUNE_PARAMS.height;
  const ridge = (tRidged(px * 2.1 + 31.7, pz * 2.1 + 31.7, 3) - 0.5) * DUNE_PARAMS.ridgeHeight;
  const h = broad + ridge;

  // Must match the corridor term in the shader exactly, or props along the
  // machine's track will float or sink.
  const t = (Math.abs(x) - DUNE_PARAMS.corridorInner) /
    (DUNE_PARAMS.corridorOuter - DUNE_PARAMS.corridorInner);
  const c = Math.max(0, Math.min(1, t));
  const corridor = c * c * (3 - 2 * c);
  return (h * 0.08 - 0.55) * (1 - corridor) + h * corridor;
}
