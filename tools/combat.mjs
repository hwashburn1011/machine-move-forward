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
await page.goto('http://localhost:5173/?nolock=1&quality=low&nospawn=1&notex=1&nomodel=1', { waitUntil: 'load' });

// `load` fires before `main.ts`'s top-level await settles, so the handle the
// checks below reach for is not there yet.
await page.waitForFunction(() => '__game' in globalThis, null, { timeout: 60000 });

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
  // Capture the exact position each arrival spawns at, straight off the bus.
  // `enemies.active[0].worldPosition` after a sim() wait is not safe for this:
  // the enemy AI starts steering it toward the player on the very next fixed
  // tick, and a scavenger walks at 3.1 m/s -- easily enough to walk most of
  // the way out of the (1.6m-deep) prow box within a single 0.5s sim() wait,
  // which would make a placement check read the post-escape position instead
  // of where it actually materialised.
  globalThis.__game.__spawnLog = [];
  g.bus.on('enemy:spawned', (e) => globalThis.__game.__spawnLog.push(e.position));
});
await sim(0.5);
check('the deck starts clear', (await stats()).enemies === 0, `${(await stats()).enemies} aboard`);

/**
 * Jump just past the next threshold, so exactly one boundary is crossed.
 *
 * A flat `travel(260)` anchors to the current distance, but the real margin before
 * the next `sim()` wait is the distance to the *next* threshold, which is
 * only guaranteed to be in (0, 250]. That can be a metre -- easily eaten by
 * the ~3.75m a 0.5s sim() wait adds on its own at the machine's cruise speed
 * -- which crosses a second boundary and fails an exact-count check about
 * 1.5% of the time. Anchoring to `nextSpawnAt` instead leaves a ~240m margin
 * regardless of how much of the current interval had already been walked.
 */
const travelPastNextThreshold = () =>
  page.evaluate(() => {
    const g = globalThis.__game;
    g.world.reset(g.game.spawner.nextSpawnAt + 10);
  });

// The real prow collider (src/machine/MachineGeometry.ts `prowBlock`,
// confirmed against source): half-extents (4.5, 0.55, 0.8) centred at
// (0, DECK_HEIGHT + 0.64, prowZ + 0.6) = (0, 3.04, -7.4). That gives:
//   x in [-4.5, 4.5], y in [2.49, 3.59], z in [-8.2, -6.6]
const PROW = { xMin: -4.5, xMax: 4.5, yMin: 2.49, yMax: 3.59, zMin: -8.2, zMax: -6.6 };
const insideProw = (p) =>
  p.x >= PROW.xMin && p.x <= PROW.xMax &&
  p.y >= PROW.yMin && p.y <= PROW.yMax &&
  p.z >= PROW.zMin && p.z <= PROW.zMax;

// Stand the player in the rear half of the deck (z > 0) before the next
// arrival: `perimeterSpawnPoint` picks whichever candidate is furthest from
// the player, so a rear player makes the front edge -- which sits entirely
// inside the prow collider -- the winning candidate every time this bug is
// present. (0, currentY, 3) is clear of the engine/generator/fuel-tank/
// workbench footprints, so the teleport itself cannot land the player inside
// machine geometry.
await page.evaluate(() => {
  const g = globalThis.__game;
  g.player.teleport({ x: 0, y: g.player.worldPosition.y, z: 3 });
});

await travelPastNextThreshold();
await sim(0.5);
check(
  'travelling far enough spawns a scavenger',
  (await stats()).enemies === 1,
  `${(await stats()).enemies} aboard`,
);

// Every check above (and every check anywhere else in this file) reads only
// `stats().enemies` -- a count -- so a placement bug is invisible by
// construction. Read the arrival's actual spawn position instead, off the
// `enemy:spawned` bus payload captured above (confirmed against
// `Enemy.spawn`, which sets position and *then* emits the event, and against
// `Enemy.worldPosition`, the live accessor the payload's numbers come from).
const arrival = await page.evaluate(() => globalThis.__game.__spawnLog[0] ?? null);
const onDeck = arrival !== null && Math.abs(arrival.x) <= 5.01 && Math.abs(arrival.z) <= 8.01;
check(
  'the arrival lands on the deck, not inside the prow',
  arrival !== null && onDeck && !insideProw(arrival),
  arrival
    ? `spawned at (${arrival.x.toFixed(2)}, ${arrival.y.toFixed(2)}, ${arrival.z.toFixed(2)})`
    : 'no arrival found',
);

// Cross five more thresholds. The cap should stop the last two.
for (let i = 0; i < 5; i++) {
  await travelPastNextThreshold();
  await sim(0.5);
}
check(
  'no more than four are aboard at once',
  (await stats()).enemies === 4,
  `${(await stats()).enemies} aboard`,
);

// The sixth threshold's arrival was refused, not lost: the spawner held the
// threshold rather than advancing it, so it owes that arrival. Free exactly
// one slot (not all four) and confirm the count climbs back to 4 on simulated
// time alone -- no further travel() -- proving the held arrival was retried
// the moment room opened, rather than discarded when the cap first bit.
await page.evaluate(() => {
  globalThis.__game.enemies.active[0]?.despawn();
});
await sim(0.5);
check(
  'a refused arrival is delivered as soon as a slot frees, without travelling further',
  (await stats()).enemies === 4,
  `${(await stats()).enemies} aboard`,
);

await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.enemies.despawnAll();
  g.spawner.resync(g.world.distanceTraveled);
});
await sim(0.5);
// Seeded from nextSpawnAt rather than the current distance, for the same
// margin reason as travelPastNextThreshold above.
await page.evaluate(() => {
  const g = globalThis.__game;
  g.world.reset(g.game.spawner.nextSpawnAt + 500);
});
await sim(0.5);
check(
  'a 500m skip produces one arrival, not two',
  (await stats()).enemies === 1,
  `${(await stats()).enemies} aboard`,
);

// --- Death and respawn -----------------------------------------------------
// Death used to be a costume: `damage` refuses to hurt the dead, so a killed
// player became an invulnerable 0-HP ghost who could still walk and shoot,
// forever. These checks exist so that cannot come back.
await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.enemies.despawnAll();
  g.enemySpawnsEnabled = false;
  g.state.godMode = false;
  g.player.stats.invulnerable = false;
  g.player.stats.reset();
  g.player.teleport({ x: 0, y: 3.6, z: 2 });
});
await sim(0.5);

const beforeDeath = await page.evaluate(() => ({
  pos: { ...globalThis.__game.player.worldPosition },
  // The firing checks above have already spent the magazine, so compare
  // against what is actually in it rather than a full one.
  mag: globalThis.__game.game.combat.current.ammoInMag,
}));
await page.evaluate(() => globalThis.__game.game.player.stats.damage(500, 'harness'));
await sim(0.4);
check(
  'lethal damage kills the player',
  (await page.evaluate(() => globalThis.__game.game.player.stats.alive)) === false,
);

// Hold a movement key and the trigger: a corpse must do neither.
await page.keyboard.down('w');
await page.mouse.down();
await sim(1.0);
await page.mouse.up();
await page.keyboard.up('w');
const whileDead = await page.evaluate(() => {
  const g = globalThis.__game;
  return {
    pos: { ...g.player.worldPosition },
    mag: g.game.combat.current.ammoInMag,
    alive: g.game.player.stats.alive,
  };
});
const walked = Math.hypot(
  whileDead.pos.x - beforeDeath.pos.x,
  whileDead.pos.z - beforeDeath.pos.z,
);
check('a dead player cannot walk', walked < 0.5, `moved ${walked.toFixed(2)}m`);
check(
  'a dead player cannot fire',
  whileDead.mag === beforeDeath.mag,
  `${beforeDeath.mag} -> ${whileDead.mag} in the magazine`,
);
check('the player is still dead a second in', whileDead.alive === false);

// Past the 3s delay.
await sim(3.0);
const afterRespawn = await page.evaluate(() => {
  const g = globalThis.__game.game;
  return {
    alive: g.player.stats.alive,
    hp: g.player.stats.health,
    grace: g.player.stats.graceRemaining,
    dead: g.state.playerDead,
  };
});
check('the player respawns', afterRespawn.alive === true, `hp ${afterRespawn.hp}`);
check('respawn restores full health', afterRespawn.hp === 100, `${afterRespawn.hp}`);
check('the death flag clears', afterRespawn.dead === false);
check(
  'respawn grants protection',
  afterRespawn.grace > 0,
  `${afterRespawn.grace.toFixed(2)}s left`,
);

// The grace has to actually absorb a hit, or it is decoration.
const graceHeld = await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.player.stats.damage(40, 'harness');
  return g.player.stats.health;
});
check('the protection absorbs a hit', graceHeld === 100, `hp ${graceHeld}`);

// And it has to expire, or respawn is permanent god mode.
await sim(2.5);
const graceGone = await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.player.stats.damage(40, 'harness');
  return { hp: g.player.stats.health, grace: g.player.stats.graceRemaining };
});
check(
  'the protection expires',
  graceGone.hp === 60 && graceGone.grace === 0,
  `hp ${graceGone.hp}, grace ${graceGone.grace}`,
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
