// Ports the sky fragment math to JS so values can be inspected directly
// instead of guessed at from screenshots.
const RB = [5.8e-6, 13.5e-6, 33.1e-6];
const MB = 21e-6;

const P = {
  turbidity: 4.2,
  rayleigh: 1.35,
  mieCoefficient: 0.019,
  g: 0.76,
  dustAmount: 1.0,
  dustColor: srgbToLinear([0xda / 255, 0xa0 / 255, 0x6a / 255]),
  exposure: 0.16,
  rayleighScale: 0.5e5,
  rayleighGain: 52,
  mieGain: 1.6,
  dustGain: 4.2,
  horizonPow: 3.5,
};

function srgbToLinear(c) {
  return c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
}
function smoothstep(e0, e1, x) {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}
// Narkowicz ACES approximation — close enough to judge hue and saturation.
function aces(x) {
  const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return Math.min(Math.max((x * (a * x + b)) / (x * (c * x + d) + e), 0), 1);
}
function toSrgb(v) {
  return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
}

function skyColor(dir, sunDir, p = P) {
  const horizon = Math.max(dir[1], -0.05);
  const zenithAngle = Math.acos(Math.min(Math.max(horizon, 0), 1));
  const deg = (zenithAngle * 180) / Math.PI;
  const denom = Math.cos(zenithAngle) + 0.15 * Math.max(93.885 - deg, 1e-3) ** -1.253;
  const od = 1 / Math.max(denom, 1e-3);

  const sunEl = Math.min(Math.max(sunDir[1], -0.2), 1);
  const lowSun = 1 - smoothstep(-0.05, 0.35, sunEl);

  const cosT = dir[0] * sunDir[0] + dir[1] * sunDir[1] + dir[2] * sunDir[2];
  const rPhase = (3 / (16 * Math.PI)) * (1 + cosT * cosT);
  const g2 = p.g * p.g;
  const hgDen = 1 + g2 - 2 * p.g * cosT;
  const mPhase = (1 / (4 * Math.PI)) * ((1 - g2) / Math.max(hgDen, 1e-4) ** 1.5);

  let sky = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const rAtt = Math.exp(-RB[i] * p.rayleigh * p.rayleighScale * od);
    const mAtt = Math.exp(-MB * p.mieCoefficient * p.turbidity * 1e5 * od);
    const fade = 1 + (0.3 - 1) * smoothstep(1.5, 14.0, od);
    sky[i] = (1 - rAtt) * rPhase * p.rayleighGain * fade + (1 - mAtt) * mPhase * p.mieGain;
  }

  const horizonBand = (1 - Math.min(Math.max(horizon, 0), 1)) ** p.horizonPow;
  let dust = horizonBand * p.dustAmount * (0.80 + 0.60 * lowSun);
  dust *= 0.85 + 0.35 * smoothstep(-0.2, 1.0, cosT);
  dust = Math.min(dust, 0.92);
  for (let i = 0; i < 3; i++) {
    sky[i] = sky[i] * (1 - dust) + p.dustColor[i] * p.dustGain * dust;
  }

  return sky.map((v) => v * p.exposure);
}

function report(label, dir, sunDir) {
  const lin = skyColor(dir, sunDir);
  const tm = lin.map(aces);
  const rgb = tm.map(toSrgb);
  const max = Math.max(...tm);
  const min = Math.min(...tm);
  const sat = max === 0 ? 0 : (max - min) / max;
  console.log(
    `${label.padEnd(22)} linear=[${lin.map((v) => v.toFixed(3)).join(', ')}]  ` +
      `srgb=(${rgb.join(',')})  sat=${sat.toFixed(2)}`,
  );
}

const sun = [0.4, 0.62, -0.68];
const n = Math.hypot(...sun);
const sunDir = sun.map((v) => v / n);

console.log('sun elevation:', sunDir[1].toFixed(3));
console.log('elevation sweep, facing AWAY from sun:');
for (const el of [-0.03, 0.0, 0.02, 0.05, 0.1, 0.15, 0.25, 0.4, 0.6, 1.0]) {
  const h = Math.sqrt(Math.max(0, 1 - el * el));
  report('  y=' + el.toFixed(2), [-0.7 * h, el, 0.71 * h], sunDir);
}
