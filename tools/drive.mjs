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

// Arrivals are tested in tools/combat.mjs and nowhere else: everywhere else
// they would wander into a check that was written on a quiet deck.
await page.goto('http://localhost:5173/?nolock=1&quality=low&nospawn=1&notex=1&nomodel=1', { waitUntil: 'load' });

// `load` fires before `main.ts`'s top-level await settles, so the handle the
// checks below reach for is not there yet.
await page.waitForFunction(() => '__game' in globalThis, null, { timeout: 60000 });
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

/**
 * Height above the deck, not height in the world.
 *
 * The machine walks now: the deck heaves and tilts under a standing player by
 * design, so their absolute Y is supposed to move. What must not move is where
 * they are standing ON the deck, which is their world position with the body's
 * pose undone.
 */
const deckHeight = () =>
  page.evaluate(() => {
    const p = globalThis.__game.player.worldPosition;
    const pose = globalThis.__game.machine.currentPose;
    const cp = Math.cos(pose.pitch);
    const sp = Math.sin(pose.pitch);
    const cr = Math.cos(pose.roll);
    const sr = Math.sin(pose.roll);
    const y0 = p.y - pose.heave;
    const y1 = y0 * cp + p.z * sp;
    return +(-p.x * sr + y1 * cr).toFixed(4);
  });

const rested = await deckHeight();
await sim(0.7);
const rested2 = await deckHeight();
check(
  'player does not sink or drift while idle',
  Math.abs(rested2 - rested) < 0.02,
  `height above the deck ${rested} -> ${rested2}`,
);

// --- Walk -------------------------------------------------------------------
const before = await pos();
await page.keyboard.down('w');
await sim(0.9);
await page.keyboard.up('w');
await sim(0.15);
const after = await pos();
const afterDeck = await deckHeight();
const walked = Math.hypot(after.x - before.x, after.z - before.z);
check('W moves the player', walked > 3.0, `moved ${walked.toFixed(2)}m`);
check(
  'player stays on the deck while walking',
  Math.abs(afterDeck - rested2) < 0.1,
  `height above the deck ${rested2} -> ${afterDeck}`,
);

// --- Strafe -----------------------------------------------------------------
const b2 = await pos();
await page.keyboard.down('d');
await sim(0.6);
await page.keyboard.up('d');
await sim(0.15);
const a2 = await pos();
const strafed = Math.hypot(a2.x - b2.x, a2.z - b2.z);
// Less far than it used to go: the deck rails are solid now, so a strafe that
// used to walk out over the edge stops against them, which is their job.
check('D strafes the player', strafed > 1.5, `moved ${strafed.toFixed(2)}m`);

// --- Jump -------------------------------------------------------------------
// Measured above the DECK throughout. The machine walks, so its deck heaves by
// up to 0.1m either way on its own, and against absolute world height a jump
// that started on a rising deck and ended on a falling one looks like a
// failure to land. Which it is not: what "landed" means is back at the height
// you jumped from RELATIVE TO THE THING YOU JUMPED OFF.
const beforeJump = await deckHeight();
await page.keyboard.down('Space');
await sim(0.08);
await page.keyboard.up('Space');
await sim(0.2);
const apex = await deckHeight();
check(
  'Space raises the player',
  apex > beforeJump + 0.3,
  `height above the deck ${beforeJump} -> ${apex}`,
);

await sim(1.2);
const landed = await deckHeight();
const landedStats = await stats();
check(
  'player lands again',
  landedStats.grounded === true && Math.abs(landed - beforeJump) < 0.05,
  `height above the deck ${beforeJump} -> ${landed}, grounded=${landedStats.grounded}`,
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
// The desert is solid now, so this is no longer "fall through the world and be
// respawned by the threshold". Step off the side and you LAND on the sand, and
// then the machine drives away and leaves you standing on it.
await page.evaluate(() => globalThis.__game.player.teleport({ x: 40, y: 6, z: 0 }));
await sim(2.0);
const off = await page.evaluate(() => {
  const g = globalThis.__game;
  const p = g.player.worldPosition;
  return { y: +p.y.toFixed(2), z: +p.z.toFixed(1), grounded: g.player.isGrounded, hp: g.player.stats.health };
});
check(
  'stepping off the machine lands on the desert rather than through it',
  off.grounded === true && off.y > -1 && off.y < 2 && off.hp === 100,
  `y=${off.y} grounded=${off.grounded} hp=${off.hp}`,
);

await sim(1.5);
const swept = await page.evaluate(() => +globalThis.__game.player.worldPosition.z.toFixed(1));
check(
  'and the machine drives off and leaves them behind',
  Math.abs(swept - off.z) > 6,
  `z ${off.z} -> ${swept}`,
);

// The machine cruises at exactly sprint speed, so there is no catching it.
// Being left out there resolves rather than stranding the player in an empty
// desert waiting to slide off the edge of the world.
await sim(2.5);
const lost = await page.evaluate(() => ({
  hp: globalThis.__game.player.stats.health,
  dead: globalThis.__game.game.state.playerDead,
}));
check('the desert claims a player it was left with', lost.hp === 0, `hp=${lost.hp}`);

await sim(4.5);
const back = await page.evaluate(() => {
  const g = globalThis.__game;
  const p = g.player.worldPosition;
  return { y: +p.y.toFixed(2), hp: g.player.stats.health };
});
check(
  'and puts them back on the deck, whole',
  back.hp === 100 && back.y > 3,
  `y=${back.y} hp=${back.hp}`,
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
