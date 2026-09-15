/**
 * MID-03: continue the genuine Relay Foundry checkpoint and complete Quiet Array
 * with normal input. This runner deliberately uses no fixture writes, distance
 * skips, seed overrides, or spawn/input bypasses.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const source = process.env.MMF_CONTINUITY_PROFILE;
if (!source) throw new Error('MMF_CONTINUITY_PROFILE is required');
const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5205/';
const fullArt = process.env.MMF_FULL_ART === '1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve('test-results', 'continuity-quiet-array', `run-${stamp}`);
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
      legacyStory: g.story.legacyProjection(),
      course: g.course.toSave(),
      power: {
        fuel: g.machine.power.fuel,
        capacity: g.machine.power.capacity,
        draw: g.machine.power.draw,
        registeredDemand: g.machine.power.registeredDemand,
        helmPowered: g.machine.power.isPowered('navigation-helm'),
      },
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
      events: globalThis.__continuityQuietArrayEvents ?? [],
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
      // Walking follows the capsule's bearing to the waypoint. Weapon aiming
      // uses the offset camera above; reusing it here makes tight waypoints
      // orbit the shoulder offset instead of converging on the aisle center.
      for (let correction = 0; correction < 12; correction += 1) {
        const yawError = await page.evaluate((at) => {
          const g = globalThis.__game.game;
          const p = g.player.worldPosition;
          const delta = Math.atan2(-(at[0] - p.x), -(at[2] - p.z)) - g.playerCamera.yawAngle;
          return Math.atan2(Math.sin(delta), Math.cos(delta));
        }, target);
        if (Math.abs(yawError) < 0.012) break;
        await page.evaluate(
          (movementX) =>
            window.dispatchEvent(
              new MouseEvent('mousemove', { movementX, movementY: 0, bubbles: true }),
            ),
          Math.max(-600, Math.min(600, -yawError / 0.0022)),
        );
        await page.waitForTimeout(40);
      }
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

const chooseQuietSignal = async () => {
  const radio = await page.evaluate(() => globalThis.__game.game.radioWorldPosition.toArray());
  await walkTo(radio, 'quiet-array-radio', 1.5);
  await page.keyboard.press('KeyE');
  await page.locator('[data-radio-trace-button]').waitFor({ state: 'visible', timeout: 15_000 });
  const radioText = await page
    .locator('[data-panel="radio"]')
    .innerText()
    .catch(() => '');
  if (!/quiet array/i.test(radioText)) throw new Error(`Quiet Array offer missing: ${radioText}`);
  await record('quiet-array-radio-offer', { text: radioText });
  await page.locator('[data-radio-trace-button]').click();
  await page.waitForFunction(
    () => ['approach', 'braking', 'docked'].includes(globalThis.__game.game.story.currentPhase),
    null,
    { timeout: 20_000 },
  );
  if (
    await page
      .locator('[data-panel="radio"]')
      .isVisible()
      .catch(() => false)
  ) {
    await page.keyboard.press('Escape');
    await settleActive('quiet-array-signal-close');
  }
  await record('quiet-array-signal-accepted', { snapshot: await snapshot() });
};

const collect = async (id, kind, radius = 1.45) => {
  const initial = await snapshot();
  if (kind === 'journal' && initial.legacyStory.journalsRead?.includes(id)) return;
  if (kind === 'unique' && initial.story.recoveredUniques?.includes(id.replace('quiet-array-', '')))
    return;
  const item = await page.evaluate((wanted) => {
    const found = globalThis.__game.game.destination.interactables.find((x) => x.id === wanted);
    return found ? found.position.toArray() : null;
  }, id);
  if (!item) throw new Error(`missing Quiet Array interactable ${id}`);
  await walkTo(item, id, radius);
  await page.keyboard.press('KeyE');
  if (kind === 'journal') {
    await page.waitForFunction(
      (wanted) => globalThis.__game.game.story.legacyProjection().journalsRead.includes(wanted),
      id,
      { timeout: 12_000 },
    );
    await page.keyboard.press('Escape');
    await settleActive(`${id}-close`);
  } else {
    await page.waitForFunction(
      (wanted) => !globalThis.__game.game.destination.interactables.some((x) => x.id === wanted),
      id,
      { timeout: 12_000 },
    );
  }
  const state = await snapshot();
  if (kind === 'unique') {
    const fact = id.replace('quiet-array-', '');
    if ((state.story.recoveredUniques ?? []).filter((x) => x === fact).length !== 1)
      throw new Error(`${id} did not produce exactly one recovered unique`);
  } else if (!(state.legacyStory.journalsRead ?? []).includes(id)) {
    throw new Error(`${id} was not recorded as read`);
  }
  await record(`quiet-array-${kind}-collected`, { id, snapshot: state });
};

const rebuildGenerator = async () => {
  if (await page.evaluate(() => globalThis.__game.game.machine.power.generatorCount > 0)) return;
  await walkTo([0.7, 14.83, -1.5], 'generator-clear-aisle', 1.0);
  await walkTo([0, 14.83, 1.5], 'generator-service-side', 1.0);
  const before = await snapshot();
  await page.keyboard.press('KeyB');
  await page.locator('[data-category="station"]').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('[data-category="station"]').click();
  await page.locator('[data-piece="generator"]').click();
  await page.waitForFunction(
    () => globalThis.__game.game.selectedPiece === 'generator' && document.pointerLockElement,
    null,
    { timeout: 5_000 },
  );
  const candidates = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const p = g.player.worldPosition;
    const candidates = [];
    for (let x = -5; x <= 5; x += 1)
      for (let z = -5; z <= 5; z += 1) {
        const placement = { piece: 'generator', cell: { x, y: 0, z }, rotation: 0 };
        if (!g.build.canPlace(placement).ok) continue;
        const local = p.clone().set(x * 2, 14.83, z * 2);
        const world = g.build.group.localToWorld(local);
        const distance = Math.hypot(world.x - p.x, world.z - p.z);
        if (distance >= 2 && distance <= 7)
          candidates.push({ placement, world: world.toArray(), distance });
      }
    return candidates.sort((a, b) => a.distance - b.distance);
  });
  let candidate = null;
  for (const proposed of candidates) {
    await moveLook(proposed.world);
    await page.waitForTimeout(150);
    const preview = await page.evaluate(() => ({
      placement: globalThis.__game.game.buildPreview.placement,
      validation: globalThis.__game.game.buildPreview.validation,
      target: globalThis.__game.game.buildPreview.target,
    }));
    if (
      preview.placement?.piece === 'generator' &&
      preview.validation?.ok &&
      !preview.target?.rejection
    ) {
      candidate = { ...proposed, actualPreview: preview.placement };
      break;
    }
  }
  if (!candidate) throw new Error('No affordable valid generator placement candidate');
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(120);
  await page.mouse.up({ button: 'left' });
  await page.waitForFunction(
    () =>
      globalThis.__game.game.build.serialise().some((piece) => piece.definitionId === 'generator'),
    null,
    { timeout: 8_000 },
  );
  await page.keyboard.press('Escape');
  await settleActive('generator-rebuild');
  const after = await snapshot();
  if (
    before.resources.scrap - after.resources.scrap !== 60 ||
    before.resources.components - after.resources.components !== 6 ||
    after.power.capacity <= 0
  )
    throw new Error('Generator rebuild did not spend its actual recipe or restore power');
  await record('generator-rebuilt', { candidate, before, snapshot: after });
  await walkTo([0.7, 14.83, -1.5], 'generator-return-aisle', 1.0);
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
  if (!sourceSave?.data) throw new Error('No readable Relay Foundry-departure checkpoint');
  await record('source-save-readonly', sourceSave);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(() => !globalThis.__game.game.titleScreen?.isOpen, null, {
    timeout: 30_000,
  });
  await settleActive('continue');
  const continued = await snapshot();
  if (
    continued.seed !== sourceSave.data.seed ||
    !continued.story.completed?.includes('relay-foundry')
  )
    throw new Error(`source is not a completed Foundry departure: ${JSON.stringify(continued)}`);
  if (
    fullArt &&
    (!continued.assets.fullArt || !continued.assets.playerS07 || !continued.assets.authored)
  )
    throw new Error(
      `full-art assets were not ready at continuation: ${JSON.stringify(continued.assets)}`,
    );
  await page.evaluate(() => {
    globalThis.__continuityQuietArrayEvents = [];
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
      'build:damaged',
      'build:removed',
      'build:placed',
    ])
      g.bus.on(type, (event) =>
        globalThis.__continuityQuietArrayEvents.push({ type, event, simTime: g.state.simTime }),
      );
  });
  await record('continued-foundry-departure', { snapshot: continued });
  if (!continued.story.completed?.includes('quiet-array')) {
    if (continued.story.active?.expeditionId !== 'quiet-array') {
      await rebuildGenerator();
      await chooseQuietSignal();
    }

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
      if (state.health <= 0) throw new Error('player died during Quiet Array travel');
      if (state.paused) throw new Error('unexpected pause during Quiet Array travel');
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
          await page.waitForFunction(
            () =>
              !globalThis.__game.game.combat.current.reloading &&
              globalThis.__game.game.combat.current.ammoInMag > 0,
            null,
            { timeout: 5_000 },
          );
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
      throw new Error(`Quiet Array did not dock within 12 minutes: ${JSON.stringify(docked)}`);
    await record('quiet-array-docked', docked);
    const root = docked.destination.root;
    const local = (point) => [root[0] + point[0], root[1] + point[1], root[2] + point[2]];
    const entry = local([-9.5, 0, 0]);
    const aisle = [
      [0.7, root[1], root[2] - 1.5],
      [4.2, root[1], root[2] - 1.5],
      [4.2, root[1], root[2]],
      [5.8, root[1], root[2]],
    ];
    if (fullArt && docked.destination.playerOnMachine) {
      for (let i = 0; i < aisle.length; i += 1)
        await walkTo(aisle[i], `quiet-array-aisle-${i + 1}`, 1.1);
    }
    await walkTo(entry, 'quiet-array-entry', 1.3);
    const walkLocal = async (point, label, radius = 1.1) =>
      walkTo(local([point[0], 0, point[1]]), label, radius);
    // Keep the authored memory vault out of the direct diagonal between the
    // relay journals and the actuator. These are physical aisle waypoints.
    await walkLocal([0, 0], 'quiet-array-center-spine');
    await collect('quiet-array-journal-port', 'journal');
    await walkLocal([0, 0], 'quiet-array-return-center');
    await collect('quiet-array-journal-starboard', 'journal');
    await walkLocal([0, 0], 'quiet-array-actuator-spine');
    await walkLocal([-1.4, 0], 'quiet-array-console-bypass', 0.3);
    await walkLocal([-1.4, 6], 'quiet-array-north-spine', 0.4);
    await collect('quiet-array-course-actuator', 'unique');
    await walkLocal([-1.4, 6], 'quiet-array-vault-return-spine', 0.4);
    await collect('quiet-array-journal-archive', 'journal');
    await walkLocal([-1.4, 4.8], 'quiet-array-archive-bypass', 0.4);
    await walkLocal([-1.4, 0], 'quiet-array-archive-clear-spine', 0.4);
    await walkLocal([0, -6], 'quiet-array-archive-spine');
    await collect('quiet-array-annika-archive-shard', 'unique', 1.9);
    const afterItems = await snapshot();
    if (
      !afterItems.story.recoveredUniques?.includes('course-actuator') ||
      !afterItems.story.recoveredUniques?.includes('annika-archive-shard') ||
      !afterItems.legacyStory.journalsRead?.includes('quiet-array-journal-port') ||
      !afterItems.legacyStory.journalsRead?.includes('quiet-array-journal-starboard')
    )
      throw new Error('Quiet Array unique recovery incomplete');
    await record('quiet-array-objectives-complete', { snapshot: afterItems });
    await walkLocal([0, -6], 'quiet-array-shard-return-spine');
    await walkLocal([0, 0], 'quiet-array-exit-spine');
    await walkTo([root[0] - 9.5, root[1], root[2]], 'quiet-array-gangway', 1.2);
    await walkTo([root[0] - 10.5, root[1], root[2]], 'quiet-array-machine-side', 1.5);
    if (fullArt) {
      for (let i = aisle.length - 1; i >= 0; i -= 1)
        await walkTo(aisle[i], `quiet-array-return-aisle-${aisle.length - i}`, 1.1);
    }
    await page.waitForFunction(
      () =>
        globalThis.__game.game.destination.playerOnMachine(
          globalThis.__game.game.player.worldPosition,
        ),
      null,
      { timeout: 15_000 },
    );
    const radio = await page.evaluate(() => globalThis.__game.game.radioWorldPosition.toArray());
    await walkTo(radio, 'quiet-array-return-radio', 1.5);
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
    await settleActive('quiet-array-depart');
    let departed = await snapshot();
    if (
      departed.phase !== 'complete' ||
      !departed.story.completed?.includes('quiet-array') ||
      departed.destination.colliders !== 0 ||
      !departed.destination.playerOnMachine
    )
      throw new Error(`Quiet Array departure did not complete: ${JSON.stringify(departed)}`);
    await record('quiet-array-completion-checkpoint', { snapshot: departed });

    await rebuildGenerator();
    departed = await snapshot();
  }

  // Exercise the earned tier-one course actuator through the live Helm UI.
  const helm = await page.evaluate(() => {
    const object = globalThis.__game.game.helmInteract;
    if (!object) return null;
    const point = new object.position.constructor();
    object.getWorldPosition(point);
    return point.toArray();
  });
  if (!helm) throw new Error('Navigation Helm interaction was not available after Quiet Array');
  await walkTo(helm, 'quiet-array-navigation-helm', 1.2);
  await page.keyboard.press('KeyE');
  await page.locator('[data-panel="helm"]').waitFor({ state: 'visible', timeout: 12_000 });
  const helmBefore = await snapshot();
  await page.locator('[data-steer="-1"]').click();
  const left = await snapshot();
  await page.locator('[data-steer="1"]').click();
  const right = await snapshot();
  if (
    helmBefore.course.tier !== 1 ||
    !helmBefore.power.helmPowered ||
    helmBefore.power.registeredDemand < 1 ||
    left.course.desiredDeg !== -12 ||
    right.course.desiredDeg !== 12
  )
    throw new Error(
      `tier-one Helm bearing controls invalid: ${JSON.stringify({ helmBefore, left, right })}`,
    );
  await record('quiet-array-helm-bearing', { helmBefore, left, right });
  await page.locator('[data-testid="helm-close"]').click();
  await settleActive('quiet-array-helm-close');
  await page.waitForFunction(
    () => {
      const course = globalThis.__game.game.course.snapshot;
      return course.bearingDeg > 0.2 && course.lateralM > 0.01;
    },
    null,
    { timeout: 10_000 },
  );
  const helmAfter = await snapshot();
  if (!Number.isFinite(helmAfter.course.bearingDeg) || !Number.isFinite(helmAfter.course.lateralM))
    throw new Error(
      `Helm state became non-finite after close: ${JSON.stringify(helmAfter.course)}`,
    );
  await record('quiet-array-helm-closed', { helmAfter });

  // Pause first, then compare the exact committed payload and a cold Continue.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__game.game.state.paused, null, { timeout: 8_000 });
  const pausedCheckpoint = await snapshot();
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
    throw new Error('committed Quiet Array save differs from paused checkpoint');
  await fs.writeFile(path.join(output, 'committed-save.json'), JSON.stringify(committed, null, 2));
  await record('quiet-array-save-committed', { slot: committed.slot });
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
    if (JSON.stringify(restored[key]) !== JSON.stringify(pausedCheckpoint[key]))
      throw new Error(`${key} changed across Quiet Array cold Continue`);
  for (const key of ['tier', 'desiredDeg', 'throttle'])
    if (restored.course[key] !== checkpoint.machine.course[key])
      throw new Error(`Course ${key} changed across cold Continue`);
  const advancedM = restored.distanceM - checkpoint.distanceTraveled;
  const bearingAdvance = restored.course.bearingDeg - checkpoint.machine.course.bearingDeg;
  const lateralAdvance = restored.course.lateralM - checkpoint.machine.course.lateralM;
  if (
    advancedM < -1e-6 ||
    advancedM > 10 ||
    bearingAdvance < -1e-6 ||
    bearingAdvance > 1.6 * (restored.simTime + 0.05) ||
    lateralAdvance < -1e-6 ||
    lateralAdvance > Math.tan((12 * Math.PI) / 180) * advancedM + 0.001
  )
    throw new Error(
      `Course restore exceeded ordinary movement: ${JSON.stringify({ advancedM, bearingAdvance, lateralAdvance, simTime: restored.simTime })}`,
    );
  if (
    restored.phase !== 'complete' ||
    restored.destination.active ||
    restored.destination.docked ||
    restored.destination.colliders !== 0 ||
    !restored.destination.playerOnMachine
  )
    throw new Error('Quiet Array completion did not survive cold Continue');
  await record('quiet-array-cold-continue', { restored, checkpoint });
  await page.screenshot({
    path: path.join(output, 'quiet-array-cold-continue.png'),
    fullPage: true,
  });
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
