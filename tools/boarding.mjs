/**
 * Browser acceptance for the playable boarding skiff.
 *
 * This drives the real VehicleScene through the running game and checks the
 * counterplay edges that pure choreography tests cannot see: hull Damageable
 * cleanup, crew/hook retreat reasons, world landing callbacks, and the rule
 * that landed boarders keep retreat from becoming terminal until they die.
 */
import { chromium } from '@playwright/test';
import { BASE_URL } from './base-url.mjs';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));
page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) console.log(`NAV  ${frame.url()}`); });

try {
await page.goto(
  `${BASE_URL}/?nolock=1&nomenu=1&quality=low&seed=boarding-harness&nospawn=1&notex=1&nomodel=1&nosound=1`,
  { waitUntil: 'load' },
);
await page.waitForFunction(() => '__game' in globalThis, null, { timeout: 60_000 });

const simTime = () => page.evaluate(() => globalThis.__game.debugStats().simTime);
async function sim(seconds) {
  const start = await simTime();
  const deadline = Date.now() + 90_000;
  while ((await simTime()) - start < seconds) {
    await page.waitForTimeout(120);
    if (Date.now() > deadline) throw new Error(`sim(${seconds}) timed out`);
  }
}

await page.evaluate(() => {
  const game = globalThis.__game.game;
  game.enemySpawnsEnabled = false;
  game.tutorialReadyAt = null;
  globalThis.__boardingHarness = { ended: [], crossed: [], killed: [], loot: [], survived: [] };
  game.bus.on('boarding:ended', (event) => globalThis.__boardingHarness.ended.push(event));
  game.bus.on('boarding:crossed', (event) => globalThis.__boardingHarness.crossed.push(event));
  game.bus.on('enemy:killed', (event) => globalThis.__boardingHarness.killed.push(event));
  game.bus.on('loot:collected', (event) => globalThis.__boardingHarness.loot.push(event));
  game.bus.on('boarding:survived', (event) => globalThis.__boardingHarness.survived.push(event));
});
// Allow the skipped opening and the first fixed update to settle before the
// harness takes ownership of the single encounter.
await sim(1);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
};
const state = () => page.evaluate(() => {
  const snapshot = globalThis.__game.game.vehicleScene.manager.snapshot;
  return snapshot ? {
    phase: snapshot.phase,
    crewStatus: [...snapshot.crewStatus],
    hullHealth: snapshot.hullHealth,
    hookHealth: snapshot.hookHealth,
  } : null;
});
const events = () => page.evaluate(() => ({
  ended: [...globalThis.__boardingHarness.ended],
  crossed: [...globalThis.__boardingHarness.crossed],
  killed: [...globalThis.__boardingHarness.killed],
  loot: [...globalThis.__boardingHarness.loot],
  survived: [...globalThis.__boardingHarness.survived],
}));
async function until(predicate, seconds = 20) {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`condition timed out after ${seconds}s`);
    await page.waitForTimeout(120);
  }
}
async function spawn() {
  return page.evaluate(() => globalThis.__game.game.vehicleScene.spawn('port'));
}
async function resetEvents() {
  await page.evaluate(() => {
    globalThis.__boardingHarness.ended.length = 0;
    globalThis.__boardingHarness.crossed.length = 0;
    globalThis.__boardingHarness.killed.length = 0;
    globalThis.__boardingHarness.loot.length = 0;
    globalThis.__boardingHarness.survived.length = 0;
  });
}
async function damageCollider(kind, index = 0) {
  return page.evaluate(({ kind, index }) => {
    const game = globalThis.__game.game;
    const snapshot = game.vehicleScene.manager.snapshot;
    if (!snapshot) return { ok: false, reason: 'no encounter' };
    const vector = game.player.worldPosition.clone();
    const direction = game.player.worldPosition.clone().set(0, -1, 0);
    let origin;
    let expected;
    if (kind === 'vehicle') {
      origin = vector.set(snapshot.lateral, 12, snapshot.forward).clone();
      expected = 'skiff-hull';
    } else if (kind === 'crew') {
      origin = vector.set(
        snapshot.lateral + (index === 0 ? -0.59 : 0.59),
        12,
        snapshot.forward + 0.35,
      ).clone();
      expected = `skiff-crew-${index}`;
    } else {
      const hook = game.vehicleScene.hookWorldPosition;
      if (!hook) return { ok: false, reason: 'hook not active' };
      origin = hook.clone().add({ x: 0, y: 1, z: 0 });
      expected = 'skiff-hook';
    }
    const hit = game.physics.raycast(origin, direction, 30);
    const damageable = hit?.userData;
    if (!damageable || damageable.id !== expected) {
      const actors = game.vehicleScene.actors?.map((actor) => ({
        id: game.physics.getUserData(actor.collider)?.id,
        position: actor.body.translation(),
      }));
      return { ok: false, reason: damageable?.id ?? 'no hit', actors };
    }
    damageable.takeDamage(999);
    return { ok: true, id: damageable.id };
  }, { kind, index });
}

// 1. The hull collider is a real vehicle Damageable and reaches destruction.
await resetEvents();
await spawn();
await until(async () => ['firing-pass', 'alongside', 'hook-flight'].includes((await state())?.phase));
const hullHit = await damageCollider('vehicle');
await until(async () => (await events()).ended.length > 0);
check('the hull Damageable is reachable by a physics ray', hullHit.ok, JSON.stringify(hullHit));
const hullEvents = await events();
check('hull damage reaches the terminal destroyed outcome', hullEvents.ended.at(-1)?.outcome === 'hull');
check('destroyed skiff salvage is emitted exactly once', hullEvents.loot.length === 1,
  `${hullEvents.loot.length} loot event(s)`);

// 2. Killing both seated crew members makes the skiff retreat without a hook.
await resetEvents();
await spawn();
await sim(0.2);
const crew0Hit = await damageCollider('crew', 0);
const crew1Hit = await damageCollider('crew', 1);
console.log(`CREW RAY  ${JSON.stringify(crew0Hit)}  ${JSON.stringify(crew1Hit)}`);
await until(async () => (await state())?.phase === 'retreat');
await until(async () => (await events()).ended.length > 0);
const crewEvents = await events();
check('both seated crew Damageables are reachable by physics rays', crew0Hit.ok && crew1Hit.ok,
  `${JSON.stringify(crew0Hit)}, ${JSON.stringify(crew1Hit)}`);
check('crew counterplay produces a crew retreat outcome', crewEvents.ended.at(-1)?.outcome === 'crew');
check('two dead seated crew members produce zero crossings', crewEvents.crossed.length === 0);

// 3. Destroying the hook before contact prevents boarding and reports hook.
await resetEvents();
await spawn();
await until(async () => (await state())?.phase === 'hook-flight', 30);
const hookHit = await damageCollider('hook');
await until(async () => (await events()).ended.length > 0);
check('the active hook Damageable is reachable by a physics ray', hookHit.ok, JSON.stringify(hookHit));
check('hook counterplay produces a hook retreat outcome', (await events()).ended.at(-1)?.outcome === 'hook');

// The player can also cut an intact attached hook through the actual hold-E
// interaction seam. This is deliberately separate from the ray test above.
await resetEvents();
await spawn();
await until(async () => ['attached', 'boarding'].includes((await state())?.phase), 30);
await page.evaluate(() => {
  const game = globalThis.__game.game;
  const hook = game.vehicleScene.hookWorldPosition;
  if (!hook) throw new Error('hook did not expose a world position');
  game.player.teleport({ x: hook.x, y: game.player.worldPosition.y, z: hook.z });
});
await page.keyboard.down('e');
await sim(1.6);
await page.keyboard.up('e');
await until(async () => (await events()).ended.length > 0, 10);
check('holding E near an attached hook cuts it after a sustained duration',
  (await events()).ended.at(-1)?.outcome === 'hook');

// 4/5. Let one complete attack run. The real scene must reach boarding and
// emit world landing callbacks. Keeping the spawned boarders alive then holds
// the retreat open; removing them permits the terminal defended outcome.
await resetEvents();
await spawn();
await sim(0.2);
const deadCrewHit = await damageCollider('crew', 0);
await until(async () => (await state())?.phase === 'boarding', 30);
await until(async () => (await events()).crossed.length > 0, 30);
const crossed = await events();
check('the first crew Damageable can be killed before boarding', deadCrewHit.ok, JSON.stringify(deadCrewHit));
check('a live skiff reaches boarding and lands only the survivor',
  crossed.crossed.length === 1 && crossed.crossed[0]?.crewIndex === 1,
  `${crossed.crossed.length} crossing event(s)`);
await until(async () => (await state())?.phase === 'retreat', 30);
await sim(3.5);
check('landed boarders keep retreat nonterminal until cleared', (await events()).ended.length === 0);
const bodiesBeforeBoarderKill = await page.evaluate(() => globalThis.__game.game.physics.bodyCount);
await page.evaluate(() => {
  for (const enemy of globalThis.__game.game.enemies.active) enemy.takeDamage(999);
});
await until(async () => (await events()).ended.length > 0, 8);
const finalEvents = await events();
check('killing landed boarders finishes the defended outcome', finalEvents.ended.at(-1)?.outcome === 'defended');
check('each landed kill emits exactly one reward event',
  finalEvents.killed.length === crossed.crossed.length && finalEvents.loot.length === finalEvents.killed.length + 1,
  `${finalEvents.killed.length} kills, ${finalEvents.loot.length} loot events`);
const bodiesAfterCleanup = await page.evaluate(() => globalThis.__game.game.physics.bodyCount);
check('terminal cleanup removes the encounter bodies', bodiesAfterCleanup < bodiesBeforeBoarderKill);
check('boarding recovery is reported once', finalEvents.ended.length === 1 && finalEvents.survived.length === 1);

if (errors.length) {
  console.log(`\n${errors.length} console error(s):`);
  for (const error of errors.slice(0, 8)) console.log(` - ${error}`);
}
const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} boarding checks passed`);
if (failed.length || errors.length) process.exitCode = 1;
} catch (error) {
  console.error('Boarding failure state:', await page.evaluate(() => {
    const g = globalThis.__game?.game;
    return g ? {
      sim: g.state.simTime, paused: g.state.paused, dead: g.state.playerDead,
      state: g.vehicleManager.snapshot,
      player: g.player.worldPosition,
      enemies: g.enemies.active.map((e) => ({ id: e.id, at: e.worldPosition, state: e.aiState })),
      events: globalThis.__boardingHarness,
    } : null;
  }).catch(() => null));
  throw error;
} finally {
  await browser.close();
}
