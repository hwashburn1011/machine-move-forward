/**
 * Dune terrain surface.
 *
 * Injected into MeshStandardMaterial rather than written as a bespoke shader,
 * so the dunes keep full PBR lighting, the sky IBL, and the height fog.
 *
 * The single most important rule here: all noise is sampled in WORLD space via
 * uChunkOffset, never in chunk-local space. Sampling locally makes every chunk
 * generate the same dune and produces a hard seam at every boundary.
 */

/** Shared noise, used by both the vertex displacement and the fragment detail. */
export const TERRAIN_NOISE = /* glsl */ `
float t_hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float t_valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  // Quintic smoothstep: C2 continuous, so fBm derivatives stay smooth.
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

  float a = t_hash(i);
  float b = t_hash(i + vec2(1.0, 0.0));
  float c = t_hash(i + vec2(0.0, 1.0));
  float d = t_hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}

float t_fbm(vec2 p, int octaves) {
  float sum = 0.0;
  float amp = 1.0;
  float total = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum += t_valueNoise(p) * amp;
    total += amp;
    amp *= 0.5;
    p *= 2.03; // slightly off 2.0 to avoid axis-aligned repetition
  }
  return sum / total;
}

// Ridged noise: sharp crests instead of rounded hills. This is what makes a
// dune field read as wind-formed rather than as generic rolling terrain.
float t_ridged(vec2 p, int octaves) {
  float sum = 0.0;
  float amp = 1.0;
  float total = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    float n = 1.0 - abs(t_valueNoise(p));
    sum += n * n * amp;
    total += amp;
    amp *= 0.5;
    p *= 2.03;
  }
  return sum / total;
}

uniform float uDuneScale;
uniform float uDuneHeight;
uniform float uRidgeHeight;

/** World-space dune height. One function, used for both displacement and normals. */
float duneHeight(vec2 worldXZ) {
  vec2 p = worldXZ / uDuneScale;
  float broad = t_fbm(p, 4) * uDuneHeight;
  float ridge = (t_ridged(p * 2.1 + 31.7, 3) - 0.5) * uRidgeHeight;
  return broad + ridge;
}
`;

export const TERRAIN_VERTEX_PARS = /* glsl */ `
uniform float uChunkOffset;
varying vec3 vTerrainWorld;
varying float vTerrainSlope;
`;

/**
 * Displace, then rebuild the normal analytically from the same height
 * function. Leaving the flat plane normal in place is the classic mistake —
 * the silhouette becomes dunes while the lighting stays a flat plane.
 */
export const TERRAIN_VERTEX_MAIN = /* glsl */ `
  vec2 worldXZ = vec2(position.x, position.z + uChunkOffset);
  float h = duneHeight(worldXZ);
  transformed.y += h;

  // Finite differences at a fixed epsilon, matched to the mesh resolution.
  const float E = 0.75;
  float hx = duneHeight(worldXZ + vec2(E, 0.0));
  float hz = duneHeight(worldXZ + vec2(0.0, E));
  vec3 tangentX = normalize(vec3(E, hx - h, 0.0));
  vec3 tangentZ = normalize(vec3(0.0, hz - h, E));
  vec3 duneNormal = normalize(cross(tangentZ, tangentX));

  objectNormal = duneNormal;
  #ifdef USE_TANGENT
    vObjectTangent = vec3(1.0, 0.0, 0.0);
  #endif

  vTerrainWorld = vec3(worldXZ.x, transformed.y, worldXZ.y);
  vTerrainSlope = 1.0 - duneNormal.y;
`;

export const TERRAIN_FRAGMENT_PARS = /* glsl */ `
uniform float uTime;
uniform float uRippleStrength;
uniform vec3  uSandLit;
uniform vec3  uSandShadow;
uniform vec3  uSandDeep;
uniform vec3  uSandCrest;
uniform vec3  uSunDir;
varying vec3 vTerrainWorld;
varying float vTerrainSlope;
`;

/**
 * Surface detail: wind ripples, slope-driven colour, and the anisotropic glint
 * real sand shows under low sun.
 */
export const TERRAIN_FRAGMENT_MAIN = /* glsl */ `
{
  float dist = length(vTerrainWorld - cameraPosition);

  // Fade high-frequency detail with distance or it aliases into shimmer.
  float detailFade = 1.0 - smoothstep(40.0, 190.0, dist);

  // --- Wind ripples ------------------------------------------------------
  // A directional sinusoid warped by noise, drifting slowly downwind.
  vec2 rippleDir = normalize(vec2(0.86, 0.51));
  float along = dot(vTerrainWorld.xz, rippleDir);

  // Heavy domain warp. Without it the sinusoid reads as regular corduroy
  // rather than wind-formed sand.
  float warp = t_fbm(vTerrainWorld.xz * 0.021, 4) * 6.5
             + t_fbm(vTerrainWorld.xz * 0.085, 3) * 1.6;
  float ripple = sin(along * 1.15 + warp + uTime * 0.16);
  // Sharpen: real ripples have flat troughs and defined crests.
  ripple = sign(ripple) * pow(abs(ripple), 0.65);

  // A finer second set, cross-cut and only visible up close, which gives the
  // ground detail to hold onto when the player is standing on the deck.
  vec2 fineDir = normalize(vec2(-0.42, 0.91));
  float fineWarp = t_fbm(vTerrainWorld.xz * 0.14, 2) * 2.0;
  float fine = sin(dot(vTerrainWorld.xz, fineDir) * 5.5 + fineWarp - uTime * 0.09);
  ripple = mix(ripple, ripple * 0.72 + fine * 0.28, 1.0 - smoothstep(8.0, 55.0, dist));

  float rippleAmt = ripple * uRippleStrength * detailFade;

  // Perturb the normal rather than the colour — ripples are geometry, and
  // shading them is what makes them catch the sun.
  vec3 rippleNormal = normalize(vec3(rippleDir.x * rippleAmt, 1.0, rippleDir.y * rippleAmt));
  normal = normalize(normal + rippleNormal * 0.45);

  // --- Slope-driven colour -----------------------------------------------
  float slope = clamp(vTerrainSlope * 2.6, 0.0, 1.0);
  float crest = smoothstep(0.30, 0.85, ripple * 0.5 + 0.5) * detailFade;

  vec3 sand = mix(uSandLit, uSandShadow, slope);
  sand = mix(sand, uSandDeep, smoothstep(0.55, 1.0, slope));
  // Wind scours crests lighter and more desaturated than the troughs.
  sand = mix(sand, uSandCrest, crest * 0.35);

  diffuseColor.rgb *= sand;

  // --- Anisotropic glint --------------------------------------------------
  // Sand sparkles because individual grains catch the sun along the ripple
  // ridges. A plain specular lobe cannot do this; it needs the direction.
  vec3 viewDirW = normalize(cameraPosition - vTerrainWorld);
  vec3 halfW = normalize(viewDirW + uSunDir);
  float alongHalf = abs(dot(normalize(vec3(rippleDir.x, 0.0, rippleDir.y)), halfW));
  float glint = pow(1.0 - alongHalf, 26.0) * crest * detailFade;
  diffuseColor.rgb += uSandCrest * glint * 0.42;
}
`;
