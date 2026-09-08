/**
 * Browser acceptance for the complete guided first-run loop.
 *
 * The harness accelerates setup with the same public runtime seams used by the
 * other browser tools: it stages the first salvage encounter and uses the
 * normal starting resources with the real salvage, build, craft, defense,
 * vehicle, damage, repair, save, and title-screen paths. It never emits a
 * progression event or marks FirstRunDirector complete by hand.
 */
import { chromium } from '@playwright/test';
import { BASE_URL } from './base-url.mjs';
import { browserLaunchOptions } from './browser-options.mjs';

const graphicsQuery = process.env.MMF_GRAPHICS === '1' ? '&quality=high' : '&quality=low&notex=1&nomodel=1';
const GAME_QUERY = `?nolock=1&nomenu=1&seed=first-run-harness&nospawn=1&nosound=1${graphicsQuery}`;
const BOOT_QUERY = `?nolock=1&seed=first-run-harness&nospawn=1&nosound=1${graphicsQuery}`;

const browser = await chromium.launch(browserLaunchOptions);
const page = await browser.newPage({ viewport: { width: 900, height: 540 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
};

const simTime = () => page.evaluate(() => globalThis.__game.debugStats().simTime);
async function sim(seconds) {
  const start = await simTime();
  const deadline = Date.now() + Math.max(90_000, seconds * 7_000);
  while ((await simTime()) - start < seconds) {
    await page.waitForTimeout(120);
    if (Date.now() > deadline) throw new Error(`sim(${seconds}) timed out`);
  }
}

async function until(predicate, seconds = 30) {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`condition timed out after ${seconds}s`);
    await page.waitForTimeout(120);
  }
}

const run = (fn, arg) => page.evaluate(fn, arg);

async function waitForGame() {
  await page.waitForFunction(
    () => Boolean(globalThis.__game && typeof globalThis.__game.debugStats === 'function'),
    null,
    { timeout: 60_000 },
  );
  await sim(1);
}

async function clickSaveAndQuit() {
  await page.locator('[data-id="save-quit"]').click();
}

async function continueFromTitle() {
  await until(async () => page.locator('[data-id="continue"]').count(), 20);
  await page.locator('[data-id="continue"]').click();
  await until(
    () => page.evaluate(() => !globalThis.__game.titleScreen?.isOpen),
    30,
  );
}

try {
  await page.goto(`${BASE_URL}/${GAME_QUERY}`, { waitUntil: 'load' });
  await waitForGame();

  // Keep the run isolated from a previous harness execution. This is storage
  // setup, not a gameplay milestone, and never touches the FirstRunDirector.
  await run(async () => {
    const g = globalThis.__game.game;
    await Promise.all(['quicksave', 'first-run-calm', 'first-run-combat'].map((slot) => g.saves.delete(slot)));
  });

  const startSim = await simTime();
  const initial = await run(() => {
    const g = globalThis.__game.game;
    return {
      step: g.firstRun.current,
      blueprint: g.progression.turretBlueprintReady,
      canBuildGun: g.build.canBuildPiece('turret-manual'),
    };
  });
  check('a fresh boot starts on salvage', initial.step === 'salvage');
  check('the manual gun starts locked', !initial.blueprint && !initial.canBuildGun);

  // --- Salvage: real active crate, hook, open, loot event, and unlock ------
  await run(() => globalThis.__game.game.world.reset(90));
  await until(() => run(() => globalThis.__game.game.salvage.targets.length > 0), 20);
  const salvage = await run(() => {
    const g = globalThis.__game.game;
    const target = g.salvage.targets[0];
    if (!target) return { hooked: false, opened: false };
    const hooked = g.salvage.hook(target.id);
    const opened = hooked && g.salvage.open(target.id, (id, count) => g.resources.deposit(id, count));
    return {
      hooked,
      opened,
      step: g.firstRun.current,
      blueprint: g.progression.turretBlueprintReady,
    };
  });
  check('the live salvage crate can be hooked', salvage.hooked);
  check('opening the live crate advances salvage', salvage.opened && salvage.step === 'build-refinery');
  check('salvage grants the manual gun blueprint once', salvage.blueprint);

  // The fresh inventory plus the live salvage reward covers the loop. Every
  // structure below is paid for through BuildSystem.place with normal costs.
  const setup = await run(() => {
    const g = globalThis.__game.game;
    const cells = [
      { x: -4, y: 0, z: -6 },
      { x: -3, y: 0, z: -6 },
      { x: -2, y: 0, z: -6 },
      { x: -1, y: 0, z: -6 },
    ];
    const floors = cells.map((cell) => g.build.place({ piece: 'floor', cell, rotation: 0 }));
    const refinery = g.build.place({ piece: 'refinery', cell: cells[2], rotation: 0 });
    return {
      floors: floors.every(Boolean),
      refinery: refinery?.instanceId ?? null,
      step: g.firstRun.current,
    };
  });
  check('real floor placement supports the refinery', setup.floors && setup.refinery !== null);
  check('the refinery placement advances the objective', setup.step === 'refine-components');

  const crafted = await run(() => {
    const g = globalThis.__game.game;
    let completed = 0;
    for (let i = 0; i < 4; i++) if (g.crafting.craft('refine-components')) completed++;
    return {
      completed,
      components: g.resources.count('components'),
      step: g.firstRun.current,
    };
  });
  check('the powered refinery makes eight components in four batches', crafted.completed === 4);
  check(
    'eight crafted components advance the guided objective',
    crafted.components >= 8 && crafted.step === 'build-workbench',
    `${crafted.components} components`,
  );

  const bench = await run(() => {
    const g = globalThis.__game.game;
    const piece = g.build.place({
      piece: 'workbench',
      cell: { x: -3, y: 0, z: -6 },
      rotation: 0,
    });
    return { id: piece?.instanceId ?? null, step: g.firstRun.current };
  });
  check('the workbench is built through normal resource costs', bench.id !== null);
  check('the workbench advances the guided objective', bench.step === 'build-defense');

  const gun = await run(() => {
    const g = globalThis.__game.game;
    const piece = g.build.place({
      piece: 'turret-manual',
      cell: { x: -1, y: 0, z: -6 },
      rotation: 0,
    });
    return { id: piece?.instanceId ?? null, step: g.firstRun.current };
  });
  check('the unlocked manual gun mounts on a real floor', gun.id !== null);

  // Enter through Game's actual interaction path; only travel and aiming are
  // accelerated. The DOM controlled repair and title flows below still use E
  // and button clicks exactly as a player would.
  const turretPosition = await run((id) => {
    const g = globalThis.__game.game;
    const visual = g.build.turretVisual(id);
    if (!visual) return null;
    const at = visual.root.position.clone();
    visual.root.getWorldPosition(at);
    return { x: at.x + 1.2, y: at.y, z: at.z };
  }, gun.id);
  if (!turretPosition) throw new Error('manual gun has no world position');
  await run((position) => globalThis.__game.player.teleport(position), turretPosition);
  await sim(0.5);
  const mountedAt = await simTime();
  const openedTurret = await run((id) => {
    const g = globalThis.__game.game;
    return g.openInteractable({
      id,
      label: 'Manual Deck Gun',
      position: { x: 0, y: 0, z: 0 },
      kind: 'turret',
    });
  }, gun.id);
  check('the manual gun opens through the game interaction path', openedTurret);
  await until(() => run(() => globalThis.__game.game.defense.mounted), 10);
  const readiness = await run((mountedAtValue) => {
    const g = globalThis.__game.game;
    return {
      mounted: g.defense.mounted,
      step: g.firstRun.current,
      readyAt: g.tutorialReadyAt,
      delay: typeof g.tutorialReadyAt === 'number' ? g.tutorialReadyAt - mountedAtValue : -1,
    };
  }, mountedAt);
  check('the manual gun is crewed through the game interaction seam', readiness.mounted);
  check('crewing the gun enters the boarding objective', readiness.step === 'survive-boarding');
  check('the tutorial has a real fifteen-second simulated ready window', readiness.delay >= 14.9, `${readiness.delay}s`);

  // Damage the engine before the skiff so the actual repair interaction is
  // required after a successful hull defense.
  const damageBeforeBoarding = await run(() => {
    const g = globalThis.__game.game;
    const dealt = g.machine.damage.damage('engine', 35);
    return { dealt, damaged: g.machine.damage.fraction('engine') < 1 };
  });
  check('the acceptance run has a real damaged subsystem to repair', damageBeforeBoarding.dealt > 0 && damageBeforeBoarding.damaged);

  await sim(15.5);
  await until(() => run(() => globalThis.__game.game.vehicleManager.active), 30);
  const readyObserved = await run((mountedAtValue) => {
    const g = globalThis.__game.game;
    return {
      active: g.vehicleManager.active,
      sim: g.state.simTime,
      readyAt: g.tutorialReadyAt,
      waited: g.state.simTime - mountedAtValue,
    };
  }, mountedAt);
  check('the tutorial skiff starts after the ready window', readyObserved.active && readyObserved.waited >= 15);

  const boardingEvents = await run(() => {
    const g = globalThis.__game.game;
    globalThis.__firstRunHarness = { ended: [], killed: [] };
    g.bus.on('boarding:ended', (event) => globalThis.__firstRunHarness.ended.push(event));
    g.bus.on('enemy:killed', (event) => globalThis.__firstRunHarness.killed.push(event));
    return true;
  });
  void boardingEvents;

  // The hull is damaged through the real physics Damageable callback used by
  // the player weapon/turret path. No event is emitted by the harness.
  const damageHull = async () =>
    page.evaluate(() => {
      const g = globalThis.__game.game;
      const snapshot = g.vehicleManager.snapshot;
      if (!snapshot) return { ok: false, reason: 'no encounter' };
      const origin = g.player.worldPosition.clone().set(snapshot.lateral, 12, snapshot.forward);
      const direction = g.player.worldPosition.clone().set(0, -1, 0);
      const hit = g.physics.raycast(origin, direction, 30);
      const damageable = hit?.userData;
      if (!damageable || damageable.id !== 'skiff-hull') {
        return { ok: false, reason: damageable?.id ?? 'no hull hit' };
      }
      damageable.takeDamage(999);
      return { ok: true, id: damageable.id };
    });
  const hullHit = await until(async () => {
    const hit = await damageHull();
    return hit.ok ? hit : false;
  }, 30);
  await until(() => run(() => globalThis.__firstRunHarness.ended.length > 0), 30);
  const boarding = await run(() => ({
    ended: globalThis.__firstRunHarness.ended.at(-1),
    killed: globalThis.__firstRunHarness.killed.length,
    step: globalThis.__game.game.firstRun.current,
  }));
  check('the tutorial skiff hull is a live physics Damageable', hullHit.ok);
  check('hull defense reaches the tutorial terminal outcome', boarding.ended?.outcome === 'hull' && boarding.ended?.tutorial === true);
  check('the damaged boarding outcome enters repair', boarding.ended?.needsRepair === true && boarding.step === 'repair');
  check('the tutorial defense starts the normal recovery window',
    await run(() => globalThis.__game.game.director.currentPhase === 'recovery'));

  // Leave the gun using the same E control, then hold E at the engine panel.
  await page.keyboard.press('e');
  await until(() => run(() => !globalThis.__game.game.defense.mounted), 10);
  await run(() => {
    const g = globalThis.__game.game;
    g.player.teleport({ x: 0, y: 4.8, z: 4.4 });
  });
  await sim(0.5);
  await page.keyboard.down('e');
  await sim(2.3);
  await page.keyboard.up('e');
  await until(() => run(() => globalThis.__game.game.firstRun.isComplete), 15);
  const completed = await run(() => ({
    step: globalThis.__game.game.firstRun.current,
    engine: globalThis.__game.game.machine.damage.fraction('engine'),
  }));
  check('holding E at the real engine panel repairs the machine', completed.step === 'complete' && completed.engine === 1);

  const afterLoop = await simTime();
  check('the guided first run completes under 900 simulated seconds', afterLoop - startSim < 900, `${afterLoop - startSim}s`);

  // --- Calm Save & Quit, then Continue persistence ------------------------
  await run(() => {
    const g = globalThis.__game.game;
    const turret = g.defense.serialise()[0];
    if (!turret) throw new Error('missing turret runtime');
    // Aim while mounted; DefenseSystem intentionally ignores aim deltas when
    // no gun is occupied. Completion already disables the tutorial trigger,
    // so this remount cannot start a duplicate skiff.
    if (!g.defense.enter(turret.instanceId)) throw new Error('turret remount failed');
    g.defense.aim(0.4, 0.12);
    g.defense.exit();
    g.machine.power.restore({ fuel: 37 });
  });
  const beforeSave = await run(() => {
    const g = globalThis.__game.game;
    const turret = g.defense.serialise()[0];
    return {
      orientation: { yaw: turret?.yaw ?? 0, pitch: turret?.pitch ?? 0 },
      fuel: g.machine.power.fuel,
      complete: g.firstRun.isComplete,
    };
  });
  await run(() => globalThis.__game.game.pause());
  await until(() => run(() => globalThis.__game.game.titleScreen?.isOpen), 10);
  await clickSaveAndQuit();
  await until(() => run(() => globalThis.__game.game.titleScreen?.isOpen && !globalThis.__game.game.state.paused), 15);
  check('calm Save & Quit returns to the title after a successful write', true);

  await page.goto(`${BASE_URL}/${BOOT_QUERY}`, { waitUntil: 'load' });
  await waitForGame();
  await continueFromTitle();
  const continued = await run(() => {
    const g = globalThis.__game.game;
    const turret = g.defense.serialise()[0];
    return {
      complete: g.firstRun.isComplete,
      blueprint: g.progression.turretBlueprintReady,
      orientation: { yaw: turret?.yaw ?? 0, pitch: turret?.pitch ?? 0 },
      fuel: g.machine.power.fuel,
      tutorialActive: Boolean(g.vehicleManager.active),
    };
  });
  check('Continue restores the completed objective and blueprint', continued.complete && continued.blueprint);
  check(
    'Continue restores turret orientation and fuel',
      Math.abs(continued.orientation.yaw - beforeSave.orientation.yaw) < 1e-5 &&
      Math.abs(continued.orientation.pitch - beforeSave.orientation.pitch) < 1e-5 &&
      Math.abs(continued.fuel - beforeSave.fuel) < 0.1,
    JSON.stringify({ before: beforeSave, after: continued }),
  );
  await sim(16);
  check('Continue does not repeat the tutorial skiff', !(await run(() => globalThis.__game.game.vehicleManager.active)));

  // --- Combat Save & Quit queues visibly until the actual enemy is dead ----
  const enemyId = await run(() => {
    const g = globalThis.__game.game;
    g.enemySpawnsEnabled = false;
    const enemy = g.enemies.spawn('scavenger', { x: 0, y: 4.5, z: -8 });
    return enemy?.id ?? null;
  });
  check('a live enemy can be started for queued Save & Quit', enemyId !== null);
  await run(() => globalThis.__game.game.pause());
  await until(() => run(() => globalThis.__game.game.titleScreen?.isOpen), 10);
  await clickSaveAndQuit();
  const queued = await run(() => ({
    pending: globalThis.__game.game.pendingSaveAndQuit,
    paused: globalThis.__game.game.state.paused,
    warning: document.querySelector('#hud-warning')?.textContent ?? '',
    titleOpen: globalThis.__game.game.titleScreen?.isOpen ?? false,
  }));
  check('combat Save & Quit queues and resumes with visible feedback', queued.pending && !queued.paused && !queued.titleOpen && queued.warning.includes('Finish the attack'));

  const killed = await run((id) => {
    const enemy = globalThis.__game.enemies.active.find((candidate) => candidate.id === id);
    if (!enemy) return false;
    enemy.takeDamage(999);
    return true;
  }, enemyId);
  check('the queued save is released by an actual enemy kill', killed);
  await until(() => run(() => globalThis.__game.game.titleScreen?.isOpen), 30);
  check('queued Save & Quit reaches title after the enemy is cleared', true);

  // --- Failed storage keeps the game open and paused ----------------------
  await continueFromTitle();
  await run(() => globalThis.__game.game.pause());
  await until(() => run(() => globalThis.__game.game.titleScreen?.isOpen), 10);
  await run(() => {
    globalThis.__game.game.saves.save = async () => {
      throw new Error('first-run harness quota failure');
    };
  });
  await clickSaveAndQuit();
  await until(() => run(() => (document.querySelector('#title-status')?.textContent ?? '').includes('Save failed')), 15);
  const failedSave = await run(() => ({
    paused: globalThis.__game.game.state.paused,
    titleOpen: globalThis.__game.game.titleScreen?.isOpen,
    status: document.querySelector('#title-status')?.textContent ?? '',
  }));
  check('storage failure stays open and paused with feedback', failedSave.paused && failedSave.titleOpen && failedSave.status.includes('Save failed'));

  if (errors.length) {
    console.log(`\n${errors.length} console error(s):`);
    for (const error of errors.slice(0, 8)) console.log(` - ${error}`);
  }
  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} first-run checks passed`);
  if (failed.length || errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
