/**
 * Incremental uninterrupted-campaign runner.
 *
 * Slice 1 uses the real title/profile/opening/pause/save/Continue flow, then
 * catches the first drifting salvage and proves that reward through a second
 * Save & Quit/Continue. It never writes Game state.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5201/';
const fresh = process.argv.includes('--fresh');
if (!fresh)
  throw new Error(
    'continuity-story starts a new campaign and requires --fresh; resume its profile with continuity-first-loop.mjs',
  );
const fullArt = process.argv.includes('--full-art');
const headed = process.argv.includes('--headed');
const campaignProfile = process.env.MMF_CAMPAIGN_PROFILE ?? 'story';
if (campaignProfile !== 'story')
  throw new Error(`Unknown MMF_CAMPAIGN_PROFILE: ${campaignProfile}`);
const requestedSeed = process.env.MMF_CAMPAIGN_SEED?.trim();
if (process.env.MMF_CAMPAIGN_SEED !== undefined && !requestedSeed)
  throw new Error('MMF_CAMPAIGN_SEED must be a non-empty deterministic seed');
const requestedOut = path.resolve(
  process.env.MMF_CONTINUITY_OUT ?? 'test-results/continuity-story',
);
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
// Fresh runs always get a new child. This preserves every earlier failure and
// avoids deleting an environment-supplied path. Set MMF_CONTINUITY_OUT to an
// existing run child and omit --fresh to resume that browser lineage.
const out = fresh ? path.join(requestedOut, `run-${runStamp}`) : requestedOut;
const userDataDir = path.join(out, 'browser-profile');
const evidencePath = path.join(out, 'events.jsonl');
const summaryPath = path.join(out, 'summary.json');

await fs.mkdir(out, { recursive: true });

const events = [];
const errors = [];
const append = async (type, detail = {}) => {
  const event = { at: new Date().toISOString(), type, ...detail };
  events.push(event);
  await fs.appendFile(evidencePath, `${JSON.stringify(event)}\n`);
  return event;
};

const url = new URL(site);
url.searchParams.set('quality', 'low');
url.searchParams.set('nosound', '1');
// The seed chooses a fresh campaign at the title screen; it never rewrites a
// running game. Use the reproducible standard-campaign seed unless requested.
url.searchParams.set('seed', requestedSeed || 'continuity-story-v1');
// This first logical run is intentionally cheap and is not visual evidence.
// Full-art continuity uses the identical path with --full-art.
if (!fullArt) {
  url.searchParams.set('nomodel', '1');
  url.searchParams.set('notex', '1');
}

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: !headed,
  viewport: { width: 640, height: 360 },
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const pages = context.pages();
const page = pages[0] ?? (await context.newPage());
page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

const snapshot = () =>
  page.evaluate(() => {
    const g = globalThis.__game?.game;
    if (!g) return null;
    return {
      profile: g.campaignProfile,
      opening: g.opening.phase,
      armed: g.playerArmed,
      paused: g.state.paused,
      dead: g.state.playerDead,
      simTime: g.state.simTime,
      distanceM: g.world.distanceTraveled,
      health: g.player.stats.health,
      enemies: g.enemies.activeCount,
      pointerLocked: document.pointerLockElement === document.querySelector('canvas'),
      story: g.story.toSave(),
      firstRun: g.firstRun.toSave(),
      radio: g.progression.earlyRadioDrop.toSave(),
      weapons: g.combat.serialise(),
      weaponLedger: g.combat.all.map((weapon) => ({
        id: weapon.def.id,
        magazine: weapon.ammoInMag,
        reserve: weapon.reserveAmmo,
        infinite: weapon.infiniteReserve,
      })),
      inventory: g.inventory.serialise(),
      resources: {
        scrap: g.resources.count('scrap'),
        components: g.resources.count('components'),
        fuel: g.resources.count('fuel'),
      },
    };
  });

const saveSummary = async (status, blocker = null) => {
  const result = {
    generatedAt: new Date().toISOString(),
    status,
    boundary: 'first-salvage-save-continue',
    campaignProfile,
    fullArt,
    site,
    blocker,
    errors,
    final: await snapshot().catch(() => null),
    events,
  };
  await fs.writeFile(summaryPath, JSON.stringify(result, null, 2));
  return result;
};

/** Read targets, but defeat them only with the ordinary pointer/mouse/reload controls. */
const clearActiveAttack = async () => {
  const count = await page.evaluate(() => globalThis.__game.game.enemies.activeCount);
  if (count === 0) return true;
  // Save & Quit refusal resumes automatically. Opening pursuers that remained
  // on the receding rooftop may retire through normal simulation before the
  // player has to fire; give that production path a bounded chance to settle.
  const retired = await page
    .waitForFunction(() => globalThis.__game.game.enemies.activeCount === 0, null, {
      timeout: 12_000,
    })
    .then(
      () => true,
      () => false,
    );
  if (retired) return true;
  const menuOpen = await page.evaluate(() => globalThis.__game.game.titleScreen?.isOpen ?? false);
  if (menuOpen) {
    const resume = page.getByRole('button', { name: 'Resume', exact: true });
    await resume.click();
    await page.waitForFunction(() => !globalThis.__game.game.titleScreen?.isOpen, null, {
      timeout: 5_000,
    });
  }
  const canvas = page.locator('canvas').first();
  // A refused Save & Quit calls Game.resume(), whose pointer-lock callback is
  // what clears pause and restores the gameplay input context. Do not treat a
  // merely hidden menu as resumed; wait for that whole production transition.
  if (
    !(await page.evaluate(() => document.pointerLockElement === document.querySelector('canvas')))
  )
    await canvas.click({ position: { x: 320, y: 180 } });
  await page.waitForFunction(
    () =>
      document.pointerLockElement === document.querySelector('canvas') &&
      !globalThis.__game.game.state.paused &&
      !globalThis.__game.game.titleScreen?.isOpen,
    null,
    { timeout: 5_000 },
  );
  // The click which acquires lock also releases Game's held-fire suppression.
  await page.waitForTimeout(250);
  for (let shot = 0; shot < 20; shot++) {
    // Convert the nearest live target into angular error, then feed that error
    // through InputManager's normal mousemove path. Camera and enemy state are
    // read; neither is assigned by the harness. Firing itself remains trusted
    // Playwright mouse input so hit/damage/ammo stay wholly authoritative.
    for (let correction = 0; correction < 5; correction++) {
      const error = await page.evaluate(() => {
        const g = globalThis.__game.game;
        const target = g.enemies.active
          .slice()
          .sort(
            (a, b) =>
              a.worldPosition.distanceToSquared(g.player.worldPosition) -
              b.worldPosition.distanceToSquared(g.player.worldPosition),
          )[0];
        if (!target) return null;
        const dx = target.worldPosition.x - g.playerCamera.muzzleOrigin.x;
        const dy = target.worldPosition.y + 0.65 - g.playerCamera.muzzleOrigin.y;
        const dz = target.worldPosition.z - g.playerCamera.muzzleOrigin.z;
        const desiredYaw = Math.atan2(-dx, -dz);
        const desiredPitch = Math.atan2(dy, Math.hypot(dx, dz));
        const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
        return {
          yaw: wrap(desiredYaw - g.playerCamera.yawAngle),
          pitch: desiredPitch - g.playerCamera.pitchAngle,
        };
      });
      if (!error) return true;
      if (Math.abs(error.yaw) < 0.015 && Math.abs(error.pitch) < 0.015) break;
      const dx = Math.max(-300, Math.min(300, -error.yaw / 0.0022));
      const dy = Math.max(-160, Math.min(160, -error.pitch / 0.0022));
      await page.evaluate(
        ({ dx, dy }) =>
          window.dispatchEvent(
            new MouseEvent('mousemove', { movementX: dx, movementY: dy, bubbles: true }),
          ),
        { dx, dy },
      );
      await page.waitForTimeout(100);
    }
    const beforeShot = await page.evaluate(() => {
      const g = globalThis.__game.game;
      const target = g.enemies.active
        .slice()
        .sort(
          (a, b) =>
            a.worldPosition.distanceToSquared(g.player.worldPosition) -
            b.worldPosition.distanceToSquared(g.player.worldPosition),
        )[0];
      return target
        ? {
            targetHealth: target.currentHealth,
            target: target.worldPosition.toArray(),
            player: g.player.worldPosition.toArray(),
            yaw: g.playerCamera.yawAngle,
            pitch: g.playerCamera.pitchAngle,
            ammo: g.combat.presentation.ammoInMag,
          }
        : null;
    });
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(180);
    await page.mouse.up({ button: 'left' });
    const afterShot = await page.evaluate(() => ({
      enemies: globalThis.__game.game.enemies.activeCount,
      ammo: globalThis.__game.game.combat.presentation.ammoInMag,
    }));
    await append('combat-input', { shot, beforeShot, afterShot });
    await page.keyboard.press('KeyR');
    if ((await page.evaluate(() => globalThis.__game.game.enemies.activeCount)) === 0) return true;
  }
  return false;
};

const openPauseMenu = async () => {
  if (await page.evaluate(() => globalThis.__game.game.titleScreen?.isOpen ?? false)) return;
  if (
    !(await page.evaluate(() => document.pointerLockElement === document.querySelector('canvas')))
  ) {
    await page
      .locator('canvas')
      .first()
      .click({ position: { x: 320, y: 180 } });
    await page.waitForFunction(
      () => document.pointerLockElement === document.querySelector('canvas'),
      null,
      { timeout: 5_000 },
    );
  }
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save & Quit', exact: true }).waitFor({
    state: 'visible',
    timeout: 5_000,
  });
};

try {
  await append('launch', { url: url.toString(), fullArt, fresh });
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 180_000 });
  await page.getByRole('button', { name: 'New Game', exact: true }).waitFor({ timeout: 30_000 });
  await append('boot-ready', { snapshot: await snapshot() });

  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page.waitForFunction(
    (profile) =>
      globalThis.__game.game.campaignProfile === profile &&
      globalThis.__game.game.opening.phase === 'rooftop',
    campaignProfile,
    { timeout: 30_000 },
  );
  const selected = await snapshot();
  await append('profile-selected', { campaignProfile, snapshot: selected });

  // Watch the authored cinematic and let it hand back control naturally.
  if (
    !(await page.evaluate(() => document.pointerLockElement === document.querySelector('canvas')))
  ) {
    await page
      .locator('canvas')
      .first()
      .click({ position: { x: 320, y: 180 } });
    await page.waitForFunction(
      () => document.pointerLockElement === document.querySelector('canvas'),
      null,
      { timeout: 5_000 },
    );
  }
  await page.waitForFunction(
    () => globalThis.__game.game.opening.phase === 'done' && globalThis.__game.game.playerArmed,
    null,
    { timeout: 45_000 },
  );
  await append('opening-complete', {
    method: 'natural cinematic handoff',
    snapshot: await snapshot(),
  });

  // Release suppression settles before Escape is used as Pause.
  await page.waitForTimeout(500);
  await openPauseMenu();
  const saveButton = page.getByRole('button', { name: 'Save', exact: true });
  await saveButton.waitFor({ state: 'visible', timeout: 10_000 });
  await saveButton.click();
  await page.waitForFunction(
    async () => Boolean(await globalThis.__game.game.saves.load('quicksave')),
    null,
    { timeout: 15_000 },
  );
  const beforeQuit = await snapshot();
  // Landing may already have produced an autosave. Its existence cannot prove
  // that this pause-menu Save was admitted while an attack is active, so keep
  // the UI result and the runtime snapshot explicit instead of calling it a
  // durable manual checkpoint.
  await append('pause-save-attempt', {
    status: await page.locator('#title-status').textContent(),
    snapshot: beforeQuit,
  });

  await page.getByRole('button', { name: 'Save & Quit', exact: true }).click();
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  // IndexedDB completion and title transition are asynchronous. `isVisible`
  // is only a snapshot and its timeout option does not wait for visibility.
  const returnedToTitle = await continueButton.waitFor({ state: 'visible', timeout: 15_000 }).then(
    () => true,
    () => false,
  );
  if (!returnedToTitle) {
    const attackBefore = await page.evaluate(() => globalThis.__game.game.enemies.activeCount);
    await append('save-quit-refused', {
      reason: attackBefore > 0 ? 'active attack' : 'unknown admission refusal',
      enemies: attackBefore,
    });
    if (attackBefore === 0 || !(await clearActiveAttack()))
      throw new Error(`Save & Quit remained blocked; active enemies=${attackBefore}`);
    await append('attack-cleared-through-input', { snapshot: await snapshot() });
    await openPauseMenu();
    await page.getByRole('button', { name: 'Save & Quit', exact: true }).click();
  }
  await continueButton.waitFor({ timeout: 30_000 });
  await append('returned-to-title');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(
    () =>
      !globalThis.__game.game.titleScreen?.isOpen &&
      globalThis.__game.game.opening.phase === 'done' &&
      globalThis.__game.game.playerArmed,
    null,
    { timeout: 60_000 },
  );
  const restored = await snapshot();
  const durableMatch =
    restored?.profile === beforeQuit?.profile &&
    restored?.opening === 'done' &&
    restored?.armed === true &&
    JSON.stringify(restored?.story) === JSON.stringify(beforeQuit?.story) &&
    JSON.stringify(restored?.firstRun) === JSON.stringify(beforeQuit?.firstRun) &&
    JSON.stringify(restored?.inventory) === JSON.stringify(beforeQuit?.inventory) &&
    JSON.stringify(restored?.resources) === JSON.stringify(beforeQuit?.resources);
  if (!durableMatch) throw new Error('Continue did not restore the durable post-opening state');
  await append('continue-restored', { durableMatch, snapshot: restored });

  // Continue the same lineage into the first ordinary salvage catch. The
  // target position only informs mouse input; the throw, catch, payout and
  // radio grant all remain production Game behavior.
  await page.waitForFunction(
    () => (globalThis.__game?.game.salvage.targets.length ?? 0) > 0,
    null,
    {
      timeout: 30_000,
    },
  );
  await page.waitForFunction(
    () => {
      const g = globalThis.__game?.game;
      if (!g) return false;
      const p = g.player.worldPosition;
      return g.salvage.targets.some(
        (t) => Math.hypot(t.x - p.x, t.y - (p.y + 0.35), t.z - p.z) <= 33.5,
      );
    },
    null,
    { timeout: 15_000 },
  );
  for (let correction = 0; correction < 8; correction++) {
    const aim = await page.evaluate(() => {
      const g = globalThis.__game.game;
      const target = g.salvage.targets.slice().sort((a, b) => {
        const p = g.player.worldPosition;
        return (
          Math.hypot(a.x - p.x, a.y - (p.y + 0.35), a.z - p.z) -
          Math.hypot(b.x - p.x, b.y - (p.y + 0.35), b.z - p.z)
        );
      })[0];
      if (!target) return null;
      const p = g.player.worldPosition;
      const dx = target.x - p.x;
      const dy = target.y - (p.y + 0.35);
      const dz = target.z - p.z;
      const desiredYaw = Math.atan2(-dx, -dz);
      const desiredPitch = Math.atan2(dy, Math.hypot(dx, dz));
      const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
      return {
        id: target.id,
        target: [target.x, target.y, target.z],
        yawError: wrap(desiredYaw - g.playerCamera.yawAngle),
        pitchError: desiredPitch - g.playerCamera.pitchAngle,
        ready: g.reelReady,
      };
    });
    if (!aim) throw new Error('Early salvage target disappeared before reel input');
    if (aim.ready) break;
    await page.evaluate(
      ({ dx, dy }) =>
        window.dispatchEvent(
          new MouseEvent('mousemove', { movementX: dx, movementY: dy, bubbles: true }),
        ),
      {
        dx: Math.max(-500, Math.min(500, -aim.yawError / 0.0022)),
        dy: Math.max(-300, Math.min(300, -aim.pitchError / 0.0022)),
      },
    );
    await page.waitForTimeout(100);
  }
  const reelBefore = await snapshot();
  const reelReady = await page.evaluate(() => globalThis.__game.game.reelReady);
  if (!reelReady) throw new Error('Normal look input did not line up the first salvage target');
  await page.keyboard.press('KeyF');
  await page.waitForFunction(
    () =>
      globalThis.__game.game.progression.earlyRadioDrop.radioFound &&
      globalThis.__game.game.salvage.targets.length === 0,
    null,
    { timeout: 15_000 },
  );
  await append('first-salvage-recovered', {
    input: 'normal look plus KeyF',
    before: reelBefore,
    after: await snapshot(),
  });

  const afterSalvage = await snapshot();
  await openPauseMenu();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('#title-status')?.textContent?.trim() === 'Saved',
    null,
    { timeout: 15_000 },
  );
  await page.getByRole('button', { name: 'Save & Quit', exact: true }).click();
  await continueButton.waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(
    () =>
      !globalThis.__game.game.titleScreen?.isOpen &&
      globalThis.__game.game.progression.earlyRadioDrop.radioFound,
    null,
    { timeout: 60_000 },
  );
  const salvageRestored = await snapshot();
  const salvageDurable =
    salvageRestored?.radio?.status === 'found' &&
    JSON.stringify(salvageRestored?.inventory) === JSON.stringify(afterSalvage?.inventory) &&
    JSON.stringify(salvageRestored?.resources) === JSON.stringify(afterSalvage?.resources);
  if (!salvageDurable) throw new Error('Continue did not preserve first salvage and radio reward');
  await append('first-salvage-continue-restored', {
    durableMatch: salvageDurable,
    snapshot: salvageRestored,
  });

  const result = await saveSummary('passed');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  await append('blocked', { message }).catch(() => {});
  await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  const result = await saveSummary('blocked', message).catch(() => ({
    status: 'blocked',
    blocker: message,
  }));
  process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await context.close();
}
