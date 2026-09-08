/**
 * Player movement verification.
 *
 * Drives the real game with real key events and asserts on the resulting
 * physics state, so "the player can walk on the machine" is measured rather
 * than assumed.
 */
import { chromium } from '@playwright/test';
import { BASE_URL } from './base-url.mjs';

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
// `nomenu=1` boots past the title screen and the opening, straight into
// gameplay — which is the boot every check below was written against.
await page.goto(`${BASE_URL}/?nolock=1&nomenu=1&quality=low&nospawn=1&notex=1&nomodel=1&nosound=1`, { waitUntil: 'load' });

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

// --- Footfalls in the sand -------------------------------------------------
// The last unasserted criterion of the walker spec (section 11.5): prints
// appear in the sand UNDER THE FEET THAT MADE THEM, at the moment they land,
// and not on a fixed interval down each flank the way the tread tracks were.
//
// Measured at the press itself. Nothing outside the render loop can see a
// plant -- it is a cycle boundary crossed between two frames -- so `press` is
// wrapped for the duration of this section and asked, each time it fires,
// where all four feet are. Note the restore: `Machine.footPosition` hands back
// a shared scratch vector, and the vector `press` was called with IS that
// scratch, so reading the other three feet overwrites the caller's argument.
// The dust burst that follows the press reads it again.
await page.evaluate(() => {
  const g = globalThis.__game.game;
  globalThis.__prints = [];
  const original = g.tracks.press.bind(g.tracks);
  g.tracks.press = (at) => {
    const px = at.x;
    const py = at.y;
    const pz = at.z;
    const feet = [];
    for (let i = 0; i < 4; i++) {
      const f = g.machine.footPosition(i);
      feet.push({ x: f.x, z: f.z });
    }
    at.x = px;
    at.y = py;
    at.z = pz;
    globalThis.__prints.push({ x: px, z: pz, feet, distance: g.world.distanceTraveled });
    original(at);
  };
});

const printStart = (await stats()).distance;
await sim(4);
const printEnd = (await stats()).distance;
const prints = await page.evaluate(() => globalThis.__prints);

check('the machine presses footfalls as it walks', prints.length > 0, `${prints.length} prints`);

// Exact, not near: the print is pressed AT a foot's position, so any distance
// at all between them means it was pressed somewhere else.
const misplaced = prints.filter(
  (p) => !p.feet.some((f) => Math.hypot(f.x - p.x, f.z - p.z) < 1e-9),
);
check(
  'every footfall is pressed under one of the four feet',
  prints.length > 0 && misplaced.length === 0,
  misplaced.length === 0
    ? `all ${prints.length} sit on a foot`
    : `${misplaced.length} of ${prints.length} elsewhere, first at (${misplaced[0].x.toFixed(2)}, ${misplaced[0].z.toFixed(2)})`,
);

// A tread laid a mark every SPACING metres. A leg plants once per stride, and
// there are four of them, so the rate is a property of the GAIT -- which is
// the distinction this whole change was about. STRIDE_LENGTH is 6.6m.
const walkedFor = printEnd - printStart;
const expected = (walkedFor / 6.6) * 4;
check(
  'footfalls come at the gait rate, not a fixed spacing',
  walkedFor > 5 && Math.abs(prints.length - expected) <= 4,
  `${prints.length} prints over ${walkedFor.toFixed(1)}m, expected about ${expected.toFixed(1)}`,
);

// And each of the four legs is laying its own, rather than one leg laying all
// of them -- which is what a print that follows the machine instead of the
// foot would look like.
const sides = new Set(prints.map((p) => `${p.x > 0 ? 'S' : 'P'}${p.z > 0 ? 'A' : 'F'}`));
check(
  'all four feet leave prints, in their own quarters',
  sides.size === 4,
  `quarters seen: ${[...sides].sort().join(' ')}`,
);

// Glued to the sand, not to the machine. A live print moves astern by exactly
// what the world moves, which is the property that makes a trail read as
// ground the machine has crossed rather than as a decal dragged along with it.
//
// The NEWEST live print, not the first in pool order: the first is the oldest,
// it is metres from retiring, and a print that retires mid-measurement stops
// moving and reads as slipping. That is how this check first passed while
// measuring nothing.
//
// "Newest" is the LEAST ASTERN, and astern is `WORLD_Z_PER_METRE`'s to say. It
// was written as "greatest z", which is the same thing only while the world
// scrolls one particular way -- and picked the oldest print the moment that
// changed.
const glue = await page.evaluate(() => {
  const g = globalThis.__game.game;
  const s = globalThis.__game.WORLD_Z_PER_METRE;
  const live = g.tracks.marks.filter((m) => m.live);
  if (live.length === 0) return null;
  const mark = live.reduce((a, b) => (b.z * s < a.z * s ? b : a));
  globalThis.__glue = { mark, z0: mark.z, d0: g.world.distanceTraveled, s };
  return true;
});
await sim(2);
const slip = await page.evaluate(() => {
  const g = globalThis.__game.game;
  const { mark, z0, d0, s } = globalThis.__glue;
  return {
    // Both in "metres astern", so the comparison below is a single number
    // whichever way the machine faces.
    moved: (mark.z - z0) * s,
    walked: g.world.distanceTraveled - d0,
    live: mark.live,
  };
});
check(
  'a pressed print stays with the sand it was pressed into',
  glue !== null && slip.live && slip.walked > 1 && Math.abs(slip.moved - slip.walked) < 0.2,
  glue === null
    ? 'no live prints'
    : `print moved ${slip.moved.toFixed(2)}m astern while the world moved ${slip.walked.toFixed(2)}m, still live=${slip.live}`,
);

await page.evaluate(() => {
  globalThis.__game.game.tracks.press = Object.getPrototypeOf(
    globalThis.__game.game.tracks,
  ).press;
});

if (outShot) await page.screenshot({ path: outShot });
await browser.close();

const failed = results.filter((r) => !r.ok);
if (errors.length) {
  console.log(`\n${errors.length} CONSOLE ERROR(S):`);
  for (const e of errors.slice(0, 8)) console.log(' -', e);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length || errors.length) process.exitCode = 1;
