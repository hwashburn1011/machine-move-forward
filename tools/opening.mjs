/**
 * The opening, measured.
 *
 * The plan's whole argument for the rooftop is that the leap is clearable
 * from a running jump — and an argument like that is worth exactly as much as
 * the harness that checks it. So this drives the real game through the real
 * opening: the chase, the jump, the landing, and the machine winding up
 * underneath the player. Then the two ways it can go wrong: falling short,
 * and skipping.
 *
 * Three pages rather than one. Each path needs the opening to start over, and
 * `begin` is deliberately one-shot — a director that could be re-begun would
 * be a director that could replay the opening in a finished game.
 *
 * Everything waits on SIMULATED time. Under the software renderer the loop's
 * step clamp lets simulated time lag wall time badly, and wall-clock waits
 * would measure the GPU rather than the game.
 */
import { chromium } from '@playwright/test';
import { BASE_URL } from './base-url.mjs';

const outShot = process.argv[2] ?? null;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const errors = [];
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

/** `opening=1` forces the rooftop opening past `nomenu`, for exactly this. */
const BOOT = '?opening=1&nomenu=1&nolock=1&quality=low&notex=1&nomodel=1&nosound=1';

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  await page.goto(`${BASE_URL}/${BOOT}`, { waitUntil: 'load' });
  // `load` fires before `main.ts`'s top-level await settles.
  await page.waitForFunction(() => '__game' in globalThis, null, { timeout: 60000 });
  return page;
}

const statsOf = (page) => page.evaluate(() => globalThis.__game.debugStats());

async function sim(page, seconds) {
  const start = (await statsOf(page)).simTime;
  const deadline = Date.now() + 90000;
  for (;;) {
    await page.waitForTimeout(120);
    const now = await statsOf(page);
    if (now.simTime - start >= seconds) return;
    if (Date.now() > deadline) throw new Error('sim() timed out waiting for simulated time');
  }
}

const posOf = (page) =>
  page.evaluate(() => {
    const p = globalThis.__game.player.worldPosition;
    return { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) };
  });

/** Wait for the opening to reach a phase, or give up and report where it got. */
async function waitForPhase(page, phase, seconds) {
  const start = (await statsOf(page)).simTime;
  for (;;) {
    const s = await statsOf(page);
    if (s.opening === phase) return s;
    if (s.simTime - start > seconds) return s;
    await page.waitForTimeout(120);
  }
}

// ===========================================================================
// 1. The happy path
// ===========================================================================
const page = await openPage();

// The scavengers' landing marks, read before they have had a chance to move.
// `boot()` runs before `start()`, so by the time `__game` exists they are
// already up here — which makes this the only moment the spawn marks can be
// observed rather than assumed.
const spawnMarks = await page.evaluate(() =>
  globalThis.__game.enemies.active.map((e) => ({
    x: e.worldPosition.x,
    z: e.worldPosition.z,
  })),
);

await sim(page, 1.0);

const start = await statsOf(page);
const startPos = await posOf(page);
check(
  'the opening starts on the rooftop',
  start.opening === 'rooftop',
  `phase=${start.opening}`,
);
check(
  'and it puts the player on the roof, well clear of the deck',
  startPos.x > 6 && startPos.y > 5,
  `player at (${startPos.x}, ${startPos.y}, ${startPos.z})`,
);
check(
  'the player is grounded on it rather than falling past it',
  start.grounded === true,
  `grounded=${start.grounded} y=${startPos.y}`,
);
check('the player is unarmed up there', start.armed === false, `armed=${start.armed}`);

// The machine idles alongside, which is what makes the roof solid unmoving
// ground and saves the whole moving-platform problem.
await sim(page, 2.5);
const idling = await statsOf(page);
check(
  'the machine waits at idle rather than walking off without them',
  idling.speed < 0.6,
  `machine speed ${idling.speed} m/s`,
);

// The chase. Two scavengers, and they have to actually leave their marks and
// arrive — measured against the spawn marks rather than against a gap sampled
// mid-run, because a scavenger that has already closed to `attackRange` and
// stopped to swing is a scavenger whose gap is no longer moving. That is the
// chase working, and it read as the chase failing.
check('two scavengers come up after them', spawnMarks.length === 2, `${spawnMarks.length} aboard`);

await sim(page, 1.6);
const chase = await page.evaluate((marks) => {
  const g = globalThis.__game;
  const p = g.player.worldPosition;
  return g.enemies.active.map((e, i) => ({
    state: e.aiState,
    walked: Math.hypot(
      e.worldPosition.x - (marks[i]?.x ?? 0),
      e.worldPosition.z - (marks[i]?.z ?? 0),
    ),
    toPlayer: Math.hypot(e.worldPosition.x - p.x, e.worldPosition.z - p.z),
  }));
}, spawnMarks);

const moved = chase.filter((c) => c.walked > 1).length;
const summary = chase
  .map((c) => `${c.state} walked ${c.walked.toFixed(1)}m, ${c.toPlayer.toFixed(1)}m away`)
  .join('; ');
check('and they pursue -- both leave their marks and come at the player', moved === 2, summary);
check(
  'and reach a player who stands still, which is why the answer up here is run',
  chase.every((c) => c.toPlayer < 3),
  summary,
);

// Run for the ledge. Camera yaw is set explicitly rather than driven by mouse
// movement: the player moves in the CAMERA's frame, so a harness that guesses
// the yaw is measuring its own guess.
const ledge = await page.evaluate(() => {
  const l = globalThis.__game.game.rooftop.ledge;
  return { x: l.x, y: l.y, z: l.z };
});
check(
  'the ledge overhangs toward the machine',
  ledge.x > 5 && ledge.x < 9,
  `ledge at x=${ledge.x.toFixed(2)}, deck edge at 5`,
);

// Face the machine and walk at it. `Player` resolves W in the CAMERA's yaw
// frame -- with W alone it moves by (-sin(yaw), -cos(yaw)) -- so +PI/2 is the
// yaw that sends a forward walk down -X, toward the deck. Set rather than
// nudged with the mouse: a harness that steers by feel measures the steering.
await page.evaluate(() => {
  const g = globalThis.__game;
  g.player.teleport({ x: 11.5, y: 7.71, z: 0 });
  g.playerCamera.setYaw(Math.PI / 2);
});
await sim(page, 0.4);

// A RUNNING jump, which is what the plan's geometry was measured against.
// Started four metres back so the sprint is at full speed before the lip, and
// jumped on simulated time rather than on a position poll — the poll's own
// round trip is worth half a metre at 7.5 m/s, which is the difference
// between jumping off the ledge and jumping from beyond it.
const beforeJump = await posOf(page);
await page.keyboard.down('Shift');
await page.keyboard.down('w');
await sim(page, 0.3);
await page.keyboard.down('Space');
await sim(page, 0.1);
await page.keyboard.up('Space');
await sim(page, 1.4);
await page.keyboard.up('w');
await page.keyboard.up('Shift');
await sim(page, 0.6);

const afterJump = await posOf(page);
const landedStats = await waitForPhase(page, 'landed', 2);
const onDeck = Math.abs(afterJump.x) <= 5 && Math.abs(afterJump.z) <= 8;
check(
  'a running jump off the ledge clears the gap and lands on the deck',
  onDeck && afterJump.y > 3 && afterJump.y < 5,
  `(${beforeJump.x}, ${beforeJump.y}) -> (${afterJump.x}, ${afterJump.y}, ${afterJump.z})`,
);
check(
  'and the landing is what moves the opening on',
  landedStats.opening === 'landed' || landedStats.opening === 'done',
  `phase=${landedStats.opening}`,
);
check(
  'landing hands the player their weapons back',
  landedStats.armed === true,
  `armed=${landedStats.armed}`,
);

// The beat the whole scene exists for: it starts walking underneath them.
await sim(page, 3.5);
const walking = await statsOf(page);
check(
  'the machine starts walking the moment they are aboard',
  walking.speed > 3,
  `machine speed ${walking.speed} m/s, climbing toward 7.5`,
);
check(
  'and the opening finishes',
  walking.opening === 'done',
  `phase=${walking.opening}`,
);

// The building leaves with the world rather than standing in the desert.
const departure0 = await page.evaluate(() => globalThis.__game.game.rooftop?.scrolledBy ?? null);
await sim(page, 2);
const departure1 = await page.evaluate(() => globalThis.__game.game.rooftop?.scrolledBy ?? null);
check(
  'the building recedes with the world once the opening releases it',
  departure0 !== null && departure1 !== null && departure1 > departure0 + 5,
  `scrolled ${departure0?.toFixed(1)}m -> ${departure1?.toFixed(1)}m astern`,
);

if (outShot) await page.screenshot({ path: outShot });
await page.close();

// ===========================================================================
// 2. The miss
// ===========================================================================
// Deliberately NOT a short jump. The character is athletic enough that a
// standing jump off the ledge lands back on the roof and a walking one clears
// the gap outright, so "jump short" is not a thing this player can be made to
// do reliably — and a harness that has to be coaxed into a failure measures
// the coaxing. Dropped into the gap instead, which is the state a genuine
// miss produces one frame later anyway.
const missPage = await openPage();
await sim(missPage, 1.0);

await missPage.evaluate(() => {
  const l = globalThis.__game.game.rooftop.ledge;
  globalThis.__game.player.teleport({ x: l.x - 1.2, y: l.y + 0.6, z: l.z });
});
await sim(missPage, 2.0);

const fallen = await posOf(missPage);
const fallenStats = await statsOf(missPage);
check(
  'a jump that comes up short drops the player into the sand',
  fallen.y < 2,
  `y=${fallen.y}`,
);
check(
  'and the opening does not count that as a landing',
  fallenStats.opening === 'rooftop',
  `phase=${fallenStats.opening}`,
);

// The existing lost-in-the-desert rule takes it from here.
await sim(missPage, 5);
const dying = await statsOf(missPage);
check('the desert claims them', dying.hp === 0, `hp=${dying.hp}`);

await sim(missPage, 4.5);
const respawned = await posOf(missPage);
const respawnStats = await statsOf(missPage);
check(
  'and respawn puts them back on the ROOF, to run it again',
  respawned.x > 6 && respawned.y > 5,
  `respawned at (${respawned.x}, ${respawned.y}, ${respawned.z})`,
);
check(
  'with the opening still where it was',
  respawnStats.opening === 'rooftop',
  `phase=${respawnStats.opening}`,
);
check(
  'and the machine still waiting',
  respawnStats.speed < 0.6,
  `machine speed ${respawnStats.speed} m/s`,
);
await missPage.close();

// ===========================================================================
// 3. The skip
// ===========================================================================
const skipPage = await openPage();
await sim(skipPage, 1.0);

const beforeSkip = await statsOf(skipPage);
check(
  'the skip path starts on the rooftop too',
  beforeSkip.opening === 'rooftop',
  `phase=${beforeSkip.opening}`,
);

// A HOLD, not a tap: Esc is also 'cancel', and a tap would skip the opening
// every time a player shut a panel.
await skipPage.keyboard.down('Escape');
await sim(skipPage, 0.4);
const midHold = await statsOf(skipPage);
check(
  'half a second of Esc is not enough',
  midHold.opening === 'rooftop',
  `phase=${midHold.opening}`,
);

await sim(skipPage, 1.2);
await skipPage.keyboard.up('Escape');
await sim(skipPage, 0.4);

const skipped = await statsOf(skipPage);
const skippedPos = await posOf(skipPage);
check(
  'a full second of it ends the opening',
  skipped.opening === 'done',
  `phase=${skipped.opening}`,
);
check(
  'and teleports the player onto the deck rather than leaving them on a roof that is about to move',
  Math.abs(skippedPos.x) <= 5 && Math.abs(skippedPos.z) <= 8,
  `player at (${skippedPos.x}, ${skippedPos.y}, ${skippedPos.z})`,
);
check(
  'a skip still arms them and starts the machine',
  skipped.armed === true,
  `armed=${skipped.armed}`,
);

await sim(skipPage, 3);
const skippedWalking = await statsOf(skipPage);
check(
  'and the machine is walking afterwards, same as a landing',
  skippedWalking.speed > 3,
  `machine speed ${skippedWalking.speed} m/s`,
);
await skipPage.close();

await browser.close();

const failed = results.filter((r) => !r.ok);
if (errors.length) {
  console.log(`\n${errors.length} CONSOLE ERROR(S):`);
  for (const e of errors.slice(0, 8)) console.log(' -', e);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length || errors.length) process.exitCode = 1;
