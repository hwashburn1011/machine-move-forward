/** Focused real-Game compatibility acceptance. Requires an already-running Vite server. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const port = process.env.MMF_PORT ?? '5201';
const base = `http://127.0.0.1:${port}`;
const output = path.resolve(process.argv[2] ?? 'docs/gameplay-polish/acceptance/compatibility-qa.json');
await fs.mkdir(path.dirname(output), { recursive: true });
const report = {
  generatedAt: new Date().toISOString(), baseUrl: base, checks: [], errors: [],
  fixtures: [
    'signal: restore a valid signal-phase StoryDirector snapshot and advance world distance; Game fixedUpdate owns cinematic start/finish',
    'boarding: call VehicleScene.spawn(side), then damage the registered skiff-hook Damageable from its real physics collider',
    'expedition: load a valid docked campaign save through SaveManager/Game.loadFrom; invoke Game interaction handlers for journal/unique/departure',
  ],
  inputDriven: [
    'opening: ?opening=1 boot and held Escape skip through normal InputManager/fixed loop',
    'signal: held Escape ends the running SignalBattleScene through normal InputManager/fixed loop',
  ],
};
const check = (name, ok, detail = undefined) => {
  report.checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
  if (!ok) throw new Error(`${name}: ${JSON.stringify(detail)}`);
};

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];

async function fresh(query) {
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => pageErrors.push(`page: ${e.message}`));
  await page.goto(`${base}/${query}`, { waitUntil: 'load', timeout: 45_000 });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 120_000 });
  return page;
}

try {
  // Opening: only the URL seam seeds the mode; completion is normal held input.
  {
    const page = await fresh('?opening=1&nolock=1&nospawn=1&nosound=1&quality=high');
    await page.waitForFunction(() => globalThis.__game.game.opening.phase === 'rooftop');
    await page.keyboard.down('Escape');
    await page.waitForFunction(() => globalThis.__game.game.opening.phase === 'done', null, { timeout: 15_000 });
    await page.keyboard.up('Escape');
    const state = await page.evaluate(() => {
      const g = globalThis.__game.game;
      return { phase: g.opening.phase, armed: globalThis.__game.debugStats().armed, rooftopReleased: g.rooftopScrolling, speed: g.machine.speed, paused: g.state.paused };
    });
    check('opening returns to armed play', state.phase === 'done' && state.armed && state.rooftopReleased && !state.paused, state);
    await page.close();
  }

  // Signal: fixture only establishes a valid ready-to-lock campaign state.
  {
    const page = await fresh('?nomenu=1&nolock=1&nospawn=1&nosound=1&quality=high');
    const seeded = await page.evaluate(() => {
      const g = globalThis.__game.game;
      g.enemies.despawnAll(); g.vehicleScene.clear(); g.gunboatScene.clear();
      g.firstRun.restore({ completed: ['salvage','build-refinery','refine-components','build-workbench','build-defense','survive-boarding','repair'], counters: {} });
      g.progression.earlyRadioDrop.restore({ status: 'found', armedAtSimTime: 0, foundAtSimTime: 0, foundAtDistance: 0, eligibleChestsOpened: 1 });
      g.story.restore({ format: 2, completed: [], recoveredUniques: [], active: { expeditionId: 'wreck-one', routeId: null, phase: 'signal', arrivalDistance: null, journalsRead: [], scriptedEncounter: 'not-due', signalStartedAt: 0 } });
      g.world.reset(2200);
      return g.story.snapshot(g.world.distanceTraveled);
    });
    check('signal fixture reaches genuine 100 percent', seeded.signalStrength === 1, seeded);
    await page.waitForFunction(() => globalThis.__game.game.signalBattle?.active === true, null, { timeout: 10_000 });
    const during = await page.evaluate(() => ({ phase: globalThis.__game.game.story.currentPhase, hudHidden: document.querySelector('#hud')?.classList.contains('is-hidden') ?? false }));
    await page.keyboard.down('Escape');
    await page.waitForFunction(() => globalThis.__game.game.story.currentPhase === 'raids' && !globalThis.__game.game.signalBattle?.active, null, { timeout: 15_000 });
    await page.keyboard.up('Escape');
    const after = await page.evaluate(() => ({ phase: globalThis.__game.game.story.currentPhase, hudHidden: document.querySelector('#hud')?.classList.contains('is-hidden') ?? false, paused: globalThis.__game.game.state.paused }));
    check('100 percent signal runs cinematic and restores control UI', during.phase === 'crossfire' && during.hudHidden && after.phase === 'raids' && !after.hudHidden && !after.paused, { during, after });
    await page.close();
  }

  // Boarding: real scene choreography on each side and the real collider Damageable.
  for (const side of ['port', 'starboard']) {
    const page = await fresh('?nomenu=1&nolock=1&nospawn=1&nosound=1&quality=high');
    await page.evaluate(side => {
      const g = globalThis.__game.game; g.player.stats.invulnerable = true;
      if (!g.vehicleScene.spawn(side)) throw new Error(`could not spawn ${side} skiff`);
    }, side);
    await page.waitForFunction(() => ['attached','boarding'].includes(globalThis.__game.game.vehicleManager.snapshot?.phase), null, { timeout: 35_000 });
    const result = await page.evaluate(() => {
      const g = globalThis.__game.game;
      const before = { ...g.vehicleManager.snapshot };
      const actor = g.vehicleScene.actors.find(entry => {
        const data = g.physics.getUserData(entry.collider);
        return data?.kind === 'hook' && data?.id === 'skiff-hook';
      });
      const damageable = actor && g.physics.getUserData(actor.collider);
      if (!damageable?.takeDamage) throw new Error('real skiff-hook Damageable missing');
      damageable.takeDamage(10_000);
      return { before, after: { ...g.vehicleManager.snapshot }, kind: damageable.kind, id: damageable.id };
    });
    await page.waitForFunction(() => ['retreat','destroyed'].includes(globalThis.__game.game.vehicleManager.snapshot?.phase) || !globalThis.__game.game.vehicleManager.active, null, { timeout: 10_000 });
    check(`${side} boarding real hook damage retreats`, result.before.side === side && result.kind === 'hook' && result.id === 'skiff-hook' && result.after.hookHealth === 0, result);
    await page.close();
  }

  // Expedition: synthesize a schema-valid docked save, then use actual Game load and interaction wiring.
  {
    const page = await fresh('?nomenu=1&nolock=1&nospawn=1&nosound=1&quality=high');
    const slot = 'polish-compatibility-expedition';
    const docked = await page.evaluate(async slot => {
      const g = globalThis.__game.game;
      const save = g.buildSave();
      save.world.story = { format: 2, completed: [], recoveredUniques: [], active: { expeditionId: 'wreck-one', routeId: null, phase: 'docked', arrivalDistance: save.distanceTraveled, journalsRead: [], scriptedEncounter: 'resolved' } };
      await g.saves.save(slot, save);
      const loaded = await g.loadFrom(slot);
      return { loaded, phase: g.story.currentPhase, docked: g.destination.docked, gate: g.machine.expeditionGateOpen };
    }, slot);
    check('docked expedition restores through Game.loadFrom', docked.loaded && docked.phase === 'docked' && docked.docked, docked);
    const progress = await page.evaluate(async slot => {
      const g = globalThis.__game.game;
      const journal = g.story.chapter.journals[0];
      g.readExpeditionJournal(journal.id);
      const destinationAt = g.destination.root.getWorldPosition(g.player.worldPosition.clone());
      destinationAt.y += 1; g.player.teleport(destinationAt);
      const unique = g.collectStoryUnique('course-gyro');
      g.player.teleport(g.machine.deckSpawn);
      const saved = await g.saveTo(slot, 'manual', true);
      g.story.restore(undefined); g.destination.setActive(false);
      const loaded = await g.loadFrom(slot);
      const restored = g.story.snapshot(g.world.distanceTraveled);
      g.requestExpeditionDeparture();
      return { journal: journal.id, unique, saved, loaded, restored, phaseAfterDepart: g.story.currentPhase, dockedAfterDepart: g.destination.docked };
    }, slot);
    check('expedition progress round trips and departs through Game', progress.unique && progress.saved && progress.loaded && progress.restored.phase === 'docked' && progress.restored.recoveredUniques.includes('course-gyro') && progress.phaseAfterDepart === 'departing' && !progress.dockedAfterDepart, progress);
    await page.close();
  }

  check('no browser console or page errors', pageErrors.length === 0, pageErrors);
} catch (error) {
  report.errors.push(error?.stack ?? String(error));
} finally {
  await context.close();
  await browser.close();
  await fs.writeFile(output, JSON.stringify(report, null, 2));
}

for (const item of report.checks) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
if (report.errors.length) console.error(report.errors.join('\n'));
if (report.errors.length || report.checks.some(item => !item.ok)) process.exitCode = 1;
