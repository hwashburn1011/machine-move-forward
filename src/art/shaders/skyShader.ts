/**
 * Procedural desert sky.
 *
 * A stylised Rayleigh + Mie scattering model with an added low-altitude dust
 * term. The dust is what makes this read as *desert* sky rather than temperate
 * sky, so it is deliberately stronger than physical accuracy would suggest.
 *
 * The same maths is mirrored on the CPU in Sky.ts so the sun light colour and
 * the fog colour can be sampled from it. Mismatched sky and fog is the most
 * common tell of a fake-looking outdoor scene.
 */

export const SKY_VERTEX = /* glsl */ `
varying vec3 vWorldDirection;

void main() {
  // Direction from the camera to this vertex, in world space.
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldDirection = normalize(worldPosition.xyz - cameraPosition);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // Force the dome to the far plane so nothing can ever draw behind it.
  gl_Position.z = gl_Position.w;
}
`;

export const SKY_FRAGMENT = /* glsl */ `
precision highp float;

varying vec3 vWorldDirection;

uniform vec3  uSunDirection;
uniform float uTurbidity;
uniform float uRayleigh;
uniform float uMieCoefficient;
uniform float uMieDirectionalG;
uniform float uDustAmount;
uniform vec3  uDustColor;
uniform float uExposure;
uniform float uSunIntensity;

const float PI = 3.141592653589793;

// Wavelength-dependent Rayleigh scattering, scaled for stylisation rather
// than physical accuracy — real values are far too blue for this palette.
const vec3 RAYLEIGH_BETA = vec3(5.8e-6, 13.5e-6, 33.1e-6);
const vec3 MIE_BETA = vec3(21e-6);

// Rayleigh phase: symmetric forward/back scatter.
float rayleighPhase(float cosTheta) {
  return (3.0 / (16.0 * PI)) * (1.0 + cosTheta * cosTheta);
}

// Henyey-Greenstein: strong forward scatter, gives the aureole around the sun.
float hgPhase(float cosTheta, float g) {
  float g2 = g * g;
  float denom = 1.0 + g2 - 2.0 * g * cosTheta;
  return (1.0 / (4.0 * PI)) * ((1.0 - g2) / pow(max(denom, 1e-4), 1.5));
}

void main() {
  vec3 dir = normalize(vWorldDirection);
  vec3 sunDir = normalize(uSunDirection);

  // Height above the horizon, softly clamped so we can shade below it too
  // (the camera can sit above dunes and see a little "under" the dome).
  float horizon = max(dir.y, -0.05);
  float zenithAngle = acos(clamp(horizon, 0.0, 1.0));

  // Optical depth: how much atmosphere this ray travels through. Grows sharply
  // toward the horizon, which is what reddens sunsets.
  float denom = cos(zenithAngle) + 0.15 * pow(max(93.885 - degrees(zenithAngle), 1e-3), -1.253);
  float opticalDepth = 1.0 / max(denom, 1e-3);

  float sunElevation = clamp(sunDir.y, -0.2, 1.0);
  // Sun sitting low thickens the air and pushes everything warm.
  float lowSun = 1.0 - smoothstep(-0.05, 0.35, sunElevation);

  // Scale kept low deliberately: pushing it higher drives red toward
  // saturation along with blue, and the zenith goes pale grey instead of blue.
  vec3 rayleighAtten = exp(-RAYLEIGH_BETA * uRayleigh * 0.5e5 * opticalDepth);
  vec3 mieAtten = exp(-MIE_BETA * uMieCoefficient * uTurbidity * 1e5 * opticalDepth);

  float cosTheta = dot(dir, sunDir);
  float rPhase = rayleighPhase(cosTheta);
  float mPhase = hgPhase(cosTheta, uMieDirectionalG);

  // In-scattered light: blue from Rayleigh, white-gold halo from Mie.
  // Mie is kept on a short leash — it is a forward-scatter spike, and letting
  // it run wide washes the entire sun half of the sky to flat white.
  vec3 rayleighColor = (1.0 - rayleighAtten) * rPhase * 52.0;

  // At high optical depth every channel saturates toward 1 and the horizon
  // glows white, drowning the dust. Fade the in-scatter back down so warm
  // haze — not blown-out Rayleigh — owns the bottom of the sky.
  rayleighColor *= mix(1.0, 0.30, smoothstep(1.5, 14.0, opticalDepth));
  vec3 mieColor = (1.0 - mieAtten) * mPhase * 1.6;

  vec3 sky = (rayleighColor + mieColor) * uSunIntensity;

  // --- Desert dust -------------------------------------------------------
  // A thick warm haze hugging the horizon. Strongest in the lowest ~8 degrees,
  // and stronger still when the sun is low. This is the desert signature.
  float horizonBand = pow(1.0 - clamp(horizon, 0.0, 1.0), 3.5);
  float dust = horizonBand * uDustAmount * (0.80 + 0.60 * lowSun);
  // Dust also scatters forward, so it brightens toward the sun.
  dust *= 0.85 + 0.35 * smoothstep(-0.2, 1.0, cosTheta);
  // Dust must be BRIGHTER than the sky it replaces. A dusty horizon is
  // luminous; mixing toward a dim colour paints a dark band instead of haze.
  vec3 dustLit = uDustColor * uSunIntensity * 4.2;
  sky = mix(sky, dustLit, clamp(dust, 0.0, 0.92));

  // --- Sun disc ----------------------------------------------------------
  // ~0.53 degrees of angular diameter, with a soft limb and a wide aureole.
  float sunAngle = acos(clamp(cosTheta, -1.0, 1.0));
  float discSize = 0.0093;
  float disc = 1.0 - smoothstep(discSize * 0.82, discSize * 1.5, sunAngle);
  // Tight aureole. A broad one reads as lens haze, not atmosphere.
  float aureole = pow(max(cosTheta, 0.0), 3000.0) * 0.40
                + pow(max(cosTheta, 0.0), 220.0) * 0.07;

  // Redden the disc as it approaches the horizon, and never let it reach pure
  // white before bloom — a clipped disc blooms into a shapeless blob.
  vec3 discColor = mix(vec3(1.0, 0.96, 0.86), vec3(1.0, 0.55, 0.28), lowSun);
  sky += discColor * (disc * 9.0 + aureole * 2.2) * uSunIntensity;

  // Ground haze below the horizon line so the dome never shows a hard edge.
  float below = smoothstep(0.0, -0.06, dir.y);
  sky = mix(sky, uDustColor * uSunIntensity * 5.0, below * 0.9);

  sky *= uExposure;

  gl_FragColor = vec4(max(sky, vec3(0.0)), 1.0);

  // A raw ShaderMaterial does not get these for free the way built-in
  // materials do — without them the sky is written as linear values into an
  // sRGB buffer and reads dark and desaturated.
  //
  // These also self-adjust: once the post chain takes tone mapping over, the
  // renderer reports NoToneMapping and the include becomes a pass-through, so
  // the sky correctly emits raw HDR into the composer's float target.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
