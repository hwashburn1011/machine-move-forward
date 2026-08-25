/**
 * Platform-carrying verification, against the real machine.
 *
 * `tests/unit/deckcarry.test.ts` measures this against a bare deck plate,
 * which is where the mechanism is clearest. This measures the same two
 * properties against the whole machine — some twenty-five colliders, hull
 * walls, tread housings and an engine room under the deck — because the
 * failure that started this was three times larger there than on a plate.
 *
 * The body oscillates and nothing else moves: no gait, no legs. That is the
 * order the spec insists on (section 10), and the reason is that a gait tuned
 * on top of a deck that drops its passengers cannot be told apart from a gait
 * that is simply wrong.
 */
import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

await page.goto('http://localhost:5173/?nolock=1&quality=low&nospawn=1&notex=1&nomodel=1&nosound=1', {
  waitUntil: 'load',
});
await page.waitForFunction(() => '__game' in globalThis, null, { timeout: 60000 });

const stats = () => page.evaluate(() => globalThis.__game.debugStats());

/** Wait for SIMULATED seconds; the software renderer runs far behind wall time. */
async function sim(seconds) {
  const start = (await stats()).simTime;
  const deadline = Date.now() + 120000;
  for (;;) {
    await page.waitForTimeout(120);
    const now = await stats();
    if (now.simTime - start >= seconds) return;
    if (Date.now() > deadline) throw new Error('sim() timed out waiting for simulated time');
  }
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

await sim(1.5);

/**
 * Start the body oscillating and record, every fixed step, where the player is
 * standing ON THE MACHINE — their world position with the pose undone. That is
 * what "standing still on a moving deck" means, and measuring it any other way
 * confuses being carried with not being carried.
 *
 * Recorded inside the page so every step is sampled; sampling from here would
 * catch a few frames a second and miss the whole thing.
 */
async function wobble({ seconds, heave, tilt, period, pitchPhase = 0, rollPhase = 0 }) {
  await page.evaluate(
    ({ heave, tilt, period, pitchPhase, rollPhase }) => {
      const g = globalThis.__game;
      const t0 = g.game.state.simTime;
      const samples = [];
      globalThis.__deck = samples;

      const untransform = (p, pose) => {
        const cp = Math.cos(pose.pitch);
        const sp = Math.sin(pose.pitch);
        const cr = Math.cos(pose.roll);
        const sr = Math.sin(pose.roll);
        const y0 = p.y - pose.heave;
        const y1 = y0 * cp + p.z * sp;
        const z1 = -y0 * sp + p.z * cp;
        return { x: p.x * cr + y1 * sr, y: -p.x * sr + y1 * cr, z: z1 };
      };

      g.game.poseSource = (simTime) => {
        const t = simTime - t0;
        // Eased in over the first cycle: a body that snaps to full tilt in one
        // step is not a gait, and the snap would be recorded as drift.
        const k = Math.min(1, t / period);
        const w = (2 * Math.PI * t) / period;
        const pose = {
          heave: k * heave * Math.sin(w),
          pitch: k * tilt * Math.sin(w + pitchPhase),
          roll: k * tilt * Math.sin(w + rollPhase),
        };
        // Sampled against the PREVIOUS pose, which is the one the player is
        // standing in at this moment.
        const p = g.player.worldPosition;
        const local = untransform({ x: p.x, y: p.y, z: p.z }, g.machine.currentPose);
        samples.push([local.x, local.y, local.z, p.y, g.player.isGrounded ? 1 : 0]);
        return pose;
      };
    },
    { heave, tilt, period, pitchPhase, rollPhase },
  );

  await sim(seconds);

  const out = await page.evaluate(() => {
    const g = globalThis.__game;
    g.game.poseSource = null;
    g.machine.setPose({ heave: 0, pitch: 0, roll: 0 });
    const s = globalThis.__deck;
    // Drop the first cycle's ease-in, and the settling step or two after the
    // body first moves.
    const from = s[Math.floor(s.length / 8)];
    let low = Infinity;
    let high = -Infinity;
    let worldLow = Infinity;
    let worldHigh = -Infinity;
    let far = 0;
    let airborne = 0;
    for (let i = Math.floor(s.length / 8); i < s.length; i++) {
      const [x, y, z, wy, g1] = s[i];
      if (y < low) low = y;
      if (y > high) high = y;
      if (wy < worldLow) worldLow = wy;
      if (wy > worldHigh) worldHigh = wy;
      const d = Math.hypot(x - from[0], z - from[2]);
      if (d > far) far = d;
      if (!g1) airborne++;
    }
    const last = s[s.length - 1];
    return {
      steps: s.length,
      heightBand: high - low,
      worldSwing: worldHigh - worldLow,
      maxWander: far,
      drift: Math.hypot(last[0] - from[0], last[2] - from[2]),
      airborne,
    };
  });

  return out;
}

// --- Walk to the bow, where pitch moves the deck most ----------------------
await page.keyboard.down('w');
await sim(1.1);
await page.keyboard.up('w');
await sim(0.4);
const spot = await page.evaluate(() => {
  const p = globalThis.__game.player.worldPosition;
  return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) };
});

// --- The body oscillates at its bounds --------------------------------------
// Harder than any gait will be: full heave and full tilt, pitch and roll a
// quarter cycle apart so the deck corkscrews rather than simply see-sawing.
const run = await wobble({
  seconds: 12,
  heave: 0.12,
  tilt: (1.5 * Math.PI) / 180,
  period: 2,
  pitchPhase: Math.PI / 2,
  rollPhase: -Math.PI / 2,
});

console.log(
  `\nstood at (${spot.x}, ${spot.z}) for ${run.steps} steps: ` +
    `height band ${run.heightBand.toFixed(4)}m, world Y swing ${run.worldSwing.toFixed(3)}m, ` +
    `wander ${run.maxWander.toFixed(4)}m, drift ${run.drift.toFixed(4)}m, ` +
    `${run.airborne} steps airborne\n`,
);

check(
  'the deck carries the player up as well as down',
  run.heightBand < 0.05,
  `height above the deck varied ${run.heightBand.toFixed(4)}m`,
);
check(
  'the player rides the body rather than standing still in the world',
  run.worldSwing > 0.1,
  `world Y swung ${run.worldSwing.toFixed(3)}m`,
);
check(
  'the player does not ratchet across the deck',
  run.drift < 0.05,
  `ended ${run.drift.toFixed(4)}m from where they started`,
);
check(
  'the player never wanders far, even mid-cycle',
  run.maxWander < 0.08,
  `furthest ${run.maxWander.toFixed(4)}m`,
);
check('the player is never thrown off the deck', run.airborne === 0, `${run.airborne} steps airborne`);

// --- And can still walk once the body is moving -----------------------------
await page.evaluate(() => {
  globalThis.__game.game.poseSource = null;
});
const before = await page.evaluate(() => {
  const p = globalThis.__game.player.worldPosition;
  return { x: p.x, z: p.z };
});
await page.keyboard.down('a');
await sim(0.5);
await page.keyboard.up('a');
await sim(0.2);
const after = await page.evaluate(() => {
  const p = globalThis.__game.player.worldPosition;
  return { x: p.x, z: p.z };
});
check(
  'the player can still walk after a spell of oscillation',
  Math.hypot(after.x - before.x, after.z - before.z) > 1.0,
  `moved ${Math.hypot(after.x - before.x, after.z - before.z).toFixed(2)}m`,
);

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
