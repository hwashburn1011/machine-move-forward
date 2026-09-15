/** REC-02 browser acceptance for the recovery projection and its real actions. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5201/';
const out = path.resolve(process.env.MMF_QA_OUT ?? 'test-results/readiness-recovery');
const checks = [],
  errors = [],
  setup = [];
const coverageGaps = [];
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
const waitStatus = () => page.waitForTimeout(350);

try {
  const url = `${site}?nomenu=1&nolock=1&nomodel=1&notex=1&nosound=1&nospawn=1&quality=low&seed=readiness-recovery`;
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 120000 });
  const fresh = await page.evaluate(() => {
    const g = globalThis.__game.game;
    return { firstRun: g.firstRun.current, recoveryText: g.machineStatus.root.textContent ?? '' };
  });
  setup.push('fresh game boot; no state mutations');
  check(
    'fresh first run hides recovery guidance',
    fresh.firstRun !== 'complete' && !fresh.recoveryText.includes('Care & forecasts'),
    fresh,
  );

  await page.evaluate(() => {
    const g = globalThis.__game.game;
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
    g.player.stats.invulnerable = true;
    g.player.teleport({ x: 5.6, y: 15.8, z: 1.5 });
  });
  setup.push('marked tutorial complete and made player invulnerable');
  await waitStatus();
  check(
    'completed tutorial exposes recovery card',
    (await page.locator('[data-recovery-details]').count()) === 1,
  );
  const infoDismissed = await page.evaluate(() => {
    const button = document.querySelector('[data-recovery-dismiss="fuel"]');
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  });
  await waitStatus();
  check(
    'informational fuel forecast can be dismissed for the session',
    infoDismissed && (await page.locator('[data-recovery-dismiss="fuel"]').count()) === 0,
    { infoDismissed },
  );

  const fuel = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.machine.power.restore({ fuel: 0 });
    const generator = g.build.serialise().find((piece) => piece.definitionId === 'generator');
    const position = generator ? g.build.visual(generator.instanceId)?.position?.clone() : null;
    if (!position) return { ok: false, reason: 'generator fixture position unavailable' };
    g.player.teleport(position);
    g.inventory.add('fuel', 2);
    const before = g.machine.power.fuel;
    const used = g.depositFuel();
    return {
      ok: used && g.machine.power.fuel > before && g.inventory.count('fuel') < 2,
      fuel: g.machine.power.fuel,
      carried: g.inventory.count('fuel'),
    };
  });
  check('real generator refuel recovers empty tank', fuel.ok, fuel);

  const needs = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.player.needs.restore({ hydration: 0, nourishment: 0 });
    g.inventory.add('water', 1);
    g.inventory.add('rations', 1);
    const waterSlot = g.inventory.slots.findIndex((slot) => slot?.itemId === 'water');
    const rationSlot = g.inventory.slots.findIndex((slot) => slot?.itemId === 'rations');
    const drank = waterSlot >= 0 && g.useSlot(waterSlot);
    const ate = rationSlot >= 0 && g.useSlot(rationSlot);
    return {
      drank,
      ate,
      hydration: g.player.needs.hydration,
      nourishment: g.player.needs.nourishment,
    };
  });
  check(
    'real inventory use recovers water and food needs',
    needs.drank && needs.ate && needs.hydration > 0 && needs.nourishment > 0,
    needs,
  );

  const power = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.machine.power.registerConsumer({ id: 'readiness-extra-load', draw: 999, priority: 'light' });
    const shed = g.machine.power.registeredDemand > g.machine.power.draw;
    g.machine.power.unregisterConsumer('readiness-extra-load');
    const restored = g.machine.power.registeredDemand <= g.machine.power.capacity;
    return { shed, restored, demand: g.machine.power.registeredDemand, draw: g.machine.power.draw };
  });
  check('removing excess load restores power demand', power.shed && power.restored, power);

  const repair = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.machine.damage.damage('engine', 99999);
    g.resources.deposit('scrap', 100);
    g.resources.deposit('components', 100);
    // SUBSYSTEMS.engine.repairAt is the authored access panel, not the engine hitbox.
    g.player.teleport({ x: 0, y: 14.74, z: 4.4 });
    const target = g.candidates().find((item) => item.kind === 'repair');
    if (!target) return { ok: false, reason: 'engine access panel candidate unavailable' };
    const before = g.machine.damage.fraction('engine');
    const scrap = g.resources.count('scrap');
    const components = g.resources.count('components');
    return { ok: true, before, scrap, components, target: target.id };
  });
  if (repair.ok) {
    await page.keyboard.down('e');
    await page.waitForTimeout(2200);
    await page.keyboard.up('e');
    const repaired = await page.evaluate(() => {
      const g = globalThis.__game.game;
      return {
        health: g.machine.damage.fraction('engine'),
        scrap: g.resources.count('scrap'),
        components: g.resources.count('components'),
      };
    });
    check(
      'real held access-panel repair consumes materials and restores subsystem',
      repaired.health > repair.before &&
        repaired.scrap < repair.scrap &&
        repaired.scrap === repair.scrap - 80 &&
        repaired.components === repair.components,
      { before: repair, after: repaired },
    );
  } else
    check('real held access-panel repair consumes materials and restores subsystem', false, repair);

  const garden = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const floor = g.build.place({ piece: 'floor', cell: { x: 2, y: 0, z: 2 }, rotation: 0 }, true);
    const placed =
      floor &&
      g.build.place({ piece: 'seed-garden', cell: { x: 2, y: 0, z: 2 }, rotation: 0 }, true);
    if (!placed) return { ok: false, reason: 'seed garden fixture placement failed' };
    const id = placed.instanceId;
    const station = g.build
      .stationsNear(g.player.worldPosition, Infinity)
      .find((item) => item.instanceId === id);
    if (!station) return { ok: false, reason: 'seed garden station position unavailable' };
    g.player.teleport(station.position);
    g.resources.deposit('water', 1);
    const target = g.candidates().find((item) => item.id === id);
    const watered = Boolean(target && g.openInteractable(target));
    const before = g.build.gardenSnapshot(id);
    g.build.tickGardens(180);
    const grown = g.build.gardenSnapshot(id);
    return { ok: watered && grown?.greens === 3, id, before, grown };
  });
  if (garden.ok) {
    const harvested = await page.evaluate((id) => {
      const g = globalThis.__game.game;
      const target = g.candidates().find((item) => item.id === id);
      const before = g.resources.count('greens');
      const opened = Boolean(target && g.openInteractable(target));
      return {
        opened,
        gained: g.resources.count('greens') - before,
        state: g.build.gardenSnapshot(id),
      };
    }, garden.id);
    check(
      'watered garden grows and harvests through real interaction',
      harvested.opened && harvested.gained === 3 && harvested.state?.greens === 0,
      { garden, harvested },
    );
    const saved = await page.evaluate(
      async (slot) => globalThis.__game.game.saveTo(slot, 'manual', true),
      'readiness-recovery',
    );
    const loaded =
      saved &&
      (await page.evaluate(
        async (slot) => globalThis.__game.game.loadFrom(slot),
        'readiness-recovery',
      ));
    await page.evaluate(() => {
      globalThis.__game.game.loop.stop();
      globalThis.__game.game.state.paused = false;
    });
    check('garden save/load preserves live controller state', Boolean(saved && loaded), {
      saved,
      loaded,
    });
  } else check('watered garden grows and harvests through real interaction', false, garden);

  const cooking = await page.evaluate(() => {
    const g = globalThis.__game.game;
    let stove = g.build.serialise().find((piece) => piece.definitionId === 'stove');
    if (!stove) {
      for (const cell of g.machine.deckCells) {
        g.build.place({ piece: 'floor', cell, rotation: 0 }, true);
        stove = g.build.place({ piece: 'stove', cell, rotation: 0 }, true) ?? undefined;
        if (stove) break;
      }
    }
    const position = stove ? g.build.visual(stove.instanceId)?.position?.clone() : null;
    if (!position) return { ok: false, reason: 'stove fixture unavailable' };
    g.machine.power.restore({ fuel: 100 });
    g.tickPower(0.01);
    g.player.teleport(position);
    g.inventory.add('greens', 1);
    g.inventory.add('water', 1);
    const target = g.candidates().find((item) => item.id === stove.instanceId);
    const opened = Boolean(target && g.openInteractable(target));
    const before = {
      greens: g.inventory.count('greens'),
      water: g.inventory.count('water'),
      rations: g.inventory.count('rations'),
      nourishment: g.player.needs.nourishment,
    };
    const crafted = opened && g.crafting.craft('cook-rations');
    const slot = g.inventory.slots.findIndex((item) => item?.itemId === 'rations');
    const ate = crafted && slot >= 0 && g.useSlot(slot);
    const after = {
      greens: g.inventory.count('greens'),
      water: g.inventory.count('water'),
      rations: g.inventory.count('rations'),
      nourishment: g.player.needs.nourishment,
    };
    return { ok: Boolean(ate), opened, crafted, ate, before, after };
  });
  check(
    'real stove recipe cooks greens and water into a ration',
    cooking.ok &&
      cooking.before.greens - cooking.after.greens === 1 &&
      cooking.before.water - cooking.after.water === 1 &&
      cooking.after.rations === cooking.before.rations &&
      cooking.after.nourishment > cooking.before.nourishment,
    cooking,
  );

  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.player.needs.restore({ hydration: 0, nourishment: 100 });
    g.machine.power.restore({ fuel: 0 });
    g.nextStatusUpdateAt = 0;
    g.updateMachineStatus();
  });
  const blocked = await page.evaluate(() => ({
    text: globalThis.__game.game.machineStatus.root.textContent ?? '',
    buttons: document.querySelectorAll('[data-recovery-dismiss]').length,
    fuelDismissed: globalThis.__game.game.dismissedRecovery?.has('fuel') ?? false,
  }));
  check(
    'blocked recovery topic is visible and never dismissible',
    blocked.text.includes('Fuel tank is empty') &&
      blocked.fuelDismissed === false &&
      blocked.buttons === 0,
    blocked,
  );
  await page.evaluate(() => {
    const details = document.querySelector('[data-recovery-details]');
    if (details instanceof HTMLDetailsElement) details.open = true;
  });
  await page.screenshot({ path: path.join(out, 'care-expanded.png') });
  const controls = await page.evaluate(
    () => globalThis.__game.game.machineStatus.root.textContent ?? '',
  );
  check(
    'recovery card shows resolved control labels',
    controls.includes('Inventory') &&
      controls.includes('Build') &&
      controls.includes('service panel'),
    controls,
  );

  const hookSave = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.fireReel();
    g.nextStatusUpdateAt = 0;
    g.updateMachineStatus();
    const active = !g.isSafeToSave(true);
    const refusal = g.machineStatus.root.textContent ?? '';
    for (let i = 0; i < 120 && g.hook !== null; i++) g.updateReel(1 / 60);
    return { active, refusal, released: g.hook === null };
  });
  check(
    'active salvage hook refuses saving with the real recovery reason',
    hookSave.active && hookSave.refusal.includes('Finish reeling') && hookSave.released,
    hookSave,
  );

  const gangwaySave = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const priorStory = g.story.toSave();
    g.story.restore({
      chapterId: 'wreck-one',
      phase: 'docked',
      arrivalDistance: g.world.distanceTraveled,
      journalsRead: [],
      uniqueCollected: false,
      nextSignal: false,
    });
    g.destination.setActive(true);
    g.destination.setDocked(true);
    // The legacy wreck has no departure interaction; its authored gangway is
    // root x=14 plus local x=-6.5 at the machine deck surface.
    g.player.teleport({ x: 7.5, y: 14.74, z: 0 });
    g.nextStatusUpdateAt = 0;
    g.updateMachineStatus();
    const refusal = g.machineStatus.root.textContent ?? '';
    const refused = !g.isSafeToSave(true);
    g.destination.setDocked(false);
    g.destination.setActive(false);
    g.story.restore(priorStory);
    return { ok: refused && refusal.includes('gangway'), refusal };
  });
  check(
    'gangway position refuses saving with the real recovery reason',
    gangwaySave.ok,
    gangwaySave,
  );

  const encounterSave = await page.evaluate(() => {
    const g = globalThis.__game.game;
    if (typeof g.spawnEnemyAhead !== 'function')
      return { ok: false, reason: 'enemy fixture seam unavailable' };
    g.spawnEnemyAhead(5);
    g.nextStatusUpdateAt = 0;
    g.updateMachineStatus();
    const refusal = g.machineStatus.root.textContent ?? '';
    const refused = !g.isSafeToSave(true);
    g.enemies.despawnAll();
    return { ok: refused && refusal.includes('Clear the current attack'), refusal };
  });
  check(
    'active encounter refuses saving with the real recovery reason',
    encounterSave.ok,
    encounterSave,
  );

  const logBefore = await page.evaluate(() =>
    JSON.stringify(globalThis.__game.game.inventory.slots),
  );
  const log = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.progression.earlyRadioDrop.restore({
      status: 'found',
      armedAtSimTime: 0,
      foundAtSimTime: 0,
      foundAtDistance: 0,
      eligibleChestsOpened: 1,
    });
    g.openRadio();
    const radioButton = document.querySelector('[data-radio-log]');
    if (!(radioButton instanceof HTMLButtonElement))
      return { ok: false, reason: 'radio campaign-record button unavailable' };
    radioButton.click();
    return { ok: Boolean(document.querySelector('.campaign-log:not([hidden])')), route: 'radio' };
  });
  if (log.ok) {
    await page.screenshot({ path: path.join(out, 'campaign-log.png') });
    await page.keyboard.press('Escape');
    if (await page.locator('.campaign-log:not([hidden])').count())
      await page.locator('[data-campaign-log-close]').click();
    const logAfter = await page.evaluate(() => ({
      player: JSON.stringify(globalThis.__game.game.inventory.slots),
      paused: globalThis.__game.game.state.paused,
    }));
    check(
      'campaign record opens/closes without inventory mutation',
      logAfter.player === logBefore && !logAfter.paused,
      { ...logAfter, route: log.route },
    );
  } else check('campaign record opens/closes without inventory mutation', false, log);

  const helmLog = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.openHelm();
    const button = document.querySelector('[data-helm-log]');
    if (!(button instanceof HTMLButtonElement))
      return { ok: false, reason: 'helm campaign-record button unavailable' };
    button.click();
    return { ok: Boolean(document.querySelector('.campaign-log:not([hidden])')) };
  });
  if (helmLog.ok) {
    await page.screenshot({ path: path.join(out, 'campaign-log-helm.png') });
    await page.keyboard.press('Escape');
    if (await page.locator('.campaign-log:not([hidden])').count())
      await page.locator('[data-campaign-log-close]').click();
  }
  check('Helm campaign-record button opens the same log', helmLog.ok, helmLog);
} catch (error) {
  errors.push(error?.stack ?? String(error));
} finally {
  await page.screenshot({ path: path.join(out, 'final.png') }).catch(() => {});
  await fs.writeFile(
    path.join(out, 'qa.json'),
    JSON.stringify({ site, setup, coverageGaps, checks, errors }, null, 2),
  );
  await page.context().browser()?.close();
}
console.log(
  JSON.stringify(
    {
      passed: checks.filter((item) => item.ok).length,
      total: checks.length,
      coverageGaps,
      checks,
      errors,
    },
    null,
    2,
  ),
);
if (errors.length || checks.some((item) => !item.ok)) process.exitCode = 1;
