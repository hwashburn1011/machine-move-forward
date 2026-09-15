import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5205/';
const source = path.resolve(
  process.env.MMF_CONTINUITY_PROFILE ??
    'test-results/continuity-build-clean/run-2026-09-15T11-02-16-853Z/first-loop-1789470403504/browser-profile',
);
// Keep Chromium's IndexedDB paths comfortably below Windows' legacy path
// limit; nesting a new profile under every checkpoint eventually exceeds it.
const evidenceDir = path.resolve('test-results/continuity-boarding', `run-${Date.now()}`);
const profile = path.join(evidenceDir, 'browser-profile');
await fs.mkdir(evidenceDir, { recursive: true });
await fs.cp(source, profile, { recursive: true, errorOnExist: true });
const evidence = path.join(evidenceDir, 'events.jsonl');
const errors = [];
const record = async (type, detail = {}) =>
  fs.appendFile(evidence, `${JSON.stringify({ at: new Date().toISOString(), type, ...detail })}\n`);

let context = await chromium.launchPersistentContext(profile, {
  headless: true,
  viewport: { width: 640, height: 360 },
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
let page = context.pages()[0] ?? (await context.newPage());
page.on('pageerror', (error) => errors.push(error.stack ?? String(error)));
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));

const snap = () =>
  page.evaluate(() => {
    const g = globalThis.__game.game;
    return {
      simTime: g.state.simTime,
      player: g.player.worldPosition.toArray(),
      playerHealth: g.player.stats.health,
      input: {
        context: g.input.inputContext,
        locked: g.input.pointerLocked,
        paused: g.state.paused,
        armed: g.playerArmed,
      },
      enemies: g.enemies.active.map((e) => ({
        id: e.id,
        health: e.currentHealth,
        at: e.worldPosition.toArray(),
        state: e.aiState,
      })),
      weapon: { ammo: g.combat.current.ammoInMag, reloading: g.combat.current.isReloading },
      distanceM: g.world.distanceTraveled,
      resources: ['scrap', 'components', 'fuel'].map((id) => [id, g.resources.count(id)]),
      pieces: g.build
        .serialise()
        .map((p) => ({ id: p.instanceId, piece: p.definitionId, cell: p.cell })),
      firstRun: g.firstRun.toSave(),
      damage: g.machine.damage.toSave(),
      vehicle: {
        active: !!g.vehicleScene.active || !!g.vehicleManager.active,
        enemies: g.enemies.activeCount,
        hull: g.vehicleManager.snapshot?.hullHealth,
        hook: g.vehicleManager.snapshot?.hookHealth,
        crew: g.vehicleManager.snapshot?.crewHealth,
        phase: g.vehicleManager.snapshot?.phase,
      },
    };
  });

const moveLookTo = async (target) => {
  for (let i = 0; i < 12; i++) {
    const delta = await page.evaluate((at) => {
      const g = globalThis.__game.game;
      const camera = g.playerCamera.camera;
      const dx = at[0] - camera.position.x,
        dy = at[1] - camera.position.y,
        dz = at[2] - camera.position.z;
      const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
      return {
        yaw: wrap(Math.atan2(-dx, -dz) - g.playerCamera.yawAngle),
        pitch: Math.atan2(dy, Math.hypot(dx, dz)) - g.playerCamera.pitchAngle,
      };
    }, target);
    if (Math.abs(delta.yaw) < 0.012 && Math.abs(delta.pitch) < 0.012) return;
    await page.evaluate(({ yaw, pitch }) => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          movementX: Math.max(-600, Math.min(600, -yaw / 0.0022)),
          movementY: Math.max(-350, Math.min(350, -pitch / 0.0022)),
        }),
      );
    }, delta);
    await page.waitForTimeout(80);
  }
};

try {
  const url = new URL(site);
  for (const [key, value] of Object.entries({
    nosound: '1',
    quality: 'low',
    nomodel: '1',
    notex: '1',
  }))
    url.searchParams.set(key, value);
  await record('provenance', { source, profile, url: url.toString(), logicalOnly: true });
  await page.goto(url.toString(), {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 180_000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(() => !globalThis.__game.game.titleScreen?.isOpen, null, {
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => globalThis.__game.game.input.pointerLocked && !globalThis.__game.game.state.paused,
  );
  await page.evaluate(() => {
    globalThis.__boardingEvents = [];
    for (const type of [
      'boarding:started',
      'boarding:hook-attached',
      'boarding:crossed',
      'boarding:ended',
      'turret:fired',
      'combat:hit',
      'repair:completed',
      'loot:collected',
      'build:removed',
    ])
      globalThis.__game.game.bus.on(type, (detail) =>
        globalThis.__boardingEvents.push({
          type,
          detail,
          simTime: globalThis.__game.game.state.simTime,
        }),
      );
  });
  await record('continued', { snapshot: await snap() });
  const initial = await snap();

  const fixture = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const turret = g.build.serialise().find((piece) => piece.definitionId === 'turret-manual');
    if (!turret) return { ok: false, reason: 'accepted profile has no manual turret' };
    const visual = g.build.turretVisual(turret.instanceId);
    if (!visual?.root) return { ok: false, reason: 'turret visual unavailable' };
    const point = g.player.worldPosition.clone();
    visual.root.getWorldPosition(point);
    return {
      ok: true,
      turretId: turret.instanceId,
      target: point.toArray(),
      firstRun: g.firstRun.toSave(),
      mounted: g.defense.mounted,
      resources: ['scrap', 'components', 'fuel'].map((id) => [id, g.resources.count(id)]),
    };
  });
  await record('fixture', fixture);
  if (!fixture.ok) throw new Error(fixture.reason);

  if (!fixture.mounted) {
    await moveLookTo(fixture.target);
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      (id) =>
        globalThis.__game.game.build
          .stationsNear(globalThis.__game.game.player.worldPosition, 1.8)
          .some((s) => s.instanceId === id),
      fixture.turretId,
      { timeout: 20_000 },
    );
    await page.keyboard.up('KeyW');
    await page.keyboard.press('KeyE');
  }
  await page.waitForFunction(() => Boolean(globalThis.__game.game.defense.mounted), null, {
    timeout: 10_000,
  });
  await record('turret-mounted', { snapshot: await snap() });
  await page.waitForFunction(() => globalThis.__game.game.vehicleManager.active, null, {
    timeout: 60000,
  });
  const beforeFire = await snap();
  await record('boarding-armed', beforeFire);

  const bursts = [];
  await page.mouse.down({ button: 'left' });
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const look = await page.evaluate(() => {
      const g = globalThis.__game.game;
      const saved = g.defense.serialise().find((turret) => turret.instanceId === g.defense.mounted);
      const visual = saved && g.build.turretVisual(saved.instanceId);
      const target = g.vehicleScene.hookWorldPosition?.clone() ?? null;
      if (!saved || !visual?.yaw?.parent || !target) return null;
      const yawLocal = visual.yaw.parent.worldToLocal(target.clone()).sub(visual.yaw.position);
      const desiredYaw = -Math.atan2(-yawLocal.x, -yawLocal.z);
      const pitchLocal = visual.pitch.parent
        .worldToLocal(target.clone())
        .sub(visual.pitch.position);
      const desiredPitch = Math.atan2(pitchLocal.y, -pitchLocal.z);
      return {
        yaw: (desiredYaw - saved.yaw) / 0.004,
        pitch: -(desiredPitch - saved.pitch) / 0.004,
      };
    });
    if (look) {
      await page.evaluate(
        ({ yaw, pitch }) =>
          window.dispatchEvent(
            new MouseEvent('mousemove', {
              movementX: Math.max(-200, Math.min(200, yaw)),
              movementY: Math.max(-150, Math.min(150, pitch)),
            }),
          ),
        look,
      );
    }
    await page.waitForTimeout(100);
    const state = await snap();
    bursts.push(state.vehicle);
    await record('fire-observation', state.vehicle);
    if (!state.vehicle.active && state.vehicle.enemies === 0) break;
    if (state.vehicle.enemies > 0 || state.vehicle.phase === 'retreat') break;
  }
  await page.mouse.up({ button: 'left' });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => !globalThis.__game.game.defense.mounted, null, {
    timeout: 5000,
  });
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(300);
  // The turret handles the skiff; any landed boarders must be fought with
  // ordinary player fire after dismounting. Aim at each live enemy's actual
  // world position and record every observation so misses remain visible.
  const boarderDeadline = Date.now() + 40_000;
  while (Date.now() < boarderDeadline) {
    const enemy = await page.evaluate(() => {
      const g = globalThis.__game.game;
      const e = g.enemies.active[0];
      return e?.worldPosition
        ? {
            target: e.worldPosition.toArray(),
            player: g.player.worldPosition.toArray(),
            weapon: g.combat.current?.id,
            ammo: g.combat.current
              ? { mag: g.combat.current.ammoInMag, reserve: g.combat.current.reserveAmmo }
              : null,
          }
        : null;
    });
    if (!enemy) break;
    if (enemy.ammo.mag === 0) {
      await page.keyboard.press('KeyR');
      await page.waitForTimeout(2400);
    }
    await moveLookTo(enemy.target);
    const aim = await page.evaluate((at) => {
      const g = globalThis.__game.game,
        from = g.playerCamera.camera.position;
      const dir = g.player.worldPosition
        .clone()
        .set(...at)
        .sub(from)
        .normalize();
      const hit = g.physics.raycast(from, dir, 100);
      return {
        from: from.toArray(),
        target: at,
        hit: hit
          ? {
              distance: hit.distance,
              kind: hit.userData?.kind,
              id: hit.userData?.id,
              point: hit.point.toArray(),
            }
          : null,
      };
    }, enemy.target);
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(250);
    await page.mouse.up({ button: 'left' });
    await record('boarder-observation', { enemy, aim, snapshot: await snap() });
  }
  await page.mouse.up({ button: 'right' });
  await fs.writeFile(
    path.join(evidenceDir, 'combat-events.json'),
    JSON.stringify(await page.evaluate(() => globalThis.__boardingEvents), null, 2),
  );
  await page
    .waitForFunction(
      () =>
        !globalThis.__game.game.vehicleManager.active &&
        globalThis.__game.game.enemies.activeCount === 0,
      null,
      { timeout: 15000 },
    )
    .catch(() => {});
  const boarding = await snap();
  await record('boarding-finished', { boarding, bursts });
  if (boarding.firstRun.completed?.includes('survive-boarding') !== true)
    throw new Error(`boarding did not complete tutorial step: ${JSON.stringify(boarding)}`);

  const maxHealth = {
    engine: 320,
    'leg-front-left': 180,
    'leg-front-right': 180,
    'leg-rear-left': 180,
    'leg-rear-right': 180,
  };
  const damaged = boarding.damage
    .filter((entry) => Number.isFinite(entry.health))
    .filter((entry) => entry.health < (maxHealth[entry.id] ?? Infinity))
    .map((entry) => entry.id);
  if (damaged.length) {
    for (const id of damaged) {
      const point = await page.evaluate((repairId) => {
        const g = globalThis.__game.game;
        const p = {
          engine: [0, 14.83, 4.4],
          'leg-front-left': [-6.3, 14.83, -4.8],
          'leg-front-right': [6.3, 14.83, -4.8],
          'leg-rear-left': [-6.3, 14.83, 4.8],
          'leg-rear-right': [6.3, 14.83, 4.8],
        }[repairId];
        if (!p) return null;
        const point = g.player.worldPosition.clone().set(p[0], p[1], p[2]);
        g.machine.group.localToWorld(point);
        return point.toArray();
      }, id);
      if (!point) throw new Error(`unknown repair point ${id}`);
      await moveLookTo(point);
      await page.keyboard.down('KeyW');
      await page.waitForFunction(
        (at) =>
          globalThis.__game.game.player.worldPosition.distanceTo({
            x: at[0],
            y: at[1],
            z: at[2],
          }) <= 1.8,
        point,
        { timeout: 20_000 },
      );
      await page.keyboard.up('KeyW');
      await page.keyboard.down('KeyE');
      await page.waitForTimeout(3_000);
      await page.keyboard.up('KeyE');
    }
  }
  const postRepair = await snap();
  const unresolved = postRepair.damage.filter(
    (entry) => entry.health < (maxHealth[entry.id] ?? Infinity),
  );
  if (unresolved.length)
    throw new Error(`physical repair incomplete: ${unresolved.map((entry) => entry.id).join(',')}`);
  if (damaged.length && !postRepair.firstRun.completed?.includes('repair'))
    throw new Error('boarding repair did not complete first-run repair step');
  const combatEvents = await page.evaluate(() => globalThis.__boardingEvents);
  const outcome = combatEvents.find((e) => e.type === 'boarding:ended')?.detail;
  if (!outcome?.tutorial) throw new Error('No authoritative tutorial outcome was recorded');
  const validHit = combatEvents.some(
    (e) =>
      e.type === 'combat:hit' &&
      (e.detail.targetKind === 'enemy' || /^skiff-(hook|hull|crew-)/.test(e.detail.targetId ?? '')),
  );
  if (!validHit) throw new Error('No real hostile hit was recorded');
  if (!outcome.needsRepair) {
    if (!postRepair.firstRun.completed?.includes('repair'))
      throw new Error('Perfect defense did not resolve repair gate');
    if (combatEvents.some((e) => e.type === 'repair:completed'))
      throw new Error('Unexpected repair during perfect defense');
  }
  for (const piece of initial.pieces)
    if (!postRepair.pieces.some((p) => p.id === piece.id))
      throw new Error(
        `First-loop structure lost: ${piece.id}; rebuild it through normal controls before continuing`,
      );
  const repairCost = boarding.damage.reduce(
    (sum, e) => sum + Math.ceil((1 - e.health / maxHealth[e.id]) * (e.id === 'engine' ? 80 : 45)),
    0,
  );
  for (const [id, count] of initial.resources) {
    const loot = combatEvents
      .filter((e) => e.type === 'loot:collected')
      .flatMap((e) => e.detail.items)
      .filter((item) => item.id === id)
      .reduce((sum, item) => sum + item.count, 0);
    const expected = count + loot - (id === 'scrap' ? repairCost : 0);
    if (postRepair.resources.find(([key]) => key === id)?.[1] !== expected)
      throw new Error(`Unreconciled ${id}: expected ${expected}`);
  }
  await record('resource-ledger', {
    initial: initial.resources,
    final: postRepair.resources,
    repairCost,
    outcome,
  });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__game.game.state.paused);
  const checkpoint = await snap();
  const expectedSave = await page.evaluate(() => globalThis.__game.game.buildSave());
  await record('pre-save-checkpoint', checkpoint);
  await page.getByRole('button', { name: 'Save & Quit', exact: true }).click();
  await page
    .getByRole('button', { name: 'Continue', exact: true })
    .waitFor({ state: 'visible', timeout: 15000 });
  const committed = await page.evaluate(async () => {
    const saves = globalThis.__game.game.saves,
      slot = await saves.latestSlot();
    return { slot, data: await saves.load(slot) };
  });
  await fs.writeFile(
    path.join(evidenceDir, 'committed-save.json'),
    JSON.stringify(committed, null, 2),
  );
  for (const key of [
    'distanceTraveled',
    'seed',
    'profile',
    'player',
    'machine',
    'progression',
    'world',
  ]) {
    if (JSON.stringify(committed.data[key]) !== JSON.stringify(expectedSave[key]))
      throw new Error(`Committed save differs from paused checkpoint: ${key}`);
  }
  await fs.writeFile(
    path.join(evidenceDir, 'combat-events.json'),
    JSON.stringify(await page.evaluate(() => globalThis.__boardingEvents), null, 2),
  );
  await record('saved-and-quit', { snapshot: await snap() });
  await context.close();
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 640, height: 360 },
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => errors.push(error.stack ?? String(error)));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  await page.goto(url.toString());
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 180_000 });
  await page
    .getByRole('button', { name: 'Continue', exact: true })
    .waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(() => !globalThis.__game.game.titleScreen?.isOpen, null, {
    timeout: 30_000,
  });
  const restored = await snap();
  await record('cold-continue', { restored });
  if (!restored.firstRun.completed?.includes('survive-boarding'))
    throw new Error('survive-boarding completion did not survive cold Continue');
  if (JSON.stringify(restored.resources) !== JSON.stringify(checkpoint.resources))
    throw new Error('resource snapshot changed across boarding/cold Continue');
  for (const key of ['damage', 'firstRun', 'pieces', 'playerHealth', 'weapon'])
    if (JSON.stringify(restored[key]) !== JSON.stringify(checkpoint[key]))
      throw new Error(`Cold Continue changed ${key}`);
  const restoredSave = await page.evaluate(() => globalThis.__game.game.buildSave());
  for (const key of ['inventory', 'equipment'])
    if (JSON.stringify(restoredSave.player[key]) !== JSON.stringify(committed.data.player[key]))
      throw new Error(`Cold Continue changed player.${key}`);
  if (Math.abs(restored.distanceM - committed.data.distanceTraveled) > 5)
    throw new Error('Cold Continue loaded a different travel checkpoint');
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  await fs.writeFile(
    path.join(evidenceDir, 'summary.json'),
    JSON.stringify(
      {
        status: 'passed',
        source,
        profile,
        committedSlot: committed.slot,
        checkpoint,
        restored,
        errors,
      },
      null,
      2,
    ),
  );
  await page.screenshot({ path: path.join(evidenceDir, 'boarding.png'), fullPage: true });
  process.stdout.write(JSON.stringify({ status: 'passed', evidence, errors }, null, 2));
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
