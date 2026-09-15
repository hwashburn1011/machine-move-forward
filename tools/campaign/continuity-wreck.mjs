/**
 * Slice 3: continue a real Slice 2 checkpoint, recover Wreck One's Course
 * Gyro, depart, and prove the save survives a cold Continue. This fixture uses
 * ordinary keyboard/mouse input and never writes gameplay state directly.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const source = process.env.MMF_CONTINUITY_PROFILE;
if (!source) throw new Error('MMF_CONTINUITY_PROFILE is required');
const resumeDocked = process.env.MMF_RESUME_DOCKED === '1';
const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5205/';
const fullArt = process.env.MMF_FULL_ART === '1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve('test-results', 'continuity-wreck', `run-${stamp}`);
const profile = path.join(output, 'browser-profile');
const eventsPath = path.join(output, 'events.jsonl');
await fs.mkdir(output, { recursive: true });
await fs.cp(path.resolve(source), profile, { recursive: true, errorOnExist: true });

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
} else {
  url.searchParams.set('quality', 'medium');
}
url.searchParams.set('nosound', '1');

let context;
let page;
const snapshot = () =>
  page.evaluate((isFullArt) => {
    const g = globalThis.__game?.game;
    if (!g) return null;
    return {
      phase: g.story.currentPhase,
      seed: g.state.seed,
      health: g.player.stats.health,
      destination: {
        active: g.destination.active,
        docked: g.destination.docked,
        colliders: g.destination.colliders.filter((collider) => collider.isEnabled()).length,
        gangwayEnabled: g.destination.gangwayEnabled,
        playerOnMachine: g.destination.playerOnMachine(g.player.worldPosition),
        root: g.destination.root.position.toArray(),
        interactables: g.destination.interactables.map((item) => ({
          id: item.id,
          kind: item.kind,
          position: [item.position.x, item.position.y, item.position.z],
        })),
      },
      distanceM: g.world.distanceTraveled,
      simTime: g.state.simTime,
      paused: g.state.paused,
      assetMode: isFullArt ? 'full-art' : 'procedural',
      authored: {
        machine: Boolean(g.machine.group.getObjectByName('authored-machine-details')),
        playerS07: Boolean(g.player.visual?.isS07),
        destination: Boolean(g.destination.root.userData.authored),
      },
      player: g.player.worldPosition.toArray(),
      radio: g.radioWorldPosition.toArray(),
      inventory: g.inventory.serialise(),
      resources: {
        scrap: g.resources.count('scrap'),
        components: g.resources.count('components'),
        fuel: g.resources.count('fuel'),
      },
      story: g.story.toSave(),
      structures: g.build.serialise(),
      damage: g.machine.damage.toSave(),
      events: globalThis.__continuityWreckEvents ?? [],
    };
  }, fullArt);

const moveLook = async (target) => {
  for (let i = 0; i < 20; i += 1) {
    const error = await page.evaluate((at) => {
      const g = globalThis.__game.game;
      const p = g.player.worldPosition;
      const desired = Math.atan2(-(at[0] - p.x), -(at[2] - p.z));
      const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
      return wrap(desired - g.playerCamera.yawAngle);
    }, target);
    if (Math.abs(error) < 0.012) return;
    await page.evaluate(
      (movementX) => {
        window.dispatchEvent(new MouseEvent('mousemove', { movementX, movementY: 0 }));
      },
      Math.max(-600, Math.min(600, -error / 0.0022)),
    );
    await page.waitForTimeout(50);
  }
};

const settleActive = async (label) => {
  await page.waitForFunction(
    () => {
      const g = globalThis.__game.game;
      return Boolean(g.input.pointerLocked && !g.state.paused && !g.titleScreen?.isOpen);
    },
    null,
    { timeout: 15_000 },
  );
  await record('active-settled', { label });
};

const walkTo = async (target, label, radius = 0.35) => {
  const started = Date.now();
  try {
    while (Date.now() - started < 20_000) {
      const state = await page.evaluate((at) => {
        const p = globalThis.__game.game.player.worldPosition;
        return { distance: Math.hypot(p.x - at[0], p.z - at[2]), position: p.toArray() };
      }, target);
      if (state.distance < radius) {
        await record('waypoint-reached', { label, target, position: state.position });
        return state;
      }
      await moveLook(target);
      // Release movement while turning. Holding W through a 180-degree
      // correction circles a small waypoint and can overshoot a doorway.
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(Math.min(90, Math.max(25, ((state.distance - radius) / 4) * 1000)));
      await page.keyboard.up('KeyW');
      await page.waitForTimeout(60);
    }
  } finally {
    await page.keyboard.up('KeyW');
  }
  const failure = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const player = g.player.worldPosition;
    const contacts = [];
    g.physics.world.forEachCollider((collider) => {
      if (collider === g.player.collider || !collider.isValid() || collider.isSensor()) return;
      const contact = g.player.collider.contactCollider(collider, 0.3);
      if (!contact || contact.distance > 0.3) return;
      const position = collider.translation();
      const data = g.physics.getUserData(collider);
      contacts.push({
        handle: collider.handle,
        separation: contact.distance,
        position: [position.x, position.y, position.z],
        userData: data && typeof data === 'object' ? data : null,
      });
    });
    return { position: player.toArray(), contacts };
  });
  throw new Error(`waypoint ${label} stuck: ${JSON.stringify(failure)}`);
};

const openRadio = async () => {
  const button = page.locator('[data-radio-trace-button]');
  if (!(await button.isVisible().catch(() => false))) {
    const radio = await page.evaluate(() => globalThis.__game.game.radioWorldPosition.toArray());
    await walkTo([radio[0], radio[1], radio[2]], 'radio-offer', 1.5);
    await page.keyboard.press('KeyE');
  }
  await button.waitFor({ state: 'visible', timeout: 15_000 });
  await record('wreck-offer', { snapshot: await snapshot() });
  await button.click();
  await page.waitForFunction(
    () => ['approach', 'braking', 'docked'].includes(globalThis.__game.game.story.currentPhase),
    null,
    { timeout: 15_000 },
  );
  await settleActive('trace');
};

try {
  await record('provenance', { source: path.resolve(source), profile, url: url.toString() });
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1280, height: 720 },
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 180_000 });
  const sourceSave = await page.evaluate(async () => {
    const saves = globalThis.__game.game.saves;
    const slot = await saves.latestSlot();
    return slot ? { slot, data: await saves.load(slot) } : null;
  });
  if (!sourceSave?.data) throw new Error('No readable parent checkpoint');
  await record('source-save-readonly', sourceSave);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(() => !globalThis.__game.game.titleScreen?.isOpen, null, {
    timeout: 30_000,
  });
  await page.waitForFunction(() => !globalThis.__game.game.state.paused, null, { timeout: 15_000 });
  await settleActive('continue');
  await page.evaluate(() => {
    globalThis.__continuityWreckEvents = [];
    const g = globalThis.__game.game;
    for (const type of ['story:phase', 'story:docked', 'story:unique-collected'])
      g.bus.on(type, (event) => globalThis.__continuityWreckEvents.push({ type, event }));
  });
  await record('continued', { snapshot: await snapshot() });
  if ((await snapshot()).seed !== sourceSave.data.seed)
    throw new Error('Continue changed the campaign seed');
  if (resumeDocked) {
    const parentPath = path.resolve(source, '..', 'events.jsonl');
    const parent = (await fs.readFile(parentPath, 'utf8'))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    const proof = parent.find((item) => item.type === 'course-gyro-collected');
    if (
      !proof ||
      proof.seed !== sourceSave.data.seed ||
      (await snapshot()).phase !== 'docked' ||
      !sourceSave.data.world.story.recoveredUniques.includes('course-gyro')
    )
      throw new Error('Docked resume lacks its observed gyro recovery and actual saved checkpoint');
    await record('parent-docked-evidence', { parentPath, proof });
  } else await openRadio();

  const deadline = Date.now() + 5 * 60_000;
  let lastPhase = '';
  while (Date.now() < deadline) {
    const state = await snapshot();
    if (state.phase !== lastPhase) {
      lastPhase = state.phase;
      await record('phase', state);
      await page.screenshot({ path: path.join(output, `phase-${state.phase}.png`) });
    }
    if (state.destination.docked) break;
    if (state.paused) throw new Error('unexpected pause during real destination approach');
    if (state.health <= 0) throw new Error('Player died during approach');
    await page.waitForTimeout(1_000);
  }
  const docked = await snapshot();
  if (!docked.destination.docked)
    throw new Error(`destination did not dock: ${JSON.stringify(docked)}`);
  if (fullArt && !Object.values(docked.authored).every(Boolean))
    throw new Error(`Full-art assets missing: ${JSON.stringify(docked.authored)}`);
  await record('docked', docked);

  const routeOrigin = await page.evaluate(() => {
    const p = globalThis.__game.game.destination.root.position;
    return [p.x, p.y, p.z];
  });
  const gateWaypoints = [
    [5.8, routeOrigin[1], routeOrigin[2]],
    [7.5, routeOrigin[1], routeOrigin[2]],
    [routeOrigin[0] - 5.2, routeOrigin[1], routeOrigin[2]],
    [routeOrigin[0] + 1.5, routeOrigin[1], routeOrigin[2]],
    [routeOrigin[0] + 2.7, routeOrigin[1], routeOrigin[2]],
    [routeOrigin[0] + 3.4, routeOrigin[1], routeOrigin[2]],
    [routeOrigin[0] + 3.4, routeOrigin[1], routeOrigin[2] + 3],
  ];
  const waypoints = fullArt
    ? [
        [0.7, routeOrigin[1], routeOrigin[2] - 1.5],
        [4.2, routeOrigin[1], routeOrigin[2] - 1.5],
        [4.2, routeOrigin[1], routeOrigin[2]],
        ...gateWaypoints,
      ]
    : gateWaypoints;
  if (!resumeDocked) {
    for (let i = 0; i < waypoints.length; i += 1) await walkTo(waypoints[i], `wreck-gate-${i + 1}`);
    const gyro = await page.evaluate(() => {
      const item = globalThis.__game.game.destination.interactables.find(
        (candidate) => candidate.id === 'wreck-one-course-gyro',
      );
      return item ? [item.position.x, item.position.y, item.position.z] : null;
    });
    if (!gyro) throw new Error('Course Gyro interactable was not present after docking');
    await walkTo(gyro, 'course-gyro', 1.5);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(
      () =>
        !globalThis.__game.game.destination.interactables.some(
          (item) => item.id === 'wreck-one-course-gyro',
        ),
      null,
      { timeout: 10_000 },
    );
    const collected = await snapshot();
    const gyroCount =
      collected.story.recoveredUniques?.filter((id) => id === 'course-gyro').length ?? 0;
    if (gyroCount !== 1) throw new Error(`Course Gyro unique count was ${gyroCount}`);
    await record('course-gyro-collected', collected);
  }

  for (let i = waypoints.length - 1; i >= 0; i -= 1) await walkTo(waypoints[i], `return-${i + 1}`);
  const radio = await page.evaluate(() => globalThis.__game.game.radioWorldPosition.toArray());
  await walkTo(radio, 'radio-depart', 1.5);
  await page.keyboard.press('KeyE');
  await page.locator('[data-radio-depart]').waitFor({ state: 'visible', timeout: 10_000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !globalThis.__game.game.panelsOpen, null, {
    timeout: 5_000,
  });
  await settleActive('depart-panel-close');
  await page.keyboard.press('KeyE');
  await page.locator('[data-radio-depart]').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('[data-radio-depart]').click();
  await page.waitForFunction(
    () =>
      !globalThis.__game.game.destination.active &&
      !globalThis.__game.game.destination.docked &&
      globalThis.__game.game.story.currentPhase === 'route-selection',
    null,
    { timeout: 15_000 },
  );
  // Wreck completion intentionally opens the next expedition's route chooser.
  // Read and close that normal UI before expecting mouse control to return.
  if (await page.evaluate(() => globalThis.__game.game.expeditionUI.isOpen)) {
    await record('next-route-offered', {
      snapshot: await snapshot(),
      text: await page
        .locator('[data-panel="expedition"]')
        .innerText()
        .catch(() => ''),
    });
    await page.screenshot({ path: path.join(output, 'next-route-offered.png') });
    await page.keyboard.press('Escape');
  }
  await settleActive('depart');
  const departed = await snapshot();
  if (
    departed.phase !== 'route-selection' ||
    !departed.story.completed?.includes('wreck-one') ||
    departed.destination.colliders !== 0 ||
    departed.destination.gangwayEnabled ||
    !departed.destination.playerOnMachine
  )
    throw new Error(`departure did not fully reset destination: ${JSON.stringify(departed)}`);
  await record('departed', departed);

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__game.game.state.paused, null, { timeout: 5_000 });
  const checkpoint = await page.evaluate(() => globalThis.__game.game.buildSave());
  await page.getByRole('button', { name: 'Save & Quit', exact: true }).click();
  await page
    .getByRole('button', { name: 'Continue', exact: true })
    .waitFor({ state: 'visible', timeout: 15_000 });
  const committed = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    const slot = await g.saves.latestSlot();
    return { slot, save: slot ? await g.saves.load(slot) : null };
  });
  const comparable = (save) => save && { ...save, savedAt: 0 };
  if (
    !committed.slot ||
    !committed.save ||
    JSON.stringify(comparable(committed.save)) !== JSON.stringify(comparable(checkpoint))
  )
    throw new Error('committed save differs from paused checkpoint');
  await record('save-committed', { slot: committed.slot });
  await fs.writeFile(path.join(output, 'committed-save.json'), JSON.stringify(committed, null, 2));
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
  await settleActive('cold-continue');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__game.game.state.paused);
  const restored = await snapshot();
  if (fullArt && !Object.values(restored.authored).every(Boolean))
    throw new Error(`Full-art assets missing after Continue: ${JSON.stringify(restored.authored)}`);
  for (const [key, value] of Object.entries({
    story: departed.story,
    structures: departed.structures,
    damage: departed.damage,
    inventory: departed.inventory,
    resources: departed.resources,
    seed: departed.seed,
    health: departed.health,
  })) {
    if (JSON.stringify(restored[key]) !== JSON.stringify(value))
      throw new Error(`${key} changed across cold Continue`);
  }
  if (
    restored.story.recoveredUniques?.filter((id) => id === 'course-gyro').length !== 1 ||
    !restored.destination.playerOnMachine ||
    restored.health <= 0 ||
    restored.destination.active ||
    restored.destination.docked ||
    restored.destination.colliders !== 0 ||
    restored.destination.gangwayEnabled
  )
    throw new Error('Course Gyro or aboard state was not retained across cold Continue');
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
  await record('blocked', { message, snapshot: page ? await snapshot().catch(() => null) : null });
  await fs.writeFile(
    path.join(output, 'summary.json'),
    JSON.stringify({ status: 'blocked', message, events, errors }, null, 2),
  );
  process.stderr.write(JSON.stringify({ status: 'blocked', output, message, errors }, null, 2));
  process.exitCode = 1;
} finally {
  await context?.close();
}
