import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5201/';
const out = process.env.MMF_QA_OUT ?? 'test-results/campaign';
await mkdir(out, { recursive: true });
const checks = [];
const errors = [];
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));

const add = (batch) => checks.push(...batch);
const result = () => ({
  generatedAt: new Date().toISOString(),
  site,
  checks,
  errors,
  passed: checks.filter((entry) => entry.ok).length,
  total: checks.length,
});

try {
  await page.goto(`${site}?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=campaign-runtime-qa`);
  await page.waitForFunction(() => globalThis.__game?.game?.player?.visual?.isAnimated, null, {
    timeout: 180_000,
  });

  add(await page.evaluate(() => {
    const g = globalThis.__game.game;
    const rows = [];
    const check = (name, ok, detail) => rows.push({ name, ok: Boolean(ok), detail });
    g.loop.stop();
    g.closePanels(false);
    g.state.paused = false;
    g.state.playerDead = false;
    g.enemies.despawnAll();
    g.vehicleScene.clear();
    g.gunboatScene.clear();
    g.player.stats.invulnerable = true;
    g.player.teleport({ x: 6, y: 15.96, z: 4 });
    g.progression.earlyRadioDrop.restore({
      status: 'found', armedAtSimTime: 0, foundAtSimTime: 1,
      foundAtDistance: 1, eligibleChestsOpened: 1,
    });
    g.machine.power.unregisterConsumer(g.radioPowerConsumerId);
    g.machine.power.registerConsumer({ id: g.radioPowerConsumerId, draw: 1, priority: 'station' });
    g.machine.power.unregisterConsumer(g.helmPowerConsumerId);
    g.machine.power.registerConsumer({ id: g.helmPowerConsumerId, draw: 1, priority: 'station' });
    g.tickPower(0.01);
    g.story.restore({
      format: 2,
      completed: ['wreck-one', 'relay-foundry'],
      recoveredUniques: ['course-gyro', 'salvage-controller', 'tracking-servo'],
      active: null,
      chapterComplete: true,
    });
    g.configureDestination();
    const snapshot = g.story.snapshot(g.world.distanceTraveled);
    check('Completed Foundry exposes Quiet Array trace', snapshot.nextExpedition?.id === 'quiet-array', snapshot);
    g.openRadio();
    const button = document.querySelector('[data-radio-trace-button]');
    check('Radio renders enabled Quiet Array action', button?.textContent?.includes('Quiet Array') && !button.disabled, button?.textContent);
    return rows;
  }));

  await page.locator('[data-radio-trace-button]').click();
  add(await page.evaluate(() => {
    const g = globalThis.__game.game;
    const rows = [];
    const check = (name, ok, detail) => rows.push({ name, ok: Boolean(ok), detail });
    check('Radio click starts real Quiet Array approach', g.story.currentPhase === 'approach' && g.story.chapter.id === 'quiet-array' && g.destination.active, g.story.snapshot(g.world.distanceTraveled));
    const arrival = g.story.toSave().active?.arrivalDistance;
    g.world.reset(arrival);
    g.machine.movement.speed = 0;
    for (let i = 0; i < 3; i++) {
      g.updateStory();
      g.destination.fixedUpdate(g.world.distanceTraveled);
    }
    check('Quiet Array docks through story braking effects', g.story.currentPhase === 'docked' && g.destination.docked, { phase: g.story.currentPhase, docked: g.destination.docked });
    g.render(0);
    return rows;
  }));
  await page.screenshot({ path: `${out}/quiet-array.png` });

  add(await page.evaluate(() => {
    const g = globalThis.__game.game;
    const rows = [];
    const check = (name, ok, detail) => rows.push({ name, ok: Boolean(ok), detail });
    const arrival = g.story.toSave().active?.arrivalDistance;
    const targets = Object.fromEntries(g.destination.interactables.map((item) => [item.id, item]));
    const actuator = targets['quiet-array-course-actuator'];
    g.player.teleport(actuator.position);
    check('Actuator is gated before both calibrations', !g.collectStoryUnique(actuator.id) && g.course.snapshot.tier === 0, g.story.unmetRequirement('course-actuator'));
    for (const id of ['quiet-array-journal-port', 'quiet-array-journal-starboard']) {
      const target = targets[id];
      g.player.teleport(target.position);
      g.readExpeditionJournal(id);
    }
    g.player.teleport(actuator.position);
    check('Calibrated actuator grants tier-one course authority', g.collectStoryUnique(actuator.id) && g.course.snapshot.tier === 1, g.course.snapshot);
    const archive = targets['quiet-array-annika-archive-shard'];
    g.player.teleport(archive.position);
    check('Annika archive shard is recovered once', g.collectStoryUnique(archive.id) && !g.collectStoryUnique(archive.id), g.story.snapshot(g.world.distanceTraveled).recoveredUniques);
    g.player.teleport({ x: 6, y: 15.96, z: 4 });
    g.requestExpeditionDeparture();
    g.world.reset(arrival + 13);
    g.machine.movement.speed = 1;
    g.updateStory();
    check('Quiet Array departure completes and survival continues', g.story.currentPhase === 'complete' && g.story.completedExpeditions.includes('quiet-array'), g.story.toSave());
    return rows;
  }));

  add(await page.evaluate(async () => {
    const g = globalThis.__game.game;
    const rows = [];
    const check = (name, ok, detail) => rows.push({ name, ok: Boolean(ok), detail });
    g.player.teleport({ x: 6, y: 15.96, z: 4 });
    g.openHelm();
    const bearing = document.querySelector('[data-testid="helm-bearing"]');
    const throttle = document.querySelector('[data-testid="helm-throttle"]');
    bearing.value = '12'; bearing.dispatchEvent(new Event('input', { bubbles: true }));
    throttle.value = '.6'; throttle.dispatchEvent(new Event('input', { bubbles: true }));
    for (let i = 0; i < 120; i++) g.course.fixedUpdate(1 / 60, 0.1);
    check('Powered helm DOM commands steer and throttle', g.course.snapshot.desiredDeg === 12 && g.course.snapshot.throttle === .6 && g.course.snapshot.lateralM > 0, g.course.snapshot);
    g.closePanels(false);
    const savedCourse = g.course.snapshot;
    const saved = await g.saveTo('campaign-runtime-qa', 'manual', true);
    g.course.restore({ tier: 0, bearingDeg: 0, desiredDeg: 0, throttle: 1, lateralM: 0 });
    const loaded = await g.loadFrom('campaign-runtime-qa');
    check('Course state survives actual save and load', saved && loaded && JSON.stringify(g.course.snapshot) === JSON.stringify(savedCourse), { savedCourse, restored: g.course.snapshot });
    const legacy = g.buildSave();
    delete legacy.machine.course;
    legacy.machine.navigationTier = 3;
    legacy.world.story = {
      format: 2,
      completed: ['wreck-one', 'relay-foundry'],
      recoveredUniques: ['course-gyro', 'salvage-controller', 'tracking-servo'],
      active: null,
      chapterComplete: true,
    };
    await g.saves.save('campaign-old-save-qa', legacy);
    await g.loadFrom('campaign-old-save-qa');
    check('Old save cannot manufacture course authority', g.course.snapshot.tier === 0 && g.course.snapshot.lateralM === 0, g.course.snapshot);
    return rows;
  }));
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.player.teleport({ x: 6, y: 15.96, z: 4 });
    g.openHelm();
    g.render(0);
  });
  await page.screenshot({ path: `${out}/helm.png` });
  await page.evaluate(() => globalThis.__game.game.closePanels(false));

  add(await page.evaluate(async () => {
    const g = globalThis.__game.game;
    const rows = [];
    const check = (name, ok, detail) => rows.push({ name, ok: Boolean(ok), detail });
    // A completed campaign is the eligibility fixture; all chart, Destination,
    // guidance, inventory and save operations below are live Game objects.
    g.story.restore({
      format: 2,
      completed: ['wreck-one', 'relay-foundry', 'quiet-array'],
      recoveredUniques: ['course-gyro', 'salvage-controller', 'tracking-servo', 'course-actuator', 'annika-archive-shard'],
      active: null,
      chapterComplete: true,
    });
    g.course.restore({ tier: 1, bearingDeg: 0, desiredDeg: 0, throttle: 1, lateralM: 0 });
    g.machine.power.unregisterConsumer(g.helmPowerConsumerId);
    g.machine.power.registerConsumer({ id: g.helmPowerConsumerId, draw: 1, priority: 'station' });
    g.tickPower(0.01);
    g.routeChart.reset();
    g.optionalModelId = null;
    g.destination.setActive(false);
    g.inventory.clear();
    g.player.teleport({ x: 6, y: 15.96, z: 4 });
    const approachDirections = [];
    for (let seedIndex = 0; seedIndex < 24; seedIndex++) {
      if (new Set(approachDirections).size === 2) break;
      const seed = `course-direction-${seedIndex}`;
      g.routeChart.reset();
      g.destination.setActive(false);
      g.optionalModelId = null;
      g.machine.movement.setScriptedSpeedLimit(null);
      g.course.restore({ tier: 1, bearingDeg: 0, desiredDeg: 0, throttle: 1, lateralM: 0 });
      g.machine.power.restore({ fuel: 100 });
      g.world.reset(250);
      g.machine.movement.speed = g.machine.movement.maxSpeed;
      const contact = g.routeChart.observe(seed, { distanceM: 250, lateralM: 0, storyPriority: false });
      const direction = Math.sign(contact.worldX - 14);
      if (approachDirections.includes(direction)) continue;
      g.openHelm();
      const plot = document.querySelector('[data-testid="helm-plot-contact"]');
      check(`Real ${direction < 0 ? 'port' : 'starboard'} approach exposes plot control`, Boolean(plot) && !plot.disabled, g.opportunityView());
      plot?.click();
      if (approachDirections.length === 0) {
        const committedBeforeSave = g.routeChart.contact;
        const saved = await g.saveTo('campaign-committed-approach', 'manual', true);
        const loaded = saved && await g.loadFrom('campaign-committed-approach');
        g.loop.stop();
        g.state.paused = false;
        check('Committed approach and powered helm survive actual save/load', loaded && g.routeChart.contact?.state === 'committed' && g.routeChart.contact?.id === committedBeforeSave.id && g.destination.active && g.machine.power.isPowered(g.helmPowerConsumerId), { contact: g.routeChart.contact, destinationActive: g.destination.active, powered: g.machine.power.isPowered(g.helmPowerConsumerId) });
      }
      let steps = 0;
      while (steps < 400 * 60 && g.routeChart.contact?.state !== 'docked') {
        g.player.needs.restore({ hydration: 100, nourishment: 100 });
        g.fixedUpdate(1 / 60);
        steps++;
      }
      check(`Real ${direction < 0 ? 'port' : 'starboard'} guidance reaches aligned dock`, g.routeChart.contact?.state === 'docked' && g.destination.docked && Math.abs(g.destination.root.position.x - 14) < .01, { steps, contact: g.routeChart.contact, course: g.course.snapshot });
      approachDirections.push(direction);
      g.player.teleport({ x: 6, y: 15.96, z: 4 });
      g.departOpportunity();
    }
    check('Automatic approach exercised both lateral directions', new Set(approachDirections).size === 2, approachDirections);

    g.routeChart.reset();
    g.destination.setActive(false);
    g.optionalModelId = null;
    g.machine.movement.setScriptedSpeedLimit(null);
    g.course.restore({ tier: 1, bearingDeg: 0, desiredDeg: 0, throttle: 1, lateralM: 0 });
    const kinds = [];
    let nextDetection = 250;
    for (let cycle = 0; cycle < 3; cycle++) {
      const distance = nextDetection;
      g.world.reset(distance);
      const contact = g.routeChart.observe(g.state.seed, { distanceM: distance, lateralM: g.course.snapshot.lateralM, storyPriority: false });
      kinds.push(contact.kind);
      const result = g.routeChart.commit(contact.id, { ...g.chartContext, safe: true, poweredHelm: true, storyPriority: false });
      check(`Chart ${cycle + 1} fixture commits`, result.ok, result);
      const committed = g.routeChart.contact;
      nextDetection = committed.atDistanceM + 250;
      const lateral = committed.worldX - 14;
      g.course.restore({ tier: 1, bearingDeg: 0, desiredDeg: 0, throttle: 1, lateralM: lateral });
      g.world.reset(committed.atDistanceM);
      g.machine.movement.speed = 0;
      for (let i = 0; i < 3; i++) g.updateOpportunities();
      check(`Chart ${cycle + 1} dock fixture exposes physical site`, g.routeChart.contact?.state === 'docked' && g.destination.docked && g.optionalModelId === committed.id, { contact: g.routeChart.contact, rootX: g.destination.root.position.x });
      const reward = g.destination.interactables.find((entry) => entry.id === 'opportunity-reward');
      if (!reward) {
        check(`Chart ${cycle + 1} exposes its physical reward`, false, {
          committed,
          active: g.destination.active,
          docked: g.destination.docked,
          optionalModelId: g.optionalModelId,
          interactables: g.destination.interactables.map((entry) => entry.id),
          context: g.chartContext,
        });
        break;
      }
      g.player.teleport(reward.position);
      if (committed.kind === 'salvage-wreck') {
        const cap = g.inventory.capacity;
        g.inventory.restore(Array.from({ length: cap }, (_, index) => ({ itemId: 'scrap', count: index === 0 ? 99 : 100 })));
        const before = g.resources.count('scrap');
        g.claimOpportunityReward();
        check('Full inventory accepts only exact partial reward', g.resources.count('scrap') === before + 1 && g.routeChart.contact.rewards[0].remaining === 23 && g.routeChart.contact.rewards[1].remaining === 2, g.routeChart.contact.rewards);
        const save = await g.saveTo('campaign-partial-contact', 'manual', true);
        const remainder = JSON.stringify(g.routeChart.contact.rewards);
        const loaded = await g.loadFrom('campaign-partial-contact');
        g.tickPower(0.01);
        check('Partial reward remainder persists without duplication', save && loaded && JSON.stringify(g.routeChart.contact.rewards) === remainder && g.resources.count('scrap') === before + 1, g.routeChart.contact.rewards);
      } else {
        g.claimOpportunityReward();
      }
      g.player.teleport({ x: g.destination.root.position.x + 4, y: 15.96, z: 0 });
      const beforeId = g.routeChart.contact.id;
      g.departOpportunity();
      check(`Chart ${cycle + 1} refuses departure off machine`, g.routeChart.contact?.id === beforeId, { ...g.player.worldPosition });
      g.player.teleport({ x: 6, y: 15.96, z: 4 });
      g.departOpportunity();
      check(`Chart ${cycle + 1} departs after player returns`, g.routeChart.contact === null && !g.destination.docked, g.routeChart.snapshot);
    }
    check('Seeded chart supplies all three opportunity kinds', new Set(kinds).size === 3, kinds);
    return rows;
  }));
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    const distance = 3050;
    g.world.reset(distance);
    const contact = g.routeChart.observe(g.state.seed, {
      distanceM: distance,
      lateralM: g.course.snapshot.lateralM,
      storyPriority: false,
    });
    if (!contact) return;
    g.routeChart.commit(contact.id, {
      ...g.chartContext,
      distanceM: distance,
      lateralM: contact.worldX,
      maxBearingDeg: 12,
      poweredHelm: true,
      safe: true,
      storyPriority: false,
    });
    g.course.restore({
      tier: 1, bearingDeg: 0, desiredDeg: 0, throttle: 1,
      lateralM: contact.worldX - 14,
    });
    g.world.reset(contact.atDistanceM);
    g.machine.movement.speed = 0;
    for (let i = 0; i < 3; i++) g.updateOpportunities();
    g.player.teleport({ x: 14, y: 15.96, z: 0 });
    g.render(0);
  });
  await page.screenshot({ path: `${out}/opportunity-site.png` });

  add(await page.evaluate(() => {
    const g = globalThis.__game.game;
    const rows = [];
    const check = (name, ok, detail) => rows.push({ name, ok: Boolean(ok), detail });
    g.destination.setActive(false);
    g.optionalModelId = null;
    const sceneStart = g.renderer.scene.children.length;
    const memoryStart = { ...g.renderer.three.info.memory };
    const bodiesStart = g.physics.bodyCount;
    const collidersStart = g.physics.colliderCount;
    let visibleAtBothExtremes = true;
    let maxInstances = 0;
    for (let cycle = 0; cycle < 100; cycle++) {
      const lateralM = cycle % 2 ? 1024 + cycle * 3 : -1024 - cycle * 3;
      const distanceM = 2000 + cycle * 64.1;
      g.course.restore({ tier: 1, bearingDeg: 0, desiredDeg: 0, throttle: 1, lateralM });
      g.world.setLateralOffset(lateralM);
      g.world.reset(distanceM);
      g.world.fixedUpdate(1 / 60, 0);
      g.world.update(cycle / 60);
      const placements = g.world.desert?.placementSnapshot ?? [];
      maxInstances = Math.max(maxInstances, placements.length);
      visibleAtBothExtremes &&= placements.length > 0 && new Set(placements.map((p) => p.bandIndex)).size === 3;
    }
    check('World remains populated beyond ±1024m lateral offset', visibleAtBothExtremes && maxInstances > 0, { maxInstances });
    check('100 lateral/rebase cycles keep scene and physics ownership stable', g.renderer.scene.children.length === sceneStart && g.physics.bodyCount === bodiesStart && g.physics.colliderCount === collidersStart, { sceneStart, sceneEnd: g.renderer.scene.children.length, bodiesStart, bodiesEnd: g.physics.bodyCount, collidersStart, collidersEnd: g.physics.colliderCount });
    check('Renderer resource counts remain bounded through course cycling', g.renderer.three.info.memory.geometries <= memoryStart.geometries + 3 && g.renderer.three.info.memory.textures <= memoryStart.textures + 3, { before: memoryStart, after: g.renderer.three.info.memory });
    return rows;
  }));
} catch (error) {
  errors.push(error?.stack ?? String(error));
} finally {
  const report = result();
  await writeFile(`${out}/runtime-qa.json`, JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
  if (errors.length || checks.some((entry) => !entry.ok)) process.exitCode = 1;
}
