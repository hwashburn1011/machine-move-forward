/**
 * Cohesion acceptance: earned Helm hardware and preservation exhibits.
 *
 * This route only uses an accepted ending profile, ordinary Continue/build/
 * interaction UI, and a real Save & Quit. It never grants facts or inventory.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const source = path.resolve(
  process.env.MMF_CONTINUITY_PROFILE ??
    'test-results/continuity-ending/run-2026-09-15T18-11-26-503Z/browser-profile',
);
const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5205/';
const assetRoot = process.env.MMF_ASSET_ROOT ? path.resolve(process.env.MMF_ASSET_ROOT) : null;
const output = path.resolve(
  process.env.MMF_QA_OUT ?? 'test-results/cohesion-acceptance',
  `run-${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
const profile = path.join(output, 'browser-profile');
const url = new URL(site);
for (const key of ['seed', 'nospawn', 'nolock', 'nomenu', 'noload', 'nomodel', 'notex'])
  if (url.searchParams.has(key)) throw new Error(`cohesion runner rejects URL override: ${key}`);
url.searchParams.set('quality', 'medium');
url.searchParams.set('nosound', '1');

const checks = [];
const errors = [];
const events = [];
let context;
let page;

const record = async (type, detail = {}) => {
  const event = { at: new Date().toISOString(), type, ...detail };
  events.push(event);
  await fs.appendFile(path.join(output, 'events.jsonl'), `${JSON.stringify(event)}\n`);
};
const assertCheck = (name, condition, detail = {}) => {
  const ok = Boolean(condition);
  checks.push({ name, ok, detail });
  if (!ok) throw new Error(`${name}: ${JSON.stringify(detail)}`);
};
const jsonEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const withoutSavedAt = (save) => (save ? { ...save, savedAt: 0 } : save);

const validateAcceptedEndingSource = async () => {
  const summaryPath = path.join(path.dirname(source), 'summary.json');
  const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
  assertCheck(
    'source is a passed completed-ending profile',
    summary.status === 'passed' &&
      summary.final?.ending?.phase === 'complete' &&
      summary.final?.story?.completed?.includes('last-garden-meridian'),
    { summaryPath, status: summary.status, phase: summary.final?.ending?.phase },
  );
  return summary;
};

const attachDiagnostics = () => {
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
};

const routeArchivedAssets = async () => {
  if (!assetRoot) return;
  await page.route(new URL('/**', site).toString(), async (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = path.resolve(assetRoot, pathname === '/' ? 'index.html' : pathname.slice(1));
    if (file !== assetRoot && !file.startsWith(assetRoot + path.sep)) return route.abort();
    const contentTypes = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.glb': 'model/gltf-binary',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.jpg': 'image/jpeg',
      '.wasm': 'application/wasm',
      '.woff2': 'font/woff2',
    };
    try {
      await route.fulfill({
        contentType: contentTypes[path.extname(file)] ?? 'application/octet-stream',
        body: await fs.readFile(file),
      });
    } catch {
      await route.fulfill({ status: 404, body: 'Not found' });
    }
  });
};

const launch = async () => {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1280, height: 720 },
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  page = context.pages()[0] ?? (await context.newPage());
  attachDiagnostics();
  await routeArchivedAssets();
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 180_000 });
};

const snapshot = () =>
  page.evaluate(() => {
    const g = globalThis.__game.game;
    const save = g.buildSave();
    const story = save.world.story;
    return {
      seed: save.seed,
      profile: save.profile,
      distanceM: g.world.distanceTraveled,
      paused: g.state.paused,
      titleOpen: Boolean(g.titleScreen?.isOpen),
      pointerLocked: Boolean(document.pointerLockElement),
      facts: [...(story?.recoveredUniques ?? [])],
      inventory: g.inventory.serialise(),
      resources: Object.fromEntries(
        ['scrap', 'components', 'fuel', 'water', 'greens', 'rations'].map((id) => [
          id,
          g.resources.count(id),
        ]),
      ),
      structures: g.build.serialise(),
      story,
      ending: g.ending.toSave(),
      hardware: [
        ['HelmActuator', 'course-actuator'],
        ['HelmGovernor', 'vector-governor'],
        ['HelmMeridian', 'meridian-solution'],
        ['HelmBearingNeedle', 'course-gyro'],
      ].map(([id, fact]) => {
        const node = g.navigationProgress?.root.getObjectByName(id);
        if (!node) return { id, fact, present: false, visible: false, inFrame: false };
        const world = node.getWorldPosition(node.position.clone());
        const projected = world.clone().project(g.playerCamera.camera);
        return {
          id,
          fact,
          present: true,
          visible: node.visible,
          inFrame:
            Math.abs(projected.x) <= 1 &&
            Math.abs(projected.y) <= 1 &&
            projected.z >= -1 &&
            projected.z <= 1,
        };
      }),
    };
  });

const settlePlaying = async (label) => {
  await page.waitForFunction(
    () =>
      Boolean(document.pointerLockElement) &&
      !globalThis.__game.game.state.paused &&
      !globalThis.__game.game.titleScreen?.isOpen,
    null,
    { timeout: 45_000 },
  );
  await record('playing-settled', { label });
};

const face = async (target) => {
  for (let i = 0; i < 30; i += 1) {
    const error = await page.evaluate((at) => {
      const g = globalThis.__game.game;
      const p = g.player.worldPosition;
      const wanted = Math.atan2(-(at[0] - p.x), -(at[2] - p.z));
      return Math.atan2(
        Math.sin(wanted - g.playerCamera.yawAngle),
        Math.cos(wanted - g.playerCamera.yawAngle),
      );
    }, target);
    if (Math.abs(error) < 0.015) return;
    await page.keyboard.up('KeyW').catch(() => {});
    await page.evaluate(
      (movementX) =>
        window.dispatchEvent(
          new MouseEvent('mousemove', { movementX, movementY: 0, bubbles: true }),
        ),
      Math.max(-500, Math.min(500, -error / 0.0022)),
    );
    await page.waitForTimeout(45);
  }
};

const walkTo = async (target, label, radius = 1.4) => {
  const started = Date.now();
  try {
    while (Date.now() - started < 45_000) {
      const distance = await page.evaluate((at) => {
        const p = globalThis.__game.game.player.worldPosition;
        return Math.hypot(p.x - at[0], p.z - at[2]);
      }, target);
      if (distance <= radius) {
        await record('waypoint', { label, target, distance });
        return;
      }
      await face(target);
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(Math.min(180, Math.max(70, distance * 130)));
      await page.keyboard.up('KeyW');
      await page.waitForTimeout(80);
    }
  } finally {
    await page.keyboard.up('KeyW').catch(() => {});
  }
  throw new Error(`${label}: walk timed out`);
};

const moveAim = async (target) => {
  for (let i = 0; i < 35; i += 1) {
    const error = await page.evaluate((at) => {
      const g = globalThis.__game.game;
      const camera = g.playerCamera.camera;
      const dx = at[0] - camera.position.x;
      const dy = at[1] - camera.position.y;
      const dz = at[2] - camera.position.z;
      const forward = camera.getWorldDirection(g.player.worldPosition.clone());
      const wrap = (value) => Math.atan2(Math.sin(value), Math.cos(value));
      return {
        yaw: wrap(Math.atan2(-dx, -dz) - Math.atan2(-forward.x, -forward.z)),
        pitch:
          Math.atan2(dy, Math.hypot(dx, dz)) -
          Math.atan2(forward.y, Math.hypot(forward.x, forward.z)),
      };
    }, target);
    if (Math.abs(error.yaw) < 0.012 && Math.abs(error.pitch) < 0.012) return;
    await page.evaluate(
      ({ yaw, pitch }) =>
        window.dispatchEvent(
          new MouseEvent('mousemove', {
            movementX: Math.max(-600, Math.min(600, -yaw / 0.0022)),
            movementY: Math.max(-350, Math.min(350, -pitch / 0.0022)),
            bubbles: true,
          }),
        ),
      error,
    );
    await page.waitForTimeout(50);
  }
  const projected = await page.evaluate((at) => {
    const g = globalThis.__game.game;
    return g.player.worldPosition
      .clone()
      .set(...at)
      .project(g.playerCamera.camera)
      .toArray();
  }, target);
  if (
    Math.abs(projected[0]) < 0.65 &&
    Math.abs(projected[1]) < 0.65 &&
    projected[2] > -1 &&
    projected[2] < 1
  ) {
    await record('aim-within-central-frame', { target, projected });
    return;
  }
  throw new Error(`aim did not converge on ${JSON.stringify({ target, projected })}`);
};

const placeShelf = async (before) => {
  await page.waitForFunction(
    () => globalThis.__game.game.isSafeToSave() && globalThis.__game.game.buildGuard.canEnter(),
    null,
    { timeout: 30_000 },
  );
  await page.keyboard.press('KeyB');
  await page.locator('[data-category="decor"]').waitFor({ state: 'visible', timeout: 8_000 });
  await page.locator('[data-category="decor"]').click();
  const shelfCard = page.locator('[data-piece="shelf"]');
  await shelfCard.waitFor({ state: 'visible', timeout: 8_000 });
  assertCheck('shelf recipe is affordable in the accepted profile', await shelfCard.isEnabled(), {
    resources: before.resources,
  });
  await shelfCard.click();
  await page.waitForFunction(
    () => globalThis.__game.game.selectedPiece === 'shelf' && Boolean(document.pointerLockElement),
    null,
    { timeout: 8_000 },
  );

  const candidates = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const p = g.player.worldPosition;
    const out = [];
    for (let x = -5; x <= 5; x += 1)
      for (let z = -5; z <= 5; z += 1)
        for (const rotation of [g.buildRotation ?? 0]) {
          const placement = { piece: 'shelf', cell: { x, y: 0, z }, rotation };
          if (!g.build.canPlace(placement).ok) continue;
          const world = g.build.constructor.transformFor(
            'shelf',
            placement.cell,
            placement.edge,
            placement.rotation,
          ).position;
          g.build.group.localToWorld(world);
          const distance = Math.hypot(world.x - p.x, world.z - p.z);
          if (distance >= 2.5 && distance <= 7)
            out.push({ placement, world: world.toArray(), distance });
        }
    return out.sort((a, b) => a.distance - b.distance);
  });

  let selected = null;
  for (const candidate of candidates) {
    await moveAim(candidate.world);
    await page.waitForTimeout(140);
    const preview = await page.evaluate(() => {
      const value = globalThis.__game.game.buildPreview;
      return { placement: value.placement, validation: value.validation, target: value.target };
    });
    await record('placement-preview', { candidate, preview });
    if (
      preview.placement?.piece === 'shelf' &&
      preview.validation?.ok &&
      !preview.target?.rejection &&
      preview.placement.cell?.x === candidate.placement.cell.x &&
      preview.placement.cell?.y === candidate.placement.cell.y &&
      preview.placement.cell?.z === candidate.placement.cell.z
    ) {
      selected = { candidate, preview };
      break;
    }
  }
  assertCheck('normal shelf preview exposes a camera-visible valid candidate', selected, {
    readonlyCandidates: candidates.length,
  });

  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(90);
  await page.mouse.up({ button: 'left' });
  const oldIds = before.structures.map((piece) => piece.instanceId);
  await page.waitForFunction(
    ({ count, oldIds }) => {
      const pieces = globalThis.__game.game.build.serialise();
      return (
        pieces.length === count + 1 && pieces.some((piece) => !oldIds.includes(piece.instanceId))
      );
    },
    { count: before.structures.length, oldIds },
    { timeout: 8_000 },
  );
  await page.keyboard.press('Escape');
  await settlePlaying('shelf build complete');

  const after = await snapshot();
  const additions = after.structures.filter((piece) => !oldIds.includes(piece.instanceId));
  assertCheck(
    'normal catalog adds exactly one shelf and preserves every existing structure',
    additions.length === 1 &&
      additions[0]?.definitionId === 'shelf' &&
      after.structures.length === before.structures.length + 1 &&
      oldIds.every((id) => after.structures.some((piece) => piece.instanceId === id)),
    { additions },
  );
  assertCheck(
    'shelf consumes the exact authored 5 scrap recipe',
    before.resources.scrap - after.resources.scrap === 5,
    { before: before.resources, after: after.resources },
  );
  for (const id of ['components', 'fuel', 'water', 'greens', 'rations'])
    assertCheck(
      `shelf recipe leaves ${id} unchanged`,
      before.resources[id] === after.resources[id],
      {
        before: before.resources[id],
        after: after.resources[id],
      },
    );
  await record('normal-shelf-built', { selected, addition: additions[0], before, after });
  return { id: additions[0].instanceId, after };
};

const shelfWorld = (id, height = 0) =>
  page.evaluate(
    ({ id, height }) => {
      const g = globalThis.__game.game;
      const object = g.build.group.getObjectByName(id);
      if (!object) return null;
      const world = object.getWorldPosition(object.position.clone());
      world.y += height;
      return world.toArray();
    },
    { id, height },
  );

const openShelf = async (id) => {
  const at = await shelfWorld(id);
  assertCheck('placed shelf has a named scene instance', at, { id });
  await walkTo(at, 'placed preservation shelf', 1.15);
  await moveAim(await shelfWorld(id, 1.45));
  await page.keyboard.press('KeyE');
  await page.locator('[data-keepsake-id]').first().waitFor({ state: 'visible', timeout: 8_000 });
};

const exhibitState = (id, expectedName) =>
  page.evaluate(
    ({ id, expectedName }) => {
      const g = globalThis.__game.game;
      const shelf = g.build.group.getObjectByName(id);
      const root = shelf?.getObjectByName('PreservationExhibits');
      const expected = root?.getObjectByName(expectedName);
      const visible = root
        ? root.children.filter((child) => child.visible).map((child) => child.name)
        : [];
      let inFrame = false;
      if (expected) {
        const world = expected.getWorldPosition(expected.position.clone());
        const projected = world.clone().project(g.playerCamera.camera);
        inFrame =
          Math.abs(projected.x) <= 1 &&
          Math.abs(projected.y) <= 1 &&
          projected.z >= -1 &&
          projected.z <= 1;
      }
      return {
        selected: g.build.instance(id)?.state?.factId ?? null,
        wrapperPresent: Boolean(shelf),
        exhibitsPresent: Boolean(root),
        visible,
        expectedVisible: Boolean(expected?.visible),
        inFrame,
      };
    },
    { id, expectedName },
  );

const selectAndCaptureExhibit = async (shelfId, factId, expectedName, label, reopen) => {
  const button = page.locator(`[data-keepsake-id="${factId}"]`);
  await button.waitFor({ state: 'visible', timeout: 8_000 });
  await button.click();
  await page.waitForFunction(
    ({ shelfId, factId, expectedName }) => {
      const g = globalThis.__game.game;
      const shelf = g.build.group.getObjectByName(shelfId);
      const exhibits = shelf?.getObjectByName('PreservationExhibits');
      return (
        g.build.instance(shelfId)?.state?.factId === factId &&
        exhibits?.children.filter((child) => child.visible).length === 1 &&
        exhibits.getObjectByName(expectedName)?.visible
      );
    },
    { shelfId, factId, expectedName },
    { timeout: 8_000 },
  );
  await page.keyboard.press('Escape');
  await settlePlaying(`${label} panel closed`);
  await moveAim(await shelfWorld(shelfId, 1.68));
  const state = await exhibitState(shelfId, expectedName);
  assertCheck(
    `${label} uses exactly one visible ${expectedName} exhibit`,
    state.selected === factId &&
      state.exhibitsPresent &&
      state.expectedVisible &&
      state.visible.length === 1 &&
      state.inFrame,
    state,
  );
  await page.screenshot({ path: path.join(output, `shelf-${label}.png`), fullPage: true });
  await record('preservation-exhibit', { label, factId, expectedName, state });
  if (reopen) await openShelf(shelfId);
};

const clearAndCaptureExhibit = async (shelfId) => {
  const clear = page.getByRole('button', { name: 'Clear selection', exact: true });
  await clear.waitFor({ state: 'visible', timeout: 8_000 });
  await clear.click();
  await page.waitForFunction(
    (id) => {
      const g = globalThis.__game.game;
      const shelf = g.build.group.getObjectByName(id);
      const exhibits = shelf?.getObjectByName('PreservationExhibits');
      const waveform = shelf?.getObjectByName('KeepsakeLit');
      const saved = g.build.serialise().find((piece) => piece.instanceId === id);
      return (
        saved &&
        !Object.prototype.hasOwnProperty.call(saved.state ?? {}, 'factId') &&
        exhibits?.children.length === 3 &&
        exhibits.children.every((child) => !child.visible) &&
        Boolean(waveform) &&
        !waveform.visible
      );
    },
    shelfId,
    { timeout: 8_000 },
  );
  await page.keyboard.press('Escape');
  await settlePlaying('empty shelf panel closed');
  await moveAim(await shelfWorld(shelfId, 1.68));
  const state = await page.evaluate((id) => {
    const g = globalThis.__game.game;
    const shelf = g.build.group.getObjectByName(id);
    const exhibits = shelf?.getObjectByName('PreservationExhibits');
    const waveform = shelf?.getObjectByName('KeepsakeLit');
    const saved = g.build.serialise().find((piece) => piece.instanceId === id);
    return {
      selected: g.build.instance(id)?.state?.factId ?? null,
      serializedState: saved?.state ?? null,
      serializedHasFactId: Object.prototype.hasOwnProperty.call(saved?.state ?? {}, 'factId'),
      exhibits: exhibits?.children.map((child) => ({
        name: child.name,
        visible: child.visible,
      })),
      waveformVisible: waveform?.visible ?? null,
    };
  }, shelfId);
  assertCheck(
    'Clear selection removes saved factId and hides all physical keepsakes',
    state.selected === null &&
      !state.serializedHasFactId &&
      state.exhibits?.length === 3 &&
      jsonEqual(state.exhibits.map((child) => child.name).sort(), [
        'PreservationCore',
        'PreservationRecord',
        'PreservationSeeds',
      ]) &&
      state.exhibits.every((child) => !child.visible) &&
      state.waveformVisible === false,
    state,
  );
  await page.screenshot({ path: path.join(output, 'shelf-empty.png'), fullPage: true });
  await record('preservation-exhibit-cleared', { state });
  await openShelf(shelfId);
};

try {
  await fs.mkdir(output, { recursive: true });
  const sourceSummary = await validateAcceptedEndingSource();
  await fs.cp(source, profile, { recursive: true, errorOnExist: true });
  await record('provenance', {
    source,
    sourceStatus: sourceSummary.status,
    profile,
    url: url.toString(),
    assetRoot,
    authority:
      'ordinary Continue, build catalog, shelf interaction, Pause Save & Quit, and cold Continue only',
  });

  await launch();
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await continueButton.waitFor({ state: 'visible', timeout: 20_000 });
  await continueButton.click();
  await settlePlaying('normal Continue');
  const initial = await snapshot();
  await record('normal-continue', { snapshot: initial });
  for (const fact of [
    'course-gyro',
    'course-actuator',
    'vector-governor',
    'meridian-solution',
    'human-seed-bank',
    'orchard-memory-core',
  ])
    assertCheck(
      `accepted profile already earned ${fact}`,
      initial.facts.includes(fact),
      initial.facts,
    );

  const helm = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const object = g.helmInteract;
    return object?.getWorldPosition
      ? object.getWorldPosition(object.position.clone()).toArray()
      : null;
  });
  assertCheck('Helm interaction has an authored world anchor', helm, {});
  for (const [index, waypoint] of [
    [0.7, 15.96, -1.5],
    [0.8, 15.96, -4.25],
    [-1.8, 15.96, -4.25],
  ].entries())
    await walkTo(waypoint, `Helm route ${index + 1}`, 0.22);
  await walkTo(helm, 'Helm interaction', 1.0);
  await moveAim([helm[0], helm[1] + 0.72, helm[2]]);
  const atHelm = await snapshot();
  assertCheck(
    'all four earned navigation modules are present and visible at the Helm',
    atHelm.hardware.every(
      (item) => item.present && item.visible && initial.facts.includes(item.fact),
    ),
    atHelm.hardware,
  );
  await page.screenshot({ path: path.join(output, 'helm-earned.png'), fullPage: true });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => globalThis.__game.game.helmUI?.isOpen, null, {
    timeout: 8_000,
  });
  await page.screenshot({ path: path.join(output, 'helm-interaction.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await settlePlaying('Helm panel closed');

  await walkTo([0.8, 15.96, -4.25], 'return to clear upper aisle', 0.22);
  await walkTo([0.8, 15.96, -1.5], 'open build approach', 0.22);

  const beforeShelf = await snapshot();
  const built = await placeShelf(beforeShelf);
  await openShelf(built.id);
  const recordFact = await page.evaluate(() => {
    const view = globalThis.__game.game.expeditionView();
    return [...(view.journalArchive ?? []), ...(view.extraJournals ?? [])][0]?.id ?? null;
  });
  assertCheck('accepted ending exposes a recovered journal record', recordFact, {});
  for (const factId of [recordFact, 'human-seed-bank', 'orchard-memory-core'])
    assertCheck(
      `normal shelf UI exposes ${factId}`,
      await page.locator(`[data-keepsake-id="${factId}"]`).isVisible(),
      { factId },
    );

  await selectAndCaptureExhibit(built.id, recordFact, 'PreservationRecord', 'journal-record', true);
  await selectAndCaptureExhibit(
    built.id,
    'human-seed-bank',
    'PreservationSeeds',
    'human-seed-bank',
    true,
  );
  await clearAndCaptureExhibit(built.id);
  await selectAndCaptureExhibit(
    built.id,
    'orchard-memory-core',
    'PreservationCore',
    'orchard-memory-core',
    false,
  );

  const selectedCore = await snapshot();
  assertCheck(
    'exhibit selection does not grant or consume inventory',
    jsonEqual(selectedCore.inventory, built.after.inventory) &&
      jsonEqual(selectedCore.resources, built.after.resources),
    {
      afterBuild: { inventory: built.after.inventory, resources: built.after.resources },
      selectedCore: { inventory: selectedCore.inventory, resources: selectedCore.resources },
    },
  );
  assertCheck(
    'exhibit selection does not change recovered facts',
    jsonEqual(selectedCore.facts, initial.facts),
    { initial: initial.facts, selected: selectedCore.facts },
  );

  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () =>
      globalThis.__game.game.state.paused &&
      globalThis.__game.game.titleScreen?.isOpen &&
      !document.pointerLockElement,
    null,
    { timeout: 10_000 },
  );
  const paused = await snapshot();
  const expectedSave = await page.evaluate(() => globalThis.__game.game.buildSave());
  const saveAndQuit = page.getByRole('button', { name: 'Save & Quit', exact: true });
  await saveAndQuit.waitFor({ state: 'visible', timeout: 10_000 });
  assertCheck('Save & Quit is enabled from the real pause menu', await saveAndQuit.isEnabled(), {});
  await saveAndQuit.click();
  await continueButton.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(
    () => globalThis.__game.game.titleScreen?.isOpen && !globalThis.__game.game.state.paused,
    null,
    { timeout: 30_000 },
  );
  const committed = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    return { latest: await g.saves.latestSlot(), save: await g.saves.load('quicksave') };
  });
  assertCheck(
    'Save & Quit commits the exact paused payload to quicksave',
    committed.latest === 'quicksave' &&
      committed.save &&
      jsonEqual(withoutSavedAt(committed.save), withoutSavedAt(expectedSave)),
    { latest: committed.latest },
  );
  await fs.writeFile(
    path.join(output, 'committed-quicksave.json'),
    JSON.stringify(committed.save, null, 2),
  );
  await record('save-and-quit-committed', { paused, latest: committed.latest });

  await context.close();
  context = null;
  await launch();
  const coldSlot = await page.evaluate(() => globalThis.__game.game.saves.latestSlot());
  assertCheck('cold boot still resolves Continue to quicksave', coldSlot === 'quicksave', {
    coldSlot,
  });
  const coldContinue = page.getByRole('button', { name: 'Continue', exact: true });
  await coldContinue.waitFor({ state: 'visible', timeout: 20_000 });
  await coldContinue.click();
  await settlePlaying('cold Continue');
  const restored = await snapshot();
  await moveAim(await shelfWorld(built.id, 1.68));
  const coldExhibit = await exhibitState(built.id, 'PreservationCore');
  await page.screenshot({ path: path.join(output, 'cold-continue-core.png'), fullPage: true });
  await record('cold-continue', { snapshot: restored, exhibit: coldExhibit });

  assertCheck(
    'cold Continue restores the committed seed and profile',
    restored.seed === committed.save.seed && restored.profile === committed.save.profile,
    {
      restored: { seed: restored.seed, profile: restored.profile },
      committed: { seed: committed.save.seed, profile: committed.save.profile },
    },
  );
  assertCheck(
    'cold Continue preserves the existing inventory ledger exactly',
    jsonEqual(restored.inventory, selectedCore.inventory) &&
      jsonEqual(restored.resources, selectedCore.resources),
    {
      before: { inventory: selectedCore.inventory, resources: selectedCore.resources },
      restored: { inventory: restored.inventory, resources: restored.resources },
    },
  );
  assertCheck(
    'cold Continue preserves recovered facts without grants',
    jsonEqual(restored.facts, initial.facts),
    { initial: initial.facts, restored: restored.facts },
  );
  const restoredShelf = restored.structures.find((piece) => piece.instanceId === built.id);
  assertCheck(
    'cold Continue restores the exact new shelf slot with the core selected',
    restoredShelf?.definitionId === 'shelf' &&
      restoredShelf.state?.factId === 'orchard-memory-core',
    { shelf: restoredShelf },
  );
  assertCheck(
    'cold Continue presents exactly one physical core exhibit',
    coldExhibit.selected === 'orchard-memory-core' &&
      coldExhibit.expectedVisible &&
      coldExhibit.visible.length === 1 &&
      coldExhibit.inFrame,
    coldExhibit,
  );
  assertCheck('acceptance produced no runtime errors', errors.length === 0, errors);
} catch (error) {
  errors.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
  await page
    ?.screenshot({ path: path.join(output, 'blocked.png'), fullPage: true })
    .catch(() => {});
} finally {
  await context?.close().catch(() => {});
}

const result = {
  status: errors.length || checks.some((check) => !check.ok) ? 'failed' : 'passed',
  scope:
    'ordinary earned Helm and shelf presentation, exact recipe, real Save & Quit, and cold Continue',
  checks,
  errors,
  events,
  output,
  source,
  assetRoot,
};
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'qa.json'), JSON.stringify(result, null, 2));
process.stdout.write(JSON.stringify(result, null, 2));
if (result.status === 'failed') process.exitCode = 1;
