import * as THREE from 'three';

/**
 * Final colour grade, film grain, and vignette in one pass.
 *
 * Deliberately combined: each extra full-screen pass costs real bandwidth for
 * what is only a handful of arithmetic ops.
 *
 * The grade is where the art direction's warm-highlight / cool-shadow split
 * gets enforced globally, on top of what the lighting already does.
 */
export const ColorGradeShader = {
  name: 'ColorGradeShader',

  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    /** Tint pushed into the shadows. Cool, to oppose the sand. */
    uShadowTint: { value: new THREE.Color(0.36, 0.34, 0.52) },
    /** Tint pushed into the highlights. Warm ochre. */
    uHighlightTint: { value: new THREE.Color(1.06, 0.98, 0.86) },
    uShadowStrength: { value: 0.16 },
    uHighlightStrength: { value: 0.2 },
    uSaturation: { value: 1.1 },
    uContrast: { value: 1.05 },
    uGrain: { value: 0.028 },
    uVignette: { value: 0.22 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec3  uShadowTint;
    uniform vec3  uHighlightTint;
    uniform float uShadowStrength;
    uniform float uHighlightStrength;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uGrain;
    uniform float uVignette;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;

      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));

      // Split tone: shadows toward violet, highlights toward warm ochre. This
      // is most of what makes the image read as hot desert sun rather than
      // just "orange".
      float shadowMask = 1.0 - smoothstep(0.0, 0.5, luma);
      float highlightMask = smoothstep(0.35, 1.0, luma);
      c = mix(c, c * uShadowTint, shadowMask * uShadowStrength);
      c = mix(c, c * uHighlightTint, highlightMask * uHighlightStrength);

      // Saturation and contrast about mid grey.
      c = mix(vec3(luma), c, uSaturation);
      c = (c - 0.5) * uContrast + 0.5;

      // Vignette, measured on a corrected aspect so it stays circular.
      vec2 v = (vUv - 0.5) * vec2(1.0, 0.62);
      float vig = 1.0 - dot(v, v) * uVignette * 4.0;
      c *= clamp(vig, 0.0, 1.0);

      // Grain, animated so it does not read as a dirty lens.
      float g = hash(vUv * 1024.0 + fract(uTime) * 91.7) - 0.5;
      // Weight toward the midtones: grain in blown highlights or crushed
      // blacks just looks like noise.
      c += g * uGrain * (1.0 - abs(luma - 0.5) * 1.4);

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
    }
  `,
};
