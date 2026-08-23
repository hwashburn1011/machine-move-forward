import * as THREE from 'three';

/**
 * Heat shimmer.
 *
 * A screen-space UV distortion that ramps in toward the horizon line and
 * leaves the deck alone. Kept very subtle — the effect sells baking heat when
 * you half-notice it and reads as a broken renderer when you do.
 */
export const HeatShimmerShader = {
  name: 'HeatShimmerShader',

  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uStrength: { value: 0.0035 },
    /** Screen Y (0 bottom, 1 top) where the shimmer is strongest. */
    uHorizon: { value: 0.52 },
    uBand: { value: 0.3 },
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
    uniform float uStrength;
    uniform float uHorizon;
    uniform float uBand;
    varying vec2 vUv;

    // Cheap flowing noise. Three sines at incommensurate frequencies read as
    // turbulence for a fraction of the cost of real fbm in a full-screen pass.
    float wobble(vec2 p, float t) {
      return sin(p.x * 24.0 + t * 2.3)
           + sin(p.y * 31.0 - t * 1.7)
           + sin((p.x + p.y) * 17.0 + t * 3.1);
    }

    void main() {
      // Concentrate on the horizon band; the deck the player stands on must
      // stay rock steady or the whole image feels unstable.
      float d = abs(vUv.y - uHorizon);
      float mask = 1.0 - smoothstep(0.0, uBand, d);
      mask *= mask;

      float offsetY = wobble(vUv, uTime) * uStrength * mask;
      float offsetX = wobble(vUv.yx * 1.3, uTime * 0.8) * uStrength * 0.4 * mask;

      vec2 uv = clamp(vUv + vec2(offsetX, offsetY), 0.0, 1.0);
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
};
