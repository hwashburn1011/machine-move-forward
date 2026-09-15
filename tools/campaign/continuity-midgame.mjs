/**
 * MID-02: continue the genuine Wreck-departure checkpoint and complete the
 * Relay Foundry detour with normal input.  This runner deliberately uses no
 * fixture writes, distance skips, seed overrides, or spawn/input bypasses.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const source = process.env.MMF_CONTINUITY_PROFILE;
if (!source) throw new Error('MMF_CONTINUITY_PROFILE is required');
const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5205/';
const fullArt = process.env.MMF_FULL_ART === '1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve('test-results', 'continuity-midgame', `run-${stamp}`);
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
} else url.searchParams.set('quality', 'medium');
url.searchParams.set('nosound', '1');

let context;
let page;
const snapshot = () =>
  page.evaluate(() => {
    const g = globalThis.__game?.game;
    if (!g) return null;
    const damage = g.machine.damage.toSave();
    return {
      phase: g.story.currentPhase,
      seed: g.state.seed,
      distanceM: g.world.distanceTraveled,
      simTime: g.state.simTime,
      paused: g.state.paused,
      health: g.player.stats.health,
      needs: g.player.needs?.toSave?.() ?? null,
      player: g.player.worldPosition.toArray(),
      inventory: g.inventory.serialise(),
      resources: {
        scrap: g.resources.count('scrap'),
        components: g.resources.count('components'),
        fuel: g.resources.count('fuel'),
      },
      story: g.story.toSave(),
      structures: g.build.serialise(),
      damage,
      destination: {
        active: g.destination.active,
        docked: g.destination.docked,
        root: g.destination.root.position.toArray(),
        colliders: g.destination.colliders.filter((c) => c.isEnabled()).length,
        gangwayEnabled: g.destination.gangwayEnabled,
        playerOnMachine: g.destination.playerOnMachine(g.player.worldPosition),
        interactables: g.destination.interactables.map((item) => ({
          id: item.id,
          kind: item.kind,
          position: item.position.toArray(),
        })),
      },
      expedition: {
        open: Boolean(g.expeditionUI?.isOpen),
        text: document.querySelector('[data-panel="expedition"]')?.textContent ?? '',
      },
      assets: {
        authored: Boolean(g.destination.root.userData.authored),
        fullArt: Boolean(g.machine.group.getObjectByName('authored-machine-details')),
        playerS07: Boolean(g.player.visual?.isS07),
      },
      events: globalThis.__continuityMidgameEvents ?? [],
      threats: {
        active: (g.enemies.active ?? []).map((enemy) => ({
          id: enemy.id,
          position: enemy.worldPosition?.toArray?.() ?? null,
          health: enemy.health ?? enemy.stats?.health ?? null,
        })),
        vehicle: g.vehicleScene?.active
          ? { active: true, position: g.vehicleScene.group?.position?.toArray?.() ?? null }
          : { active: false },
        tankFuel: g.machine.power?.fuel ?? null,
      },
    };
  });

const moveLook = async (target) => {
  for (let i = 0; i < 24; i += 1) {
    const error = await page.evaluate((at) => {
      const g = globalThis.__game.game;
      const c = g.playerCamera.camera;
      const dx = at[0] - c.position.x;
      const dy = at[1] - c.position.y;
      const dz = at[2] - c.position.z;
      const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
      return {
        x: wrap(Math.atan2(-dx, -dz) - g.playerCamera.yawAngle),
        y: Math.atan2(dy, Math.hypot(dx, dz)) - g.playerCamera.pitchAngle,
      };
    }, target);
    if (Math.abs(error.x) < 0.012 && Math.abs(error.y) < 0.012) return;
    await page.keyboard.up('KeyW').catch(() => {});
    await page.evaluate(
      (movementX) => {
        window.dispatchEvent(
          new MouseEvent('mousemove', { movementX, movementY: 0, bubbles: true }),
        );
      },
      Math.max(-600, Math.min(600, -error.x / 0.0022)),
    );
    await page.evaluate(
      (movementY) => {
        window.dispatchEvent(
          new MouseEvent('mousemove', { movementX: 0, movementY, bubbles: true }),
        );
      },
      Math.max(-350, Math.min(350, -error.y / 0.0022)),
    );
    await page.waitForTimeout(45);
  }
};

const settleActive = async (label) => {
  await page.waitForFunction(
    () => {
      const g = globalThis.__game.game;
      return Boolean(g.input.pointerLocked && !g.state.paused && !g.titleScreen?.isOpen);
    },
    null,
    { timeout: 20_000 },
  );
  await record('active-settled', { label });
};

const walkTo = async (target, label, radius = 1.1, timeoutMs = 35_000) => {
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
      await moveLook(target);
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(
        Math.min(150, Math.max(50, ((state.distance - radius) / 4) * 1000)),
      );
      await page.keyboard.up('KeyW');
      await page.waitForTimeout(65);
    }
  } finally {
    await page.keyboard.up('KeyW').catch(() => {});
  }
  throw new Error(
    `waypoint ${label} timed out at ${JSON.stringify(await page.evaluate(() => globalThis.__game.game.player.worldPosition.toArray()))}`,
  );
};

const clickRoute = async () => {
  if (
    !(await page
      .locator('[data-route="foundry-detour"]')
      .isVisible()
      .catch(() => false))
  ) {
    const helm = await page.evaluate(() => {
      const object = globalThis.__game.game.helmInteract;
      if (!object) return null;
      const point = new object.position.constructor();
      object.getWorldPosition(point);
      return point.toArray();
    });
    if (!helm) throw new Error('Navigation Helm interaction was not available for route selection');
    await walkTo(helm, 'navigation-helm', 1.0);
    await page.keyboard.press('KeyE');
  }
  await page
    .locator('[data-route="foundry-detour"]')
    .waitFor({ state: 'visible', timeout: 15_000 });
  await record('route-menu', {
    text: await page
      .locator('[data-panel="expedition"]')
      .innerText()
      .catch(() => ''),
  });
  await page.locator('[data-route="foundry-detour"]').click();
  await page.locator('[data-route-confirm="foundry-detour"]').click();
  await page.waitForFunction(
    () => ['approach', 'braking', 'docked'].includes(globalThis.__game.game.story.currentPhase),
    null,
    { timeout: 20_000 },
  );
  await record('foundry-detour-accepted', { snapshot: await snapshot() });
};

const collect = async (id) => {
  const item = await page.evaluate((wanted) => {
    const found = globalThis.__game.game.destination.interactables.find((x) => x.id === wanted);
    return found ? found.position.toArray() : null;
  }, id);
  if (!item) throw new Error(`missing Foundry interactable ${id}`);
  await walkTo(item, id, 1.45);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(
    (wanted) => {
      const g = globalThis.__game.game;
      return !g.destination.interactables.some((x) => x.id === wanted);
    },
    id,
    { timeout: 12_000 },
  );
  const state = await snapshot();
  if (
    (state.story.recoveredUniques ?? []).filter((x) => x === id.replace('relay-foundry-', ''))
      .length !== 1
  )
    throw new Error(`${id} did not produce exactly one recovered unique`);
  await record('foundry-unique-collected', { id, snapshot: state });
};

try {
  await record('provenance', {
    source: path.resolve(source),
    profile,
    sourcePathLength: path.resolve(source).length,
    profilePathLength: profile.length,
    url: url.toString(),
    fullArt,
  });
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1280, height: 720 },
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 180_000 });
  const sourceSave = await page.evaluate(async () => {
    const saves = globalThis.__game.game.saves;
    const slot = await saves.latestSlot();
    return slot ? { slot, data: await saves.load(slot) } : null;
  });
  if (!sourceSave?.data) throw new Error('No readable Wreck-departure checkpoint');
  await record('source-save-readonly', sourceSave);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(() => !globalThis.__game.game.titleScreen?.isOpen, null, {
    timeout: 30_000,
  });
  await settleActive('continue');
  const continued = await snapshot();
  if (
    continued.seed !== sourceSave.data.seed ||
    !continued.story.completed?.includes('wreck-one') ||
    continued.phase !== 'route-selection'
  )
    throw new Error(`source is not a completed Wreck departure: ${JSON.stringify(continued)}`);
  if (
    fullArt &&
    (!continued.assets.fullArt || !continued.assets.playerS07 || !continued.assets.authored)
  )
    throw new Error(
      `full-art assets were not ready at continuation: ${JSON.stringify(continued.assets)}`,
    );
  await page.evaluate(() => {
    globalThis.__continuityMidgameEvents = [];
    const g = globalThis.__game.game;
    for (const type of [
      'story:phase',
      'story:docked',
      'story:unique-collected',
      'story:expedition-complete',
      'player:damaged',
      'player:died',
      'machine:damaged',
      'threat:phase',
      'enemy:spawned',
      'enemy:damaged',
      'boarding:started',
      'boarding:crossed',
      'boarding:survived',
      'boarding:ended',
      'loot:collected',
      'weapon:fired',
      'threat:spawned',
    ])
      g.bus.on(type, (event) =>
        globalThis.__continuityMidgameEvents.push({ type, event, simTime: g.state.simTime }),
      );
  });
  await record('continued-wreck-departure', { snapshot: continued });
  await clickRoute();

  const travelDeadline = Date.now() + 12 * 60_000;
  let lastPhase = '';
  while (Date.now() < travelDeadline) {
    const state = await snapshot();
    if (state.phase !== lastPhase) {
      lastPhase = state.phase;
      await record('phase', state);
      await page.screenshot({ path: path.join(output, `phase-${state.phase}.png`) });
    }
    if (state.destination.docked) break;
    if (state.health <= 0) throw new Error('player died during Foundry travel');
    if (state.paused) throw new Error('unexpected pause during Foundry travel');
    const threat = state.threats.active[0];
    if (threat?.position) {
      const beforeHealth = threat.health;
      await page.mouse.down({ button: 'right' });
      await moveLook(threat.position);
      const ammo = await page.evaluate(() => {
        const weapon = globalThis.__game.game.combat.current;
        return weapon ? { mag: weapon.ammoInMag, reserve: weapon.reserveAmmo } : null;
      });
      if (ammo && ammo.mag <= 0 && ammo.reserve > 0) {
        await page.keyboard.press('KeyR');
        await page.waitForTimeout(1_200);
      }
      await page.mouse.down({ button: 'left' });
      await page.waitForTimeout(250);
      await page.mouse.up({ button: 'left' });
      await page.mouse.up({ button: 'right' });
      const afterThreat = await snapshot();
      await record('ordinary-threat-engagement', {
        id: threat.id,
        beforeHealth,
        after: afterThreat.threats.active.find((candidate) => candidate.id === threat.id) ?? null,
        snapshot: afterThreat,
      });
    }
    await page.waitForTimeout(1_000);
  }
  const docked = await snapshot();
  if (!docked.destination.docked)
    throw new Error(`Foundry did not dock within 12 minutes: ${JSON.stringify(docked)}`);
  await record('foundry-docked', docked);
  const root = docked.destination.root;
  const entry = [root[0] - 6.2, root[1], root[2]];
  // Keep the authored outbound aisle clear of the refinery pair and the
  // player-built turret at the starboard rail. These are ordinary movement
  // waypoints, so collision and navigation remain authoritative.
  const aisle = [
    [0.7, root[1], root[2] - 1.5],
    [4.2, root[1], root[2] - 1.5],
    [4.2, root[1], root[2]],
    [5.8, root[1], root[2]],
  ];
  if (fullArt) {
    for (let i = 0; i < aisle.length; i += 1) await walkTo(aisle[i], `foundry-aisle-${i + 1}`, 1.1);
  }
  await walkTo(entry, 'foundry-entry', 1.3);
  await collect('relay-foundry-salvage-controller');
  await collect('relay-foundry-tracking-servo');
  const afterItems = await snapshot();
  if (
    !afterItems.story.recoveredUniques?.includes('salvage-controller') ||
    !afterItems.story.recoveredUniques?.includes('tracking-servo')
  )
    throw new Error('Foundry unique recovery incomplete');
  await record('foundry-objectives-complete', { snapshot: afterItems });
  await walkTo([root[0] - 7.5, root[1], root[2]], 'foundry-gangway', 1.2);
  if (fullArt) {
    for (let i = aisle.length - 1; i >= 0; i -= 1)
      await walkTo(aisle[i], `foundry-return-aisle-${aisle.length - i}`, 1.1);
  }
  await walkTo([root[0] - 8.5, root[1], root[2]], 'foundry-machine-side', 1.5);
  await page.waitForFunction(
    () =>
      globalThis.__game.game.destination.playerOnMachine(
        globalThis.__game.game.player.worldPosition,
      ),
    null,
    { timeout: 15_000 },
  );
  const radio = await page.evaluate(() => globalThis.__game.game.radioWorldPosition.toArray());
  await walkTo(radio, 'foundry-return-radio', 1.5);
  await page.keyboard.press('KeyE');
  await page.locator('[data-radio-depart]').waitFor({ state: 'visible', timeout: 12_000 });
  await page.locator('[data-radio-depart]').click();
  await page.waitForFunction(
    () =>
      !globalThis.__game.game.destination.active &&
      globalThis.__game.game.story.currentPhase === 'complete',
    null,
    { timeout: 15_000 },
  );
  if (await page.evaluate(() => globalThis.__game.game.expeditionUI?.isOpen))
    await page.keyboard.press('Escape');
  await settleActive('foundry-depart');
  const departed = await snapshot();
  if (
    departed.phase !== 'complete' ||
    !departed.story.completed?.includes('relay-foundry') ||
    departed.destination.colliders !== 0 ||
    !departed.destination.playerOnMachine
  )
    throw new Error(`Foundry departure did not complete: ${JSON.stringify(departed)}`);
  await record('foundry-completion-checkpoint', { snapshot: departed });

  // Pause first, then compare the exact committed payload and a cold Continue.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__game.game.state.paused, null, { timeout: 8_000 });
  const checkpoint = await page.evaluate(() => globalThis.__game.game.buildSave());
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
    !committed.slot ||
    !committed.save ||
    JSON.stringify({ ...committed.save, savedAt: 0 }) !==
      JSON.stringify({ ...checkpoint, savedAt: 0 })
  )
    throw new Error('committed Foundry save differs from paused checkpoint');
  await fs.writeFile(path.join(output, 'committed-save.json'), JSON.stringify(committed, null, 2));
  await record('foundry-save-committed', { slot: committed.slot });
  await context.close();
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1280, height: 720 },
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 180_000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(() => !globalThis.__game.game.titleScreen?.isOpen, null, {
    timeout: 30_000,
  });
  await settleActive('cold-continue');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__game.game.state.paused, null, {
    timeout: 15_000,
  });
  const restored = await snapshot();
  for (const key of ['seed', 'health', 'inventory', 'resources', 'story', 'structures', 'damage'])
    if (JSON.stringify(restored[key]) !== JSON.stringify(departed[key]))
      throw new Error(`${key} changed across Foundry cold Continue`);
  if (
    restored.phase !== 'complete' ||
    restored.destination.active ||
    restored.destination.docked ||
    restored.destination.colliders !== 0 ||
    !restored.destination.playerOnMachine
  )
    throw new Error('Foundry completion did not survive cold Continue');
  await record('foundry-cold-continue', { restored, checkpoint });
  await page.screenshot({ path: path.join(output, 'foundry-cold-continue.png'), fullPage: true });
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
