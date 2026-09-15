/**
 * SURV refined execution: exercise finite Survival ammo through the real
 * workbench and weapon controls, then prove the resulting campaign save can
 * cold-continue. This runner never edits game state or bypasses encounters.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const source = process.env.MMF_CONTINUITY_PROFILE;
if (!source) throw new Error('MMF_CONTINUITY_PROFILE is required');
const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5205/';
const fullArt = process.env.MMF_FULL_ART === '1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve('test-results', 'continuity-survival-ammo', `run-${stamp}`);
const profile = path.join(output, 'browser-profile');
await fs.mkdir(output, { recursive: true });
await fs.cp(path.resolve(source), profile, { recursive: true, errorOnExist: true });
const eventsPath = path.join(output, 'events.jsonl');
const events = [];
const errors = [];
const record = async (type, detail = {}) => {
  const event = { at: new Date().toISOString(), type, ...detail };
  events.push(event);
  await fs.appendFile(eventsPath, `${JSON.stringify(event)}\n`);
};

const url = new URL(site);
if (['seed', 'nospawn', 'nolock', 'nomenu', 'noload'].some((key) => url.searchParams.has(key)))
  throw new Error('Campaign URL contains an authority override');
if (!fullArt) {
  url.searchParams.set('nomodel', '1');
  url.searchParams.set('notex', '1');
  url.searchParams.set('quality', 'low');
} else url.searchParams.set('quality', 'medium');
url.searchParams.set('nosound', '1');

let context;
let page;
const snap = () =>
  page.evaluate(() => {
    const g = globalThis.__game?.game;
    if (!g) return null;
    const current = g.combat.current;
    return {
      seed: g.state.seed,
      profile: g.buildSave().profile,
      phase: g.story.currentPhase,
      simTime: g.state.simTime,
      distanceM: g.world.distanceTraveled,
      paused: g.state.paused,
      health: g.player.stats.health,
      player: g.player.worldPosition.toArray(),
      mounted: g.defense.mounted,
      interaction: g.interaction.current
        ? { id: g.interaction.current.id, kind: g.interaction.current.kind }
        : null,
      needs: g.player.needs?.toSave?.() ?? null,
      weapon: current
        ? {
            id: current.def.id,
            mag: current.ammoInMag,
            reserve: current.reserveAmmo,
            reloading: current.reloading,
          }
        : null,
      weapons: g.combat.all.map((weapon) => ({
        id: weapon.def.id,
        mag: weapon.ammoInMag,
        reserve: weapon.reserveAmmo,
        reloading: weapon.reloading,
        infinite: weapon.infiniteReserve,
      })),
      inventory: g.inventory.serialise(),
      resources: {
        scrap: g.resources.count('scrap'),
        components: g.resources.count('components'),
        fuel: g.resources.count('fuel'),
      },
      pieces: g.build.serialise().map((piece) => ({
        instanceId: piece.instanceId,
        definitionId: piece.definitionId,
        cell: piece.cell,
        health: piece.health,
      })),
      story: g.story.toSave(),
      damage: g.machine.damage.toSave(),
      enemies: (g.enemies.active ?? []).map((enemy) => ({
        id: enemy.id,
        position: enemy.worldPosition?.toArray?.() ?? null,
        health: enemy.health ?? enemy.stats?.health ?? null,
      })),
      vehicle: g.vehicleManager?.snapshot ?? null,
      events: (globalThis.__continuitySurvivalEvents ?? []).length,
    };
  });

const moveLookTo = async (target) => {
  for (let i = 0; i < 16; i += 1) {
    const delta = await page.evaluate((at) => {
      const g = globalThis.__game.game;
      const from = g.playerCamera.camera.position;
      const dx = at[0] - from.x;
      const dy = at[1] - from.y;
      const dz = at[2] - from.z;
      const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
      return {
        x: wrap(Math.atan2(-dx, -dz) - g.playerCamera.yawAngle),
        y: Math.atan2(dy, Math.hypot(dx, dz)) - g.playerCamera.pitchAngle,
      };
    }, target);
    if (Math.abs(delta.x) < 0.012 && Math.abs(delta.y) < 0.012) return;
    await page.keyboard.up('KeyW').catch(() => {});
    await page.evaluate(
      ({ x, y }) =>
        window.dispatchEvent(
          new MouseEvent('mousemove', {
            movementX: Math.max(-600, Math.min(600, -x / 0.0022)),
            movementY: Math.max(-350, Math.min(350, -y / 0.0022)),
            bubbles: true,
          }),
        ),
      delta,
    );
    await page.waitForTimeout(70);
  }
};

const walkTo = async (target, label, radius = 1.2, timeoutMs = 25_000) => {
  const started = Date.now();
  try {
    while (Date.now() - started < timeoutMs) {
      const state = await page.evaluate((at) => {
        const p = globalThis.__game.game.player.worldPosition;
        return { distance: Math.hypot(p.x - at[0], p.z - at[2]), position: p.toArray() };
      }, target);
      if (state.distance <= radius) {
        await record('waypoint-reached', { label, target, position: state.position });
        return state;
      }
      await moveLookTo(target);
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(
        Math.min(150, Math.max(55, ((state.distance - radius) / 4) * 1000)),
      );
      await page.keyboard.up('KeyW');
      await page.waitForTimeout(70);
    }
  } finally {
    await page.keyboard.up('KeyW').catch(() => {});
  }
  throw new Error(`waypoint ${label} timed out`);
};

const settleActive = async (label) => {
  await page.waitForFunction(
    () => Boolean(document.pointerLockElement) && !globalThis.__game.game.state.paused,
    null,
    { timeout: 15_000 },
  );
  await record('active-settled', { label });
};

const weaponEventCount = (type, weaponId) =>
  page.evaluate(
    ({ wantedType, wantedWeapon }) =>
      (globalThis.__continuitySurvivalEvents ?? []).filter(
        (entry) => entry.type === wantedType && entry.event.weaponId === wantedWeapon,
      ).length,
    { wantedType: type, wantedWeapon: weaponId },
  );

const aimAwayFromMachine = async () => {
  const target = await page.evaluate(() => {
    const camera = globalThis.__game.game.playerCamera.camera.position;
    return [camera.x, camera.y + 45, camera.z - 30];
  });
  await moveLookTo(target);
};

const workbenchPosition = async () =>
  page.evaluate(() => {
    const g = globalThis.__game.game;
    const station = g.build
      .stationsNear(g.player.worldPosition, 100)
      .find((candidate) => candidate.piece === 'workbench');
    return station?.position?.toArray?.() ?? null;
  });

const craft = async (recipeId) => {
  const before = await snap();
  const button = page.locator(`[data-recipe="${recipeId}"]`);
  await button.waitFor({ state: 'visible', timeout: 8_000 });
  if (await button.isDisabled()) throw new Error(`${recipeId} is disabled at the workbench`);
  await button.click();
  await page.waitForFunction(
    (id) => (globalThis.__continuityCraftEvents ?? []).some((event) => event.recipeId === id),
    recipeId,
    { timeout: 8_000 },
  );
  const after = await snap();
  const weaponId = recipeId === 'craft-rifle-ammo' ? 'rifle' : 'shotgun';
  const otherId = weaponId === 'rifle' ? 'shotgun' : 'rifle';
  const beforeGun = before.weapons.find((weapon) => weapon?.id === weaponId);
  const afterGun = after.weapons.find((weapon) => weapon?.id === weaponId);
  const beforeOther = before.weapons.find((weapon) => weapon?.id === otherId);
  const afterOther = after.weapons.find((weapon) => weapon?.id === otherId);
  const outputCount = weaponId === 'rifle' ? 30 : 8;
  if (
    !beforeGun ||
    !afterGun ||
    afterGun.mag + afterGun.reserve !== beforeGun.mag + beforeGun.reserve + outputCount
  )
    throw new Error(`${recipeId} did not add exactly ${outputCount} rounds to ${weaponId}`);
  if (
    !beforeOther ||
    !afterOther ||
    afterOther.mag + afterOther.reserve !== beforeOther.mag + beforeOther.reserve
  )
    throw new Error(`${recipeId} changed the other weapon`);
  const expectedScrapDelta = weaponId === 'rifle' ? -2 : -3;
  const expectedComponentsDelta = weaponId === 'rifle' ? -1 : 0;
  if (
    after.resources.scrap - before.resources.scrap !== expectedScrapDelta ||
    after.resources.components - before.resources.components !== expectedComponentsDelta
  )
    throw new Error(`${recipeId} consumed an unexpected resource amount`);
  const outputItem = weaponId === 'rifle' ? 'ammo-rifle' : 'ammo-shotgun';
  if (after.inventory.some((slot) => slot?.itemId === outputItem))
    throw new Error(`${recipeId} left crafted ammo in inventory instead of auto-loading the gun`);
  await record('crafted-ammo', {
    recipeId,
    before: { inventory: before.inventory, resources: before.resources, weapon: before.weapon },
    after: { inventory: after.inventory, resources: after.resources, weapon: after.weapon },
  });
  return { before, after };
};

try {
  await record('provenance', {
    source: path.resolve(source),
    profile,
    url: url.toString(),
    fullArt,
  });
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1280, height: 720 },
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on(
    'console',
    (message) => message.type() === 'error' && errors.push(`console: ${message.text()}`),
  );
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 180_000 });
  const sourceSave = await page.evaluate(async () => {
    const saves = globalThis.__game.game.saves;
    const slot = await saves.latestSlot();
    return slot ? { slot, data: await saves.load(slot) } : null;
  });
  if (!sourceSave?.data) throw new Error('No readable Survival checkpoint');
  if (sourceSave.data.profile !== 'survival')
    throw new Error(`Expected Survival profile, got ${sourceSave.data.profile}`);
  await record('source-save-readonly', {
    slot: sourceSave.slot,
    seed: sourceSave.data.seed,
    profile: sourceSave.data.profile,
    ammo: sourceSave.data.player?.equipment?.weapons,
    pieces: sourceSave.data.machine?.structures?.map((piece) => piece.definitionId),
  });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(() => !globalThis.__game.game.titleScreen?.isOpen, null, {
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => Boolean(document.pointerLockElement) && !globalThis.__game.game.state.paused,
    null,
    { timeout: 15_000 },
  );
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    globalThis.__continuitySurvivalEvents = [];
    globalThis.__continuityCraftEvents = [];
    for (const type of [
      'craft:completed',
      'weapon:fired',
      'weapon:reload-started',
      'weapon:reload-finished',
      'weapon:dry-fire',
      'enemy:spawned',
      'enemy:damaged',
      'enemy:killed',
      'player:damaged',
      'player:died',
      'loot:collected',
      'repair:completed',
    ])
      g.bus.on(type, (event) =>
        globalThis.__continuitySurvivalEvents.push({ type, event, simTime: g.state.simTime }),
      );
    g.bus.on('craft:completed', (event) => globalThis.__continuityCraftEvents.push(event));
  });
  const continued = await snap();
  await record('continued', continued);
  if (continued.seed !== sourceSave.data.seed || continued.profile !== 'survival')
    throw new Error('Survival seed/profile changed on Continue');
  if (
    continued.weapons.length !== 2 ||
    continued.weapons.some((weapon) => weapon.infinite !== false)
  )
    throw new Error('Survival checkpoint did not restore finite weapons');
  if (continued.mounted) {
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => !globalThis.__game.game.defense.mounted, null, {
      timeout: 5_000,
    });
  }
  const bench = await workbenchPosition();
  if (!bench) throw new Error('No built workbench found in the Survival checkpoint');
  await walkTo(bench, 'workbench', 1.35);
  if ((await snap()).interaction?.kind === 'repair') {
    const beforeRepair = await snap();
    const prompt = await page.evaluate(
      () => document.body.innerText.match(/[^\n]*Repair Deck Plate[^\n]*/i)?.[0] ?? '',
    );
    await page.keyboard.down('KeyE');
    try {
      await page.waitForFunction(
        () => globalThis.__game.game.interaction.current?.kind === 'workbench',
        null,
        { timeout: 8_000 },
      );
    } finally {
      await page.keyboard.up('KeyE');
    }
    await record('workbench-support-repaired', {
      before: beforeRepair,
      after: await snap(),
      prompt,
    });
  }
  await page.waitForFunction(
    () => globalThis.__game.game.interaction.current?.kind === 'workbench',
    null,
    { timeout: 5_000 },
  );
  await page.keyboard.press('KeyE');
  await page.locator('#inv-panel').waitFor({ state: 'visible', timeout: 8_000 });
  await page.waitForFunction(
    () => document.querySelector('[data-recipe="craft-rifle-ammo"]') !== null,
    null,
    { timeout: 8_000 },
  );

  // Cross-weapon check: hold shotgun while crafting rifle ammunition.
  await page.keyboard.press('Escape');
  await settleActive('leave-workbench-before-shotgun-equip');
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(150);
  const shotgunHeld = await snap();
  if (shotgunHeld.weapon?.id !== 'shotgun') throw new Error('Digit2 did not equip shotgun');
  await page.keyboard.press('KeyE');
  await page.locator('#inv-panel').waitFor({ state: 'visible', timeout: 8_000 });
  await craft('craft-rifle-ammo');
  await page.keyboard.press('Escape');
  await settleActive('leave-workbench-before-shotgun-drain');
  await aimAwayFromMachine();

  // Drain every finite shotgun round through trigger input. Reloads are
  // explicit and are acknowledged by a NEW weapon-specific completion event.
  const shotgunTotalBeforeDrain = shotgunHeld.weapon.mag + shotgunHeld.weapon.reserve;
  const shotgunFiresBefore = await weaponEventCount('weapon:fired', 'shotgun');
  for (let i = 0; i < shotgunTotalBeforeDrain + 16; i += 1) {
    const current = await snap();
    if (!current.weapon || current.weapon.id !== 'shotgun')
      throw new Error('Shotgun was lost while draining finite ammunition');
    if (current.weapon.mag + current.weapon.reserve <= 0) break;
    if (current.weapon.mag === 0) {
      const reloadsBefore = await weaponEventCount('weapon:reload-finished', 'shotgun');
      await page.keyboard.press('KeyR');
      await page.waitForFunction(
        (before) =>
          (globalThis.__continuitySurvivalEvents ?? []).filter(
            (entry) =>
              entry.type === 'weapon:reload-finished' && entry.event.weaponId === 'shotgun',
          ).length > before,
        reloadsBefore,
        { timeout: 7_000 },
      );
      continue;
    }
    const firesBefore = await weaponEventCount('weapon:fired', 'shotgun');
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(820);
    await page.mouse.up({ button: 'left' });
    await page.waitForFunction(
      (before) =>
        (globalThis.__continuitySurvivalEvents ?? []).filter(
          (entry) => entry.type === 'weapon:fired' && entry.event.weaponId === 'shotgun',
        ).length > before,
      firesBefore,
      { timeout: 3_000 },
    );
  }
  const depleted = await snap();
  if (
    !depleted.weapon ||
    depleted.weapon.id !== 'shotgun' ||
    depleted.weapon.mag + depleted.weapon.reserve !== 0
  )
    throw new Error(
      `Shotgun did not deplete through trigger input: ${JSON.stringify(depleted.weapon)}`,
    );
  const shotgunFiresAfter = await weaponEventCount('weapon:fired', 'shotgun');
  if (shotgunFiresAfter - shotgunFiresBefore !== shotgunTotalBeforeDrain)
    throw new Error('Shotgun fired-event ledger did not conserve its finite ammunition');

  const dryBefore = await weaponEventCount('weapon:dry-fire', 'shotgun');
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(250);
  await page.mouse.up({ button: 'left' });
  const dry = await snap();
  const dryAfter = await weaponEventCount('weapon:dry-fire', 'shotgun');
  if (dryAfter <= dryBefore) throw new Error('Empty shotgun trigger did not emit weapon:dry-fire');
  await record('shotgun-depleted-dry-trigger', {
    before: depleted.weapon,
    after: dry.weapon,
    fires: shotgunFiresAfter - shotgunFiresBefore,
    dryEventsBefore: dryBefore,
    dryEventsAfter: dryAfter,
  });

  // Cross a real rifle magazine boundary and prove firing consumes exactly one
  // round per fired event while reload merely transfers reserve into the mag.
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(150);
  const rifleBeforeDrain = await snap();
  if (rifleBeforeDrain.weapon?.id !== 'rifle') throw new Error('Digit1 did not equip rifle');
  const rifleTotalBefore = rifleBeforeDrain.weapon.mag + rifleBeforeDrain.weapon.reserve;
  const rifleFiresBefore = await weaponEventCount('weapon:fired', 'rifle');
  const rifleReloadsBefore = await weaponEventCount('weapon:reload-finished', 'rifle');
  await aimAwayFromMachine();
  const rifleDeadline = Date.now() + 120_000;
  while ((await weaponEventCount('weapon:fired', 'rifle')) - rifleFiresBefore < 35) {
    if (Date.now() > rifleDeadline)
      throw new Error('Rifle input failed to cross a magazine within two minutes');
    const current = await snap();
    if (current.weapon.mag === 0) {
      await page.keyboard.press('KeyR');
      await page.waitForFunction(() => !globalThis.__game.game.combat.current.reloading, null, {
        timeout: 7_000,
      });
      continue;
    }
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(360);
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
  }
  const rifleFiresAfter = await weaponEventCount('weapon:fired', 'rifle');
  const rifleAfterDrain = await snap();
  if (rifleFiresAfter - rifleFiresBefore < 35)
    throw new Error(
      `Rifle fired ${rifleFiresAfter - rifleFiresBefore} rounds; expected at least 35`,
    );
  if (
    rifleAfterDrain.weapon.mag + rifleAfterDrain.weapon.reserve !==
    rifleTotalBefore - (rifleFiresAfter - rifleFiresBefore)
  )
    throw new Error('Rifle firing/reload ledger did not conserve finite ammunition');
  const rifleReloadsAfter = await weaponEventCount('weapon:reload-finished', 'rifle');
  if (rifleReloadsAfter <= rifleReloadsBefore)
    throw new Error('Rifle magazine boundary did not produce a finite reload');

  await walkTo(bench, 'workbench-return', 1.35);
  await page.keyboard.press('KeyE');
  await page.locator('#inv-panel').waitFor({ state: 'visible', timeout: 8_000 });
  const craftedShells = await craft('craft-shotgun-ammo');
  if (craftedShells.after.inventory.some((slot) => slot?.itemId === 'ammo-shotgun'))
    throw new Error('Crafted shotgun shells remained in inventory after auto-loading');
  await page.keyboard.press('Escape');
  await settleActive('leave-workbench-before-shotgun-reload');
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(150);
  const shotgunReloadStartsBefore = await weaponEventCount('weapon:reload-started', 'shotgun');
  const shotgunReloadFinishesBefore = await weaponEventCount('weapon:reload-finished', 'shotgun');
  await page.keyboard.press('KeyR');
  await page.waitForFunction(
    (before) =>
      (globalThis.__continuitySurvivalEvents ?? []).filter(
        (entry) => entry.type === 'weapon:reload-started' && entry.event.weaponId === 'shotgun',
      ).length > before,
    shotgunReloadStartsBefore,
    { timeout: 5_000 },
  );
  await page.waitForFunction(
    (before) =>
      (globalThis.__continuitySurvivalEvents ?? []).filter(
        (entry) => entry.type === 'weapon:reload-finished' && entry.event.weaponId === 'shotgun',
      ).length > before,
    shotgunReloadFinishesBefore,
    { timeout: 6_000 },
  );
  const reloaded = await snap();
  if (
    !reloaded.weapon ||
    reloaded.weapon.id !== 'shotgun' ||
    reloaded.weapon.mag !== 6 ||
    reloaded.weapon.reserve !== 2
  )
    throw new Error(
      `Shotgun did not reload crafted 6+2 shells: ${JSON.stringify(reloaded.weapon)}`,
    );
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(150);
  const postCraft = await snap();
  await record('ammo-ledger', {
    continued,
    shotgunHeld,
    depleted,
    dry,
    rifleBeforeDrain,
    rifleAfterDrain,
    reloaded,
    postCraft,
  });
  if (postCraft.weapon?.id !== 'rifle')
    throw new Error('Rifle was not still held after shotgun craft');

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__game.game.state.paused, null, { timeout: 8_000 });
  const checkpoint = await page.evaluate(() => globalThis.__game.game.buildSave());
  await record('gameplay-events', {
    events: await page.evaluate(() => globalThis.__continuitySurvivalEvents ?? []),
  });
  await page.getByRole('button', { name: 'Save & Quit', exact: true }).click();
  await page
    .getByRole('button', { name: 'Continue', exact: true })
    .waitFor({ state: 'visible', timeout: 20_000 });
  const committed = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    const slot = await g.saves.latestSlot();
    return { slot, save: slot ? await g.saves.load(slot) : null };
  });
  if (
    !committed.save ||
    JSON.stringify({ ...committed.save, savedAt: 0 }) !==
      JSON.stringify({ ...checkpoint, savedAt: 0 })
  )
    throw new Error('Committed Survival ammo save differs from paused checkpoint');
  await fs.writeFile(path.join(output, 'committed-save.json'), JSON.stringify(committed, null, 2));
  await record('save-committed', { slot: committed.slot });
  await context.close();
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1280, height: 720 },
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on(
    'console',
    (message) => message.type() === 'error' && errors.push(`console: ${message.text()}`),
  );
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 180_000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(() => !globalThis.__game.game.titleScreen?.isOpen, null, {
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => Boolean(document.pointerLockElement) && !globalThis.__game.game.state.paused,
    null,
    { timeout: 15_000 },
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__game.game.state.paused, null, { timeout: 8_000 });
  const restored = await snap();
  for (const key of [
    'seed',
    'profile',
    'health',
    'inventory',
    'resources',
    'pieces',
    'story',
    'damage',
    'weapon',
    'weapons',
  ])
    if (JSON.stringify(restored[key]) !== JSON.stringify(postCraft[key]))
      throw new Error(`${key} changed across cold Continue`);
  if (restored.weapon?.id !== 'rifle' || restored.weapon.mag <= 0)
    throw new Error('Finite rifle ammo state was not restored');
  const restoredShotgun = restored.weapons.find((weapon) => weapon.id === 'shotgun');
  if (!restoredShotgun || restoredShotgun.mag !== 6 || restoredShotgun.reserve !== 2)
    throw new Error(
      `Finite shotgun 6+2 state was not restored: ${JSON.stringify(restoredShotgun)}`,
    );
  await record('cold-continue', { restored, checkpoint });
  await page.screenshot({ path: path.join(output, 'cold-continue.png'), fullPage: true });
  if (errors.length) throw new Error(errors.join('\n'));
  await fs.writeFile(
    path.join(output, 'summary.json'),
    JSON.stringify({ status: 'passed', events, errors }, null, 2),
  );
  process.stdout.write(
    JSON.stringify({ status: 'passed', output, events: events.length }, null, 2),
  );
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  await record('blocked', { message, snapshot: page ? await snap().catch(() => null) : null });
  await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  await fs.writeFile(
    path.join(output, 'summary.json'),
    JSON.stringify({ status: 'blocked', message, events, errors }, null, 2),
  );
  process.stderr.write(JSON.stringify({ status: 'blocked', output, message, errors }, null, 2));
  process.exitCode = 1;
} finally {
  await context?.close();
}
