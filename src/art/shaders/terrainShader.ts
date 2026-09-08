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
uniform float uTerrainSeed;

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
uniform float uCorridorInner;
uniform float uCorridorOuter;
/**
 * World-space dune height. One function, used for displacement, for normals,
 * and (mirrored) on the CPU for prop placement.
 *
 * The corridor term flattens the sand along the machine's track. The machine
 * is pinned to the origin at a fixed deck height and terrain carries no
 * collider, so without this, dunes would simply grow up through the deck. It
 * also reads correctly: a crawler this size ploughs its own path.
 */
float duneHeight(vec2 worldXZ) {
  vec2 p = worldXZ / uDuneScale;
  float broad = t_fbm(p, 4) * uDuneHeight;
  float ridge = (t_ridged(p * 2.1 + 31.7, 3) - 0.5) * uRidgeHeight;
  float h = broad + ridge;

  float corridor = smoothstep(uCorridorInner, uCorridorOuter, abs(worldXZ.x));
  // Flatten hard in the track, and sink it slightly so berms build at the edges.
  h = mix(h * 0.08 - 0.55, h, corridor);
  return h;
}
`;

export const TERRAIN_VERTEX_PARS = /* glsl */ `
uniform float uChunkOffset;
uniform float uChunkWorldZ;
varying vec3 vTerrainWorld;
varying vec3 vTerrainRender;
varying float vTerrainSlope;
`;

/**
 * Displace, then rebuild the normal analytically from the same height
 * function. Leaving the flat plane normal in place is the classic mistake —
 * the silhouette becomes dunes while the lighting stays a flat plane.
 */
export const TERRAIN_VERTEX_MAIN = /* glsl */ `
  // The dune field is a function of where this ground IS IN THE WORLD, not of
  // where it currently sits on screen.
  //
  // This is the difference between a landscape and a painted backdrop, and it
  // was the latter. uChunkOffset is the chunk's RENDERED z — its world
  // origin minus the distance travelled — so feeding it to the height function
  // evaluated every vertex at its own screen position and pinned the entire
  // dune field to the machine. The mesh slid through a landscape that never
  // moved. Measured by looking straight down at bare sand and correlating two
  // frames four metres apart: the ground's best-fit shift was zero rows, its
  // speed 0.00 m/s, while the machine did 7.46.
  //
  // uChunkWorldZ is the chunk's permanent world origin instead, which does
  // not move, so a dune keeps its shape while the mesh carrying it slides past.
  vec2 worldXZ = vec2(position.x, position.z + uChunkWorldZ);
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
  // Where it is on screen, which is a different question and the one that
  // anything measuring against the camera has to ask.
  vTerrainRender = vec3(position.x, transformed.y, position.z + uChunkOffset);
  vTerrainSlope = 1.0 - duneNormal.y;
`;

export const TERRAIN_FRAGMENT_PARS = /* glsl */ `
uniform float uRippleStrength;
uniform float uMacroStrength;
uniform float uRippleOrientation;
uniform vec3  uSandLit;
uniform vec3  uSandShadow;
uniform vec3  uSandDeep;
uniform vec3  uSandCrest;
uniform vec3  uSunDir;
varying vec3 vTerrainWorld;
varying vec3 vTerrainRender;
varying float vTerrainSlope;

#ifdef TERRAIN_SAND_TEXTURE
  uniform sampler2D uSandMap;
  uniform sampler2D uSandNormalMap;
  uniform sampler2D uSandArmMap;
  uniform float uSandBlotch;
  uniform float uSandGrain;
  uniform float uSandNormalStrength;
#endif
`;

/**
 * Surface detail: wind ripples, slope-driven colour, and the anisotropic glint
 * real sand shows under low sun.
 */
export const TERRAIN_FRAGMENT_MAIN = /* glsl */ `
{
  // Against the RENDERED position: the camera is in render space, and a fade
  // measured in world space would race away as the machine travelled.
  float dist = length(vTerrainRender - cameraPosition);

  // Fade high-frequency detail with distance or it aliases into shimmer.
  float detailFade = 1.0 - smoothstep(40.0, 190.0, dist);

  // --- Wind ripples ------------------------------------------------------
  // Direction comes from a broad, seeded world-space field. The old shader
  // advanced this phase with uTime, which made the sand's normal swim under
  // a stationary prop. This phase is structural and stays frozen; airborne
  // particles carry the motion cue instead.
  vec2 macroSeed = vec2(uTerrainSeed * 31.7, uTerrainSeed * -17.3);
  float orientationNoise = t_fbm(vTerrainWorld.xz * 0.0028 + macroSeed, 2);
  float rippleAngle = uRippleOrientation + orientationNoise * 0.72;
  vec2 rippleDir = normalize(vec2(cos(rippleAngle), sin(rippleAngle)));
  float along = dot(vTerrainWorld.xz, rippleDir);

  // Heavy domain warp. Without it the sinusoid reads as regular corduroy
  // rather than wind-formed sand.
  float warp = t_fbm(vTerrainWorld.xz * 0.021, 4) * 6.5
             + t_fbm(vTerrainWorld.xz * 0.085, 3) * 1.6;
  float ripple = sin(along * 1.15 + warp);
  // Sharpen: real ripples have flat troughs and defined crests.
  ripple = sign(ripple) * pow(abs(ripple), 0.65);

  // A finer second set, cross-cut and only visible up close, which gives the
  // ground detail to hold onto when the player is standing on the deck.
  vec2 fineDir = normalize(vec2(-0.42, 0.91));
  float fineWarp = t_fbm(vTerrainWorld.xz * 0.14, 2) * 2.0;
  float fine = sin(dot(vTerrainWorld.xz, fineDir) * 5.5 + fineWarp);
  ripple = mix(ripple, ripple * 0.72 + fine * 0.28, 1.0 - smoothstep(8.0, 55.0, dist));

  float rippleAmt = ripple * uRippleStrength * detailFade;

  // Perturb the normal rather than the colour — ripples are geometry, and
  // shading them is what makes them catch the sun.
  vec3 rippleWorld = normalize(vec3(rippleDir.x * rippleAmt, 1.0, rippleDir.y * rippleAmt));
  vec3 rippleView = normalize((viewMatrix * vec4(rippleWorld, 0.0)).xyz);
  vec3 upView = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  normal = normalize(normal + (rippleView - upView) * 0.45);

  // --- Slope-driven colour -----------------------------------------------
  float slope = clamp(vTerrainSlope * 2.6, 0.0, 1.0);
  float crest = smoothstep(0.30, 0.85, ripple * 0.5 + 0.5) * detailFade;

  float macro = t_fbm(vTerrainWorld.xz * 0.0065 + macroSeed, 3);
  float macroPatch = t_valueNoise(vTerrainWorld.xz * 0.011 + macroSeed + vec2(17.3, -9.1));
  vec3 sand = mix(uSandLit, uSandShadow, slope);
  sand = mix(sand, uSandDeep, smoothstep(0.55, 1.0, slope));
  sand *= 1.0 + macro * uMacroStrength + macroPatch * uMacroStrength * 0.35;
  // Wind scours crests lighter and more desaturated than the troughs.
  sand = mix(sand, uSandCrest, crest * 0.35);

  // --- Photographed sand --------------------------------------------------
  // A real scan (Poly Haven's aerial_sand, CC0), sampled in WORLD space at
  // two scales. Not bound to the material's own map slot: a chunk is 360m by
  // 64m and its UVs would stretch one tile the length of the world.
  //
  // Used as DETAIL rather than as albedo. The scan is pale desert beige and
  // this desert is deliberately not — multiplying the palette by it directly
  // would drag every art-directed colour back toward the photograph's grey.
  // So the far sample supplies large-scale blotching, the near sample supplies
  // grain as its difference from the far one, and both modulate around 1.0.
  // The hue stays the palette's; the texture only says where sand is coarser,
  // finer, scoured or banked.
#ifdef TERRAIN_SAND_TEXTURE
  vec2 grainFarUv = vTerrainWorld.xz * 0.013;
  vec2 grainNearUv = vTerrainWorld.xz * 0.14;

  const vec3 LUMA = vec3(0.299, 0.587, 0.114);
  float lumFar = dot(texture2D(uSandMap, grainFarUv).rgb, LUMA);
  float lumNear = dot(texture2D(uSandMap, grainNearUv).rgb, LUMA);

  // Patches of coarser and finer sand, tens of metres across. Not faded with
  // distance: this is the term that stops a far dune reading as flat colour.
  sand *= 1.0 + (lumFar - 0.5) * uSandBlotch;
  // Grain, as the near sample's departure from the far one. Faded with
  // distance or it aliases into shimmer, exactly like the ripples.
  sand *= 1.0 + (lumNear - lumFar) * uSandGrain * detailFade;

  // The scan's own normals, layered under the ripples in the same way — the
  // ripple perturbation above mixes a world-space vector into the normal, and
  // this follows it rather than inventing a second convention.
  vec3 grainNormal = texture2D(uSandNormalMap, grainNearUv).xyz * 2.0 - 1.0;
  vec3 grainWorld = normalize(vec3(grainNormal.x, 1.0, grainNormal.y));
  vec3 grainView = normalize((viewMatrix * vec4(grainWorld, 0.0)).xyz);
  normal = normalize(normal + (grainView - upView) * uSandNormalStrength * detailFade);

  // Roughness variation, so the glint below is not uniform across a whole
  // desert. Green channel: the ARM packing puts roughness there.
  roughnessFactor *= 1.0 + (texture2D(uSandArmMap, grainNearUv).g - 0.5) * 0.3 * detailFade;
#endif

  // Broad roughness remains visible at distance, while high-frequency map
  // detail fades in the foreground to avoid shimmer.
  roughnessFactor *=
    1.0 + t_fbm(vTerrainWorld.xz * 0.0051 + macroSeed + vec2(-13.2, 8.7), 3) * 0.09;

  diffuseColor.rgb *= sand;

  // --- Anisotropic glint --------------------------------------------------
  // Sand sparkles because individual grains catch the sun along the ripple
  // ridges. A plain specular lobe cannot do this; it needs the direction.
  vec3 viewDirW = normalize(cameraPosition - vTerrainRender);
  vec3 halfW = normalize(viewDirW + uSunDir);
  float alongHalf = abs(dot(normalize(vec3(rippleDir.x, 0.0, rippleDir.y)), halfW));
  // max() guard: alongHalf can tip a hair above 1.0 through float error,
  // and pow() with a negative base is undefined in GLSL — it returns NaN,
  // which paints the whole surface white.
  float glint = pow(max(1.0 - alongHalf, 0.0), 26.0) * crest * detailFade;
  diffuseColor.rgb += uSandCrest * glint * 0.42;
}
`;
