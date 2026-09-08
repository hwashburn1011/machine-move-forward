import * as THREE from 'three';

/**
 * Height-aware atmospheric fog.
 *
 * Three's built-in FogExp2 is uniform in height, which looks wrong over dunes —
 * haze should pool low and thin out with altitude. This injects a height term
 * into the standard materials via onBeforeCompile.
 *
 * The fog colour lives in ONE shared uniform object referenced by every
 * material, so retinting the whole world when the sun moves is a single
 * assignment rather than a walk over the scene graph.
 */

export interface HeightFogParams {
  /** Extinction per metre at the reference height. */
  density: number;
  /** How fast fog thins with altitude. Larger = thinner higher up. */
  heightFalloff: number;
  /** World Y at which `density` applies. */
  baseHeight: number;
}

export const DEFAULT_FOG: HeightFogParams = {
  density: 0.0042,
  heightFalloff: 0.055,
  baseHeight: 0,
};

/**
 * Shared uniforms. Every fogged material points at these exact objects, which
 * is what makes `updateFogColor` a one-line update.
 */
const fogColorUniform = { value: new THREE.Color(0.85, 0.72, 0.58) };
const fogDensityUniform = { value: DEFAULT_FOG.density };
const fogFalloffUniform = { value: DEFAULT_FOG.heightFalloff };
const fogBaseUniform = { value: DEFAULT_FOG.baseHeight };

/**
 * Fog is applied before Three's tone mapping and colour-space conversion. This keeps the
 * height blend in scene-linear space for both the HDR composer target and the
 * direct renderer bypass path.
 */
export function updateFogColor(linearColor: THREE.Color): void {
  fogColorUniform.value.copy(linearColor);
}

export function setFogParams(params: Partial<HeightFogParams>): void {
  if (params.density !== undefined) fogDensityUniform.value = params.density;
  if (params.heightFalloff !== undefined) fogFalloffUniform.value = params.heightFalloff;
  if (params.baseHeight !== undefined) fogBaseUniform.value = params.baseHeight;
}

export function getFogColor(): THREE.Color {
  return fogColorUniform.value;
}

const VERTEX_PARS = /* glsl */ `
varying vec3 vHeightFogWorldPos;
`;

const VERTEX_MAIN = /* glsl */ `
#ifdef USE_INSTANCING
  vHeightFogWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vHeightFogWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
`;

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vHeightFogWorldPos;
uniform vec3  uHeightFogColor;
uniform float uHeightFogDensity;
uniform float uHeightFogFalloff;
uniform float uHeightFogBase;
`;

const FRAGMENT_MAIN = /* glsl */ `
{
  // Distance from the camera to this fragment, in world units.
  float fogDist = length(vHeightFogWorldPos - cameraPosition);

  // Exponential height falloff: dense at deck level, thin higher up.
  float heightTerm = exp(-uHeightFogFalloff * (vHeightFogWorldPos.y - uHeightFogBase));
  float opticalDepth = uHeightFogDensity * heightTerm * fogDist;

  float fogFactor = 1.0 - exp(-max(opticalDepth, 0.0));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uHeightFogColor, clamp(fogFactor, 0.0, 1.0));
}
`;

/**
 * Give a material height fog. Safe to call on any material built from Three's
 * standard shader chunks; a no-op on raw ShaderMaterials.
 *
 * `cacheTag` matters more than it looks. Three's default
 * `customProgramCacheKey()` returns `onBeforeCompile.toString()`, and every
 * material wrapped here shares the identical arrow-function source — closures
 * do not show up in toString(). Two materials whose other parameters also
 * match therefore collide in the program cache and silently share whichever
 * program compiled first. Anything that injects its own shader code must pass
 * a distinct tag, or it will quietly render with someone else's shader.
 */
export function applyHeightFog(material: THREE.Material, cacheTag = 'heightfog'): void {
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${previousKey()}|${cacheTag}`;

  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);

    shader.uniforms.uHeightFogColor = fogColorUniform;
    shader.uniforms.uHeightFogDensity = fogDensityUniform;
    shader.uniforms.uHeightFogFalloff = fogFalloffUniform;
    shader.uniforms.uHeightFogBase = fogBaseUniform;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX_MAIN}`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      // Blend while the fragment is still scene-linear. The later
      // tone mapping and colour conversion then apply equally to geometry and
      // fog, including when the final image goes through OutputPass.
      .replace('#include <tonemapping_fragment>', `${FRAGMENT_MAIN}\n#include <tonemapping_fragment>`);
  };

  // Force a recompile if the material has already been used.
  material.needsUpdate = true;
}
