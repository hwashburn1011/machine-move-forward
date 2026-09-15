import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5205/';
const source = path.resolve(
  process.env.MMF_CONTINUITY_PROFILE ??
    'test-results/continuity-build-clean/run-2026-09-15T11-02-16-853Z/first-loop-1789470403504/boarding-1789473321465/browser-profile',
);
const evidenceDir = path.resolve('test-results', 'continuity-radio', `run-${Date.now()}`);
const profile = path.join(evidenceDir, 'browser-profile');
await fs.mkdir(evidenceDir, { recursive: true });
await fs.cp(source, profile, { recursive: true, errorOnExist: true });
const evidence = path.join(evidenceDir, 'events.jsonl');
const errors = [];
const resumeOffer = process.env.MMF_RESUME_OFFER === '1';
const boot = new URL(site);
if (['seed', 'nospawn', 'nolock', 'nomenu', 'noload'].some((key) => boot.searchParams.has(key)))
  throw new Error('Campaign continuity URL contains an authority override');
for (const [key, value] of Object.entries({
  nomodel: '1',
  notex: '1',
  quality: 'low',
  nosound: '1',
}))
  boot.searchParams.set(key, value);
const bootUrl = boot.toString();
let expectedSave = null;
let sourceSave = null;
const record = async (type, detail = {}) =>
  fs.appendFile(evidence, `${JSON.stringify({ at: new Date().toISOString(), type, ...detail })}\n`);

let context = await chromium.launchPersistentContext(profile, {
  headless: true,
  viewport: { width: 1280, height: 720 },
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
let page = context.pages()[0] ?? (await context.newPage());
const attachErrors = () => {
  page.on('pageerror', (error) => errors.push(error.stack ?? String(error)));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
};
attachErrors();
await record('provenance', {
  source,
  sourcePathLength: source.length,
  output: evidenceDir,
  outputPathLength: evidenceDir.length,
});
const snap = () =>
  page.evaluate(() => {
    const g = globalThis.__game.game;
    return {
      simTime: g.state.simTime,
      seed: g.state.seed,
      distanceM: g.world.distanceTraveled,
      resources: ['scrap', 'components', 'fuel'].map((id) => [id, g.resources.count(id)]),
      pieces: g.build
        .serialise()
        .map((p) => ({ id: p.instanceId, piece: p.definitionId, cell: p.cell })),
      firstRun: g.firstRun.toSave(),
      story: g.story.toSave(),
      phase: g.story.currentPhase,
      radio: g.progression.earlyRadioDrop,
      raids: g.radioRaids.toSave(),
      vehicle: g.vehicleManager.snapshot,
      enemies: g.enemies.activeCount,
      paused: g.state.paused,
      panels: g.panelsOpen,
      playerHealth: g.player.stats.health,
      damage: g.machine.damage.toSave(),
      needs: g.player.needs?.toSave?.() ?? null,
      ammo: g.combat.current
        ? {
            id: g.combat.current.id,
            mag: g.combat.current.ammoInMag,
            reserve: g.combat.current.reserveAmmo,
          }
        : null,
      events: globalThis.__continuityRadioEvents ?? [],
    };
  });
const moveLookTo = async (target) => {
  for (let i = 0; i < 12; i++) {
    const d = await page.evaluate((at) => {
      const g = globalThis.__game.game,
        c = g.playerCamera.camera;
      const dx = at[0] - c.position.x,
        dy = at[1] - c.position.y,
        dz = at[2] - c.position.z;
      const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
      return {
        x: wrap(Math.atan2(-dx, -dz) - g.playerCamera.yawAngle),
        y: Math.atan2(dy, Math.hypot(dx, dz)) - g.playerCamera.pitchAngle,
      };
    }, target);
    if (Math.abs(d.x) < 0.012 && Math.abs(d.y) < 0.012) return;
    await page.evaluate(
      ({ x, y }) =>
        window.dispatchEvent(
          new MouseEvent('mousemove', {
            movementX: Math.max(-600, Math.min(600, -x / 0.0022)),
            movementY: Math.max(-350, Math.min(350, -y / 0.0022)),
          }),
        ),
      d,
    );
    await page.waitForTimeout(80);
  }
};

try {
  await page.goto(bootUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 180_000 });
  sourceSave = await page.evaluate(async () => {
    const saves = globalThis.__game.game.saves;
    const slot = await saves.latestSlot();
    return slot ? { slot, data: await saves.load(slot) } : null;
  });
  if (!sourceSave?.data) throw new Error('Source profile has no readable saved campaign');
  await record('source-save-readonly', sourceSave);
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
    globalThis.__continuityRadioEvents = [];
    for (const type of ['story:phase', 'boarding:ended', 'loot:collected'])
      g.bus.on(type, (event) =>
        globalThis.__continuityRadioEvents.push({ type, event, simTime: g.state.simTime }),
      );
  });
  await record('continued', { snapshot: await snap() });

  const continuedState = await snap();
  if (continuedState.seed !== sourceSave.data.seed)
    throw new Error('Continue changed the source campaign seed');
  if (resumeOffer) {
    const parentPath = path.resolve(
      process.env.MMF_PARENT_EVIDENCE ?? path.join(source, '..', 'events.jsonl'),
    );
    if (path.dirname(parentPath) !== path.dirname(source))
      throw new Error('Resume evidence must belong to the source profile directory');
    const raw = await fs.readFile(parentPath, 'utf8');
    const parent = raw
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    const ledger = parent.find((item) => item.type === 'resource-ledger');
    const phases = parent.filter((item) => item.type === 'phase-change').map((item) => item.phase);
    if (
      !ledger ||
      !['signal', 'crossfire', 'raids'].every((phase) => phases.includes(phase)) ||
      !ledger.outcome ||
      ledger.seed !== sourceSave.data.seed
    )
      throw new Error('Resume source does not contain an observed, reconciled raid from this seed');
    for (const [id, count] of ledger.final)
      if (continuedState.resources.find(([key]) => key === id)?.[1] !== count)
        throw new Error(`Resume autosave lacks the observed ${id} raid balance`);
    await record('parent-raid-evidence', {
      path: parentPath,
      sha256: createHash('sha256').update(raw).digest('hex'),
      ledger,
    });
    if (
      continuedState.phase !== 'raids' ||
      continuedState.raids.wave <= 0 ||
      !continuedState.story.radioTraceEligible
    )
      throw new Error(
        `resume offer profile is not a persisted eligible raid: ${JSON.stringify(continuedState)}`,
      );
    await record('resume-offer-verified', continuedState);
  }

  // Allow the real route clock to reach the next radio encounter. If a threat
  // appears, the loop records it and uses ordinary player input below.
  let priorPhase = '';
  const travelDeadline = Date.now() + 15 * 60_000;
  let nextStatusAt = Date.now() + 30_000;
  while (!resumeOffer && Date.now() < travelDeadline) {
    const state = await snap();
    if (state.playerHealth <= 0) throw new Error('player died during Slice 2 travel/combat');
    if (Date.now() >= nextStatusAt) {
      await record('travel-status', state);
      nextStatusAt += 30_000;
    }
    if (state.phase !== priorPhase) {
      priorPhase = state.phase;
      await page.screenshot({
        path: path.join(evidenceDir, `phase-${state.phase}.png`),
        fullPage: true,
      });
      await record('phase-change', state);
    }
    if (state.phase === 'raids' && state.raids.wave > 0) break;
    if (state.enemies > 0) {
      const target = await page.evaluate(
        () => globalThis.__game.game.enemies.active[0]?.worldPosition?.toArray() ?? null,
      );
      if (target) {
        await page.mouse.down({ button: 'right' });
        await moveLookTo(target);
        if (state.ammo && state.ammo.mag <= 0 && state.ammo.reserve > 0) {
          await page.keyboard.press('KeyR');
          await page.waitForTimeout(1200);
        }
        await page.mouse.down({ button: 'left' });
        await page.waitForTimeout(250);
        await page.mouse.up({ button: 'left' });
        await page.mouse.up({ button: 'right' });
      }
    }
    await page.waitForTimeout(500);
  }
  const afterRaid = await snap();
  await record('radio-raid-observation', afterRaid);
  if (
    afterRaid.phase !== 'raids' ||
    afterRaid.raids.wave <= 0 ||
    (!resumeOffer && !afterRaid.events.some((event) => event.type === 'boarding:ended'))
  )
    throw new Error(`qualifying radio raid was not observed: ${JSON.stringify(afterRaid)}`);
  if (!resumeOffer) {
    const outcome = afterRaid.events.find((event) => event.type === 'boarding:ended');
    const loot = afterRaid.events
      .filter((event) => event.type === 'loot:collected')
      .flatMap((event) => event.event.items);
    for (const [id, count] of continuedState.resources) {
      const earned = loot
        .filter((item) => item.id === id)
        .reduce((sum, item) => sum + item.count, 0);
      if (afterRaid.resources.find(([key]) => key === id)?.[1] !== count + earned)
        throw new Error(`Raid resource ledger does not reconcile ${id}`);
    }
    if (JSON.stringify(continuedState.pieces) !== JSON.stringify(afterRaid.pieces))
      throw new Error('A built structure was lost during the raid');
    await record('resource-ledger', {
      seed: afterRaid.seed,
      initial: continuedState.resources,
      final: afterRaid.resources,
      loot,
      outcome,
    });
  }
  const radio = await page.evaluate(() => globalThis.__game.game.radioWorldPosition.toArray());
  await moveLookTo(radio);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(
    (at) =>
      globalThis.__game.game.player.worldPosition.distanceTo({ x: at[0], y: at[1], z: at[2] }) <=
      1.8,
    radio,
    { timeout: 25_000 },
  );
  await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyE');
  await page.locator('[data-radio-trace-button]').waitFor({ state: 'visible', timeout: 10_000 });
  await record('radio-open', {
    snapshot: await snap(),
    text: await page
      .locator('[data-panel="radio"]')
      .innerText()
      .catch(() => ''),
  });
  const beforeTrace = await snap();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !globalThis.__game.game.panelsOpen, null, { timeout: 5_000 });
  await page.waitForFunction(
    () => {
      const g = globalThis.__game.game;
      return document.pointerLockElement && !g.state.paused && !g.titleScreen.isOpen;
    },
    null,
    { timeout: 5_000 },
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__game.game.state.paused, null, { timeout: 5_000 });
  expectedSave = await page.evaluate(() => globalThis.__game.game.buildSave());
  const saveQuit = page.getByRole('button', { name: 'Save & Quit', exact: true });
  await saveQuit.waitFor({ state: 'visible', timeout: 5_000 });
  await saveQuit.click();
  await page
    .getByRole('button', { name: 'Continue', exact: true })
    .waitFor({ state: 'visible', timeout: 15_000 });
  const committed = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    const slot = await g.saves.latestSlot();
    const listed = await g.saves.list();
    const loaded = slot ? await g.saves.load(slot) : null;
    return { slot, listed, loaded };
  });
  const comparable = (save) =>
    save && {
      player: save.player,
      machine: save.machine,
      world: save.world,
      progression: save.progression,
      seed: save.seed,
      profile: save.profile,
      distanceTraveled: save.distanceTraveled,
    };
  if (
    !committed.slot ||
    !committed.loaded ||
    JSON.stringify(comparable(committed.loaded)) !== JSON.stringify(comparable(expectedSave))
  )
    throw new Error('committed save payload differs from the pre-quit checkpoint');
  await record('committed-save-readonly', {
    slot: committed.slot,
    listed: committed.listed,
    checkpoint: comparable(expectedSave),
  });
  await fs.writeFile(
    path.join(evidenceDir, 'committed-save.json'),
    JSON.stringify(committed, null, 2),
  );
  await record('pre-trace-cold-checkpoint', { snapshot: await snap() });
  await context.close();
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1280, height: 720 },
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  page = context.pages()[0] ?? (await context.newPage());
  attachErrors();
  await page.goto(bootUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 180_000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(() => !globalThis.__game.game.titleScreen?.isOpen, null, {
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => document.pointerLockElement && !globalThis.__game.game.state.paused,
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__game.game.state.paused);
  const restored = await snap();
  const restoredSave = await page.evaluate(() => globalThis.__game.game.buildSave());
  const same = (actual, expected, label) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`Cold Continue changed ${label}`);
  };
  for (const key of ['seed', 'profile', 'progression'])
    same(restoredSave[key], committed.loaded[key], key);
  for (const key of ['health', 'inventory', 'equipment'])
    same(restoredSave.player[key], committed.loaded.player[key], `player.${key}`);
  for (const key of Object.keys(committed.loaded.machine).filter((key) => key !== 'fuel'))
    same(restoredSave.machine[key], committed.loaded.machine[key], `machine.${key}`);
  for (const key of ['story', 'threatDirector', 'raidRecovery', 'routeChart'])
    same(restoredSave.world[key], committed.loaded.world[key], `world.${key}`);
  same(restoredSave.world.radioRaids.wave, committed.loaded.world.radioRaids.wave, 'raid wave');
  const elapsed = restored.simTime;
  if (elapsed > 2) throw new Error('Cold restore was not captured promptly');
  const boundedDecrease = (after, before, bound, label) => {
    if (after > before + 0.00001 || before - after > bound + 0.00001)
      throw new Error(`Cold restore exceeds live drift for ${label}: ${before} → ${after}`);
  };
  for (const key of ['hydration', 'nourishment'])
    boundedDecrease(
      restoredSave.player.needs[key],
      committed.loaded.player.needs[key],
      elapsed * 0.101,
      key,
    );
  boundedDecrease(restoredSave.machine.fuel, committed.loaded.machine.fuel, elapsed * 0.2, 'fuel');
  boundedDecrease(
    restoredSave.world.radioRaids.remaining,
    committed.loaded.world.radioRaids.remaining,
    elapsed + 1 / 60,
    'raid timer',
  );
  if (
    Math.abs(restoredSave.distanceTraveled - committed.loaded.distanceTraveled) >
    8 * elapsed + 0.2
  )
    throw new Error('Cold restore loaded a different travel checkpoint');
  await record('cold-save-comparison', {
    elapsed,
    restoredSave,
    committedDistance: committed.loaded.distanceTraveled,
  });
  await record('pre-trace-cold-restored', { restored });
  if (
    JSON.stringify(restored.resources) !== JSON.stringify(beforeTrace.resources) ||
    JSON.stringify(restored.pieces) !== JSON.stringify(beforeTrace.pieces) ||
    JSON.stringify(restored.firstRun) !== JSON.stringify(beforeTrace.firstRun) ||
    JSON.stringify(restored.story) !== JSON.stringify(beforeTrace.story)
  )
    throw new Error('pre-trace checkpoint changed across cold Continue');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForFunction(
    () => document.pointerLockElement && !globalThis.__game.game.state.paused,
  );
  await moveLookTo(radio);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(
    (at) =>
      globalThis.__game.game.player.worldPosition.distanceTo({ x: at[0], y: at[1], z: at[2] }) <=
      1.8,
    radio,
    { timeout: 25_000 },
  );
  await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyE');
  await page.locator('[data-radio-trace-button]').waitFor({ state: 'visible', timeout: 10_000 });
  await record('trace-offer-restored', { snapshot: await snap() });
  await page.screenshot({ path: path.join(evidenceDir, 'radio-trace-offer.png'), fullPage: true });
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  await fs.writeFile(
    path.join(evidenceDir, 'summary.json'),
    JSON.stringify(
      {
        status: 'passed-slice-2-offer-ready',
        source,
        profile,
        seed: sourceSave.data.seed,
        restored,
        errors,
      },
      null,
      2,
    ),
  );
  process.stdout.write(
    JSON.stringify({ status: 'passed-slice-2-offer-ready', evidence, errors }, null, 2),
  );
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  await record('blocked', { message, snapshot: await snap().catch(() => null), errors });
  await page
    .screenshot({ path: path.join(evidenceDir, 'failure.png'), fullPage: true })
    .catch(() => {});
  process.stderr.write(JSON.stringify({ status: 'blocked', evidence, message, errors }, null, 2));
  process.exitCode = 1;
} finally {
  await context.close();
}
