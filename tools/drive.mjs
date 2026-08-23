/**
 * Player movement verification.
 *
 * Drives the real game with real key events and asserts on the resulting
 * physics state, so "the player can walk on the machine" is measured rather
 * than assumed.
 */
import { chromium } from '@playwright/test';

const outShot = process.argv[2] ?? null;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
// Small viewport: the software renderer is the bottleneck, and this test
// cares about physics, not pixels.
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

await page.goto('http://localhost:5173/?nolock=1&quality=low', { waitUntil: 'load' });
const stats = () => page.evaluate(() => globalThis.__game.debugStats());

/**
 * Wait for a number of SIMULATED seconds. The headless renderer runs at a few
 * frames per second, so the loop's step clamp lets simulated time lag wall
 * time badly. Waiting on wall time here would measure the GPU, not the game.
 */
async function sim(seconds) {
  const start = (await stats()).simTime;
  const deadline = Date.now() + 60000;
  for (;;) {
    await page.waitForTimeout(120);
    const now = await stats();
    if (now.simTime - start >= seconds) return;
    if (Date.now() > deadline) throw new Error('sim() timed out waiting for simulated time');
  }
}

await sim(1.5);
const pos = () =>
  page.evaluate(() => {
    const p = globalThis.__game.player.worldPosition;
    return { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) };
  });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

// --- Settle -----------------------------------------------------------------
const settled = await pos();
const s0 = await stats();
check('player settles on the deck', s0.grounded === true, `y=${settled.y} grounded=${s0.grounded}`);

await sim(0.7);
const settled2 = await pos();
check(
  'player does not sink or drift while idle',
  Math.abs(settled2.y - settled.y) < 0.01,
  `dy=${(settled2.y - settled.y).toFixed(4)}`,
);

// --- Walk -------------------------------------------------------------------
const before = await pos();
await page.keyboard.down('w');
await sim(0.9);
await page.keyboard.up('w');
await sim(0.15);
const after = await pos();
const walked = Math.hypot(after.x - before.x, after.z - before.z);
check('W moves the player', walked > 3.0, `moved ${walked.toFixed(2)}m`);
check(
  'player stays on the deck while walking',
  Math.abs(after.y - before.y) < 0.35,
  `y ${before.y} -> ${after.y}`,
);

// --- Strafe -----------------------------------------------------------------
const b2 = await pos();
await page.keyboard.down('d');
await sim(0.6);
await page.keyboard.up('d');
await sim(0.15);
const a2 = await pos();
const strafed = Math.hypot(a2.x - b2.x, a2.z - b2.z);
check('D strafes the player', strafed > 2.0, `moved ${strafed.toFixed(2)}m`);

// --- Jump -------------------------------------------------------------------
const groundY = (await pos()).y;
await page.keyboard.down('Space');
await sim(0.08);
await page.keyboard.up('Space');
await sim(0.2);
const apex = await pos();
check('Space raises the player', apex.y > groundY + 0.3, `y ${groundY} -> ${apex.y}`);

await sim(1.2);
const landed = await pos();
const landedStats = await stats();
check(
  'player lands again',
  landedStats.grounded === true && Math.abs(landed.y - groundY) < 0.2,
  `y=${landed.y} grounded=${landedStats.grounded}`,
);

// --- Collision --------------------------------------------------------------
// Walk hard into the prow block; the player must be stopped by it.
await page.evaluate(() => globalThis.__game.player.teleport({ x: 0, y: 3.8, z: -5.0 }));
await sim(0.4);
await page.keyboard.down('w');
await sim(2.2);
await page.keyboard.up('w');
await sim(0.15);
const blocked = await pos();
check('machine structures block the player', blocked.z > -8.6, `z=${blocked.z} (deck ends at -8)`);

// --- Falling off ------------------------------------------------------------
await page.evaluate(() => globalThis.__game.player.teleport({ x: 40, y: 6, z: 0 }));
await sim(2.5);
const respawned = await pos();
check(
  'falling off the machine respawns the player on deck',
  Math.abs(respawned.x) < 3 && respawned.y > 0,
  `x=${respawned.x} y=${respawned.y}`,
);

if (outShot) await page.screenshot({ path: outShot });
await browser.close();

const failed = results.filter((r) => !r.ok);
if (errors.length) {
  console.log(`\n${errors.length} CONSOLE ERROR(S):`);
  for (const e of errors.slice(0, 8)) console.log(' -', e);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length || errors.length) process.exitCode = 1;
