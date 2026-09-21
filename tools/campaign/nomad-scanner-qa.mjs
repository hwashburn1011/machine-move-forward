import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const port = process.env.MMF_PORT ?? '5206';
const out = process.env.MMF_QA_OUT ?? 'test-results/nomad-scanner-qa';
const url = `http://127.0.0.1:${port}/?nomenu=1&nolock=1&nospawn=1&nosound=1&quality=low`;
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));

const check = (condition, message) => {
  if (!condition) throw new Error(message);
};

try {
  await page.goto(url);
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 120_000 });
  await page.waitForTimeout(1200);

  const setup = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.opening.restore({ phase: 'done' });
    g.story.restore({
      format: 2,
      completed: [],
      recoveredUniques: [],
      active: {
        expeditionId: 'wreck-one',
        routeId: null,
        phase: 'signal',
        arrivalDistance: null,
        journalsRead: [],
        scriptedEncounter: 'not-due',
        signalStartedAt: 0,
      },
    });
    g.progression.earlyRadioDrop.restore({ status: 'found' });
    g.scanner.receive();
    g.radioModel.visible = true;
    try {
      g.machine.power.registerConsumer({ id: 'fixed-radio', draw: 1, priority: 'station' });
    } catch {
      // A hot-reloaded fixture may already have registered the radio consumer.
    }
    g.machine.movement.setThrottle(0);
    g.player.teleport({ x: 0.65, y: 17.02, z: -6.8 });
    // Controlled fixture arms the tutorial deadline so completion can prove
    // that Game rebases it instead of firing the skiff during scanning.
    g.tutorialReadyAt = g.state.simTime;
    g.state.paused = false;

    // Controlled setup: place a real workbench through BuildSystem and seed
    // only the resources needed to exercise the normal crafting path.
    const refusalBeforeWorkbench = g.scannerRecipeRefusal('craft-scanner-replacement-module');
    g.build.setBuildAuthorization(() => true);
    let workbenchPlaced = false;
    for (const cell of g.machine.deckCells) {
      const floor = { piece: 'floor', cell, rotation: 0 };
      if (!g.build.canPlace(floor).ok) continue;
      g.build.place(floor, true);
      const workbench = { piece: 'workbench', cell, rotation: 0 };
      workbenchPlaced = !!g.build.place(workbench, true);
      if (workbenchPlaced) break;
    }
    // Economy check: the real refinery path is attempted before seeding the
    // scanner-module inputs. This remains a controlled fixture (the build
    // authorizer is the only bypass); the recipe, power, inventory and event
    // paths are still the live ones.
    let refineryPlaced = false;
    for (const cell of g.machine.deckCells) {
      const floor = { piece: 'floor', cell, rotation: 0 };
      if (!g.build.canPlace(floor).ok) continue;
      g.build.place(floor, true);
      const refinery = { piece: 'refinery', cell, rotation: 0 };
      refineryPlaced = !!g.build.place(refinery, true);
      if (refineryPlaced) break;
    }
    const beforeRefine = {
      scrap: g.inventory.count('scrap'),
      components: g.inventory.count('components'),
    };
    const refineResults = [];
    for (let i = 0; i < 6; i++) refineResults.push(g.crafting.craft('refine-components'));
    const afterRefine = {
      scrap: g.inventory.count('scrap'),
      components: g.inventory.count('components'),
    };
    g.inventory.add('scrap', 4);
    g.inventory.add('components', 4);
    const crafted = workbenchPlaced && g.crafting.craft('craft-scanner-replacement-module');
    return {
      workbenchPlaced,
      refusalBeforeWorkbench,
      crafted,
      economy: {
        refineryPlaced,
        refineResults,
        outputCount: afterRefine.components - beforeRefine.components,
        scrapSpent: beforeRefine.scrap - afterRefine.scrap,
        budget: { refineCrafts: 6, refineScrap: 48, moduleScrap: 4, moduleComponents: 4 },
      },
      scanner: g.scanner.snapshot(),
      pieces: g.build.serialise().length,
    };
  });
  check(setup.refusalBeforeWorkbench === null || setup.refusalBeforeWorkbench.includes('workbench'), 'unexpected scanner recipe gate');
  check(setup.workbenchPlaced, 'controlled workbench fixture could not be placed');
  check(setup.crafted, 'real scanner replacement recipe did not craft');

  await page.evaluate(() => globalThis.__game.game.openRadio());
  await page.waitForTimeout(100);
  check(await page.locator('.radio-panel').isVisible(), 'radio panel did not open');
  check(await page.locator('[data-scanner-action=""]').isVisible(), 'scanner action was not rendered');
  await page.locator('[data-scanner-action=""]').click();
  await page.waitForTimeout(100);
  const installed = await page.evaluate(() => globalThis.__game.game.scanner.snapshot());
  check(['installed', 'scanning'].includes(installed.phase), `scanner install failed: ${installed.phase}`);
  if (installed.phase === 'installed') {
    await page.locator('[data-scanner-action=""]').click();
    await page.waitForTimeout(100);
  }
  const started = await page.evaluate(() => globalThis.__game.game.scanner.snapshot());
  check(started.phase === 'scanning', `scanner start failed: ${started.phase}`);
  await page.screenshot({ path: `${out}/scanner-started.png` });
  await page.locator('[data-radio-close]').click();
  await page.waitForTimeout(100);

  const tracking = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const events = [];
    const offPhase = g.bus.on('story:phase', (event) => events.push({ type: 'story:phase', ...event }));
    const offScan = g.bus.on('story:signal', (event) => events.push({ type: 'story:signal', ...event }));
    const offBoarding = g.bus.on('boarding:started', (event) => events.push({ type: 'boarding:started', ...event }));
    const run = (seconds) => {
      for (let i = 0; i < Math.ceil(seconds * 60); i++) g.fixedUpdate(1 / 60);
    };
    const before = g.scanner.snapshot();
    const tutorialBefore = g.tutorialReadyAt;
    run(30);
    const after30 = g.scanner.snapshot();
    g.state.paused = true;
    run(2);
    const paused = g.scanner.snapshot();
    g.state.paused = false;
    g.machine.power.restore({ fuel: 0 });
    run(2);
    const unpowered = g.scanner.snapshot();
    g.machine.power.restore({ fuel: 100 });
    run(150);
    const after180 = g.scanner.snapshot();
    run(3.1);
    const ready = g.scanner.snapshot();
    const story = g.story.currentPhase;
    offPhase();
    offScan();
    offBoarding();
    return { before, after30, paused, unpowered, after180, ready, story, tutorialBefore, tutorialDuring: g.tutorialReadyAt, events };
  });
  check(tracking.after30.elapsedS > tracking.before.elapsedS, 'powered scanner did not advance');
  check(tracking.paused.elapsedS === tracking.after30.elapsedS, 'pause advanced scanner');
  check(tracking.unpowered.elapsedS === tracking.paused.elapsedS, 'power loss advanced scanner');
  check(Number.isFinite(tracking.tutorialBefore) && tracking.tutorialDuring === tracking.tutorialBefore, 'tutorial deadline changed during scanner acquisition');
  check(!tracking.events.some((event) => event.type === 'boarding:started'), 'tutorial boarding started during scanner acquisition');
  check(tracking.after180.phase === 'contact-ready' || tracking.ready.phase === 'contact-ready' || tracking.ready.phase === 'consumed', 'scanner did not reach contact readiness');
  await writeFile(`${out}/tracking.json`, JSON.stringify(tracking, null, 2));
  check(tracking.events.some((event) => event.type === 'story:phase'), 'scanner did not enter the existing story battle path');
  await page.screenshot({ path: `${out}/scanner-contact.png` });

  const saveChecks = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    const intermediate = g.buildSave();
    await g.saves.save('scanner-qa-intermediate', intermediate);
    const loadedIntermediate = await g.loadFrom('scanner-qa-intermediate');
    const intermediatePhase = g.scanner.snapshot();

    let naturalEnded = false;
    if (!g.signalBattle?.active) g.beginSignalBattle();
    for (let i = 0; i < 1400 && g.signalBattle?.active; i++) g.fixedUpdate(1 / 60);
    naturalEnded = !g.signalBattle?.active;
    const natural = { scanner: g.scanner.snapshot(), story: g.story.currentPhase, tutorialReadyAt: g.tutorialReadyAt, simTime: g.state.simTime };
    const consumedSave = g.buildSave();
    await g.saves.save('scanner-qa-consumed', consumedSave);
    const loadedConsumed = await g.loadFrom('scanner-qa-consumed');
    const consumedReload = { scanner: g.scanner.snapshot(), story: g.story.currentPhase };

    // Probe the real completion method with a pending tutorial deadline.  This
    // keeps the deadline check independent of the subsequent fixed-update
    // loop, which may legitimately start/finish other tutorial actors.
    g.story.restore({
      format: 2,
      completed: [],
      recoveredUniques: [],
      active: { expeditionId: 'wreck-one', routeId: null, phase: 'crossfire', arrivalDistance: null, journalsRead: [], scriptedEncounter: 'not-due' },
    });
    g.scanner.restore({ format: 1, phase: 'contact-ready', elapsedS: 180, pendingDelayS: 0 });
    g.tutorialReadyAt = g.state.simTime + 100;
    g.finishSignalBattle();
    const deadlineProbe = { before: g.state.simTime + 100, after: g.tutorialReadyAt, simTime: g.state.simTime };

    // Reset only the pure presentation inputs for a second controlled run. The
    // same Game completion method is used; this exercises the hold-to-skip
    // branch without manufacturing a different progression result.
    g.story.restore({
      format: 2,
      completed: [],
      recoveredUniques: [],
      active: { expeditionId: 'wreck-one', routeId: null, phase: 'crossfire', arrivalDistance: null, journalsRead: [], scriptedEncounter: 'not-due' },
    });
    g.scanner.restore({ format: 1, phase: 'contact-ready', elapsedS: 180, pendingDelayS: 0 });
    g.beginSignalBattle();
    const skipped = !!g.signalBattle?.update(0.8, g.world.distanceTraveled, true);
    if (skipped) g.finishSignalBattle();
    const skip = { scanner: g.scanner.snapshot(), story: g.story.currentPhase };
    return { loadedIntermediate, intermediatePhase, naturalEnded, natural, loadedConsumed, consumedReload, deadlineProbe, skipped, skip };
  });
  await writeFile(`${out}/save-checks.json`, JSON.stringify(saveChecks, null, 2));
  check(saveChecks.loadedIntermediate, 'Game.loadFrom rejected the intermediate scanner save');
  check(saveChecks.intermediatePhase.phase === 'contact-ready', `intermediate load phase changed: ${saveChecks.intermediatePhase.phase}`);
  check(saveChecks.naturalEnded && saveChecks.natural.scanner.phase === 'consumed' && saveChecks.natural.story === 'raids', 'natural cinematic completion did not converge to consumed/raids');
  check(saveChecks.loadedConsumed && saveChecks.consumedReload.scanner.phase === 'consumed' && saveChecks.consumedReload.story === 'raids', 'consumed scanner save did not reload through Game.loadFrom');
  check(saveChecks.skipped && saveChecks.skip.scanner.phase === 'consumed' && saveChecks.skip.story === 'raids', 'cinematic skip did not converge to consumed/raids');
  check(Math.abs(saveChecks.deadlineProbe.after - saveChecks.deadlineProbe.simTime - 15) < 0.05, 'tutorial-skiff deadline was not rebased by 15 seconds');
  const report = { url, setup, tracking, saveChecks, errors };
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  if (errors.length) throw new Error(`browser errors: ${errors.join('; ')}`);
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
