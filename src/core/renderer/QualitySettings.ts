import type * as THREE from 'three';

export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

export interface QualitySettings {
  tier: QualityTier;
  /** MSAA samples on the composer render target. 0 disables. */
  msaaSamples: number;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  /** Ground-truth ambient occlusion. */
  gtao: boolean;
  bloom: boolean;
  heatShimmer: boolean;
  grain: boolean;
  /** Maximum simultaneously live particles across all emitters. */
  particleBudget: number;
  /** Terrain mesh subdivisions per chunk edge. */
  terrainSegments: number;
  /** Props instanced per terrain chunk. */
  propsPerChunk: number;
  /**
   * Real point lights available to the lamp pool.
   *
   * The pool is fixed at this size and moved between lamps rather than grown
   * and shrunk: a Three material recompiles its shader when the light count
   * in the scene changes, so a varying pool would hitch every time the player
   * walked past a lamp. Every LIT lamp glows regardless; this is only how many
   * of them cast actual illumination.
   */
  lampLights: number;
  maxPixelRatio: number;
}

const TIERS: Record<QualityTier, QualitySettings> = {
  low: {
    tier: 'low',
    msaaSamples: 0,
    shadowsEnabled: false,
    shadowMapSize: 1024,
    gtao: false,
    bloom: false,
    heatShimmer: false,
    grain: false,
    particleBudget: 200,
    terrainSegments: 48,
    propsPerChunk: 6,
    lampLights: 2,
    maxPixelRatio: 1,
  },
  medium: {
    tier: 'medium',
    msaaSamples: 2,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    gtao: false,
    bloom: true,
    heatShimmer: false,
    grain: true,
    particleBudget: 800,
    terrainSegments: 96,
    propsPerChunk: 12,
    lampLights: 4,
    maxPixelRatio: 1.5,
  },
  high: {
    tier: 'high',
    msaaSamples: 4,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    gtao: true,
    bloom: true,
    // High is the midrange target. GTAO already needs a depth/normal pass;
    // keep the distortion pass for Ultra where its extra bandwidth is a
    // deliberate tradeoff.
    heatShimmer: false,
    grain: true,
    particleBudget: 2000,
    terrainSegments: 96,
    propsPerChunk: 20,
    lampLights: 6,
    // The primary acceptance target is 1080p at native resolution. A high-DPI
    // display must not silently turn that into a 4K workload.
    maxPixelRatio: 1,
  },
  ultra: {
    tier: 'ultra',
    msaaSamples: 4,
    shadowsEnabled: true,
    shadowMapSize: 4096,
    gtao: true,
    bloom: true,
    heatShimmer: true,
    grain: true,
    particleBudget: 4000,
    terrainSegments: 140,
    propsPerChunk: 28,
    lampLights: 8,
    maxPixelRatio: 1.5,
  },
};

export function getQualitySettings(tier: QualityTier): QualitySettings {
  return { ...TIERS[tier] };
}

export const QUALITY_TIERS: readonly QualityTier[] = ['low', 'medium', 'high', 'ultra'];

export function nextQualityTier(tier: QualityTier): QualityTier {
  const i = QUALITY_TIERS.indexOf(tier);
  return QUALITY_TIERS[(i + 1) % QUALITY_TIERS.length] as QualityTier;
}

/**
 * Pick a starting tier from what the GPU and CPU look capable of. Deliberately
 * conservative: it is far better to start at `high` and let the player raise it
 * than to open at `ultra` and stutter on the first frame they see.
 */
export function detectQualityTier(renderer: THREE.WebGLRenderer): QualityTier {
  const maxTexture = renderer.capabilities.maxTextureSize;
  const cores = navigator.hardwareConcurrency ?? 4;

  if (maxTexture < 8192 || cores <= 2) return 'low';
  if (cores <= 4) return 'medium';
  return 'high';
}
