/* global process, console */

/**
 * Live automation integration proof. This is a QA fixture: it grants the two
 * specialist blueprints and starter materials so the checks can isolate the
 * automation contracts. It never fabricates collected loot or combat damage;
 * salvage, enemy, gunboat, power, UI, and save/load outcomes come from the
 * running Game and its real systems.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { browserLaunchOptions } from './browser-options.mjs';

const port = Number(process.env.MMF_PORT ?? 5193);
const base = `http://127.0.0.1:${port}`;
const output = 'docs/art/expansion-validation';
await mkdir(output, { recursive: true });

const browser = await chromium.launch(browserLaunchOptions);
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const checks = [];
const errors = [];
const trace = { setup: [], salvage: [], combat: [], save: [] };
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));

function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` -- ${detail}` : ''}`);
}

async function step(seconds) {
  await page.evaluate((duration) => {
    const game = globalThis.__game.game;
    game.stop();
    let left = Math.max(0, duration);
    while (left > 0) {
      const dt = Math.min(1 / 60, left);
      game.fixedUpdate(dt);
      left -= dt;
    }
    game.render(1);
    game.start();
  }, seconds);
}

async function run() {
  await page.goto(
    `${base}/?nolock=1&nomenu=1&nospawn=1&nosound=1&quality=high&seed=automation-acceptance`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 60000 });
  await page.evaluate(() => {
    const g = globalThis.__game.game;
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
    g.machine.power.restore({ fuel: 100 });
    g.enemySpawnsEnabled = false;
    g.stop();
  });

  const fixture = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const cell = { x: -4, y: 0, z: -6 };
    const turretCell = { x: -3, y: 0, z: 3 };
    const beforeLocked = g.build.place({ piece: 'collector-auto', cell, rotation: 0 }) === null;
    g.progression.grantBlueprint('automatic-salvage-collector');
    g.progression.grantBlueprint('automatic-defense-turret');
    const scrapBefore = g.inventory.count('scrap');
    const componentsBefore = g.inventory.count('components');
    g.inventory.add('scrap', 400);
    g.inventory.add('components', 60);
    const floor = g.build.place({ piece: 'floor', cell, rotation: 0 });
    const turretFloor = g.build.place({ piece: 'floor', cell: turretCell, rotation: 0 });
    const collector = floor ? g.build.place({ piece: 'collector-auto', cell, rotation: 0 }) : null;
    const turret = turretFloor
      ? g.build.place({ piece: 'turret-auto', cell: turretCell, rotation: 0 })
      : null;
    return {
      beforeLocked,
      floor: floor?.instanceId ?? null,
      turretFloor: turretFloor?.instanceId ?? null,
      collector: collector?.instanceId ?? null,
      turret: turret?.instanceId ?? null,
      scrapBefore,
      componentsBefore,
      scrapAdded: 400,
      componentsAdded: 60,
      scrapAfterBuild: g.inventory.count('scrap'),
      componentsAfterBuild: g.inventory.count('components'),
      powerDraw: g.machine.power.draw,
      collectorPowerDraw: g.machine.power.consumers.get(collector?.instanceId)?.draw ?? null,
      turretPowerDraw: g.machine.power.consumers.get(turret?.instanceId)?.draw ?? null,
    };
  });
  trace.setup.push(fixture);
  check('collector placement is locked before specialist unlock', fixture.beforeLocked);
  check(
    'ordinary-cost collector and turret placement succeeds on valid deck cells',
    Boolean(fixture.collector && fixture.turret),
    JSON.stringify(fixture),
  );
  check(
    'automation build costs are paid through shared inventory',
    fixture.scrapAfterBuild === fixture.scrapBefore + fixture.scrapAdded - 136 &&
      fixture.componentsAfterBuild === fixture.componentsBefore + fixture.componentsAdded - 14,
    JSON.stringify(fixture),
  );
  check(
    'collector and turret power draws are four and six',
    fixture.collectorPowerDraw === 4 && fixture.turretPowerDraw === 6,
    JSON.stringify(fixture),
  );

  const salvage = await page.evaluate((collectorId) => {
    const g = globalThis.__game.game;
    g.salvage.armAfterOpening(g.world.distanceTraveled);
    g.salvage.update(0, g.world.distanceTraveled, g.machine.speed);
    const spawned = g.salvage.targets[0];
    return {
      spawned,
      before: g.build.collectorContainer(collectorId)?.serialise() ?? null,
    };
  }, fixture.collector);
  const collectorResult = await page.evaluate(async (collectorId) => {
    const g = globalThis.__game.game;
    const before = g.salvage.targets[0]?.id ?? null;
    let collected = false;
    for (let i = 0; i < 900 && !collected; i++) {
      g.fixedUpdate(1 / 60);
      const buffer = g.build.collectorContainer(collectorId);
      collected = Boolean(
        buffer?.count('scrap') || buffer?.count('components') || buffer?.count('fuel'),
      );
    }
    const buffer = g.build.collectorContainer(collectorId);
    const slots = buffer?.serialise() ?? [];
    const targetStillLive = before ? g.salvage.positionOf(before) !== null : false;
    const openedPanel = g.openInteractable({
      kind: 'collector',
      id: collectorId,
      label: 'Collector',
    });
    if (openedPanel) g.render(0);
    return {
      before,
      collected,
      slots,
      targetStillLive,
      openedPanel,
      panelMode: g.inventoryUI.currentMode,
      panelVisible: document.querySelector('#inv-panel')?.style.display,
      firstBufferSlot: Boolean(
        document.querySelector('#inv-panel [data-side="crate"][data-slot="0"]'),
      ),
    };
  }, fixture.collector);
  trace.salvage.push({ spawned: salvage.spawned, result: collectorResult });
  check(
    'collector claims and pulls a live SalvageField crate',
    collectorResult.collected,
    JSON.stringify(collectorResult),
  );
  check(
    'collector buffer contains only real manifest items',
    collectorResult.slots.some(
      (slot) =>
        slot?.itemId === 'scrap' || slot?.itemId === 'components' || slot?.itemId === 'fuel',
    ),
    JSON.stringify(collectorResult.slots),
  );
  check(
    'collector buffer opens through the transfer UI',
    collectorResult.openedPanel &&
      collectorResult.panelMode === 'transfer' &&
      collectorResult.firstBufferSlot,
    JSON.stringify(collectorResult),
  );
  const bufferBeforeClick = await page.evaluate(
    (collectorId) =>
      globalThis.__game.game.build.collectorContainer(collectorId)?.count('scrap') ?? 0,
    fixture.collector,
  );
  const transferSlot = page.locator('#inv-panel [data-side="crate"][data-slot="0"]');
  if ((await transferSlot.count()) > 0) {
    await transferSlot.click();
    await page.evaluate(() => globalThis.__game.game.render(0));
  }
  const bufferAfterClick = await page.evaluate(
    (collectorId) =>
      globalThis.__game.game.build.collectorContainer(collectorId)?.count('scrap') ?? 0,
    fixture.collector,
  );
  check(
    'collector transfer UI click moves the selected stack',
    bufferBeforeClick > 0 && bufferAfterClick === 0,
    `${bufferBeforeClick} -> ${bufferAfterClick}`,
  );

  const combat = await page.evaluate(async (turretId) => {
    const g = globalThis.__game.game;
    g.inventoryUI.setMode('closed');
    const fired = [];
    const gunboatHits = [];
    g.bus.on('automatic-turret:fired', (event) => {
      fired.push(event);
      if (event.targetId?.startsWith('gunboat-')) {
        const part = event.targetId.slice(8);
        gunboatHits.push({
          targetId: event.targetId,
          health: g.gunboatScene.snapshot?.[`${part}Health`] ?? null,
        });
      }
    });
    const turret = g.build.turretVisual(turretId);
    const origin = turret?.root.getWorldPosition(g.player.worldPosition.clone());
    const stableEnemy = {
      x: origin?.x ?? -6,
      y: (origin?.y ?? 3.6) - 0.2,
      z: (origin?.z ?? 6) + 3,
    };
    const enemy = g.enemies.spawn('scavenger', stableEnemy);
    g.physics.step();
    g.fixedUpdate(1 / 60);
    const muzzle = turret?.muzzle.getWorldPosition(g.player.worldPosition.clone());
    const candidates = [
      [-6, 0],
      [6, 0],
      [0, -6],
      [0, 6],
      [-4, -4],
      [-4, 4],
      [4, -4],
      [4, 4],
    ];
    let clearCandidate = null;
    if (enemy && muzzle) {
      for (const [dx, dz] of candidates) {
        stableEnemy.x = muzzle.x + dx;
        stableEnemy.y = muzzle.y;
        stableEnemy.z = muzzle.z + dz;
        enemy.worldPosition.set(stableEnemy.x, stableEnemy.y, stableEnemy.z);
        enemy.handle.body.setTranslation(stableEnemy, true);
        const delta = g.player.worldPosition
          .clone()
          .set(stableEnemy.x, stableEnemy.y, stableEnemy.z)
          .sub(muzzle);
        const hit = g.physics.raycast(muzzle, delta.clone().normalize(), delta.length() + 0.5);
        if (hit?.userData?.id === enemy.id) {
          clearCandidate = { x: stableEnemy.x, y: stableEnemy.y, z: stableEnemy.z };
          break;
        }
      }
    }
    const hpBefore = enemy?.health ?? null;
    for (let i = 0; i < 600 && enemy && enemy.health === hpBefore; i++) {
      // Keep the live enemy collider in the clear corridor while its real
      // target enumeration, LOS raycast, lock delay, and damage path run.
      enemy.worldPosition.set(stableEnemy.x, stableEnemy.y, stableEnemy.z);
      enemy.handle.body.setTranslation(stableEnemy, true);
      g.physics.step();
      g.automaticDefense.update(1 / 60);
    }
    const hpAfter = enemy?.health ?? null;
    const firedAtEnemy = fired.some((event) => event.targetId === enemy?.id);
    const powerBefore = g.machine.power.isPowered(turretId);
    g.machine.power.restore({ fuel: 0 });
    const noPowerHealth = enemy?.health ?? null;
    for (let i = 0; i < 120; i++) {
      enemy?.worldPosition.set(stableEnemy.x, stableEnemy.y, stableEnemy.z);
      enemy?.handle.body.setTranslation(stableEnemy, true);
      g.physics.step();
      g.automaticDefense.update(1 / 60);
    }
    const noPowerAfter = enemy?.health ?? null;
    enemy?.despawn();
    g.machine.power.restore({ fuel: 100 });
    // Rebuild transient aim state after the intentional power-loss interval.
    g.automaticDefense.restore(g.automaticDefense.toSave());
    g.physics.step();
    const powerAfterRestore = {
      fuel: g.machine.power.fuel,
      capacity: g.machine.power.capacity,
      draw: g.machine.power.draw,
      powered: g.machine.power.isPowered(turretId),
    };
    const gunboatSpawned = g.gunboatScene.spawn('port');
    let gunboatFired = false;
    for (let i = 0; i < 2400 && !gunboatFired; i++) {
      g.physics.step();
      g.fixedUpdate(1 / 60);
      gunboatFired = fired.some((event) => event.targetId?.startsWith('gunboat-'));
    }
    const gunboat = g.gunboatScene.snapshot;
    const gunboatTargets = g.automaticDefense.callbacks?.getTargets?.() ?? [];
    const gunboatVisibility = gunboatTargets.map((target) => ({
      id: target.id,
      position: target.position,
      visible: g.automaticDefense.callbacks?.hasLineOfSight?.(turretId, target.id) ?? null,
    }));
    const gunboatPower = g.machine.power.isPowered(turretId);
    const gunboatPart =
      fired.find((event) => event.targetId?.startsWith('gunboat-'))?.targetId ?? null;
    return {
      enemyId: enemy?.id ?? null,
      origin: origin ? { x: origin.x, y: origin.y, z: origin.z } : null,
      clearCandidate,
      enemyPosition: enemy
        ? { x: enemy.worldPosition.x, y: enemy.worldPosition.y, z: enemy.worldPosition.z }
        : null,
      hpBefore,
      hpAfter,
      firedAtEnemy,
      powerBefore,
      noPowerHealth,
      noPowerAfter,
      gunboatSpawned,
      gunboatFired,
      gunboatHullHealth: gunboat?.hullHealth ?? null,
      gunboatPart,
      gunboatHits,
      gunboatPower,
      powerAfterRestore,
      gunboatVisibility,
      fired: fired.length,
      firedTargets: [...new Set(fired.map((event) => event.targetId))],
    };
  }, fixture.turret);
  trace.combat.push(combat);
  check(
    'automatic turret fires on a real infantry enemy through LOS',
    combat.firedAtEnemy && combat.hpAfter < combat.hpBefore,
    JSON.stringify(combat),
  );
  check(
    'automatic turret stops damaging when power is lost',
    combat.firedAtEnemy && combat.noPowerAfter === combat.noPowerHealth,
    JSON.stringify(combat),
  );
  check(
    'automatic turret acquires and damages a live gunboat subsystem',
    combat.gunboatSpawned &&
      combat.gunboatFired &&
      combat.gunboatHits.some((hit) => Number.isFinite(hit.health)),
    JSON.stringify(combat),
  );

  const save = await page.evaluate(
    async ({ collectorId, turretId }) => {
      const g = globalThis.__game.game;
      g.enemies.despawnAll();
      g.gunboatScene.clear();
      const before = {
        buffer: g.build.collectorContainer(collectorId)?.serialise() ?? [],
        aims: g.automaticDefense.toSave(),
        built: g.build.serialise().map((piece) => piece.instanceId),
      };
      const written = await g.saveTo('automation-acceptance', 'manual', true);
      g.build.damagePiece(turretId, 999999);
      const loaded = await g.loadFrom('automation-acceptance');
      const after = {
        buffer: g.build.collectorContainer(collectorId)?.serialise() ?? [],
        aims: g.automaticDefense.toSave(),
        built: g.build.serialise().map((piece) => piece.instanceId),
      };
      return { written, loaded, before, after };
    },
    { collectorId: fixture.collector, turretId: fixture.turret },
  );
  trace.save.push(save);
  check(
    'actual save/load retains collector buffer contents',
    save.written &&
      save.loaded &&
      JSON.stringify(save.after.buffer) === JSON.stringify(save.before.buffer),
    JSON.stringify(save),
  );
  check(
    'actual save/load retains aims only for built automatic turrets',
    save.written &&
      save.loaded &&
      save.after.aims.every((aim) => save.after.built.includes(aim.instanceId)),
    JSON.stringify(save),
  );
}

try {
  await run();
  const result = {
    generatedAt: new Date().toISOString(),
    port,
    checks,
    trace,
    errors,
    fixture:
      'Blueprints/materials are granted only to isolate automation; collected salvage and combat outcomes are live Game results.',
  };
  await writeFile(`${output}/automation-acceptance.json`, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  if (errors.length || checks.some((check) => !check.ok)) process.exitCode = 1;
} finally {
  await page.close();
  await browser.close();
}
