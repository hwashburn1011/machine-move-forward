import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5201/';
const out = process.env.MMF_QA_OUT ?? 'test-results/campaign/visual-review';
await mkdir(out, { recursive: true });
const checks = [], errors = [], captures = [];
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));

const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
const capture = async (name) => {
  const path = `${out}/${name}.png`;
  await page.screenshot({ path });
  captures.push(path);
};

try {
  await page.goto(`${site}?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=medium&seed=campaign-visual-review`);
  await page.waitForFunction(() => globalThis.__game?.game?.player?.visual?.isAnimated, null, { timeout: 180_000 });
  await page.evaluate(async () => {
    const [data, visuals] = await Promise.all([
      import('/src/data/opportunities.ts'),
      import('/src/art/OpportunityModels.ts'),
    ]);
    globalThis.__campaignOpportunityDefinition = data.opportunityDefinition;
    globalThis.__campaignOpportunityModel = visuals.buildOpportunityModel;
  });
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.loop.stop();
    g.closePanels(false);
    g.state.paused = false;
    g.state.playerDead = false;
    g.enemies.despawnAll();
    g.player.stats.invulnerable = true;
    g.machine.power.restore({ fuel: 100 });
    g.story.restore({
      format: 2,
      completed: ['wreck-one', 'relay-foundry'],
      recoveredUniques: ['course-gyro', 'salvage-controller', 'tracking-servo'],
      active: {
        expeditionId: 'quiet-array', routeId: null, phase: 'docked', arrivalDistance: 1000,
        journalsRead: [], scriptedEncounter: 'not-due',
      },
      chapterComplete: true,
    });
    g.destination.setActive(false);
    g.configureDestination();
    g.destination.setArrivalDistance(1000);
    g.destination.setActive(true);
    g.destination.setDocked(true);
    g.world.reset(1000);
    g.machine.movement.speed = 0;
    g.machine.movement.setScriptedSpeedLimit(0);
    g.machine.setExpeditionGangwayOpen(true);
    g.titleCamera = g.renderer.camera;
    g.titleCamera.position.set(0, 28, -26);
    g.titleCamera.lookAt(17, 15.2, 0);
    g.render(0);
  });
  await capture('quiet-array-overview');

  const crossing = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.titleCamera = null;
    g.playerCamera.setYaw(0);
    g.player.teleport({ x: 5.4, y: 15.96, z: 0 });
    return { before: { ...g.player.worldPosition } };
  });
  await page.keyboard.down('d');
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    for (let i = 0; i < 150; i++) g.fixedUpdate(1 / 60);
  });
  await page.keyboard.up('d');
  const crossed = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const p = { ...g.player.worldPosition };
    return {
      position: p,
      inside: g.destination.containsPlayer(p),
      onGangway: g.destination.playerOnGangway(p),
      docked: g.destination.docked,
      colliderCount: g.physics.colliderCount,
    };
  });
  add('Player capsule physically crosses the Quiet Array gangway', crossed.inside && crossed.position.x > crossing.before.x + 2, { ...crossing, ...crossed });

  for (const [kind, cameraX] of [['water-cache', 0], ['salvage-wreck', 28], ['memorial', 0]]) {
    const detail = await page.evaluate(({ kind, cameraX }) => {
      const g = globalThis.__game.game;
      g.story.restore({
        format: 2,
        completed: ['wreck-one', 'relay-foundry', 'quiet-array'],
        recoveredUniques: ['course-gyro', 'salvage-controller', 'tracking-servo', 'course-actuator', 'annika-archive-shard'],
        active: null, chapterComplete: true,
      });
      g.routeChart.reset();
      g.destination.setActive(false);
      g.destination.configure(globalThis.__campaignOpportunityDefinition(kind), globalThis.__campaignOpportunityModel(kind, g.materials));
      g.destination.setArrivalDistance(g.world.distanceTraveled);
      g.destination.setLateralRoot(14);
      g.destination.setActive(true);
      g.destination.setDocked(true);
      g.titleCamera = g.renderer.camera;
      g.titleCamera.position.set(cameraX, 24, -23);
      g.titleCamera.lookAt(14, 15.2, 0);
      g.render(0);
      const definition = globalThis.__campaignOpportunityDefinition(kind);
      const floor = definition.colliders.find((item) => item.id === 'floor');
      return { kind, root: { ...g.destination.root.position }, children: g.destination.root.children.length, floor: floor?.half, interactables: g.destination.interactables.map((item) => item.id) };
    }, { kind, cameraX });
    add(`${kind} authored site is docked and interactive`, detail.children > 0 && detail.floor?.x === 6 && detail.floor?.z === 5 && detail.interactables.includes('opportunity-reward'), detail);
    await capture(`site-${kind}`);
  }

  // Use the public game integration for the chart/Helm capture. The two tiny
  // globals above are installed below through a browser module import because
  // the runtime intentionally does not expose data factories on __game.
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.destination.setActive(false);
    g.optionalModelId = null;
    g.story.restore({
      format: 2,
      completed: ['wreck-one', 'relay-foundry', 'quiet-array'],
      recoveredUniques: ['course-gyro', 'salvage-controller', 'tracking-servo', 'course-actuator', 'annika-archive-shard'],
      active: null, chapterComplete: true,
    });
    g.course.restore({ tier: 1, bearingDeg: 3, desiredDeg: 7, throttle: .65, lateralM: 180 });
    g.machine.power.unregisterConsumer(g.helmPowerConsumerId);
    g.machine.power.registerConsumer({ id: g.helmPowerConsumerId, draw: 1, priority: 'station' });
    g.tickPower(0.01);
    g.routeChart.reset();
    g.world.reset(250);
    g.routeChart.observe(g.state.seed, { distanceM: 250, lateralM: 180, storyPriority: false });
    g.player.teleport({ x: 5.5, y: 15.96, z: 2 });
    g.titleCamera = null;
    g.openHelm();
    g.render(0);
  });
  const helm = await page.evaluate(() => ({
    tier: document.querySelector('[data-panel="helm"]')?.dataset.tier,
    locked: document.querySelector('[data-panel="helm"]')?.dataset.locked,
    contact: document.querySelector('[data-testid="helm-opportunity"]')?.textContent,
    status: document.querySelector('[data-testid="helm-status"]')?.textContent,
    bearingDisabled: document.querySelector('[data-testid="helm-bearing"]')?.disabled,
  }));
  add('Powered unlocked Helm displays a live chart contact', helm.tier === '1' && helm.locked === 'false' && helm.bearingDisabled === false && helm.status?.includes('online') && Boolean(helm.contact), helm);
  await capture('helm-unlocked-contact');

  const perf = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    g.closePanels(false);
    g.destination.setActive(false);
    g.optionalModelId = null;
    g.titleCamera = g.renderer.camera;
    g.world.setLateralOffset(1024);
    g.world.reset(4200);
    const work = [], intervals = [];
    let prior = performance.now();
    const start = prior;
    while (performance.now() - start < 20_000) {
      await new Promise(requestAnimationFrame);
      const now = performance.now();
      intervals.push(now - prior);
      prior = now;
      const t = (now - start) / 1000;
      g.titleCamera.position.set(Math.sin(t * .45) * 30, 23 + Math.sin(t * .7) * 4, -30 + Math.cos(t * .45) * 8);
      g.titleCamera.lookAt(0, 8, -12);
      const renderStart = performance.now();
      g.render(0);
      work.push(performance.now() - renderStart);
    }
    const quantile = (values, p) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    };
    const info = g.renderer.three.info;
    return {
      durationMs: performance.now() - start,
      frames: work.length,
      fps: work.length / ((performance.now() - start) / 1000),
      renderWorkMs: { median: quantile(work, .5), p95: quantile(work, .95), over33: work.filter((v) => v > 33).length },
      frameIntervalMs: { median: quantile(intervals, .5), p95: quantile(intervals, .95), over33: intervals.filter((v) => v > 33).length },
      renderer: { geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0, calls: info.render.calls, triangles: info.render.triangles },
      userAgent: navigator.userAgent,
    };
  });
  add('20-second medium 1080p render sample completed', perf.durationMs >= 20_000 && perf.frames > 100, perf);
} catch (error) {
  errors.push(error?.stack ?? String(error));
} finally {
  const report = { generatedAt: new Date().toISOString(), site, checks, errors, captures, passed: checks.filter((x) => x.ok).length, total: checks.length };
  await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
  if (errors.length || checks.some((entry) => !entry.ok)) process.exitCode = 1;
}
