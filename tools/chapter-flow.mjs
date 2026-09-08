/* global process, console */

/**
 * Browser acceptance for the radio-to-wreck chapter pass.
 *
 * The normal opening flow proves the first eligible chest through the real
 * keyboard reel path. Expedition, research, and save checks use explicitly
 * labelled in-browser fixtures after that flow; those fixtures do not claim a
 * normal thirty-minute play session or fabricate resource-economy evidence.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { browserLaunchOptions } from './browser-options.mjs';

process.env.MMF_PORT ??= '5194';
const { BASE_URL } = await import('./base-url.mjs');

const graphicsQuery = process.env.MMF_GRAPHICS === '1' ? '&quality=high' : '&quality=low&notex=1&nomodel=1';
const QUERY = `?nolock=1&nomenu=1&seed=chapter-flow&nospawn=1&nosound=1${graphicsQuery}`;
const MENU_QUERY = `?nolock=1&seed=chapter-flow&nospawn=1&nosound=1${graphicsQuery}`;

const browser = await chromium.launch(browserLaunchOptions);
const page = await browser.newPage({ viewport: { width: 900, height: 540 } });
const errors = [];
const checks = [];
const evidence = { normalOpeningRadio: [], stagedResearchAndChapter: [] };

page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));

const check = (name, ok, detail = '', flow = 'normalOpeningRadio') => {
  checks.push({ name, ok: Boolean(ok), detail, flow });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
};

const evaluate = (fn, arg) => page.evaluate(fn, arg);
const snapshot = () => evaluate(() => {
  const g = globalThis.__game;
  const game = g.game;
  return {
    stats: g.debugStats(),
    opening: game.opening.phase,
    story: game.story.currentPhase,
    radio: game.progression.earlyRadioDrop.toSave(),
    resources: {
      scrap: g.resources.count('scrap'),
      components: g.resources.count('components'),
      fuel: g.resources.count('fuel'),
    },
    power: { fuel: game.machine.power.fuel, capacity: game.machine.power.capacity, draw: game.machine.power.draw },
    sessionMetrics: g.sessionMetrics.snapshot(),
  };
});

async function waitForGame() {
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 60_000 });
}

async function waitUntil(predicate, seconds = 20) {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() > deadline) throw new Error(`condition timed out after ${seconds}s`);
    await page.waitForTimeout(80);
  }
}

/** Advance the actual fixed simulation while rendering once at the end. */
async function step(seconds) {
  await evaluate((duration) => {
    const game = globalThis.__game.game;
    game.stop();
    let left = Math.max(0, duration);
    while (left > 0) {
      const dt = Math.min(1 / 60, left);
      game.fixedUpdate(dt);
      left -= dt;
    }
    game.render(1);
    game.start();
  }, seconds);
}

async function advanceUntil(predicate, maxSimulationSeconds, chunkSeconds = 0.25) {
  let elapsed = 0;
  while (elapsed < maxSimulationSeconds) {
    if (await predicate()) return true;
    const chunk = Math.min(chunkSeconds, maxSimulationSeconds - elapsed);
    await step(chunk);
    elapsed += chunk;
  }
  return Boolean(await predicate());
}

async function walkToward(x, z, simulationSeconds = 4) {
  const startSimulation = await evaluate(() => globalThis.__game.game.state.simTime);
  // SwiftShader can spend most of a wall-clock second in one fixed-step
  // batch. Route budgets are simulation budgets; this watchdog only catches a
  // genuinely wedged browser and never makes a valid slow route fail.
  const deadline = Date.now() + 60_000;
  let previousDistance = Number.POSITIVE_INFINITY;
  let stagnantSteps = 0;
  let lastState = null;
  while (Date.now() < deadline) {
    const state = await evaluate(({ x: tx, z: tz }) => {
      const g = globalThis.__game;
      const p = g.player.worldPosition;
      const dx = tx - p.x;
      const dz = tz - p.z;
      g.playerCamera.setYaw(Math.atan2(-dx, -dz));
      return {
        distance: Math.hypot(dx, dz),
        x: p.x,
        z: p.z,
        grounded: g.debugStats().grounded,
        simTime: g.game.state.simTime,
      };
    }, { x, z });
    lastState = state;
    if (state.distance < 0.65) return;
    const elapsed = state.simTime - startSimulation;
    if (elapsed >= simulationSeconds) {
      throw new Error(`walk waypoint timed out at (${x}, ${z}) after ${elapsed.toFixed(2)} simulated seconds; last (${state.x.toFixed(2)}, ${state.z.toFixed(2)})`);
    }
    // A waypoint is part of the physical route, so silently timing out at a
    // collider would make the following checks exercise the wrong location.
    // Keep the failure local and report the last waypoint in the harness JSON.
    if (state.distance >= previousDistance - 0.01) stagnantSteps++;
    else stagnantSteps = 0;
    if (stagnantSteps >= 12) {
      throw new Error(`walk waypoint stalled at (${x}, ${z}); remaining ${state.distance.toFixed(2)}m from (${state.x.toFixed(2)}, ${state.z.toFixed(2)}), grounded=${state.grounded}`);
    }
    previousDistance = state.distance;
    const remaining = simulationSeconds - elapsed;
    const chunk = Math.min(0.18, remaining, Math.max(0.06, state.distance / 4.5 * 0.45));
    await page.keyboard.down('w');
    await step(chunk);
    await page.keyboard.up('w');
    await step(0.05);
  }
  throw new Error(`walk waypoint watchdog expired at (${x}, ${z}); last (${lastState?.x?.toFixed?.(2) ?? '?'}, ${lastState?.z?.toFixed?.(2) ?? '?'})`);
}

async function walkRoute(waypoints) {
  for (const waypoint of waypoints) {
    await walkToward(waypoint.x, waypoint.z, waypoint.seconds ?? 5);
  }
}

async function maybeScreenshot(name) {
  if (process.env.CHAPTER_SCREENSHOTS !== '1') return null;
  await mkdir('docs/art/chapter-validation', { recursive: true });
  const path = `docs/art/chapter-validation/${name}.png`;
  await page.screenshot({ path });
  return path;
}

async function start(url) {
  await page.goto(url, { waitUntil: 'load' });
  await waitForGame();
  await page.waitForTimeout(250);
}

try {
  await start(`${BASE_URL}/${QUERY}`);
  await evaluate(() => {
    const g = globalThis.__game;
    globalThis.__chapterEvents = { hooked: 0, radio: [], opened: 0 };
    g.bus.on('radio:found', (event) => { globalThis.__chapterEvents.radio.push(event); });
    g.bus.on('loot:collected', (event) => {
      if (event.source.toLowerCase().includes('salvage')) globalThis.__chapterEvents.opened++;
    });
  });

  await waitUntil(() => evaluate(() => globalThis.__game.game.opening.phase === 'done'), 15);
  const initial = await snapshot();
  check('normal boot starts with 260 scrap', initial.resources.scrap === 260, String(initial.resources.scrap));
  check('opening is playable before the radio test', initial.opening === 'done');
  await waitUntil(() => evaluate(() => globalThis.__game.game.salvage.targets.length > 0), 10);

  // The target is spawned by SalvageField. The harness only aims and presses
  // F; it never calls salvage.hook/open or grants a progression fact.
  const target = await evaluate(() => {
    const g = globalThis.__game;
    const crate = g.game.salvage.targets[0];
    if (!crate) return null;
    const p = g.player.worldPosition;
    const dx = crate.x - p.x;
    const dy = crate.y - (p.y + 0.35);
    const dz = crate.z - p.z;
    const length = Math.hypot(dx, dy, dz);
    const yaw = Math.atan2(-dx, -dz);
    g.playerCamera.setYaw(yaw);
    // PlayerCamera keeps pitch private because normal play changes it through
    // mouse deltas. This is still the real F/reel path; the harness only sets
    // the deterministic aim needed to reach the live chest.
    g.playerCamera.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
    return { x: crate.x, y: crate.y, z: crate.z, distance: Math.hypot(dx, dy, dz) };
  });
  check('the first eligible chest spawns within 45m', target !== null && target.distance <= 45.1, JSON.stringify(target));
  if (target) {
    const reachedReelRange = await advanceUntil(() => evaluate(() => {
      const g = globalThis.__game;
      const crate = g.game.salvage.targets[0];
      if (!crate) return false;
      const p = g.player.worldPosition;
      return Math.hypot(crate.x - p.x, crate.y - (p.y + 0.35), crate.z - p.z) <= 32;
    }), 20);
    check('first chest drifts into real reel range', reachedReelRange, '', 'normalOpeningRadio');
    if (!reachedReelRange) throw new Error('first eligible chest did not reach reel range within 20s simulated time');
    // REEL_RANGE is 34m. Let the live crate drift into that range, then aim
    // once more after a rendered camera update before pressing the real key.
    await evaluate(() => {
      const g = globalThis.__game;
      const crate = g.game.salvage.targets[0];
      if (!crate) return;
      const p = g.player.worldPosition;
      const dx = crate.x - p.x;
      const dy = crate.y - (p.y + 0.35);
      const dz = crate.z - p.z;
      const length = Math.hypot(dx, dy, dz);
      g.playerCamera.setYaw(Math.atan2(-dx, -dz));
      g.playerCamera.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
    });
    await step(0.1);
    await page.keyboard.press('f');
    await step(0.18);
    const cue = await evaluate(() => {
      const g = globalThis.__game.game;
      const head = g.reelHead?.position;
      const at = g.hookAt;
      return { active: Boolean(g.hook), aligned: Boolean(head && at) && head.distanceTo(at) < 0.01 };
    });
    check('reel cue endpoint follows the live hook', cue.active && cue.aligned, JSON.stringify(cue));
    await step(4);
  }

  const radioRun = await snapshot();
  const events = await evaluate(() => {
    const metrics = globalThis.__game.sessionMetrics.snapshot();
    return {
      ...globalThis.__chapterEvents,
      hooked: metrics.milestones.filter((milestone) => milestone.name === 'salvage.hooked').length,
    };
  });
  check('the radio is found through the real hook/reel path', events.hooked === 1 && events.radio.length === 1, JSON.stringify(events));
  check('radio reward includes its fixed cache after normal salvage',
    radioRun.resources.scrap >= initial.resources.scrap + 34 && radioRun.resources.fuel >= 4,
    JSON.stringify({ before: initial.resources, after: radioRun.resources }));
  check('radio ledger records its first eligible opening once',
    radioRun.radio.status === 'found' && radioRun.radio.eligibleChestsOpened === 1,
    JSON.stringify(radioRun.radio));
  const radioElapsed = events.radio[0]?.elapsedSincePlayable;
  check('radio is found within the first 300 playable seconds',
    typeof radioElapsed === 'number' && Number.isFinite(radioElapsed) && radioElapsed <= 300,
    String(radioElapsed));
  check('normal flow records radio in bounded session metrics',
    radioRun.sessionMetrics.milestones.some((milestone) => milestone.name === 'radio.found'));
  evidence.normalOpeningRadio.push({ initial, target, radioRun, events });
  await maybeScreenshot('radio-found');

  // Research and combat values are an explicit staged fixture. The normal
  // opening above remains the only economy claim in this harness.
  const research = await evaluate(() => {
    const g = globalThis.__game;
    // Explicit staged fixture: the normal chest path above remains the only
    // economy claim; this supplies the already-found radio state for isolated
    // research acceptance checks when a normal roll is intentionally absent.
    g.game.progression.earlyRadioDrop.restore({ status: 'found', armedAtSimTime: 0, foundAtSimTime: 1, foundAtDistance: 42, eligibleChestsOpened: 1 });
    g.game.radioModel.visible = true;
    g.game.machine.power.registerConsumer({ id: 'fixed-radio', draw: 1, priority: 'station' });
    g.game.story.restore({ chapterId: 'wreck-one', phase: 'signal', arrivalDistance: null, journalsRead: [], uniqueCollected: false, nextSignal: false });
    const beforePoor = [...g.game.progression.upgrades.researchedIds];
    g.game.researchUpgrade('longstride-rams');
    const poorRejected = g.game.progression.upgrades.researchedIds.length === beforePoor.length;

    g.game.machine.power.unregisterConsumer('fixed-radio');
    g.game.researchUpgrade('longstride-rams');
    const deadPowerRejected = !g.game.progression.upgrades.hasResearched('longstride-rams');
    g.game.machine.power.registerConsumer({ id: 'fixed-radio', draw: 1, priority: 'station' });

    g.resources.deposit('scrap', 300);
    g.resources.deposit('components', 40);
    g.game.researchUpgrade('longstride-rams');
    g.game.researchUpgrade('torque-clutch');
    g.game.activateUpgrade('longstride-rams');
    const activeBefore = g.game.progression.upgrades.active('propulsion');
    g.game.activateUpgrade('torque-clutch');
    const activeAfter = g.game.progression.upgrades.active('propulsion');

    g.game.researchUpgrade('heavy-breech');
    g.game.activateUpgrade('heavy-breech');
    g.game.defense.register('chapter-fixture-turret');
    const defense = {
      damage: g.game.defense.effectiveDamage,
      draw: g.game.defense.effectivePowerDraw,
      fireRate: g.game.defense.effectiveFireRate,
    };
    g.game.closePanels();
    return { poorRejected, deadPowerRejected, activeBefore, activeAfter, defense };
  });
  check('staged research rejects an unaffordable upgrade', research.poorRejected, JSON.stringify(research), 'stagedResearchAndChapter');
  check('staged research rejects a dead powered-radio path', research.deadPowerRejected, JSON.stringify(research), 'stagedResearchAndChapter');
  check('staged researched propulsion swaps one active branch slot',
    research.activeBefore === 'longstride-rams' && research.activeAfter === 'torque-clutch', JSON.stringify(research), 'stagedResearchAndChapter');
  check('staged defense activation changes damage, rate, and draw',
    Math.abs(research.defense.damage - 60) < 0.01 &&
    Math.abs(research.defense.fireRate - 0.8) < 0.01 &&
    research.defense.draw === 4, JSON.stringify(research.defense), 'stagedResearchAndChapter');

  // Explicit staged power recovery fixture. The budget is granted here so
  // this isolated research check makes no economy claim about the normal
  // opening: a healthy 16-capacity generator carries refinery 10, radio 1,
  // and a fixture heavy gun 4. The governor lowers capacity to 14, shedding
  // the station class (including the radio); uninstalling it through the
  // ordinary Research UI restores capacity and radio power for free.
  const governor = await evaluate(() => {
    const g = globalThis.__game;
    const power = g.game.machine.power;
    power.unregisterConsumer('fixed-radio');
    power.unregisterConsumer('chapter-fixture-refinery');
    power.unregisterConsumer('chapter-fixture-heavy-gun');
    power.registerConsumer({ id: 'fixed-radio', draw: 1, priority: 'station' });
    power.registerConsumer({ id: 'chapter-fixture-refinery', draw: 10, priority: 'station' });
    power.registerConsumer({ id: 'chapter-fixture-heavy-gun', draw: 4, priority: 'defense' });
    // Staged fixture purse: ordinary research still consumes the defined cost.
    g.resources.deposit('scrap', 200);
    g.resources.deposit('components', 30);
    const before = {
      scrap: g.resources.count('scrap'),
      components: g.resources.count('components'),
      capacity: power.capacity,
      radioPowered: power.isPowered('fixed-radio'),
    };
    g.game.researchUpgrade('lean-governor');
    const researched = g.game.progression.upgrades.hasResearched('lean-governor');
    g.game.activateUpgrade('lean-governor');
    const afterInstall = {
      researched,
      active: g.game.progression.upgrades.active('power'),
      scrap: g.resources.count('scrap'),
      components: g.resources.count('components'),
      capacity: power.capacity,
      radioPowered: power.isPowered('fixed-radio'),
    };
    g.game.openResearch();
    return { before, afterInstall };
  });
  check('staged Governor research uses its ordinary resource cost',
    governor.before.scrap - governor.afterInstall.scrap === 40 &&
    governor.before.components - governor.afterInstall.components === 8 &&
    governor.afterInstall.researched && governor.afterInstall.active === 'lean-governor',
    JSON.stringify(governor), 'stagedResearchAndChapter');
  check('staged Governor shed leaves the radio unpowered at capacity fourteen',
    governor.before.capacity === 16 && governor.before.radioPowered &&
    governor.afterInstall.capacity === 14 && !governor.afterInstall.radioPowered,
    JSON.stringify(governor), 'stagedResearchAndChapter');
  await waitUntil(() => evaluate(() => Boolean(document.querySelector('[data-deactivate-branch="power"]'))), 5);
  const uninstallReady = await evaluate(() => {
    const button = document.querySelector('[data-deactivate-branch="power"]');
    return button instanceof HTMLButtonElement ? { present: true, disabled: button.disabled } : { present: false, disabled: true };
  });
  check('Research UI enables power uninstall while the shed radio is stable',
    uninstallReady.present && !uninstallReady.disabled,
    JSON.stringify(uninstallReady), 'stagedResearchAndChapter');
  await page.locator('[data-deactivate-branch="power"]').click();
  await step(0.1);
  const afterUninstall = await evaluate(() => {
    const g = globalThis.__game;
    const power = g.game.machine.power;
    return {
      active: g.game.progression.upgrades.active('power'),
      scrap: g.resources.count('scrap'),
      components: g.resources.count('components'),
      capacity: power.capacity,
      radioPowered: power.isPowered('fixed-radio'),
    };
  });
  check('Research UI uninstall restores the radio without changing the purse',
    afterUninstall.active === null &&
    afterUninstall.scrap === governor.afterInstall.scrap &&
    afterUninstall.components === governor.afterInstall.components &&
    afterUninstall.capacity === 16 && afterUninstall.radioPowered,
    JSON.stringify(afterUninstall), 'stagedResearchAndChapter');
  await evaluate(() => {
    const power = globalThis.__game.game.machine.power;
    power.unregisterConsumer('chapter-fixture-refinery');
    power.unregisterConsumer('chapter-fixture-heavy-gun');
    globalThis.__game.game.closePanels();
  });

  const tutorialProfile = await evaluate(() => {
    const g = globalThis.__game;
    g.game.vehicleScene.clear();
    const spawned = g.game.vehicleScene.spawn('port', true);
    const profile = g.game.vehicleScene.manager.snapshot;
    g.game.vehicleScene.clear();
    return spawned && profile
      ? { hull: profile.hullHealth, hook: profile.hookHealth, crew: profile.crewHealth.length }
      : null;
  });
  check('staged tutorial spawn uses the reduced encounter profile',
    tutorialProfile?.hull === 220 && tutorialProfile?.hook === 45, JSON.stringify(tutorialProfile), 'stagedResearchAndChapter');

  // Chapter fixture: story state is staged at the signal boundary, then the
  // Game integration drives the actual approach/braking/dock effects.
  const approach = await evaluate(() => {
    const g = globalThis.__game;
    g.game.vehicleScene.clear();
    g.game.firstRun.restore({ completed: ['salvage', 'build-refinery', 'refine-components', 'build-workbench', 'build-defense', 'survive-boarding', 'repair'], counters: {} });
    g.game.progression.earlyRadioDrop.restore({ status: 'found', armedAtSimTime: 0, foundAtSimTime: 1, foundAtDistance: 42, eligibleChestsOpened: 1 });
    g.game.story.restore({ chapterId: 'wreck-one', phase: 'signal', arrivalDistance: null, journalsRead: [], uniqueCollected: false, nextSignal: false });
    return true;
  });
  void approach;
  await step(0.1);
  const arrival = await evaluate(() => globalThis.__game.game.story.toSave().active?.arrivalDistance ?? null);
  const approachState = await snapshot();
  check('staged story schedules a wreck only after radio and first-run completion',
    approachState.story === 'approach' && typeof arrival === 'number', JSON.stringify({ phase: approachState.story, arrival }), 'stagedResearchAndChapter');

  await evaluate((targetDistance) => {
    const g = globalThis.__game.game;
    g.machine.movement.setThrottle(0);
    g.machine.movement.setScriptedSpeedLimit(0);
    g.world.reset(targetDistance - 0.5);
  }, arrival);
  await step(4);
  await evaluate((targetDistance) => globalThis.__game.game.world.reset(targetDistance - 0.5), arrival);
  await step(0.1);
  const docked = await snapshot();
  check('staged approach reaches the safe dock boundary',
    docked.story === 'docked' && docked.stats.speed <= 0.15,
    JSON.stringify({ story: docked.story, speed: docked.stats.speed }), 'stagedResearchAndChapter');
  const destination = await evaluate(() => {
    const g = globalThis.__game;
    return { active: g.game.destination.active, docked: g.game.destination.docked, gangway: g.game.destination.gangwayEnabled };
  });
  check('docking enables the destination and gangway', destination.active && destination.docked && destination.gangway, JSON.stringify(destination), 'stagedResearchAndChapter');

  // Start at the machine, then walk the real capsule across the gangway and
  // central doorway. This is a physical route check; no destination teleport
  // is used after the fixture starts.
  await evaluate(() => {
    const g = globalThis.__game;
    g.player.teleport(g.machine.deckSpawn);
  });
  // The two starboard cargo crates occupy the direct x=0 to gangway lane.
  // Walk around their aft edge, then line up with the live gangway; this keeps
  // the route physical while avoiding a fixture teleport through a collider.
  await walkRoute([
    // Clear the starboard cargo crates first. The final two waypoints line up
    // with the live gangway and its docked gate; no jump or teleport crosses
    // the machine rail.
    { x: 1.8, z: -2.4, seconds: 4 },
    { x: 4.4, z: -2.4, seconds: 4 },
    { x: 4.4, z: 0, seconds: 4 },
    { x: 5.8, z: 0, seconds: 4 },
    { x: 8, z: 0, seconds: 4 },
  ]);
  const wreckEntry = await evaluate(() => {
    const g = globalThis.__game;
    const p = g.player.worldPosition;
    return {
      inside: g.game.destination.containsPlayer(p),
      onGangway: g.game.destination.playerOnGangway(p),
      x: p.x,
      z: p.z,
    };
  });
  check('player walks across the gangway into the wreck',
    wreckEntry.inside && !wreckEntry.onGangway,
    JSON.stringify(wreckEntry), 'stagedResearchAndChapter');

  await walkToward(14, 0, 4);
  // The gyro's own live collider occupies its center, so approach from the
  // clear side within INTERACT_REACH instead of steering into the prop.
  await walkToward(16.5, 1.8, 4);
  await page.keyboard.press('e');
  await step(0.25);
  const gyro = await evaluate(() => globalThis.__game.game.story.toSave());
  check('proximity E collection recovers the Course Gyro once', gyro.recoveredUniques.includes('course-gyro'), JSON.stringify(gyro), 'stagedResearchAndChapter');
  const secondGyro = await evaluate(() => globalThis.__game.game.collectCourseGyro?.() ?? false);
  check('Course Gyro collection is one-shot', secondGyro === false, String(secondGyro), 'stagedResearchAndChapter');

  // Safe saves are allowed while the player is inside the docked wreck. Keep
  // this checkpoint separate from the machine-side save below so persistence
  // proves the on-wreck capsule, health, upgrades, and unique collection.
  const wreckSaveState = await evaluate(() => {
    const g = globalThis.__game;
    g.game.player.stats.damage(7, 'chapter wreck save', g.player.worldPosition);
    g.game.machine.power.restore({ fuel: 37 });
    return {
      health: g.game.player.stats.health,
      fuel: g.game.machine.power.fuel,
      upgrades: g.game.progression.upgrades.toSave(),
      story: g.game.story.toSave(),
      position: { x: g.player.worldPosition.x, y: g.player.worldPosition.y, z: g.player.worldPosition.z },
    };
  });
  const wreckSaved = await evaluate(async () => globalThis.__game.game.saveTo('chapter-flow-wreck', 'manual', false));
  check('wreck-side save accepts a stable docked capsule', wreckSaved === true, JSON.stringify(wreckSaveState), 'stagedResearchAndChapter');
  const wreckReloaded = await evaluate(async () => {
    const g = globalThis.__game;
    const loaded = await g.game.loadFrom('chapter-flow-wreck');
    const p = g.player.worldPosition;
    return {
      loaded,
      inside: g.game.destination.containsPlayer(p),
      health: g.player.stats.health,
      fuel: g.game.machine.power.fuel,
      gyro: g.game.story.toSave().recoveredUniques.includes('course-gyro'),
      upgrades: g.game.progression.upgrades.toSave(),
      position: { x: p.x, y: p.y, z: p.z },
    };
  });
  check('wreck-side reload restores health, fuel, upgrades, and gyro',
    wreckReloaded.loaded && wreckReloaded.inside &&
    wreckReloaded.health === wreckSaveState.health &&
    Math.abs(wreckReloaded.fuel - wreckSaveState.fuel) < 0.1 &&
    wreckReloaded.gyro &&
    wreckReloaded.upgrades.active.propulsion === wreckSaveState.upgrades.active.propulsion,
    JSON.stringify(wreckReloaded), 'stagedResearchAndChapter');
  await step(1);
  const wreckSupport = await evaluate(() => {
    const g = globalThis.__game;
    const p = g.player.worldPosition;
    const stats = g.debugStats();
    return {
      inside: g.game.destination.containsPlayer(p),
      grounded: stats.grounded,
      y: p.y,
      playerY: stats.playerY,
    };
  });
  check('wreck-side reload capsule remains physically supported after one simulated second',
    wreckSupport.inside && wreckSupport.grounded,
    JSON.stringify(wreckSupport), 'stagedResearchAndChapter');

  // Return on foot to the machine radio, save at the stable dock boundary,
  // and reload through the title Continue path.
  await walkRoute([
    // Leave the gyro room through the central doorway before stepping back
    // onto the gangway. The doorway is a real opening in the wreck collider;
    // aiming diagonally at the gangway would press into the bulkhead.
    { x: 15.5, z: 3, seconds: 4 },
    { x: 15.5, z: 0, seconds: 4 },
    { x: 13.5, z: 0, seconds: 4 },
    { x: 5.8, z: 0, seconds: 6 },
    // Cross the machine's live gate first, then walk inside the rail line;
    // aiming diagonally for the radio would strike the closed rail at z=-2.
    { x: 4.4, z: 0, seconds: 4 },
  ]);
  const radioPosition = await evaluate(() => {
    const g = globalThis.__game;
    const world = g.player.worldPosition.clone();
    g.game.radioModel.getWorldPosition(world);
    return { x: world.x, z: world.z };
  });
  await walkToward(4.4, -2.4, 4);
  await walkToward(4.4, radioPosition.z, 4);
  await walkToward(radioPosition.x, radioPosition.z, 4);
  const onMachine = await evaluate(() => {
    const g = globalThis.__game;
    return g.game.destination.playerOnMachine(g.player.worldPosition);
  });
  check('player returns across the gangway to the machine', onMachine, String(onMachine), 'stagedResearchAndChapter');
  await page.keyboard.press('e');
  await waitUntil(() => evaluate(() => Boolean(globalThis.document.querySelector('[data-radio-depart]'))), 5);

  const beforeSave = await evaluate(() => {
    const g = globalThis.__game;
    g.game.player.stats.damage(7, 'chapter fixture', g.player.worldPosition);
    g.game.machine.power.restore({ fuel: 37 });
    return {
      health: g.player.stats.health,
      fuel: g.game.machine.power.fuel,
      upgrades: g.game.progression.upgrades.toSave(),
      story: g.game.story.toSave(),
    };
  });
  await evaluate(() => globalThis.__game.game.closePanels());
  const saved = await evaluate(async () => globalThis.__game.game.saveTo('chapter-flow-docked', 'manual', true));
  const continuedSave = await evaluate(async () => globalThis.__game.game.saveTo('quicksave', 'manual', false));
  check('docked chapter fixture writes a stable partial save',
    saved === true && continuedSave === true,
    JSON.stringify(beforeSave), 'stagedResearchAndChapter');

  await start(`${BASE_URL}/${MENU_QUERY}`);
  await waitUntil(() => evaluate(() => Boolean(globalThis.document.querySelector('[data-id="continue"]'))), 20);
  await page.locator('[data-id="continue"]').click();
  await waitUntil(() => evaluate(() => globalThis.__game.game.story.currentPhase === 'docked'), 20);
  await snapshot();
  const continuedState = await evaluate(() => {
    const g = globalThis.__game;
    return {
      wreck: { active: g.game.destination.active, docked: g.game.destination.docked },
      health: g.player.stats.health,
      fuel: g.game.machine.power.fuel,
      gyro: g.game.story.toSave().recoveredUniques.includes('course-gyro'),
      upgrades: g.game.progression.upgrades.toSave(),
    };
  });
  check('docked reload restores wreck, health, fuel, upgrades, and gyro',
    continuedState.wreck.active && continuedState.wreck.docked &&
    continuedState.health === beforeSave.health && Math.abs(continuedState.fuel - beforeSave.fuel) < 0.1 &&
    continuedState.gyro && continuedState.upgrades.active.propulsion === beforeSave.upgrades.active.propulsion,
    JSON.stringify(continuedState), 'stagedResearchAndChapter');

  // Exercise the actual title New Game callback on the loaded docked world,
  // rather than treating a fresh page as equivalent lifecycle coverage.
  await evaluate(() => globalThis.__game.game.closePanels());
  await evaluate(() => globalThis.__game.game.pause());
  // Pause mode exposes Quit to Title. Use it first, then invoke New Game from
  // the boot menu in this same Game instance; a pause menu has no New Game row.
  await waitUntil(() => evaluate(() => Boolean(globalThis.document.querySelector('[data-id="quit"]'))), 5);
  await page.locator('[data-id="quit"]').click();
  await waitUntil(() => evaluate(() => Boolean(globalThis.document.querySelector('[data-id="new-game"]'))), 5);
  await page.locator('[data-id="new-game"]').click();
  await waitUntil(() => evaluate(() => globalThis.__game.game.opening.phase === 'rooftop'), 5);
  const freshDuringOpening = await snapshot();
  check('real New Game clears the expedition wreck immediately',
    freshDuringOpening.story === 'locked' && !(await evaluate(() => globalThis.__game.game.destination.active)),
    JSON.stringify(freshDuringOpening), 'stagedResearchAndChapter');
  const freshReset = await evaluate(() => {
    const g = globalThis.__game;
    const structures = g.game.build.serialise();
    return {
      generators: structures.filter((piece) => piece.definitionId === 'generator').length,
      capacity: g.game.machine.power.capacity,
      fuel: g.game.machine.power.fuel,
      upgrades: g.game.progression.upgrades.toSave().active,
      radioVisible: g.game.radioModel.visible,
      wreckActive: g.game.destination.active,
    };
  });
  check('real New Game resets the starting generator and progression state',
    freshReset.generators === 1 && freshReset.capacity === 16 &&
    Math.abs(freshReset.fuel - 60) < 0.1 &&
    Object.keys(freshReset.upgrades).length === 0 &&
    freshReset.radioVisible === false && freshReset.wreckActive === false,
    JSON.stringify(freshReset), 'stagedResearchAndChapter');
  await page.keyboard.down('Escape');
  await step(2.5);
  await page.keyboard.up('Escape');

  // Return to the saved docked fixture for the actual radio departure click.
  await start(`${BASE_URL}/${MENU_QUERY}`);
  await waitUntil(() => evaluate(() => Boolean(globalThis.document.querySelector('[data-id="continue"]'))), 20);
  await page.locator('[data-id="continue"]').click();
  await waitUntil(() => evaluate(() => globalThis.__game.game.story.currentPhase === 'docked'), 20);
  await page.keyboard.press('e');
  await waitUntil(() => evaluate(() => Boolean(globalThis.document.querySelector('[data-radio-depart]'))), 5);
  await page.locator('[data-radio-depart]').click();
  await waitUntil(() => evaluate(() => globalThis.__game.game.story.currentPhase === 'departing'), 5);
  check('radio departure begins only after returning to the machine', true, '', 'stagedResearchAndChapter');
  const departed = await advanceUntil(
    () => evaluate(() => globalThis.__game.game.story.currentPhase === 'complete'),
    8,
    0.25,
  );
  const departureState = await evaluate(() => {
    const g = globalThis.__game;
    const story = g.game.story.toSave();
    return {
      phase: story.active?.phase ?? (story.completed.includes('wreck-one') ? 'complete' : 'locked'),
      nextSignal: story.completed.includes('wreck-one'),
      destinationActive: g.game.destination.active,
      destinationDocked: g.game.destination.docked,
      gangway: g.game.destination.gangwayEnabled,
      distance: g.game.world.distanceTraveled,
      arrival: story.active?.arrivalDistance ?? null,
    };
  });
  check('radio departure completes after clearing twelve metres',
    departed && departureState.phase === 'complete' && departureState.nextSignal &&
    !departureState.destinationActive && !departureState.destinationDocked && !departureState.gangway &&
    typeof departureState.arrival === 'number' && departureState.distance >= departureState.arrival + 12,
    JSON.stringify(departureState), 'stagedResearchAndChapter');

  await start(`${BASE_URL}/${QUERY}`);
  const legacy = await evaluate(() => {
    const g = globalThis.__game.game;
    g.progression.earlyRadioDrop.restore(undefined);
    return g.progression.earlyRadioDrop.toSave();
  });
  check('legacy radio-missing state remains pending for the next chest', legacy.status === 'pending', JSON.stringify(legacy), 'stagedResearchAndChapter');

  const pausedCrate = await evaluate(() => {
    const g = globalThis.__game;
    const target = g.game.salvage.targets[0];
    if (!target) return null;
    g.game.pause();
    return { id: target.id, x: target.x, y: target.y, z: target.z };
  });
  await page.waitForTimeout(250);
  const pausedAfter = await evaluate((before) => {
    const target = globalThis.__game.game.salvage.targets.find((candidate) => candidate.id === before?.id);
    return target ? { x: target.x, y: target.y, z: target.z } : null;
  }, pausedCrate);
  check('pause freezes an unhooked salvage crate',
    pausedCrate !== null && pausedAfter !== null && Math.hypot(pausedAfter.x - pausedCrate.x, pausedAfter.y - pausedCrate.y, pausedAfter.z - pausedCrate.z) < 1e-6,
    JSON.stringify({ before: pausedCrate, after: pausedAfter }), 'stagedResearchAndChapter');

} catch (error) {
  const fatalError = error instanceof Error ? error.stack ?? error.message : String(error);
  errors.push(`HARNESS: ${fatalError}`);
} finally {
  await browser.close();
  await mkdir('docs/art', { recursive: true });
  await writeFile('docs/art/chapter-validation.json', `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    honestLabels: {
      normalOpeningRadio: 'normal opening economy plus real hook/reel; no direct grants',
      stagedResearchAndChapter: 'explicit fixture state for research, chapter routing, and save/reload; not a human thirty-minute session',
    },
    checks,
    errors,
    evidence,
  }, null, 2)}\n`, 'utf8');
}

const failed = checks.filter((result) => !result.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} chapter checks passed`);
if (errors.length) {
  console.log(`\n${errors.length} console error(s):`);
  for (const error of errors.slice(0, 8)) console.log(` - ${error}`);
}
if (failed.length || errors.length) process.exitCode = 1;
