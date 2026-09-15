/** Resume an accepted continuity profile and perform the real refinery loop. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5205/';
const profileRoot = process.env.MMF_CONTINUITY_PROFILE;
if (!profileRoot) throw new Error('Set MMF_CONTINUITY_PROFILE to an accepted run/browser-profile');
const profile = path.resolve(profileRoot);
const evidenceDir = path.join(path.dirname(profile), `first-loop-${Date.now()}`);
await fs.mkdir(evidenceDir, { recursive: true });
// A normal run may autosave before an automation failure. Work from a copied
// browser profile so every retry preserves the accepted source checkpoint.
const workingProfile = path.join(evidenceDir, 'browser-profile');
await fs.cp(profile, workingProfile, { recursive: true, errorOnExist: true });
const evidence = path.join(evidenceDir, 'events.jsonl');
const record = async (type, detail = {}) =>
  fs.appendFile(evidence, `${JSON.stringify({ at: new Date().toISOString(), type, ...detail })}\n`);

const context = await chromium.launchPersistentContext(workingProfile, {
  headless: true,
  viewport: { width: 640, height: 360 },
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = context.pages()[0] ?? (await context.newPage());
const errors = [];
page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

const snap = () =>
  page.evaluate(() => {
    const g = globalThis.__game.game;
    return {
      simTime: g.state.simTime,
      distanceM: g.world.distanceTraveled,
      health: g.player.stats.health,
      enemies: g.enemies.activeCount,
      vehicleActive: g.vehicleManager.active || g.vehicleScene.active,
      firstRun: g.firstRun.toSave(),
      story: g.story.toSave(),
      resources: ['scrap', 'components', 'fuel'].map((id) => [id, g.resources.count(id)]),
      pieces: g.build.serialise().map((p) => ({ id: p.instanceId, piece: p.definitionId, cell: p.cell })),
    };
  });

const moveLookTo = async (target) => {
  for (let i = 0; i < 10; i++) {
    const error = await page.evaluate((at) => {
      const g = globalThis.__game.game;
      const from = g.playerCamera.camera.position;
      const dx = at[0] - from.x,
        dy = at[1] - from.y,
        dz = at[2] - from.z;
      const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
      return {
        x: wrap(Math.atan2(-dx, -dz) - g.playerCamera.yawAngle),
        y: Math.atan2(dy, Math.hypot(dx, dz)) - g.playerCamera.pitchAngle,
      };
    }, target);
    if (Math.abs(error.x) < 0.01 && Math.abs(error.y) < 0.01) return;
    await page.evaluate(
      ({ x, y }) =>
        window.dispatchEvent(
          new MouseEvent('mousemove', {
            movementX: Math.max(-600, Math.min(600, -x / 0.0022)),
            movementY: Math.max(-350, Math.min(350, -y / 0.0022)),
          }),
        ),
      error,
    );
    await page.waitForTimeout(100);
  }
};

const choosePlacement = (piece) =>
  page.evaluate((pieceId) => {
    const g = globalThis.__game.game;
    const p = g.player.worldPosition;
    const candidates = [];
    for (let x = -5; x <= 5; x++)
      for (let z = -5; z <= 5; z++) {
        const placement = { piece: pieceId, cell: { x, y: 0, z }, rotation: 0 };
        if (!g.build.canPlace(placement).ok) continue;
        const local = p.clone().set(x * 2, 14.83, z * 2);
        const world = g.build.group.localToWorld(local);
        const distance = Math.hypot(world.x - p.x, world.z - p.z);
        if (distance >= 3 && distance <= 7) candidates.push({ placement, world: world.toArray(), distance });
      }
    return candidates.sort((a, b) => a.distance - b.distance);
  }, piece);

const placeFromCatalog = async (piece) => {
  await page.keyboard.press('KeyB');
  const category = piece === 'floor' ? 'structure' : 'station';
  await page.locator(`[data-category="${category}"]`).waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator(`[data-category="${category}"]`).click();
  await page.locator(`[data-piece="${piece}"]`).click();
  await page.waitForFunction(
    (id) => globalThis.__game.game.selectedPiece === id && document.pointerLockElement !== null,
    piece,
    { timeout: 5_000 },
  );
  const candidates = await choosePlacement(piece);
  if (candidates.length === 0) throw new Error(`No affordable clear placement candidate for ${piece}`);
  let candidate = null;
  for (const proposed of candidates) {
    await moveLookTo(proposed.world);
    await page.waitForTimeout(100);
    const preview = await page.evaluate(() => ({
      placement: globalThis.__game.game.buildPreview.placement,
      validation: globalThis.__game.game.buildPreview.validation,
      target: globalThis.__game.game.buildPreview.target,
    }));
    if (preview.placement?.piece === piece && preview.validation.ok && !preview.target?.rejection) {
      candidate = proposed;
      break;
    }
  }
  if (!candidate) throw new Error(`No camera-visible valid placement candidate for ${piece}`);
  const before = await snap();
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(100);
  await page.mouse.up({ button: 'left' });
  await page.waitForFunction(
    ({ id, count }) =>
      globalThis.__game.game.build.serialise().filter((p) => p.definitionId === id).length > count,
    { id: piece, count: before.pieces.filter((p) => p.piece === piece).length },
    { timeout: 5_000 },
  );
  await page.keyboard.press('Escape');
  const placed = (await snap()).pieces.filter((p) => p.piece === piece).at(-1);
  await record('placed', { piece, candidate, placed, before, after: await snap() });
  return { candidate, placed };
};

const approachAndOpen = async (piece, world) => {
  await moveLookTo(world);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(
    (id) => globalThis.__game.game.build.stationsNear(globalThis.__game.game.player.worldPosition, 1.8).some((s) => s.piece === id),
    piece,
    { timeout: 8_000 },
  );
  await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyE');
  await page.locator('#inv-panel').waitFor({ state: 'visible', timeout: 5_000 });
};

try {
  const url = new URL(site);
  url.searchParams.set('quality', 'low');
  url.searchParams.set('nosound', '1');
  url.searchParams.set('nomodel', '1');
  url.searchParams.set('notex', '1');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 180_000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(
    () => !globalThis.__game.game.titleScreen?.isOpen && globalThis.__game.game.progression.earlyRadioDrop.radioFound,
    null,
    { timeout: 60_000 },
  );
  await record('continued', { snapshot: await snap() });

  // Let the normal post-encounter build guard become calm.
  await page.waitForTimeout(2_500);
  await placeFromCatalog('floor');
  await page.waitForTimeout(2_500);
  const refinery = await placeFromCatalog('refinery');
  await approachAndOpen('refinery', refinery.candidate.world);
  for (let i = 0; i < 4; i++) {
    await page.locator('[data-recipe="refine-components"]').click();
    await page.waitForTimeout(100);
  }
  await record('components-refined', { snapshot: await snap() });
  await page.keyboard.press('Escape');

  await page.waitForTimeout(2_500);
  await placeFromCatalog('floor');
  await page.waitForTimeout(2_500);
  await placeFromCatalog('workbench');
  await page.waitForTimeout(2_500);
  await placeFromCatalog('floor');
  await page.waitForTimeout(2_500);
  const turret = await placeFromCatalog('turret-manual');
  await moveLookTo(turret.candidate.world);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(
    () =>
      globalThis.__game.game.build
        .stationsNear(globalThis.__game.game.player.worldPosition, 1.8)
        .some((s) => s.piece === 'turret-manual'),
    null,
    { timeout: 8_000 },
  );
  await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => globalThis.__game.game.defense.mounted, null, {
    timeout: 5_000,
  });
  await record('manual-defense-crewed', { snapshot: await snap() });
  await page.waitForFunction(
    () =>
      globalThis.__game.game.vehicleManager.active ||
      globalThis.__game.game.vehicleScene.active ||
      globalThis.__game.game.enemies.activeCount > 0,
    null,
    // Tutorial readiness uses simulation time; software-rendered runs can
    // advance it more slowly than wall time after the turret is crewed.
    { timeout: 120_000 },
  );
  await record('tutorial-boarding-begun', { snapshot: await snap() });
  const final = await snap();
  if (final.resources.find(([id]) => id === 'components')?.[1] < 1)
    throw new Error('Workbench loop did not conserve the expected remaining components');
  await record('first-build-loop-complete', { snapshot: final, errors });
  process.stdout.write(`${JSON.stringify({ status: 'passed', evidence, final, errors }, null, 2)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  await record('blocked', { message, snapshot: await snap().catch(() => null), errors });
  await page.screenshot({ path: path.join(evidenceDir, 'failure.png') }).catch(() => {});
  process.stderr.write(`${JSON.stringify({ status: 'blocked', evidence, message, errors }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await context.close();
}
