import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = process.env.MMF_QA_OUT ?? 'docs/signal-crossfire';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(
    `http://127.0.0.1:${process.env.MMF_PORT ?? 5200}/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=medium`,
  );
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 120000 });
  await page.click('#game');
  const start = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.stop();
    g.state.paused = false;
    g.opening.restore({ phase: 'done' });
    g.firstRun.restore({
      completed: [
        'salvage',
        'build-refinery',
        'refine-components',
        'build-workbench',
        'build-defense',
        'survive-boarding',
        'repair',
      ],
      counters: {},
    });
    g.progression.earlyRadioDrop.restore({ status: 'found' });
    g.vehicleScene.clear();
    g.enemies.despawnAll();
    g.pendingBoardingOutcome = null;
    g.tutorialReadyAt = null;
    g.closePanels();
    g.player.teleport(g.player.worldPosition.clone().set(5.6, 15.8, 1.5));
    g.machine.power.restore({ fuel: 100 });
    for (let i = 0; i < 60; i++) g.fixedUpdate(1 / 60);
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
    g.world.reset(2199);
    g.updateStory();
    if (g.story.currentPhase !== 'signal') throw new Error('Signal fired early');
    // Listening at the receiver must not block its own 100% reveal.
    g.radioUI.open();
    g.world.reset(2200);
    g.updateStory();
    if (!g.signalBattle?.active)
      throw new Error(
        `Reveal did not start: ${JSON.stringify({ phase: g.story.currentPhase, stable: g.isStableForStory(), tutorial: g.firstRun.isComplete, first: g.firstRun.toSave(), opening: g.opening.phase, camera: g.isFreeCamera, mounted: g.defense.mounted, panels: g.panelsOpen, player: g.player.worldPosition, aboard: g.destination.playerOnMachine(g.player.worldPosition), radio: g.progression.earlyRadioDrop.radioFound, snapshot: g.story.snapshot(g.world.distanceTraveled) })}`,
      );
    if (g.radioUI.isOpen) throw new Error('Receiver did not hand off to the cinematic');
    return { health: g.player.stats.health, position: g.player.worldPosition.toArray() };
  });
  const frames = [];
  for (const [time, name] of [
    [3.5, '01-crossfire'],
    [7.8, '02-robot-ship'],
    [9.8, '03-turn'],
    [13.5, '04-revenant'],
  ]) {
    const shot = await page.evaluate((time) => {
      const g = globalThis.__game.game;
      while (g.signalBattle.time + 0.001 < time) g.fixedUpdate(1 / 60);
      g.render(1);
      return {
        time: g.signalBattle.time,
        camera: g.activeCamera.position.toArray(),
        face: g.signalBattle.face.toArray(),
        calls: g.renderer.three.info.render.calls,
      };
    }, time);
    await page.screenshot({ path: `${out}/${name}.png` });
    frames.push(shot);
  }
  const completion = await page.evaluate(() => {
    const g = globalThis.__game.game;
    while (g.signalBattle.active) g.fixedUpdate(1 / 60);
    g.updateStory();
    g.render(1);
    return {
      phase: g.story.currentPhase,
      health: g.player.stats.health,
      position: g.player.worldPosition.toArray(),
      save: g.buildSave(),
      safe: g.isSafeToSave(),
      activeCamera: g.activeCamera === g.playerCamera.camera,
    };
  });
  if (
    completion.phase !== 'raids' ||
    completion.health !== start.health ||
    !completion.safe ||
    !completion.activeCamera
  )
    throw new Error('Control/health/save handoff failed');
  const boarding = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.enemySpawnsEnabled = true;
    g.player.stats.invulnerable = true;
    g.radioRaids.restore({ wave: 0, remaining: 0 });
    g.updateSpawns(1 / 60);
    if (!g.vehicleScene.active) throw new Error('Raid did not spawn');
    const roster = [...g.vehicleScene.roster];
    const side = g.vehicleManager.snapshot.side;
    const initialHealth = g.vehicleManager.snapshot.crewHealth[0];
    g.vehicleScene.damageCrew(0, 11);
    const phases = new Set();
    for (let i = 0; i < 1800; i++) {
      g.fixedUpdate(1 / 60);
      phases.add(g.vehicleManager.snapshot?.phase);
      if (
        g.vehicleManager.snapshot?.crewStatus[0] === 'crossing' &&
        g.vehicleManager.snapshot.phaseElapsed > 1.6
      )
        break;
    }
    if (!g.vehicleManager.snapshot?.crewStatus.includes('crossing'))
      throw new Error('No visible crossing');
    g.freeCamera = g.renderer.camera;
    const sign = side === 'port' ? -1 : 1;
    g.freeCamera.position.set(sign * 19, 17, 7);
    g.freeCamera.lookAt(sign * 8, 11, -2);
    g.render(1);
    return {
      roster,
      side,
      initialHealth,
      phases: [...phases],
      crew: g.vehicleScene.crew.map((c) => ({
        id: c.userData.mechId,
        position: c.getWorldPosition(c.position.clone()).toArray(),
      })),
      saveBlocked: !g.isSafeToSave(),
    };
  });
  await page.screenshot({ path: `${out}/05-grapple-crossing.png` });
  const landing = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.freeCamera = null;
    const landings = [];
    const unsub = g.bus.on('boarding:crossed', ({ enemyId, crewIndex }) => {
      const e = g.enemies.active.find((e) => e.id === enemyId);
      landings.push({
        index: crewIndex,
        id: e.def.id,
        health: e.currentHealth,
        position: e.worldPosition.toArray(),
      });
    });
    for (let i = 0; i < 300 && landings.length < 2; i++) g.fixedUpdate(1 / 60);
    unsub();
    const safe = g.isSafeToSave();
    const movement = g.enemies.active.map((e) => ({ id: e.id, position: e.worldPosition.clone() }));
    for (let i = 0; i < 150; i++) g.fixedUpdate(1 / 60);
    const moved = movement.some(
      (old) =>
        g.enemies.active.find((e) => e.id === old.id)?.worldPosition.distanceTo(old.position) > 0.2,
    );
    g.render(1);
    for (const e of g.enemies.active) e.takeDamage(9999);
    for (
      let i = 0;
      i < 600 && (g.vehicleManager.active || g.pendingBoardingOutcome || g.enemies.activeCount);
      i++
    )
      g.fixedUpdate(1 / 60);
    return {
      landings,
      safeDuringCombat: safe,
      moved,
      ended: !g.vehicleManager.active && g.pendingBoardingOutcome === null,
      recovery: g.radioRaids.toSave(),
      safeAfter: g.isSafeToSave(),
    };
  });
  if (
    landing.landings.length !== 2 ||
    landing.landings[0].health !== boarding.initialHealth - 11 ||
    landing.landings.some((l, i) => l.id !== boarding.roster[i]) ||
    !landing.moved ||
    !landing.ended ||
    !boarding.saveBlocked ||
    landing.safeDuringCombat ||
    !landing.safeAfter
  )
    throw new Error(`Boarding integration failed: ${JSON.stringify({ boarding, landing })}`);
  const cut = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.radioRaids.restore({ ...g.radioRaids.toSave(), remaining: 0 });
    g.updateSpawns(1 / 60);
    const roster = [...g.vehicleScene.roster];
    for (let i = 0; i < 1800 && g.vehicleManager.snapshot?.phase !== 'attached'; i++)
      g.fixedUpdate(1 / 60);
    g.vehicleScene.holdCutHook(1.3);
    for (let i = 0; i < 300 && g.vehicleManager.active; i++) g.fixedUpdate(1 / 60);
    return {
      roster,
      active: g.vehicleManager.active,
      enemies: g.enemies.activeCount,
      recovery: g.radioRaids.toSave(),
    };
  });
  if (cut.active || cut.enemies !== 0 || new Set([...boarding.roster, ...cut.roster]).size !== 4)
    throw new Error(`Grapple/all-model test failed: ${JSON.stringify(cut)}`);
  const restore = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    const save = g.buildSave();
    const raidState = JSON.stringify(g.radioRaids.toSave());
    await g.saves.save('signal-qa', save);
    if (!(await g.loadFrom('signal-qa'))) throw new Error('Save slot did not load');
    g.state.paused = false;
    g.updateStory();
    return {
      phase: g.story.currentPhase,
      cinematic: g.signalBattle.active,
      sameRaidState: JSON.stringify(g.radioRaids.toSave()) === raidState,
    };
  });
  if (restore.phase !== 'raids' || restore.cinematic || !restore.sameRaidState)
    throw new Error(`Reload failed ${JSON.stringify(restore)}`);
  const skip = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const sun = g.renderer.sun.target.position.clone();
    g.story.restore({
      format: 2,
      completed: [],
      recoveredUniques: [],
      active: {
        expeditionId: 'wreck-one',
        routeId: null,
        phase: 'crossfire',
        arrivalDistance: null,
        journalsRead: [],
        scriptedEncounter: 'not-due',
      },
    });
    g.updateStory();
    g.input.held.add('cancel');
    g.input.held.add('forward');
    g.input.held.add('fire');
    for (let i = 0; i < 49; i++) g.fixedUpdate(1 / 60);
    return {
      phase: g.story.currentPhase,
      camera: g.activeCamera === g.playerCamera.camera,
      cleared: !g.input.isDown('fire') && !g.input.isDown('forward') && !g.input.isDown('cancel'),
      sunRestored: g.renderer.sun.target.position.distanceTo(sun) < 0.001,
    };
  });
  if (skip.phase !== 'raids' || !skip.camera || !skip.cleared || !skip.sunRestored)
    throw new Error(`Skip failed: ${JSON.stringify(skip)}`);
  const legacyRoute = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.story.restore({
      format: 2,
      completed: ['wreck-one'],
      recoveredUniques: ['course-gyro'],
      active: null,
    });
    g.machine.power.registerConsumer({ id: 'navigation-helm', draw: 1, priority: 'station' });
    g.machine.power.fixedUpdate(1 / 60);
    g.openExpedition();
    const stableWithPanel = g.panelsOpen && g.isStableForStory();
    g.selectStoryRoute('foundry-detour');
    return {
      stableWithPanel,
      phase: g.story.currentPhase,
      route: g.story.snapshot(g.world.distanceTraveled).routeId,
    };
  });
  if (
    !legacyRoute.stableWithPanel ||
    legacyRoute.phase !== 'approach' ||
    legacyRoute.route !== 'foundry-detour'
  )
    throw new Error(`Existing expedition route failed: ${JSON.stringify(legacyRoute)}`);
  await writeFile(
    `${out}/visual-review.json`,
    JSON.stringify(
      {
        start,
        frames,
        completion: { ...completion, save: undefined },
        boarding,
        landing,
        cut,
        restore,
        skip,
        legacyRoute,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ boarding, landing, cut, restore, skip, legacyRoute, errors }));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
