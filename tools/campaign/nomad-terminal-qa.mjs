import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const port = process.env.MMF_PORT ?? '5206';
const out = process.env.MMF_QA_OUT ?? 'test-results/nomad-terminal-qa';
const url = `http://127.0.0.1:${port}/?nomenu=1&nolock=1&nospawn=1&nosound=1&quality=low`;
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
const check = (ok, message) => { if (!ok) throw new Error(message); };

try {
  await page.goto(url);
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 120_000 });
  await page.waitForTimeout(800);

  const setup = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.opening.restore({ phase: 'done' });
    g.story.restore({ format: 2, completed: ['relay-foundry'], recoveredUniques: [], active: null, chapterComplete: true });
    g.progression.earlyRadioDrop.restore({ status: 'found' });
    g.state.paused = false;
    g.build.setBuildAuthorization(() => true);
    let workbenchId = null;
    let crateId = null;
    for (const cell of g.machine.deckCells) {
      const floor = { piece: 'floor', cell, rotation: 0 };
      if (!g.build.canPlace(floor).ok) continue;
      g.build.place(floor, true);
      if (!workbenchId) {
        const result = g.build.place({ piece: 'workbench', cell, rotation: 0 }, true);
        if (result) workbenchId = typeof result === 'string' ? result : result.instanceId;
      }
      if (!crateId) {
        const result = g.build.place({ piece: 'crate', cell, rotation: 0 }, true);
        if (result) crateId = typeof result === 'string' ? result : result.instanceId;
      }
      if (workbenchId && crateId) break;
    }
    if (!workbenchId || !crateId) throw new Error('controlled workbench/crate fixture could not be placed');
    g.player.teleport({ x: 0.65, y: 17.02, z: -5.8 });
    g.inventory.add('scrap', 24);
    g.inventory.add('components', 16);
    return { workbenchId, crateId, pieces: g.build.serialise().length, resources: { scrap: g.inventory.count('scrap'), components: g.inventory.count('components') }, storage: g.terminal.onboardResources().storage.map((entry) => ({ id: entry.id, kind: entry.kind, online: entry.online })) };
  });

  await page.keyboard.press('Tab');
  await page.locator('.terminal-ui').waitFor({ state: 'visible' });
  check(await page.evaluate(() => globalThis.__game.game.terminal.isOpen), 'terminal did not open with Tab');
  const accessibility = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.terminal.setAccessibility({ textScale: 1.4, reducedMotion: true });
    g.player.setReducedMotion(true);
    const root = document.querySelector('.terminal-ui');
    return {
      scale: root ? getComputedStyle(root).getPropertyValue('--terminal-text-scale').trim() : '',
      reducedMotion: root?.dataset.reducedMotion ?? '',
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  check(accessibility.scale === '1.4' && accessibility.reducedMotion === 'true', 'terminal accessibility settings were not applied through runtime APIs');
  check(!accessibility.horizontalOverflow, 'large terminal text introduced horizontal overflow');
  const paused = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const t = g.state.simTime;
    return { t, distance: g.world.distanceTraveled, fuel: g.machine.power.fuel };
  });
  await page.waitForTimeout(500);
  const pausedAfter = await page.evaluate(() => ({ t: globalThis.__game.game.state.simTime, distance: globalThis.__game.game.world.distanceTraveled }));
  check(paused.t === pausedAfter.t && paused.distance === pausedAfter.distance, 'terminal did not pause simulation');
  await page.screenshot({ path: `${out}/terminal-inventory.png` });

  await page.locator('[data-tab="workshop"]').click();
  await page.screenshot({ path: `${out}/terminal-workshop.png` });
  check(await page.locator('.terminal-fieldwork-card').count() >= 1, 'fieldwork card was not rendered');
  const beforeResearch = await page.evaluate(() => ({
    resources: { scrap: globalThis.__game.game.inventory.count('scrap'), components: globalThis.__game.game.inventory.count('components') },
    rifle: globalThis.__game.game.combat.weapon('rifle').installedAttachment,
  }));
  const stabilizer = page.locator('[data-fieldwork-attachment="rifle-stabilizer"]');
  check(await stabilizer.count() === 1, 'rifle stabilizer action missing');
  await stabilizer.click();
  await page.waitForTimeout(100);
  const afterResearch = await page.evaluate(() => ({
    resources: { scrap: globalThis.__game.game.inventory.count('scrap'), components: globalThis.__game.game.inventory.count('components') },
    rifle: globalThis.__game.game.combat.weapon('rifle').installedAttachment,
    researched: globalThis.__game.game.combat.weapon('rifle').researchedAttachments,
  }));
  check(afterResearch.resources.scrap === beforeResearch.resources.scrap - 12 && afterResearch.resources.components === beforeResearch.resources.components - 8, 'attachment debit was not exactly 12 scrap/8 components');
  check(afterResearch.rifle === 'rifle-stabilizer' && afterResearch.researched.includes('rifle-stabilizer'), 'research did not equip and persist stabilizer');
  await page.locator('[data-fieldwork-remove="rifle"]').click();
  await page.waitForTimeout(100);
  check(await page.evaluate(() => globalThis.__game.game.combat.weapon('rifle').installedAttachment === null), 'remove attachment action did not clear rifle');

  const noFuel = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.machine.power.restore({ fuel: 0 });
    g.terminal.refresh();
    return g.terminalFieldworkViews?.() ?? [];
  });
  check(noFuel.length === 0 || noFuel.every((view) => !view.available), 'zero fuel did not refuse fieldwork');
  await page.evaluate(() => { globalThis.__game.game.machine.power.restore({ fuel: 100 }); });

  const queued = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.director.queueExternal('skiff');
    g.terminal.refresh();
    return g.terminalFieldworkViews?.() ?? [];
  });
  check(queued.length === 0 || queued.every((view) => !view.available), 'queued encounter did not refuse fieldwork');
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    const saved = g.director.toSave();
    g.director.restore({ ...saved, queuedVehicle: null, pending: [] });
  });

  // An active external encounter is also a real pending encounter and must
  // block fieldwork without consuming resources or changing the attachment.
  const pending = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const saved = g.director.toSave();
    g.director.restore({ ...saved, phase: 'engagement', externalEncounterActive: true, pending: ['ordinary-scavenger'] });
    g.terminal.refresh();
    return g.terminalFieldworkViews?.() ?? [];
  });
  check(pending.length === 0 || pending.every((view) => !view.available), 'pending encounter did not refuse fieldwork');
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    const saved = g.director.toSave();
    g.director.restore({ ...saved, phase: 'calm', externalEncounterActive: false, queuedVehicle: null, pending: [] });
  });

  // Verify the actual output destination selector and craft command. The
  // workbench recipe produces live rifle rounds into the selected crate; the
  // browser click is the authority for this check.
  await page.evaluate(() => { globalThis.__game.game.machine.power.restore({ fuel: 100 }); globalThis.__game.game.terminal.refresh(); });
  const output = page.locator('[data-testid="terminal-output-destination"]');
  if (await output.count()) {
    await output.selectOption({ label: /crate/i }).catch(async () => {
      const options = await output.locator('option').evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, label: node.textContent })));
      if (options.length > 1) await output.selectOption(options[1].value);
    });
  }
  const crateOption = output.locator('option').filter({ hasText: /crate/i });
  const remoteAvailable = await crateOption.count() > 0;
  if (remoteAvailable) await output.selectOption(await crateOption.first().getAttribute('value'));
  const rifleRecipe = page.locator('.terminal-action-row:has-text("Rifle Rounds") button').first();
  const beforeCraft = await page.evaluate(() => ({
    scrap: globalThis.__game.game.inventory.count('scrap'),
    components: globalThis.__game.game.inventory.count('components'),
    crates: globalThis.__game.game.terminal.onboardResources().storage.map((s) => ({ id: s.id, rifle: s.container.count('ammo-rifle') })),
  }));
  if (await rifleRecipe.count()) await rifleRecipe.click();
  await page.waitForTimeout(100);
  const afterCraft = await page.evaluate(() => ({
    scrap: globalThis.__game.game.inventory.count('scrap'),
    components: globalThis.__game.game.inventory.count('components'),
    crates: globalThis.__game.game.terminal.onboardResources().storage.map((s) => ({ id: s.id, rifle: s.container.count('ammo-rifle') })),
  }));
  const craftClicked = await rifleRecipe.count() > 0;
  check(remoteAvailable && craftClicked, 'remote crate output or rifle recipe was not available');
  check(afterCraft.scrap === beforeCraft.scrap - 2 && afterCraft.components === beforeCraft.components - 1, 'remote rifle craft debit mismatch');
  await page.screenshot({ path: `${out}/terminal-workshop-after.png` });
  for (const tab of ['inventory', 'character', 'machine', 'signal', 'build']) {
    await page.locator(`[data-tab="${tab}"]`).click();
    await page.waitForTimeout(40);
  }
  await page.keyboard.press('Escape');
  await page.locator('.terminal-ui').waitFor({ state: 'hidden' });
  check(!(await page.evaluate(() => globalThis.__game.game.state.paused)), 'terminal close did not resume simulation');
  const ammoBeforeReopen = await page.evaluate(() => ({ rifle: globalThis.__game.game.combat.weapon('rifle').ammoInMag, shotgun: globalThis.__game.game.combat.weapon('shotgun').ammoInMag }));
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('Tab');
    await page.locator('.terminal-ui').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.locator('.terminal-ui').waitFor({ state: 'hidden' });
  }
  const ammoAfterReopen = await page.evaluate(() => ({ rifle: globalThis.__game.game.combat.weapon('rifle').ammoInMag, shotgun: globalThis.__game.game.combat.weapon('shotgun').ammoInMag }));
  check(JSON.stringify(ammoBeforeReopen) === JSON.stringify(ammoAfterReopen), 'repeated terminal open/close changed weapon ammunition');
  const report = { url, setup, accessibility, paused, pausedAfter, beforeResearch, afterResearch, noFuel, queued, pending, beforeCraft, afterCraft, craftClicked, ammoBeforeReopen, ammoAfterReopen, errors };
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  if (errors.length) throw new Error(`browser errors: ${errors.join('; ')}`);
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
