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
async function sim(seconds, pg = page) {
  const clock = () => pg.evaluate(() => globalThis.__game.debugStats().simTime);
  const start = await clock();
  const deadline = Date.now() + 90000;
  for (;;) {
    await page.waitForTimeout(120);
    if ((await clock()) - start >= seconds) return;
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
// Ammunition is unlimited while the shooting is being tuned, so reloading no
// longer draws the reserve down. The magazine still empties and still has to be
// reloaded -- what went away is the possibility of running dry mid-fight.
check('reloading no longer spends the reserve', Number(a2.ammo.split('/')[1]) === 150,
  `reserve ${a2.ammo.split('/')[1]}, expected 150`);

const dry = await page.evaluate(async () => {
  const w = globalThis.__game.game.combat.current;
  w.reserveAmmo = 0;
  w.ammoInMag = 0;
  const started = w.startReload(performance.now() / 1000);
  return { started, infinite: w.infiniteReserve };
});
check('a weapon can still reload on an empty reserve', dry.started === true,
  `infiniteReserve=${dry.infinite}`);
await page.evaluate(() => {
  const w = globalThis.__game.game.combat.current;
  w.reserveAmmo = 150;
  w.ammoInMag = w.effectiveMagazineSize;
  w.cancelReload();
});

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

const DECK_STANDING_Y = await page.evaluate(() => {
  const g = globalThis.__game.game;
  // Deck surface plus the enemy capsule's half-height and radius.
  return g.machine.deckBounds.min.y + 0.09 + 0.6 + 0.36;
});

// --- Arrivals actually cross the deck --------------------------------------
// The check this file was missing. Everything above spawns enemies by hand at
// hand-picked positions, so nothing exercised the height the *spawner* drops
// them from -- and a scavenger dropped with its feet inside the deck plate is
// one the character controller refuses to move at all. It stands on its
// arrival mark for the rest of the run, close enough to punch anyone who
// wanders past and far enough back to never be seen.
await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.enemies.despawnAll();
  g.player.stats.invulnerable = true;
  g.player.teleport({ x: 0, y: 3.6, z: -1 });
  // Arm the spawner for this section rather than inheriting whatever the
  // sections above left set: the death checks between them respawn the player,
  // and updateSpawns refuses to run while the player is down.
  g.enemySpawnsEnabled = true;
  g.spawner.resync(g.world.distanceTraveled);
  globalThis.__game.__arrivalMarks = {};
  g.bus.on('enemy:spawned', (ev) => {
    globalThis.__game.__arrivalMarks[ev.enemyId] = {
      x: ev.position.x,
      y: ev.position.y,
      z: ev.position.z,
    };
  });
});
// Drive the real arrival path rather than spawning by hand.
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => {
    const g = globalThis.__game;
    g.world.reset(g.game.spawner.nextSpawnAt + 10);
  });
  await sim(0.6);
}
const arrivals = await page.evaluate(() => globalThis.__game.enemies.active.length);
check('distance drives arrivals onto the deck', arrivals > 0, `${arrivals} aboard`);

// Measured from where each scavenger actually materialised, taken off the bus
// rather than sampled afterwards: by the time a check can look, an arrival has
// already been walking for a tick or two.
await sim(6);
const settled = await page.evaluate(() => {
  const marks = globalThis.__game.__arrivalMarks;
  return globalThis.__game.enemies.active
    .filter((e) => marks[e.id])
    .map((e) => ({
      moved: Math.hypot(
        e.worldPosition.x - marks[e.id].x,
        e.worldPosition.z - marks[e.id].z,
      ),
      restY: e.worldPosition.y,
    }));
});

// The invariant, checked at the drop rather than through the physics that
// follow from it. Whether a sunk capsule freezes outright or merely grinds
// depends on where the perimeter ring happened to put it, so asserting on the
// resulting movement is a test that passes by luck; the height it was dropped
// from is exact every time.
const drops = await page.evaluate(() => {
  const marks = globalThis.__game.__arrivalMarks;
  const feetAt = 0.6 + 0.36; // enemy capsule half-height + radius
  return Object.values(marks).map((m) => +(m.y - feetAt).toFixed(3));
});
const deckTop = await page.evaluate(() => globalThis.__game.game.machine.deckBounds.min.y + 0.09);
check(
  'arrivals are dropped with their feet above the deck, not inside it',
  drops.length > 0 && drops.every((feet) => feet > deckTop),
  `feet start at ${drops.join(', ')} vs deck top ${deckTop.toFixed(2)}`,
);

// The regression this guards: an arrival that never leaves the mark it landed
// on. Every scavenger used to do this, for the whole run -- close enough to hit
// anyone who wandered aft, and behind the player, so never seen. Crossing the
// rest of a deck cluttered with the engine, generator and cargo is a separate
// and much harder problem; the steering is openly local avoidance rather than
// pathfinding, and one picking its way around the generator can still lose
// several seconds to it.
const walking = settled.filter((w) => w.moved > 1).length;
check(
  'every arrival walks off the mark it landed on',
  walking === settled.length && settled.length > 0,
  `${walking}/${settled.length} moved >1m (${settled.map((w) => w.moved.toFixed(1)).join(', ')})`,
);

// The cause, measured directly. A capsule dropped with its feet inside the deck
// plate never reaches standing height, and Rapier's character controller then
// refuses to move it at all: grounded, no lateral collision, zero movement,
// forever. Arrivals used to land at 3.40 and stay there.
const sunk = settled.filter((w) => w.restY < DECK_STANDING_Y - 0.01);
check(
  'arrivals settle on top of the deck, not inside it',
  sunk.length === 0,
  `resting Y ${settled.map((w) => w.restY.toFixed(3)).join(', ')}`,
);

// --- Gaps narrower than a scavenger ----------------------------------------
// The deck's equipment leaves two slots the fan can see straight down and a
// body cannot fit through: 0.65m between the generator and the engine, 0.70m
// between the engine and the fuel tank, against a 0.72m capsule. A scavenger
// that picks one walks into it and stops, held off the deck by the squeeze,
// with every forward probe still reporting clear.
for (const [side, x] of [['port', -1.95], ['starboard', 1.95]]) {
  await page.evaluate(
    (sx) => {
      const g = globalThis.__game.game;
      g.enemies.despawnAll();
      g.player.stats.invulnerable = true;
      g.player.teleport({ x: 0, y: 3.6, z: -1 });
      g.enemies.spawn('scavenger', { x: sx, y: 3.6, z: 5.6 });
    },
    x,
  );
  await sim(10);
  const r = await page.evaluate(() => {
    const e = globalThis.__game.enemies.active[0];
    const pl = globalThis.__game.game.player.worldPosition;
    return {
      gap: e.worldPosition.distanceTo(pl),
      liftedOffDeck: e.worldPosition.y - 3.47,
    };
  });
  // Ten seconds is thirty-one metres of walking on a sixteen-metre deck. Going
  // the long way round the engine is a couple of metres of detour, so anything
  // that has not closed to within four metres is stuck in the slot.
  check(
    `a scavenger routes around the ${side} equipment gap`,
    r.gap < 4,
    `${r.gap.toFixed(1)}m away, ${r.liftedOffDeck > 0.05 ? `wedged ${r.liftedOffDeck.toFixed(2)}m off the deck` : 'on the deck'}`,
  );
}

// --- Kills pay -------------------------------------------------------------
// Straight into the inventory rather than as something to walk over: the deck
// moves at 7.5 m/s and is cluttered, and loot that has to be chased is loot
// that slides under the engine block.
await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.enemies.despawnAll();
  g.player.stats.invulnerable = true;
  g.enemies.spawn('scavenger', { x: 0, y: 3.6, z: 3 });
});
await sim(0.3);
const loot = await page.evaluate(() => {
  const g = globalThis.__game.game;
  const before = g.resources.count('scrap');
  let announced = null;
  const off = g.bus.on('loot:collected', (e) => { announced = e.items; });
  globalThis.__game.enemies.active[0].takeDamage(9999);
  off();
  return { before, after: g.resources.count('scrap'), announced };
});
check(
  'killing a scavenger pays scrap',
  loot.after > loot.before,
  `${loot.before} -> ${loot.after}`,
);
check(
  'and says so, so the player knows it paid',
  Array.isArray(loot.announced) && loot.announced.length > 0,
  loot.announced ? loot.announced.map((i) => `${i.count} ${i.id}`).join(', ') : 'no event',
);

// --- Salvage crates and the reel -------------------------------------------
// Crates drift past in the dunes at the machine's own speed. They are the only
// reason to look anywhere but at the deck, so they have to actually turn up.
await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.player.stats.invulnerable = true;
});
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => {
    const g = globalThis.__game;
    g.world.reset(g.world.distanceTraveled + 200);
  });
  await sim(0.6);
}
const field = await page.evaluate(() => globalThis.__game.game.salvage.targets.length);
check('salvage crates appear as the machine travels', field > 0, `${field} aloft`);
// Wait for a crate to drift inside the reel's reach. They arrive at 46m and
// close slowly, so whichever is listed first is often still out of range.
let reachable = null;
for (let attempt = 0; attempt < 40 && reachable === null; attempt++) {
  reachable = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const c = g.activeCamera.position;
    return (
      g.salvage.targets.find(
        (t) => Math.hypot(t.x - c.x, t.y - c.y, t.z - c.z) < 28,
      ) ?? null
    );
  });
  if (reachable === null) await sim(0.5);
}
check('a crate drifts within reach of the reel', reachable !== null,
  reachable ? 'in range' : 'none came within 28m');

// A cue that disagrees with the mechanic is worse than none: it teaches the
// wrong reach. Both are asked of the same function, so this checks the wiring.
const aimAtCrate = async (crate) => {
  await page.evaluate((t) => {
    const g = globalThis.__game.game;
    const cam = g.playerCamera;
    const c = g.activeCamera.position;
    const dx = t.x - c.x, dy = t.y - c.y, dz = t.z - c.z;
    // PlayerCamera rebuilds its rotation from yaw/pitch every frame, so
    // lookAt would be gone by the next one.
    cam.yaw = Math.atan2(-dx, -dz);
    cam.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }, crate);
  await sim(0.25);
  return page.evaluate(() => globalThis.__game.game.reelReady);
};
const onTarget = reachable ? await aimAtCrate(reachable) : false;
check('the reel cue lights when a crate is lined up', onTarget === true, `reelReady=${onTarget}`);

await page.evaluate(() => {
  const cam = globalThis.__game.game.playerCamera;
  cam.pitch = 1.2; // straight up, where no crate can be
});
await sim(0.25);
const offTarget = await page.evaluate(() => globalThis.__game.game.reelReady);
check('and stays dark when nothing is in reach', offTarget === false, `reelReady=${offTarget}`);
await page.evaluate(() => { globalThis.__game.game.playerCamera.pitch = -0.08; });
await sim(0.2);


const reeled = await page.evaluate(() => {
  const g = globalThis.__game.game;
  const c = g.activeCamera.position;
  const target =
    g.salvage.targets.find((t) => Math.hypot(t.x - c.x, t.y - c.y, t.z - c.z) < 30) ??
    g.salvage.targets[0];
  if (!target) return null;
  const before = g.resources.count('scrap');
  // Aim the throw at the crate and fly it, rather than teleporting the crate
  // into the player's hands: the latch happens during the flight now.
  g.hookOrigin.set(g.player.worldPosition.x, g.player.worldPosition.y + 0.35, g.player.worldPosition.z);
  g.hookDir.set(target.x - g.hookOrigin.x, target.y - g.hookOrigin.y, target.z - g.hookOrigin.z).normalize();
  g.hook = { distance: 0, phase: 'out' };
  let latched = false;
  for (let i = 0; i < 600 && g.hook !== null; i++) {
    g.updateReel(0.02);
    if (g.hookedCrate !== null) latched = true;
  }
  return {
    before,
    after: g.resources.count('scrap'),
    released: g.hookedCrate === null && g.hook === null,
    latched,
    stillTargetable: g.salvage.targets.some((t) => t.id === target.id),
  };
});
check(
  'the hook latches a crate during its flight',
  reeled !== null && reeled.latched === true,
  reeled ? `latched=${reeled.latched}` : 'no crate to hook',
);
check(
  'reeling a crate in pays out',
  reeled !== null && reeled.after > reeled.before,
  reeled ? `${reeled.before} -> ${reeled.after}` : 'no crate to hook',
);
check(
  'and the crate is retired rather than reelable twice',
  reeled !== null && reeled.released && !reeled.stillTargetable,
  reeled ? `released=${reeled.released}, still listed=${reeled.stillTargetable}` : 'no crate',
);

// --- The enemy visual ------------------------------------------------------
// This harness boots with nomodel=1, so this is the procedural fallback and it
// must stay a complete enemy, not a degraded one. The suite has always run this
// path; nothing until now asserted it deliberately.
await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.enemies.despawnAll();
  g.player.stats.invulnerable = true;
  g.enemies.spawn('scavenger', { x: 0, y: 3.4, z: 2 });
});
await sim(0.5);
const fallbackVisual = await page.evaluate(() => {
  const e = globalThis.__game.enemies.active[0];
  let meshes = 0;
  e.object3D.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) meshes++;
  });
  return {
    meshes,
    visible: e.object3D.visible,
    // The drawn body must stand on the deck rather than float above it or sink
    // into it. The offset that does that moved out of Enemy and into
    // EnemyVisual, and the two disagreeing is invisible to every other check.
    footY: e.object3D.position.y + e.object3D.children[0].position.y,
    centreY: e.worldPosition.y,
  };
});
check(
  'an enemy renders without a model file',
  fallbackVisual.meshes > 0 && fallbackVisual.visible,
  `${fallbackVisual.meshes} mesh(es)`,
);
check(
  'the drawn enemy stands at the base of its collider',
  Math.abs(fallbackVisual.centreY - fallbackVisual.footY - 0.96) < 1e-3,
  `feet ${fallbackVisual.footY.toFixed(3)}, centre ${fallbackVisual.centreY.toFixed(3)}`,
);

// --- Hit reaction ----------------------------------------------------------
// Shooting a scavenger produced nothing visible until it died, which is a
// large part of why the player read one as scenery. It now flashes -- and the
// flash has to be its own, because SkeletonUtils.clone shares materials
// between clones exactly as it shares skeletons. Without per-enemy copies,
// hitting one lights up every scavenger aboard.
await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.enemies.despawnAll();
  g.player.stats.invulnerable = true;
  g.enemies.spawn('scavenger', { x: -2, y: 3.6, z: 4 });
  g.enemies.spawn('scavenger', { x: 2, y: 3.6, z: 4 });
});
await sim(0.4);
const flash = await page.evaluate(() => {
  const [a, b] = globalThis.__game.enemies.active;
  const glow = (e) => {
    let peak = 0;
    e.object3D.traverse((o) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) if (m.emissiveIntensity > peak) peak = m.emissiveIntensity;
    });
    return peak;
  };
  const before = [glow(a), glow(b)];
  a.takeDamage(5);
  // Read on the same tick: the flash lights at the moment of the hit, because
  // a frame can outlast the whole thing and waiting for one is how it ends up
  // never being seen.
  return { before, after: [glow(a), glow(b)] };
});
check(
  'a scavenger lights up when it is shot',
  flash.after[0] > flash.before[0] + 0.5,
  `glow ${flash.before[0].toFixed(2)} -> ${flash.after[0].toFixed(2)}`,
);
check(
  'only the one that was shot lights up',
  Math.abs(flash.after[1] - flash.before[1]) < 1e-6,
  `bystander ${flash.before[1].toFixed(2)} -> ${flash.after[1].toFixed(2)}`,
);

// --- Health bar ------------------------------------------------------------
// The bar is drawn with depth testing off so cargo cannot hide a scavenger
// from the player -- the reported problem was an empty-looking deck with one
// aboard. That makes it the one piece of enemy state visible from anywhere, so
// it has to actually track the health it claims to.
await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.enemies.despawnAll();
  g.player.stats.invulnerable = true;
  g.enemies.spawn('scavenger', { x: 0, y: 3.6, z: 3 });
});
await sim(0.3);
const bar = await page.evaluate(() => {
  const e = globalThis.__game.enemies.active[0];
  const width = () => e.visual.barFill.scale.x;
  const full = width();
  e.takeDamage(Math.round(e.def.maxHealth / 2));
  const half = width();
  return { full, half, ratio: half / full, visible: e.visual.bar.visible };
});
check(
  'the health bar empties as a scavenger is worn down',
  Math.abs(bar.ratio - 0.5) < 0.02,
  `${bar.full.toFixed(2)} -> ${bar.half.toFixed(2)} (${(bar.ratio * 100).toFixed(0)}%)`,
);

const corpseBar = await page.evaluate(() => {
  const e = globalThis.__game.enemies.active[0];
  e.takeDamage(9999);
  return { visible: e.visual.bar.visible, state: e.aiState };
});
check(
  'a corpse stops advertising a health bar',
  corpseBar.visible === false,
  `${corpseBar.state}, bar visible ${corpseBar.visible}`,
);

// --- Animated model, when one is present -----------------------------------
// Needs public/models/scavenger.glb, which is not committed. The checks below
// SKIP loudly rather than fail when it is absent: a silently-skipped check
// reads as a passing one, which is how a broken model pipeline ships green.
const modelPage = await browser.newPage({ viewport: { width: 640, height: 360 } });
await modelPage.goto('http://localhost:5173/?nolock=1&quality=low&nospawn=1', {
  waitUntil: 'load',
});
await modelPage.waitForFunction(() => '__game' in globalThis, null, { timeout: 60000 });

const hasModel = await modelPage.evaluate(() => globalThis.__game.enemies.hasModel === true);

if (!hasModel) {
  console.log('SKIP  animated model checks -- public/models/scavenger.glb not present');
} else {
  // Two enemies, deliberately driven into different AI states: one on top of
  // the player and attacking, one across the deck and idle.
  await modelPage.evaluate(() => {
    const g = globalThis.__game.game;
    g.player.stats.invulnerable = true;
    g.enemies.despawnAll();
    g.player.teleport({ x: 0, y: 3.6, z: 2 });
    g.enemies.spawn('scavenger', { x: 0, y: 3.4, z: 3.5 });
    g.enemies.spawn('scavenger', { x: -4, y: 3.4, z: -7 });
  });

  // Let them settle into their states and let the mixers run.
  await modelPage.waitForTimeout(4000);

  const result = await modelPage.evaluate(() => {
    const [a, b] = globalThis.__game.enemies.active;
    const bonesOf = (e) => {
      const out = [];
      e.object3D.traverse((o) => {
        if (o.isBone) out.push(o.position.y + o.rotation.x);
      });
      return out;
    };
    const skinned = (e) => {
      let n = 0;
      e.object3D.traverse((o) => {
        if (o.isSkinnedMesh) n++;
      });
      return n;
    };
    const pa = bonesOf(a);
    const pb = bonesOf(b);
    const differing = pa.filter((v, i) => Math.abs(v - (pb[i] ?? 0)) > 1e-4).length;
    return { states: [a.aiState, b.aiState], skinnedA: skinned(a), differing, bones: pa.length };
  });

  check('an enemy renders as a skinned mesh', result.skinnedA > 0, `${result.skinnedA}`);


  // Size, measured from the vertices that actually get drawn. "Is a skinned
  // mesh" passed for months while that mesh was five centimetres tall and
  // invisible on the deck, because the fit was handed a bind-pose bounding box
  // -- the armature's reach, not the body -- and faithfully scaled the model
  // down to nothing.
  const drawnSize = await modelPage.evaluate(() => {
    const THREE_Box3 = globalThis.__game.game.machine.deckBounds.constructor;
    const e = globalThis.__game.enemies.active[0];
    const model = e.object3D.children.find((c) => c.name === 'Root_Scene');
    if (!model) return null;
    const box = new THREE_Box3().setFromObject(model, true);
    return {
      height: box.max.y - box.min.y,
      feet: box.min.y,
      deckTop: globalThis.__game.game.machine.deckBounds.min.y + 0.09,
    };
  });
  check(
    'a scavenger is drawn at roughly the size of its collider',
    drawnSize !== null && drawnSize.height > 1.3 && drawnSize.height < 2.4,
    drawnSize === null ? 'no model node' : `${drawnSize.height.toFixed(2)}m tall`,
  );
  check(
    'and stands on the deck rather than floating or sunk',
    drawnSize !== null && Math.abs(drawnSize.feet - drawnSize.deckTop) < 0.25,
    drawnSize === null
      ? 'no model node'
      : `feet ${drawnSize.feet.toFixed(2)} vs deck ${drawnSize.deckTop.toFixed(2)}`,
  );

  // The one check that catches Object3D.clone standing in for
  // SkeletonUtils.clone: a shared skeleton makes every pooled enemy hold a
  // single pose. No unit test can reach it.
  check(
    'two enemies in different states hold different poses',
    result.differing > 0,
    `states ${result.states.join('/')}, ${result.differing} of ${result.bones} bones differ`,
  );

  // Criterion 4: the death clip plays out and then holds. Left looping, the
  // corpse springs back upright partway through its 2.5s despawn timer. The
  // clip is 0.958s, so 1.4s is past its end and 2.1s is still inside the
  // timer.
  const deathPose = await modelPage.evaluate(() => {
    const e = globalThis.__game.enemies.active[0];
    const sum = () => {
      let t = 0;
      e.object3D.traverse((o) => {
        if (o.isBone) t += o.rotation.x + o.rotation.z;
      });
      return t;
    };
    globalThis.__poseBefore = sum();
    e.takeDamage(9999);
    return globalThis.__poseBefore;
  });
  await sim(1.4, modelPage);
  const settled = await modelPage.evaluate(() => {
    const e = globalThis.__game.enemies.active[0];
    let t = 0;
    e.object3D.traverse((o) => {
      if (o.isBone) t += o.rotation.x + o.rotation.z;
    });
    return t;
  });
  await sim(0.7, modelPage);
  const held = await modelPage.evaluate(() => {
    const e = globalThis.__game.enemies.active[0];
    if (!e) return null;
    let t = 0;
    e.object3D.traverse((o) => {
      if (o.isBone) t += o.rotation.x + o.rotation.z;
    });
    return t;
  });
  check(
    'a killed enemy plays its death clip',
    Math.abs(settled - deathPose) > 1,
    `pose moved ${Math.abs(settled - deathPose).toFixed(2)}`,
  );
  check(
    'the corpse holds its final pose instead of looping',
    held !== null && Math.abs(held - settled) < 1e-3,
    held === null ? 'despawned early' : `drift ${Math.abs(held - settled).toExponential(1)}`,
  );
  // --- Which way the drawn body points -------------------------------------
  // The project aims things with rotation.y = atan2(x, z), which puts local +Z
  // along the heading. A model authored to the glTF convention faces -Z, and
  // dropping one in without the half-turn makes it walk backwards everywhere.
  // Measured on the body rather than on the group that carries it: the group
  // points along the heading by construction and proves nothing.
  await modelPage.evaluate(() => {
    const g = globalThis.__game.game;
    g.player.stats.invulnerable = true;
  });
  await modelPage.waitForTimeout(400);
  const walkStart = await modelPage.evaluate(() => {
    const w = globalThis.__game.game.player.worldPosition;
    return { x: w.x, z: w.z };
  });
  await modelPage.keyboard.down('KeyW');
  await modelPage.waitForTimeout(1800);
  const bodyFacing = await modelPage.evaluate((s) => {
    const pl = globalThis.__game.game.player;
    const V = pl.worldPosition.constructor;
    const body = pl.object3D.children[0];
    const q = body.getWorldQuaternion(new (pl.object3D.quaternion.constructor)());
    const front = new V(0, 0, 1).applyQuaternion(q).normalize();
    const moved = new V(pl.worldPosition.x - s.x, 0, pl.worldPosition.z - s.z);
    const dist = moved.length();
    return { dist, dot: dist > 0.2 ? front.dot(moved.normalize()) : null, animated: pl.visual.isAnimated };
  }, walkStart);
  await modelPage.keyboard.up('KeyW');
  // This model is authored facing -Z, so its visible front is the negation of
  // its local +Z. Asserting the magnitude would accept a body walking backwards
  // just as happily, which is the whole bug.
  check(
    'the player model faces the way it is walking',
    bodyFacing.dot !== null && -bodyFacing.dot > 0.85,
    bodyFacing.dot === null
      ? `only moved ${bodyFacing.dist.toFixed(2)}m`
      : `dot ${bodyFacing.dot.toFixed(2)}, animated=${bodyFacing.animated}`,
  );
}

if (outShot) {
  if (!hasModel) {
    // Nothing to show that the other harnesses do not already show.
    await page.setViewportSize({ width: 1280, height: 720 });
    await sim(0.5);
    await page.screenshot({ path: outShot });
  } else {
    // A first-person shot is the wrong tool here: the camera starts inside the
    // deck clutter as often as not, and framing a character from its own
    // eyeline shows very little of it. The free camera is set once at
    // construction and never touched again by the render step, so it can be
    // parked deliberately.
    const shot = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await shot.goto('http://localhost:5173/?nolock=1&quality=high&nospawn=1&cam=side', {
      waitUntil: 'load',
    });
    await shot.waitForFunction(() => '__game' in globalThis, null, { timeout: 60000 });

    await shot.evaluate(() => {
      const g = globalThis.__game.game;
      g.player.stats.invulnerable = true;
      g.enemies.despawnAll();
      g.enemies.spawn('scavenger', { x: 0, y: 3.4, z: 2 });
    });
    await shot.waitForTimeout(2500);

    // Stand the player inside attack range. An attacking scavenger holds its
    // ground, so the frame does not drift between parking the camera and
    // taking the picture -- and a swing reads better than a walk cycle caught
    // at an arbitrary phase.
    await shot.evaluate(() => {
      const g = globalThis.__game.game;
      const e = globalThis.__game.enemies.active[0];
      const p = e.worldPosition;
      g.player.teleport({ x: p.x + 1.4, y: p.y, z: p.z });
    });
    await shot.waitForTimeout(2500);

    await shot.evaluate(() => {
      const g = globalThis.__game.game;
      const p = globalThis.__game.enemies.active[0].worldPosition;
      // Three-quarter view from just above the deck, close enough that the
      // capsule fit is judgeable: feet on the plate, head at player height.
      g.freeCamera.position.set(p.x + 2.2, p.y + 0.55, p.z + 2.6);
      g.freeCamera.lookAt(p.x, p.y - 0.25, p.z);
    });
    await shot.waitForTimeout(500);
    await shot.screenshot({ path: outShot });
    await shot.close();
  }
}

await modelPage.close();
await browser.close();

const failed = results.filter((r) => !r.ok);
if (errors.length) {
  console.log(`\n${errors.length} CONSOLE ERROR(S):`);
  for (const e of errors.slice(0, 8)) console.log(' -', e);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length || errors.length) process.exitCode = 1;
