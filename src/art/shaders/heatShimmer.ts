import * as THREE from 'three';

/**
 * Heat shimmer.
 *
 * A screen-space UV distortion masked by SCENE DEPTH, so it plays over the
 * distant desert and leaves the machine, the player, and anything built on
 * the deck perfectly still.
 *
 * The mask used to be the pixel's height on screen, on the assumption that
 * "near the horizon line" meant "far away". In third person it does not: the
 * deck and everything standing on it sit right across the middle of the
 * frame, so the machine and its cargo rippled like everything else and the
 * whole scene read as melting. Screen position cannot tell a dune two hundred
 * metres out from a crate two metres away — only depth can.
 *
 * Kept very subtle either way: the effect sells baking heat when you
 * half-notice it and reads as a broken renderer when you do.
 */
export const HeatShimmerShader = {
  name: 'HeatShimmerShader',

  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uStrength: { value: 0.0035 },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 2000 },
    /** Metres. Nothing closer than this shimmers at all. */
    uNearFade: { value: 30 },
    /** Metres. Full strength from here out. */
    uFarFull: { value: 70 },
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
    uniform sampler2D tDepth;
    uniform float uTime;
    uniform float uStrength;
    uniform float uCameraNear;
    uniform float uCameraFar;
    uniform float uNearFade;
    uniform float uFarFull;
    varying vec2 vUv;

    /** Metres from the camera for a pixel, from the depth buffer. */
    float sceneDistance(vec2 uv) {
      float clipZ = texture2D(tDepth, uv).x;
      // Standard perspective un-projection. Returns a negative view Z, so
      // negate it for a distance. Untouched sky reads as the far plane.
      float viewZ = (uCameraNear * uCameraFar) /
                    ((uCameraFar - uCameraNear) * clipZ - uCameraFar);
      return -viewZ;
    }

    // Cheap flowing noise. Three sines at incommensurate frequencies read as
    // turbulence for a fraction of the cost of real fbm in a full-screen pass.
    float wobble(vec2 p, float t) {
      return sin(p.x * 24.0 + t * 2.3)
           + sin(p.y * 31.0 - t * 1.7)
           + sin((p.x + p.y) * 17.0 + t * 3.1);
    }

    void main() {
      // Sample the mask at the UNDISTORTED pixel. Sampling it at the offset
      // position would let a distant pixel drag a nearby one along with it,
      // smearing the machine's silhouette against the sky — the exact artefact
      // this mask exists to remove.
      float mask = smoothstep(uNearFade, uFarFull, sceneDistance(vUv));

      float offsetY = wobble(vUv, uTime) * uStrength * mask;
      float offsetX = wobble(vUv.yx * 1.3, uTime * 0.8) * uStrength * 0.4 * mask;

      vec2 uv = clamp(vUv + vec2(offsetX, offsetY), 0.0, 1.0);
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
};
