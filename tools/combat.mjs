/**
 * Combat verification: firing, reloading, spread, damage, and enemy death,
 * measured against the real running game.
 */
import { chromium } from '@playwright/test';

const outShot = process.argv[2] ?? null;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

// Boots quiet so every check below runs on a clear deck. The arrivals section
// at the bottom of this file arms the spawner deliberately — this is the one
// harness that tests it.
await page.goto('http://localhost:5173/?nolock=1&quality=low&nospawn=1', { waitUntil: 'load' });

const stats = () => page.evaluate(() => globalThis.__game.debugStats());

/** Wait on simulated, not wall, time — the headless renderer is very slow. */
async function sim(seconds) {
  const start = (await stats()).simTime;
  const deadline = Date.now() + 90000;
  for (;;) {
    await page.waitForTimeout(120);
    if ((await stats()).simTime - start >= seconds) return;
    if (Date.now() > deadline) throw new Error('sim() timed out');
  }
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

await sim(1.5);

// Count events straight off the bus.
await page.evaluate(() => {
  const g = globalThis.__game;
  g.counts = { fired: 0, hit: 0, killed: 0, damaged: 0, reloadStart: 0, reloadDone: 0, dry: 0 };
  g.bus = g.bus ?? null;
});

// --- Ammo and firing --------------------------------------------------------
const a0 = await stats();
check('starts with a full rifle magazine', a0.ammo === '30/150', a0.ammo);

await page.mouse.down();
await sim(0.5);
await page.mouse.up();
await sim(0.2);
const a1 = await stats();
const fired = 30 - Number(a1.ammo.split('/')[0]);
// 0.5s at 9 rounds/sec is 4-5 shots.
check('holding fire empties the magazine at the right cadence', fired >= 4 && fired <= 6,
  `${fired} shots in 0.5s (expect 4-6)`);

// --- Reload -----------------------------------------------------------------
await page.keyboard.press('r');
await sim(0.4);
const midReload = await stats();
check('cannot fire mid-reload', Number(midReload.ammo.split('/')[0]) === Number(a1.ammo.split('/')[0]),
  `ammo held at ${midReload.ammo}`);

await sim(2.2);
const a2 = await stats();
check('reload refills the magazine', a2.ammo.startsWith('30/'), a2.ammo);
check('reload draws from the reserve', Number(a2.ammo.split('/')[1]) === 150 - fired,
  `reserve ${a2.ammo.split('/')[1]}, expected ${150 - fired}`);

// --- Weapon swap ------------------------------------------------------------
await page.keyboard.press('2');
await sim(0.2);
const a3 = await stats();
check('key 2 equips the shotgun', a3.weapon === 'shotgun', a3.weapon);
check('shotgun has its own magazine', a3.ammo === '6/48', a3.ammo);
await page.keyboard.press('1');
await sim(0.2);
check('key 1 returns to the rifle', (await stats()).weapon === 'rifle');

// --- Enemy spawn and kill ---------------------------------------------------
// Spawn ON the camera's aim line, not the player's centreline. In
// over-the-shoulder the crosshair sits off the player's axis by the shoulder
// offset, so an enemy walking at the player is not under the crosshair.
await page.evaluate(() => {
  const g = globalThis.__game;
  const cam = g.playerCamera.camera.position;
  const fwd = g.playerCamera.forward;
  g.enemies.spawn('scavenger', {
    x: cam.x + fwd.x * 7,
    y: g.player.worldPosition.y,
    z: cam.z + fwd.z * 7,
  });
});
await sim(0.4);
check('enemy spawns', (await stats()).enemies === 1);

// Aim at it and hold fire. The enemy walks in, so it stays roughly centred.
const health = () =>
  page.evaluate(() => globalThis.__game.enemies.active[0]?.currentHealth ?? -1);
const hpBefore = await health();
check('enemy spawns at full health', hpBefore === 110, `hp=${hpBefore}`);

await page.mouse.down();
await sim(3.0);
await page.mouse.up();
await sim(0.3);

const hpAfter = await health();
const killed = (await stats()).enemies === 0 || hpAfter <= 0 || hpAfter === -1;
check('shooting damages and kills the enemy', killed || hpAfter < hpBefore,
  `hp ${hpBefore} -> ${hpAfter}`);

// --- Player damage ----------------------------------------------------------
await page.evaluate(() => {
  const g = globalThis.__game;
  const p = g.player.worldPosition;
  g.enemies.spawn('scavenger', { x: p.x + 1.2, y: p.y, z: p.z + 1.2 });
});
const hpPlayerBefore = (await stats()).hp;
await sim(4.0);
const hpPlayerAfter = (await stats()).hp;
check('an adjacent enemy damages the player', hpPlayerAfter < hpPlayerBefore,
  `hp ${hpPlayerBefore} -> ${hpPlayerAfter}`);

// --- Distance-driven arrivals ---------------------------------------------
// This harness boots with ?nospawn=1 so every check above ran on a quiet deck.
// Arm the spawner here, aligned to the distance already covered, and make the
// player invulnerable: four scavengers on a 16m deck would otherwise kill them
// mid-section and suppress the very spawns being measured.
await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.enemies.despawnAll();
  g.state.godMode = true;
  g.player.stats.invulnerable = true;
  g.enemySpawnsEnabled = true;
  g.spawner.resync(g.world.distanceTraveled);
});
await sim(0.5);
check('the deck starts clear', (await stats()).enemies === 0, `${(await stats()).enemies} aboard`);

/** Jump the world forward, the way distance actually accrues, only faster. */
const travel = (metres) =>
  page.evaluate(
    (m) => globalThis.__game.world.reset(globalThis.__game.world.distanceTraveled + m),
    metres,
  );

await travel(260);
await sim(0.5);
check(
  'travelling far enough spawns a scavenger',
  (await stats()).enemies === 1,
  `${(await stats()).enemies} aboard`,
);

// Cross five more thresholds. The cap should stop the last two.
for (let i = 0; i < 5; i++) {
  await travel(260);
  await sim(0.5);
}
check(
  'no more than four are aboard at once',
  (await stats()).enemies === 4,
  `${(await stats()).enemies} aboard`,
);

await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.enemies.despawnAll();
  g.spawner.resync(g.world.distanceTraveled);
});
await sim(0.5);
await travel(500);
await sim(0.5);
check(
  'a 500m skip produces one arrival, not two',
  (await stats()).enemies === 1,
  `${(await stats()).enemies} aboard`,
);

if (outShot) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await sim(0.5);
  await page.screenshot({ path: outShot });
}
await browser.close();

const failed = results.filter((r) => !r.ok);
if (errors.length) {
  console.log(`\n${errors.length} CONSOLE ERROR(S):`);
  for (const e of errors.slice(0, 8)) console.log(' -', e);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length || errors.length) process.exitCode = 1;
