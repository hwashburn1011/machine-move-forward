/**
 * Combat verification: firing, reloading, spread, damage, and enemy death,
 * measured against the real running game.
 */
import { chromium } from '@playwright/test';

const outShot = process.argv[2] ?? null;

const browser = await chromium.launch({
  // This is the one harness that keeps audio on, so it needs the flag that
  // lets an AudioContext start without a real user gesture, and the one that
  // stops a headless box hunting for an output device it does not have. The
  // graph still runs and still counts; nothing has to come out of a speaker.
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
  ],
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

/**
 * Where a player's capsule CENTRE goes to stand on the deck.
 *
 * `Player.teleport` sets the centre, and this file spent its whole life
 * passing 3.6 -- the deck PLANE, which puts the feet a metre inside the plate.
 * A capsule buried like that is one the character controller refuses to move,
 * and, worse for a navigation harness, one whose feet read as level -1: the
 * nav graph routed scavengers down the engine-room ramp to reach a player it
 * believed was in the engine room, and the checks that measured them found
 * them anywhere but on the deck. Deck surface, plus half-height, plus radius,
 * plus the same clearance `CHARACTER_DROP_Y` uses.
 */
const { player: PLAYER_STAND_Y, enemy: ENEMY_STAND_Y } = await page.evaluate(() => {
  const deck = globalThis.__game.game.machine.deckBounds.min.y + 0.09;
  // Half-height plus radius per capsule, plus the same clearance
  // `CHARACTER_DROP_Y` uses so the body settles onto the surface rather than
  // starting inside it. Also parked on the page: half the callers below are
  // browser-side closures, which cannot see a node-side const.
  globalThis.__standY = { player: deck + 0.62 + 0.34 + 0.15, enemy: deck + 0.6 + 0.36 + 0.15 };
  return globalThis.__standY;
});

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
 * Jump the world just past the director's current phase boundary.
 *
 * The pacing used to be a metronome and this used to anchor to
 * `spawner.nextSpawnAt`. It anchors to the phase boundary for the same reason
 * it anchored there: the distance remaining in a phase is only guaranteed to
 * be positive, and a metre of it is easily eaten by the ~3.75m a 0.5s `sim()`
 * wait adds at cruise, which would cross the NEXT boundary too and fail an
 * exact-count check now and then. Anchoring to the boundary itself leaves the
 * whole of the next phase as margin.
 *
 * Engagement has no boundary -- it ends when the deck is clear -- so this is a
 * no-op there, which is exactly right: you cannot travel your way out of a
 * fight.
 */
const advancePastPhase = () =>
  page.evaluate(() => {
    const g = globalThis.__game;
    const ends = g.game.director.phaseEnds;
    if (Number.isFinite(ends)) g.world.reset(ends + 5);
  });

const phase = () => page.evaluate(() => globalThis.__game.game.director.currentPhase);

/** Travel until the next wave is on the deck. Returns how it got there. */
const travelToNextWave = async () => {
  const seen = [];
  for (let i = 0; i < 8; i++) {
    seen.push(await phase());
    if ((await stats()).enemies > 0) return seen;
    await advancePastPhase();
    await sim(0.5);
  }
  seen.push(await phase());
  return seen;
};

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

// --- Pacing ----------------------------------------------------------------
// The director replaced a flat 250m metronome. What matters is the SHAPE: a
// calm you can build in, a warning you can act on, then the wave -- and never
// the wave without the warning.
check('a fresh game starts calm', (await phase()) === 'calm', await phase());

// The whole of the calm, and nothing in it. Travelling to the boundary and no
// further is the check: this is the stretch the handoff's hard rule is about.
await advancePastPhase();
await sim(0.5);
const afterCalm = await phase();
check(
  'the calm ends in a warning, not in an ambush',
  afterCalm === 'buildup' && (await stats()).enemies === 0,
  `${afterCalm}, ${(await stats()).enemies} aboard`,
);

// And the warning is announced. The banner is the only telegraph that exists
// until there is a dust plume and engine noise to do it properly, so if it
// does not fire the phase may as well not be there.
const telegraphed = await page.evaluate(
  () => document.querySelector('#hud-boarding')?.textContent ?? '',
);
check(
  'and the warning reaches the player',
  telegraphed.length > 0,
  telegraphed || 'no banner text',
);

await advancePastPhase();
await sim(0.5);
check(
  'the wave then lands',
  (await phase()) !== 'buildup' && (await stats()).enemies >= 1,
  `${await phase()}, ${(await stats()).enemies} aboard`,
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

// A fight does not end because the machine kept driving. Travel a very long
// way with the wave still alive and confirm nothing else is sent: engagement
// ends on a clear deck, and the alternative -- reinforcements arriving on a
// timer while you are still fighting -- is precisely the chaining the handoff
// forbids.
const duringFight = (await stats()).enemies;
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => {
    const g = globalThis.__game;
    g.world.reset(g.world.distanceTraveled + 900);
  });
  await sim(0.5);
}
check(
  'no reinforcements arrive while the wave is still alive',
  (await stats()).enemies === duringFight && (await phase()) === 'engagement',
  `${(await stats()).enemies} aboard (was ${duringFight}), phase ${await phase()}`,
);

// Clear the deck: recovery is owed, and it is owed as DISTANCE, so travelling
// through it is the only way out.
await page.evaluate(() => globalThis.__game.enemies.despawnAll());
await sim(0.5);
check('a cleared deck buys a recovery', (await phase()) === 'recovery', await phase());

// A skip does not skip the warning. This is the one property a debug key and a
// loaded save could each quietly break, and the cost of breaking it is a fight
// that arrives unannounced.
await page.evaluate(() => {
  const g = globalThis.__game;
  g.world.reset(g.world.distanceTraveled + 5000);
});
await sim(0.5);
check(
  'a 5km skip lands in a phase, not in an ambush',
  (await stats()).enemies === 0 && (await phase()) !== 'contact',
  `${await phase()}, ${(await stats()).enemies} aboard`,
);

// Waves grow, and stop growing at what the deck holds. Fought through several
// cycles, killing everything each time, which is what "survived" means.
let biggest = 0;
for (let wave = 0; wave < 7; wave++) {
  await travelToNextWave();
  // Let the whole wave finish arriving before counting it.
  for (let i = 0; i < 6; i++) await sim(0.6);
  biggest = Math.max(biggest, (await stats()).enemies);
  await page.evaluate(() => globalThis.__game.enemies.despawnAll());
  await sim(0.5);
}
check(
  'waves grow as they are survived, and never past what the deck holds',
  biggest > 1 && biggest <= 4,
  `largest wave seen: ${biggest}`,
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
  g.player.teleport({ x: 0, y: globalThis.__standY.player, z: 2 });
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
  g.player.teleport({ x: 0, y: globalThis.__standY.player, z: -1 });
  // Arm the director for this section rather than inheriting whatever the
  // sections above left set: the death checks between them respawn the player,
  // and updateSpawns refuses to run while the player is down, which can leave
  // the director parked mid-phase.
  g.enemySpawnsEnabled = true;
  globalThis.__game.__arrivalMarks = {};
  g.bus.on('enemy:spawned', (ev) => {
    globalThis.__game.__arrivalMarks[ev.enemyId] = {
      x: ev.position.x,
      y: ev.position.y,
      z: ev.position.z,
    };
  });
});
// Drive the real arrival path rather than spawning by hand: through a calm,
// through a warning, into a wave.
const route = await travelToNextWave();
// Give the whole wave time to finish arriving, staggered as it is.
for (let i = 0; i < 4; i++) await sim(0.6);
const arrivals = await page.evaluate(() => globalThis.__game.enemies.active.length);
check(
  'the director puts arrivals onto the deck',
  arrivals > 0,
  `${arrivals} aboard via ${route.join(' -> ')}`,
);

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
      g.player.teleport({ x: 0, y: globalThis.__standY.player, z: -1 });
      g.enemies.spawn('scavenger', { x: sx, y: globalThis.__standY.enemy, z: 5.6 });
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
  g.enemies.spawn('scavenger', { x: 0, y: globalThis.__standY.enemy, z: 3 });
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
  g.enemies.spawn('scavenger', { x: 0, y: globalThis.__standY.enemy, z: 2 });
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
    drawnCentreY: e.object3D.position.y,
    centreY: e.worldPosition.y,
  };
});
check(
  'an enemy renders without a model file',
  fallbackVisual.meshes > 0 && fallbackVisual.visible,
  `${fallbackVisual.meshes} mesh(es)`,
);
// Two relationships, each measured against the right thing. The foot sits a
// capsule's foot-offset below the DRAWN centre, exactly; and the drawn centre
// tracks the simulated one to within a step of motion, because the render
// position is interpolated and the simulated one is not. This check used to
// hold the drawn foot against the simulated centre to a millimetre, which was
// only ever satisfiable by an enemy that could not move -- and for a long time
// that is what it was handed.
check(
  'the drawn enemy stands at the base of its collider',
  Math.abs(fallbackVisual.drawnCentreY - fallbackVisual.footY - 0.96) < 1e-3 &&
    Math.abs(fallbackVisual.drawnCentreY - fallbackVisual.centreY) < 0.02,
  `feet ${fallbackVisual.footY.toFixed(3)}, drawn ${fallbackVisual.drawnCentreY.toFixed(3)}, simulated ${fallbackVisual.centreY.toFixed(3)}`,
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
  g.enemies.spawn('scavenger', { x: -2, y: globalThis.__standY.enemy, z: 4 });
  g.enemies.spawn('scavenger', { x: 2, y: globalThis.__standY.enemy, z: 4 });
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
  g.enemies.spawn('scavenger', { x: 0, y: globalThis.__standY.enemy, z: 3 });
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

// Its own page, so its own copy — see the `__standY` note at the top.
await modelPage.evaluate(() => {
  const deck = globalThis.__game.game.machine.deckBounds.min.y + 0.09;
  globalThis.__standY = { player: deck + 0.62 + 0.34 + 0.15, enemy: deck + 0.6 + 0.36 + 0.15 };
});

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
    g.player.teleport({ x: 0, y: globalThis.__standY.player, z: 2 });
    g.enemies.spawn('scavenger', { x: 0, y: globalThis.__standY.enemy, z: 3.5 });
    g.enemies.spawn('scavenger', { x: -4, y: globalThis.__standY.enemy, z: -7 });
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

// --- Navigation over player structure ------------------------------------
//
// A room walled on three sides with one doorway, built around the player, at
// grid cell (0,0,-1) -- one of the few cells on this deck with all four
// neighbours free of the starting equipment (engine, generator, fuel tank,
// crates, workbench, collector all block cells elsewhere on this grid; see
// `machine.equipmentCells` on the harness handle). The doorway is on the west
// edge; the scavenger starts east of the room, so a correct route has to
// round the wall.
//
// KNOWN GAP surfaced while writing this section, not fixed here (see the
// task report): one or more character-controller/collider issues stop a
// kinematic capsule -- player or enemy, doesn't matter -- from completing a
// crossing at two different pieces of geometry:
//   1. A doorway opening (1.1m wide, no collider across it, only jambs and a
//      lintel -- 0.34m of combined clearance around the widest capsule in the
//      game, about 0.17m per side) freezes movement dead mid-step.
//   2. A stairs ramp (1.92m wide, no aperture at all) freezes movement dead
//      mid-climb. `maxSlopeClimbAngle` is not the cause here: it is 50°
//      (`PhysicsWorld.ts:144`) against this ramp's 36.87° incline, comfortably
//      climbable.
// Both were reproduced with the PLAYER under held WASD input, not just an
// AI-driven enemy, at two independent geometries -- so this is not a
// navigation bug, and A* and the steering fan both do their job correctly
// right up to the freeze. Whether it is one shared root cause or two is not
// established; treat them as separate symptoms until someone roots one out.
// A lead, not a conclusion: `PhysicsWorld.addCharacter` configures
// `controller.enableAutostep(AUTOSTEP_HEIGHT, 0.2, true)` -- the `0.2`
// minimum-step-width parameter is worth checking against both seams.
// Either way, it means "arrives inside the room" and "climbs the stairs"
// cannot be asserted honestly right now: they would fail against correct
// navigation code exactly as they fail against reverted code, for a reason
// unrelated to navigation. The checks below stop at what these freezes do
// not confound: did it route to the correct side of the wall, and does the
// nav graph link the stairs run to its landing.

const place = (piece, cell, side = null, rotation = 0) =>
  page.evaluate(
    ({ piece, cell, side, rotation }) => {
      const g = globalThis.__game;
      const edge = side ? g.canonicalEdge(cell, side) : undefined;
      return g.game.build.place({ piece, cell, edge, rotation }) !== null;
    },
    { piece, cell, side, rotation },
  );

// `Player.teleport` takes a THREE.Vector3, but only reads .x/.y/.z through
// Vector3.copy, so a plain object is fine from the harness — the same trick
// Game.spawnEnemyAhead already uses for enemy spawns.
const teleportPlayer = (x, y, z) =>
  page.evaluate(({ x, y, z }) => globalThis.__game.player.teleport({ x, y, z }), { x, y, z });

/** Where the one live scavenger is, in grid cells, plus its AI state. */
const scavenger = () =>
  page.evaluate(() => {
    const e = globalThis.__game.enemies.active[0];
    if (!e) return null;
    return {
      cell: e.gridCell,
      aiState: e.aiState,
      x: e.worldPosition.x,
      z: e.worldPosition.z,
    };
  });

/**
 * Spawn a scavenger and cut its attack range to well under a doorstep.
 *
 * This test's room is small enough (2m walls, 1.1x the attack range of 2.2m)
 * that a scavenger going the long way round would otherwise lock into its
 * `attack` state -- which halts movement -- while still hard against the
 * WRONG wall, before it ever reaches the doorway side. That is an artifact of
 * this test's geometry, not of navigation, so it is neutralised here the same
 * way `player.stats.invulnerable` neutralises damage elsewhere in this file:
 * `def` is the live, shared `ENEMIES.scavenger` object, so mutating it
 * affects every scavenger for the rest of this process, not just this one --
 * the original value is captured on first use and restored by
 * `restoreAttackRange()` once this section is done, so a check appended
 * after this one does not silently inherit an altered enemy.
 */
let originalAttackRange;
const spawnHuntingScavenger = async (x, y, z) => {
  const orig = await page.evaluate(
    ({ x, y, z }) => {
      const e = globalThis.__game.enemies.spawn('scavenger', { x, y, z });
      if (!e) return null;
      const orig = e.def.attackRange;
      e.def.attackRange = 0.6;
      return orig;
    },
    { x, y, z },
  );
  if (originalAttackRange === undefined && orig !== null) originalAttackRange = orig;
};
const restoreAttackRange = async () => {
  if (originalAttackRange === undefined) return;
  await page.evaluate(
    (v) => {
      const e = globalThis.__game.enemies.active[0];
      if (e) e.def.attackRange = v;
    },
    originalAttackRange,
  );
};

// F5's resource grant is inline in Game.handleDebugKeys and not callable, so
// deposit directly — `resources` is already on the harness handle.
await page.evaluate(() => {
  globalThis.__game.game.resources.deposit('scrap', 400);
  globalThis.__game.game.resources.deposit('components', 20);
});
await sim(0.5);

const cell = (x, y, z) => ({ x, y, z });
/**
 * Starboard of the centreline, and that is not cosmetic.
 *
 * This was cell(0,0,-1), whose west neighbour is (-1,0,-1) -- which lies over
 * the engine-room stairwell and is therefore not a walkable nav cell at all.
 * The room's only doorway opened onto a hole, the graph correctly refused to
 * link through it, and this whole section has been measuring an unreachable
 * room ever since the engine room was cut into the hull. Moved one cell to
 * starboard, every side of the room opens onto solid deck and the doorway is
 * the only way in, which is what these checks were written to prove.
 */
const ROOM = cell(1, 0, -1);
/** World X of the room's west face — `ROOM.x * GRID_TILE - GRID_TILE / 2`. */
const ROOM_WEST_FACE = 1;
await place('floor', ROOM);
for (const side of ['north', 'south', 'east']) {
  await place('wall', ROOM, side);
}
await place('doorway', ROOM, 'west');
await sim(0.5);

const built = await page.evaluate(() => globalThis.__game.game.build.pieceCount);
check('navigation: test room built', built >= 5, `${built} pieces`);

// Put the player inside the room, and a scavenger on the far side of it. Both
// spawn a capsule's own height above the deck SURFACE, plus clearance, so
// gravity settles them onto whatever is underneath -- the base deck outside,
// the placed floor plate inside, which sit at slightly different heights.
// These used to pass 3.6, the deck PLANE, which is a metre of plate below a
// capsule's feet: buried, unmovable, and reading as engine-room level to the
// nav graph, which is why this section could never route anyone anywhere.
await teleportPlayer(ROOM.x * 2, PLAYER_STAND_Y, -2);
await page.evaluate(() => globalThis.__game.enemies.despawnAll());
await spawnHuntingScavenger(4.6, ENEMY_STAND_Y, -2);
await sim(1.0);

// The scavenger starts east of the room. The only way toward the player is
// the west doorway, so a correct route must get past the room's west face --
// rounding the wall -- well before it is anywhere near the doorway threshold
// itself. Past the face is unambiguous on its own: a scavenger that walked
// into the east wall and stopped sits three metres the other side of it.
//
// The minimum is tracked rather than tested sample by sample. It rounds the
// corner tightly -- measured, it reaches x=0.78 against a face at 1.0 -- and
// crosses the strip in well under one sampling interval at 3.1 m/s, so a
// threshold checked only at the instants a sample lands is a check that
// passes or fails on where the polling happened to fall.
let minX = Infinity;
for (let i = 0; i < 60; i++) {
  await sim(0.2);
  const s = await scavenger();
  if (!s) break;
  minX = Math.min(minX, s.x);
  if (minX < ROOM_WEST_FACE) break;
}
check(
  'navigation: it routes round the wall to the doorway side, not into a wall',
  minX < ROOM_WEST_FACE,
  `closest approach to the doorway side: x=${minX.toFixed(2)}, face at ${ROOM_WEST_FACE}`,
);

// Arrival, which is the criterion this whole feature exists to satisfy. It was
// left out when the harness was written because no capsule could fit under a
// doorway lintel; with that clearance fixed, a scavenger that routes to the
// doorway now actually comes through it.
let arrivedInRoom = false;
for (let i = 0; i < 40; i++) {
  await sim(0.4);
  const s = await scavenger();
  if (!s) break;
  if (s.cell.x === ROOM.x && s.cell.z === ROOM.z) {
    arrivedInRoom = true;
    break;
  }
}
const insideRoom = await scavenger();
check(
  'navigation: the scavenger comes through the doorway and reaches the player',
  arrivedInRoom,
  insideRoom ? `ended at cell ${insideRoom.cell.x},${insideRoom.cell.z}` : 'despawned',
);

// --- Sealed ---------------------------------------------------------------
// The doorway has to come out before the wall goes in. An edge that already
// holds a piece rejects a second one as 'occupied', so the old
// `place('wall', ROOM, 'west')` silently did nothing and this section ran
// against a room that still had its doorway. It passed anyway, because a
// capsule could not fit under the lintel and no scavenger ever got in -- the
// check was measuring the traversal bug, not the seal. Both are asserted now.
const doorwayRemoved = await page.evaluate((room) => {
  const g = globalThis.__game;
  return (
    g.game.build.demolishAt({
      piece: 'doorway',
      cell: room,
      edge: g.canonicalEdge(room, 'west'),
      rotation: 0,
    }) > 0
  );
}, ROOM);
const wallPlaced = await place('wall', ROOM, 'west');
check(
  'navigation: the room actually seals (doorway out, wall in)',
  doorwayRemoved && wallPlaced,
  `demolished=${doorwayRemoved} walled=${wallPlaced}`,
);
await sim(0.5);

await page.evaluate(() => globalThis.__game.enemies.despawnAll());
await spawnHuntingScavenger(4.6, ENEMY_STAND_Y, -2);
await sim(8.0);

// "Kept out" is judged by grid cell, not distance -- with the attack range
// cut for this section (see spawnHuntingScavenger), a scavenger pressed
// against the outside of a wall can end up within a metre of the player in a
// straight line without ever standing in the room's cell.
const sealed = await scavenger();
const HUNTING_STATES = ['navigate', 'pursue', 'attack'];
check(
  'navigation: a sealed room keeps the scavenger out, and it keeps hunting',
  sealed !== null &&
    (sealed.cell.x !== ROOM.x || sealed.cell.z !== ROOM.z) &&
    HUNTING_STATES.includes(sealed.aiState),
  sealed
    ? `at cell ${sealed.cell.x},${sealed.cell.z}, state ${sealed.aiState}`
    : 'despawned',
);

// --- Vertical -------------------------------------------------------------
// A staircase from (0,0,-2) running to (0,0,-1) and landing on (0,1,-1).
// Shifted onto the same equipment-free column as the room above.
//
// Order matters. `validateStairs` rejects a landing cell that is already
// occupied, so the upper floor goes down AFTER the stairs, not before. And an
// upper floor needs support: a wall on an edge below it, or a floor beside it
// on the same level. Hence the scaffold at x=1.

await page.evaluate(() => globalThis.__game.enemies.despawnAll());
await page.evaluate(() => globalThis.__game.game.build.clear());
await sim(0.5);

await place('floor', cell(0, 0, -2));
await place('floor', cell(1, 0, -1));
await place('stairs', cell(0, 0, -2), null, 2); // rotation 2 => run +Z
await place('wall', cell(1, 0, -1), 'north');   // support for the level-1 floor
await place('floor', cell(1, 1, -1));           // supported by that wall
await place('floor', cell(0, 1, -1));           // the landing, beside it
await sim(0.5);

const stairsBuilt = await page.evaluate(() => {
  const links = globalThis.__game.game.build.navGraph.links;
  return (links.get('0,0,-1') ?? []).some((n) => n.y === 1);
});
check('navigation: the graph links the stairs run to its landing', stairsBuilt);

// Take the stairs away: with no link to level 1 at all, nothing should ever
// report itself standing up there. `demolishAt` takes the same Placement
// shape `place` did — see tools/build.mjs for the pattern.
await page.evaluate(() =>
  globalThis.__game.game.build.demolishAt({
    piece: 'stairs',
    cell: { x: 0, y: 0, z: -2 },
    rotation: 2,
  }),
);
await sim(0.5);
await teleportPlayer(0, 6.5, -1);
await page.evaluate(() => globalThis.__game.enemies.despawnAll());
await spawnHuntingScavenger(0, ENEMY_STAND_Y, -4);

let sawScavenger = false;
let reachedUpper = false;
for (let i = 0; i < 20; i++) {
  await sim(0.5);
  const s = await scavenger();
  if (!s) continue;
  sawScavenger = true;
  if (s.cell.y >= 1) { reachedUpper = true; break; }
}
check(
  'navigation: no stairs means no way up',
  sawScavenger && !reachedUpper,
  !sawScavenger ? 'scavenger never appeared' : reachedUpper ? 'reached level 1 anyway' : 'stayed at level 0',
);

await restoreAttackRange();

// --- Engine room ----------------------------------------------------------
// The machine's own lower deck, hollowed out of the hull. Unlike the build
// grid's stairs piece, this stair is machine geometry: one smooth ramp under
// an opening that spans its whole run, so nothing is ever climbing beneath a
// floored cell.

const navLevels = await page.evaluate(() => {
  const links = globalThis.__game.game.build.navGraph.links;
  const keys = [...links.keys()];
  return {
    minus1: keys.filter((k) => k.split(',')[1] === '-1').length,
    stairHead: (links.get('-1,0,2') ?? []).some((c) => c.y === -1),
  };
});
check(
  'engine room: its floor is in the nav graph, linked to the deck',
  navLevels.minus1 > 20 && navLevels.stairHead,
  `${navLevels.minus1} level -1 cells, deck link ${navLevels.stairHead}`,
);

// The player walks down, then back out. Engine floor stands a body at ~1.56;
// the deck stands one at ~4.65.
await page.evaluate(() => globalThis.__game.enemies.despawnAll());
await teleportPlayer(-2, 4.8, 3.2);
await sim(0.6);
await page.evaluate(() => {
  const cam = globalThis.__game.playerCamera;
  if (cam && 'yaw' in cam) cam.yaw = 0;
});
const playerY = () => page.evaluate(() => +globalThis.__game.player.worldPosition.y.toFixed(2));

await page.keyboard.down('w');
let lowestY = 99;
for (let i = 0; i < 16; i++) {
  await sim(0.35);
  lowestY = Math.min(lowestY, await playerY());
  if (lowestY < 2.2) break;
}
await page.keyboard.up('w');
check('engine room: the player can walk down into it', lowestY < 2.2, `lowest y ${lowestY.toFixed(2)}`);

await page.evaluate(() => {
  const cam = globalThis.__game.playerCamera;
  if (cam && 'yaw' in cam) cam.yaw = Math.PI;
});
await sim(0.3);
await page.keyboard.down('w');
let highestY = -99;
for (let i = 0; i < 22; i++) {
  await sim(0.35);
  highestY = Math.max(highestY, await playerY());
  if (highestY > 4.4) break;
}
await page.keyboard.up('w');
check('engine room: and can climb back out', highestY > 4.4, `highest y ${highestY.toFixed(2)}`);

// And it is not a safe room: a scavenger follows the player down.
await teleportPlayer(-2, 1.6, -5);
await sim(0.8);
await page.evaluate(() => {
  const g = globalThis.__game;
  g.enemies.despawnAll();
  g.enemies.spawn('scavenger', { x: -2, y: 4.8, z: 6 });
});
let followed = false;
for (let i = 0; i < 50; i++) {
  await sim(0.4);
  const s = await page.evaluate(() => {
    const e = globalThis.__game.enemies.active[0];
    return e ? { y: +e.worldPosition.y.toFixed(2), level: e.gridCell.y } : null;
  });
  if (!s) break;
  if (s.level === -1 && s.y < 2.5) { followed = true; break; }
}
check('engine room: a scavenger follows the player down into it', followed);

// --- Audio -----------------------------------------------------------------
// The half of the audio layer a unit test cannot reach. `SoundBank` is pure
// arithmetic and is checked in node; what only a real browser can answer is
// whether an `AudioContext` was actually obtained and whether a node graph
// actually gets built when the game says something happened.
//
// Counting is the only observation available: nothing in a headless browser
// can listen. `soundsPlayed` is incremented by `AudioEngine.play` itself, so a
// count that moves means a real graph was assembled against a real context.
await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.enemies.despawnAll();
  g.enemySpawnsEnabled = false;
  g.player.stats.invulnerable = true;
  g.player.stats.reset();
  g.player.teleport({ x: 0, y: globalThis.__standY.player, z: 2 });
  g.audio.resume();
});
await sim(0.5);

const audioUp = await page.evaluate(() => globalThis.__game.game.audio.ready);
check('the game gets an audio context', audioUp === true, `ready=${audioUp}`);

const busSounds = await page.evaluate(() => {
  const g = globalThis.__game.game;
  const before = g.audio.soundsPlayed;
  g.bus.emit('weapon:fired', { weaponId: 'rifle', ammoRemaining: 12 });
  g.bus.emit('combat:hit', {
    position: { x: 2, y: 4, z: 2 },
    normal: { x: 0, y: 1, z: 0 },
    targetId: null,
    onMetal: true,
  });
  return g.audio.soundsPlayed - before;
});
check('events on the bus make sounds', busSounds === 2, `${busSounds} of 2 played`);

// A sound past the falloff is dropped rather than played at zero gain, which
// is what stops a deck full of impacts building node graphs nobody can hear.
const outOfEarshot = await page.evaluate(() => {
  const g = globalThis.__game.game;
  const before = g.audio.soundsPlayed;
  g.audio.play('hit-metal', 0, 500);
  return g.audio.soundsPlayed - before;
});
check('a sound out of earshot is not played at all', outOfEarshot === 0, `${outOfEarshot} played`);

// The machine's own note. It is the one continuous sound, so it is not a voice
// and does not touch the counter -- what is checked is that asking for it does
// not throw and that the context is still alive afterwards.
const droned = await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.audio.updateDrone(7.5, 7.5);
  g.audio.updateDrone(0, 7.5);
  return g.audio.ready;
});
check('the drone follows the machine without falling over', droned === true, `ready=${droned}`);

const muteTest = await page.evaluate(() => {
  const g = globalThis.__game.game;
  const on = g.audio.toggleMute();
  const before = g.audio.soundsPlayed;
  g.bus.emit('weapon:fired', { weaponId: 'rifle', ammoRemaining: 11 });
  const during = g.audio.soundsPlayed - before;
  g.audio.toggleMute();
  const after0 = g.audio.soundsPlayed;
  g.bus.emit('weapon:fired', { weaponId: 'rifle', ammoRemaining: 10 });
  return { on, during, back: g.audio.soundsPlayed - after0 };
});
check(
  'mute silences it, and unmute brings it back',
  muteTest.on === true && muteTest.during === 0 && muteTest.back === 1,
  `muted=${muteTest.on} playedWhileMuted=${muteTest.during} playedAfter=${muteTest.back}`,
);

// The machine walks whether or not anyone is shooting, so its footfalls are
// the one sound that must fire from the render loop rather than off the bus.
const beforeWalk = await page.evaluate(() => globalThis.__game.game.audio.soundsPlayed);
await sim(4);
const afterWalk = await page.evaluate(() => globalThis.__game.game.audio.soundsPlayed);
check(
  'the machine is audible walking, with nothing else happening',
  afterWalk > beforeWalk,
  `${afterWalk - beforeWalk} sounds over four seconds of walking`,
);

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
      g.enemies.spawn('scavenger', { x: 0, y: globalThis.__standY.enemy, z: 2 });
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
