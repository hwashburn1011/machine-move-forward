/** MER-END: normal-input Meridian ending continuity runner. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const source = process.env.MMF_CONTINUITY_PROFILE;
if (!source) throw new Error('MMF_CONTINUITY_PROFILE is required');
const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5205/';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve('test-results', 'continuity-ending', `run-${stamp}`);
const profile = path.join(output, 'browser-profile');
await fs.mkdir(output, { recursive: true });
await fs.cp(path.resolve(source), profile, { recursive: true, errorOnExist: true });
const lineage = [];
const seen = new Set();
let lineageSource = path.resolve(source);
for (let depth = 0; depth < 64; depth += 1) {
  if (seen.has(lineageSource)) throw new Error(`cycle in ending provenance at ${lineageSource}`);
  seen.add(lineageSource);
  const summary = await fs
    .readFile(path.join(path.dirname(lineageSource), 'summary.json'), 'utf8')
    .then((text) => JSON.parse(text))
    .catch(() => null);
  if (!summary) break;
  const provenance = summary.events?.find((event) => event.type === 'provenance');
  lineage.push({ source: lineageSource, summary, provenance });
  if (!provenance?.source) break;
  lineageSource = path.resolve(provenance.source);
}
if (
  !lineage.some(
    ({ summary }) =>
      summary.status === 'passed' &&
      summary.final?.story?.completed?.includes('last-garden-meridian'),
  )
)
  throw new Error('MER-END requires ancestry to a passed Meridian checkpoint');

const url = new URL(site);
for (const key of ['seed', 'nospawn', 'nolock', 'nomenu', 'noload', 'nomodel', 'notex']) {
  if (url.searchParams.has(key)) throw new Error(`ending runner rejects URL override: ${key}`);
}
url.searchParams.set('quality', 'medium');
url.searchParams.set('nosound', '1');

const events = [];
const errors = [];
let context;
let page;
const record = async (type, detail = {}) => {
  const event = { at: new Date().toISOString(), type, ...detail };
  events.push(event);
  await fs.appendFile(path.join(output, 'events.jsonl'), `${JSON.stringify(event)}\n`);
};
const attachDiagnostics = () => {
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
};
const snapshot = () =>
  page.evaluate(() => {
    const g = globalThis.__game.game;
    const save = g.buildSave();
    return {
      seed: g.state.seed,
      profile: save.profile,
      simTime: g.state.simTime,
      distanceM: g.world.distanceTraveled,
      paused: g.state.paused,
      titleOpen: Boolean(g.titleScreen?.isOpen),
      pointerLocked: Boolean(document.pointerLockElement),
      safe: g.isSafeToSave(),
      player: g.player.worldPosition.toArray(),
      health: g.player.stats.health,
      needs: g.player.needs.toSave(),
      inventory: g.inventory.serialise(),
      equipment: save.player.equipment,
      upgrades: save.progression.upgrades,
      coreHealth: save.machine.coreHealth,
      resources: Object.fromEntries(
        ['scrap', 'components', 'fuel', 'water', 'greens', 'rations'].map((id) => [
          id,
          g.resources.count(id),
        ]),
      ),
      course: g.course.toSave(),
      power: {
        fuel: g.machine.power.fuel,
        burnRate: g.machine.power.effectiveFuelBurnPerSecond,
      },
      maxSpeed: g.machine.movement.maxSpeed,
      structures: g.build.serialise(),
      damage: g.machine.damage.toSave(),
      story: save.world.story,
      ending: g.ending.toSave(),
      destination: {
        active: g.destination.active,
        docked: g.destination.docked,
        playerOnMachine: g.destination.playerOnMachine(g.player.worldPosition),
      },
      authoredHorizon: Boolean(
        g.arrivalScene &&
        g.campaignArtReady(['meridian-horizon']) &&
        g.arrivalScene.ownedGeometry.length === 0 &&
        g.arrivalScene.root.children.length === 1,
      ),
      endingOverlay: Boolean(g.endingUI?.root && !g.endingUI.root.hidden),
      observed: globalThis.__endingContinuityEvents ?? [],
    };
  });

const settleCommittedJourney = async (label) => {
  await page.waitForFunction(
    () => {
      const g = globalThis.__game.game;
      return (
        g.ending.phase === 'committed' &&
        !g.state.paused &&
        !g.titleScreen?.isOpen &&
        !document.pointerLockElement
      );
    },
    null,
    { timeout: 15_000 },
  );
  await record('committed-journey-settled', { label, snapshot: await snapshot() });
};

const settlePlaying = async (label) => {
  await page.waitForFunction(
    () =>
      Boolean(document.pointerLockElement) &&
      !globalThis.__game.game.state.paused &&
      !globalThis.__game.game.titleScreen?.isOpen,
    null,
    { timeout: 30_000 },
  );
  await record('playing-settled', { label, snapshot: await snapshot() });
};
const faceWalk = async (target) => {
  for (let i = 0; i < 24; i += 1) {
    const error = await page.evaluate((at) => {
      const g = globalThis.__game.game;
      const p = g.player.worldPosition;
      const wanted = Math.atan2(-(at[0] - p.x), -(at[2] - p.z));
      const delta = Math.atan2(
        Math.sin(wanted - g.playerCamera.yawAngle),
        Math.cos(wanted - g.playerCamera.yawAngle),
      );
      return delta;
    }, target);
    if (Math.abs(error) < 0.014) return;
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
const moveAim = async (target) => {
  for (let i = 0; i < 24; i += 1) {
    const error = await page.evaluate((at) => {
      const g = globalThis.__game.game;
      const camera = g.playerCamera.camera;
      const dx = at[0] - camera.position.x;
      const dy = at[1] - camera.position.y;
      const dz = at[2] - camera.position.z;
      const wrap = (value) => Math.atan2(Math.sin(value), Math.cos(value));
      return {
        x: wrap(Math.atan2(-dx, -dz) - g.playerCamera.yawAngle),
        y: Math.atan2(dy, Math.hypot(dx, dz)) - g.playerCamera.pitchAngle,
      };
    }, target);
    if (Math.abs(error.x) < 0.012 && Math.abs(error.y) < 0.012) return;
    await page.evaluate(
      ({ x, y }) =>
        window.dispatchEvent(
          new MouseEvent('mousemove', {
            movementX: Math.max(-600, Math.min(600, -x / 0.0022)),
            movementY: Math.max(-350, Math.min(350, -y / 0.0022)),
            bubbles: true,
          }),
        ),
      error,
    );
    await page.waitForTimeout(50);
  }
};
const walkTo = async (target, label, radius = 1.3, timeoutMs = 30_000) => {
  const started = Date.now();
  try {
    while (Date.now() - started < timeoutMs) {
      const state = await page.evaluate((at) => {
        const p = globalThis.__game.game.player.worldPosition;
        return { distance: Math.hypot(p.x - at[0], p.z - at[2]), position: p.toArray() };
      }, target);
      if (state.distance <= radius) {
        await record('waypoint', { label, target, position: state.position });
        return state;
      }
      await faceWalk(target);
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(Math.min(180, Math.max(60, (state.distance - radius) * 180)));
      await page.keyboard.up('KeyW');
      await page.waitForTimeout(80);
    }
  } finally {
    await page.keyboard.up('KeyW').catch(() => {});
  }
  throw new Error(`walk ${label} timed out`);
};
const resumeIfPaused = async (label) => {
  if (
    await page
      .locator('button')
      .filter({ hasText: /^Resume$/ })
      .isVisible()
      .catch(() => false)
  ) {
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await settlePlaying(label);
  }
};
const placeKeepWalkingFloor = async () => {
  await page.waitForFunction(
    () => {
      const g = globalThis.__game.game;
      return g.isSafeToSave() && g.buildGuard.canEnter();
    },
    null,
    { timeout: 30_000 },
  );
  const before = await snapshot();
  await page.keyboard.press('KeyB');
  await page.locator('[data-category="structure"]').waitFor({ state: 'visible', timeout: 8_000 });
  await page.locator('[data-category="structure"]').click();
  await page.locator('[data-piece="floor"]').click();
  await page.waitForFunction(
    () => globalThis.__game.game.selectedPiece === 'floor' && document.pointerLockElement,
    null,
    { timeout: 8_000 },
  );
  const candidates = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const p = g.player.worldPosition;
    const out = [];
    for (let x = -5; x <= 5; x += 1)
      for (let z = -5; z <= 5; z += 1) {
        const placement = { piece: 'floor', cell: { x, y: 0, z }, rotation: 0 };
        if (!g.build.canPlace(placement).ok) continue;
        const world = g.build.constructor.transformFor(
          'floor',
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
    if (
      preview.validation?.ok &&
      !preview.target?.rejection &&
      preview.placement?.cell?.x === candidate.placement.cell.x &&
      preview.placement?.cell?.y === candidate.placement.cell.y &&
      preview.placement?.cell?.z === candidate.placement.cell.z
    ) {
      selected = { candidate, preview };
      break;
    }
  }
  if (!selected) throw new Error('Keep Walking exposed no camera-visible valid floor placement');
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(90);
  await page.mouse.up({ button: 'left' });
  await page.waitForFunction(
    (count) =>
      globalThis.__game.game.build.serialise().filter((piece) => piece.definitionId === 'floor')
        .length > count,
    before.structures.filter((piece) => piece.definitionId === 'floor').length,
    { timeout: 8_000 },
  );
  await page.keyboard.press('Escape');
  await settlePlaying('Keep Walking build complete');
  const after = await snapshot();
  if (before.resources.scrap - after.resources.scrap !== 8)
    throw new Error('Keep Walking floor did not consume the exact 8 scrap cost');
  for (const id of ['components', 'fuel', 'water', 'greens', 'rations'])
    if (before.resources[id] !== after.resources[id])
      throw new Error(`Keep Walking floor unexpectedly changed ${id}`);
  await record('keep-walking-floor-built', { before, selected, after });
};
const saveAndColdContinue = async (expectedPhase, label) => {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__game.game.state.paused, null, { timeout: 10_000 });
  const paused = await snapshot();
  const save = await page.evaluate(() => globalThis.__game.game.buildSave());
  await record(`${label}-paused`, { paused, save });
  await page.getByRole('button', { name: 'Save & Quit', exact: true }).click();
  await page
    .getByRole('button', { name: 'Continue', exact: true })
    .waitFor({ state: 'visible', timeout: 30_000 });
  const committed = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    const slot = await g.saves.latestSlot();
    return slot ? { slot, save: await g.saves.load(slot) } : null;
  });
  if (!committed) throw new Error(`${label}: no committed save`);
  if (JSON.stringify({ ...committed.save, savedAt: 0 }) !== JSON.stringify({ ...save, savedAt: 0 }))
    throw new Error(`${label}: committed payload differs from paused buildSave`);
  await fs.writeFile(
    path.join(output, `${label}-committed-save.json`),
    JSON.stringify(committed, null, 2),
  );
  await context.close();
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1280, height: 720 },
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  page = context.pages()[0] ?? (await context.newPage());
  attachDiagnostics();
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180_000 });
  await record('runtime-bundle', {
    phase: `${label}-cold-boot`,
    scripts: await page.evaluate(() =>
      [...document.scripts].map((script) => script.src).filter((src) => src.includes('/assets/')),
    ),
  });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(() => !globalThis.__game.game.titleScreen?.isOpen, null, {
    timeout: 30_000,
  });
  if (expectedPhase === 'committed') {
    await settleCommittedJourney(`${label}-cold-continue`);
  } else await settlePlaying(`${label}-cold-continue`);
  const restored = await snapshot();
  const failures = [];
  for (const key of [
    'seed',
    'profile',
    'health',
    'inventory',
    'equipment',
    'upgrades',
    'coreHealth',
    'resources',
    'story',
    'damage',
  ]) {
    if (JSON.stringify(restored[key]) !== JSON.stringify(paused[key]))
      failures.push(`${key} changed`);
  }
  if (!restored.story.completed.includes('last-garden-meridian'))
    failures.push('Meridian completion lost');
  if (restored.ending.phase !== expectedPhase)
    failures.push(`ending phase ${restored.ending.phase}`);
  const producerSpecs = new Map([
    ['condenser', { period: 90, capacity: 1 }],
    ['planter', { period: 150, capacity: 3 }],
  ]);
  const staticPiece = (piece) => {
    if (!producerSpecs.has(piece.definitionId)) return piece;
    const { state, ...rest } = piece;
    return rest;
  };
  const sorted = (pieces) =>
    pieces.map(staticPiece).sort((a, b) => a.instanceId.localeCompare(b.instanceId));
  if (JSON.stringify(sorted(restored.structures)) !== JSON.stringify(sorted(paused.structures)))
    failures.push('structure identity or nonproducer state changed');
  for (const key of ['tier', 'desiredDeg', 'throttle'])
    if (restored.course[key] !== paused.course[key]) failures.push(`course ${key} changed`);
  if (!Number.isFinite(restored.course.bearingDeg) || !Number.isFinite(restored.course.lateralM))
    failures.push('course projection became nonfinite');
  const elapsed = restored.simTime;
  const forwardM = restored.distanceM - paused.distanceM;
  // CourseController turns by at most 1.6 degrees per second. At tier 3
  // the lateral displacement cannot exceed forward travel (45-degree limit).
  if (Math.abs(restored.course.bearingDeg - paused.course.bearingDeg) > 1.6 * elapsed + 0.02)
    failures.push('course bearing exceeded normal elapsed turn');
  if (forwardM < -0.02 || forwardM > paused.maxSpeed * elapsed + 0.1)
    failures.push(`distance changed ${forwardM}`);
  if (Math.abs(restored.course.lateralM - paused.course.lateralM) > Math.max(0, forwardM) + 0.1)
    failures.push('course lateral position exceeded elapsed travel');
  for (const before of paused.structures.filter((piece) => producerSpecs.has(piece.definitionId))) {
    const after = restored.structures.find((piece) => piece.instanceId === before.instanceId);
    const spec = producerSpecs.get(before.definitionId);
    const oldState = before.state ?? {};
    const newState = after?.state ?? {};
    const gained =
      newState.stored * spec.period +
      newState.progress -
      (oldState.stored * spec.period + oldState.progress);
    if (
      !after ||
      !Number.isFinite(newState.progress) ||
      !Number.isInteger(newState.stored) ||
      newState.stored < oldState.stored ||
      newState.stored > spec.capacity ||
      gained < -0.02 ||
      gained > elapsed + 0.02
    )
      failures.push(`${before.definitionId} ${before.instanceId} advanced ${gained}s`);
  }
  const fuelSpent = paused.power.fuel - restored.power.fuel;
  if (!(elapsed >= 0 && elapsed <= 5)) failures.push(`cold elapsed ${elapsed}s`);
  if (fuelSpent < -0.02 || fuelSpent > paused.power.burnRate * elapsed + 0.02)
    failures.push(`fuel changed ${fuelSpent}`);
  for (const key of ['hydration', 'nourishment']) {
    const drained = paused.needs[key] - restored.needs[key];
    if (drained < -0.02 || drained > 0.1 * elapsed + 0.02)
      failures.push(`${key} changed ${drained}`);
  }
  if (failures.length) throw new Error(`${label} cold Continue mismatch: ${failures.join('; ')}`);
  await record(`${label}-restored`, { paused, restored });
  return restored;
};

try {
  await record('provenance', {
    source: path.resolve(source),
    profile,
    url: url.toString(),
    lineage: lineage.map(({ source: parent, summary, provenance }) => ({
      source: parent,
      status: summary.status,
      parent: provenance?.source ?? null,
    })),
    authority:
      'full-art normal input; no grants, teleports, fixed stepping, threat suppression, or state writes',
  });
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1280, height: 720 },
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  page = context.pages()[0] ?? (await context.newPage());
  attachDiagnostics();
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180_000 });
  await record('runtime-bundle', {
    phase: 'initial',
    scripts: await page.evaluate(() =>
      [...document.scripts].map((script) => script.src).filter((src) => src.includes('/assets/')),
    ),
  });
  const sourceSave = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    const slot = await g.saves.latestSlot();
    return slot ? { slot, save: await g.saves.load(slot) } : null;
  });
  await record('source-save-readonly', sourceSave);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(() => !globalThis.__game.game.titleScreen?.isOpen, null, {
    timeout: 30_000,
  });
  if ((await snapshot()).ending.phase === 'committed') {
    await settleCommittedJourney('resumed committed prerequisite');
  } else await settlePlaying('Meridian prerequisite');
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    globalThis.__endingContinuityEvents = [];
    for (const type of [
      'ending:committed',
      'ending:arrival',
      'ending:credits',
      'story:phase',
      'player:damaged',
      'weapon:fired',
    ])
      g.bus.on(type, (event) =>
        globalThis.__endingContinuityEvents.push({ type, event, simTime: g.state.simTime }),
      );
  });
  const initial = await snapshot();
  if (
    !initial.story.completed.includes('last-garden-meridian') ||
    !initial.story.recoveredUniques.includes('meridian-solution')
  )
    throw new Error('source does not prove completed Meridian and meridian-solution');
  if (initial.course.tier !== 3)
    throw new Error(`source course tier is ${initial.course.tier}, expected 3`);
  if (!initial.destination.playerOnMachine || initial.destination.active)
    throw new Error('source is not aboard with destination inactive');
  await record('meridian-prerequisite', { snapshot: initial });

  let committedState;
  if (initial.ending.phase === 'committed') {
    const prior = lineage
      .flatMap(({ summary }) => summary.events ?? [])
      .find(
        (event) =>
          event.type === 'ending-committed' &&
          event.snapshot?.ending?.committedAtDistance === initial.ending.committedAtDistance &&
          event.committedSave?.save?.world?.story?.ending?.phase === 'committed',
      );
    if (!prior)
      throw new Error(
        'committed resume lacks the recorded normal Helm confirmation and durable commitment',
      );
    committedState = initial;
    await record('ending-committed-resumed', { snapshot: initial, priorCommitAt: prior.at });
  } else if (initial.ending.phase === 'available') {
    const helm = await page.evaluate(() => {
      const g = globalThis.__game.game;
      if (!g.helmInteract) return null;
      const point = g.helmInteract.position.clone();
      g.helmInteract.getWorldPosition(point);
      return point.toArray();
    });
    if (!helm) throw new Error('live helm interaction point unavailable');
    await walkTo(helm, 'final-helm', 1.5);
    await page.keyboard.press('KeyE');
    await page
      .locator('[data-testid="helm-commit-ending"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
    const endingContext = await page.evaluate(
      () => globalThis.__game.game.endingContext?.() ?? null,
    );
    await record('ending-available', {
      context: endingContext,
      text: await page.locator('[data-testid="helm-commit-ending"]').innerText(),
    });
    const commitButton = page.locator('[data-testid="helm-commit-ending"]');
    if (await commitButton.isDisabled())
      throw new Error('ending commit disabled: prerequisite/refusal present');
    await commitButton.click();
    await page
      .getByRole('button', { name: 'Confirm final course', exact: true })
      .waitFor({ state: 'visible', timeout: 5_000 });
    await record('ending-confirmation', {
      text: await page
        .getByRole('button', { name: 'Confirm final course', exact: true })
        .innerText(),
    });
    await page.getByRole('button', { name: 'Confirm final course', exact: true }).click();
    await page.waitForFunction(() => globalThis.__game.game.ending.phase === 'committed', null, {
      timeout: 30_000,
    });
    committedState = await snapshot();
    if (
      committedState.ending.phase !== 'committed' ||
      committedState.ending.committedAtDistance === null
    )
      throw new Error(`ending commit did not persist: ${JSON.stringify(committedState.ending)}`);
    let committedSlot = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      committedSlot = await page.evaluate(async () => {
        const g = globalThis.__game.game;
        const slot = await g.saves.latestSlot();
        return slot ? { slot, save: await g.saves.load(slot) } : null;
      });
      if (committedSlot?.save?.world?.story?.ending?.phase === 'committed') break;
      await page.waitForTimeout(100);
    }
    if (
      !committedSlot?.save?.world?.story?.ending ||
      committedSlot.save.world.story.ending.phase !== 'committed'
    )
      throw new Error('committed ending checkpoint missing from persistent save');
    await fs.writeFile(
      path.join(output, 'ending-committed-save.json'),
      JSON.stringify(committedSlot, null, 2),
    );
    await record('ending-committed', { snapshot: committedState, committedSave: committedSlot });
  } else throw new Error(`unsupported source ending phase ${initial.ending.phase}`);

  const committedRestored = await saveAndColdContinue('committed', 'committed-ending');
  if (committedRestored.ending.committedAtDistance !== committedState.ending.committedAtDistance)
    throw new Error('committed ending checkpoint changed its journey origin on cold Continue');

  await page.waitForFunction(() => globalThis.__game.game.ending.phase === 'arrival', null, {
    timeout: 180_000,
  });
  const arrival = await snapshot();
  if (!arrival.authoredHorizon)
    throw new Error('arrival did not use the authored Meridian horizon');
  await record('ending-arrival', { snapshot: arrival });
  await page.screenshot({ path: path.join(output, 'meridian-arrival.png'), fullPage: true });
  await page.waitForFunction(() => globalThis.__game.game.ending.phase === 'credits', null, {
    timeout: 45_000,
  });
  if (!(await page.locator('[data-ending-keep]').isVisible()))
    throw new Error('Keep Walking is not visible in credits');
  await record('ending-credits', {
    snapshot: await snapshot(),
    text: await page.locator('.ending-credits').innerText(),
  });
  await page.screenshot({ path: path.join(output, 'meridian-credits.png'), fullPage: true });
  await page.locator('[data-ending-keep]').click();
  await page.waitForFunction(() => globalThis.__game.game.ending.phase === 'complete', null, {
    timeout: 15_000,
  });
  await resumeIfPaused('after Keep Walking');
  const completed = await snapshot();
  if (
    completed.ending.phase !== 'complete' ||
    !completed.story.completed.includes('last-garden-meridian')
  )
    throw new Error('Keep Walking did not complete ending');
  await record('ending-complete', { snapshot: completed });
  await faceWalk([0.7, completed.player[1], -1.5]);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1_000);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(150);
  const moved = await snapshot();
  if (
    Math.hypot(moved.player[0] - completed.player[0], moved.player[2] - completed.player[2]) < 0.5
  )
    throw new Error('Keep Walking did not return normal player movement');
  await record('keep-walking-moved', { before: completed, after: moved });
  await placeKeepWalkingFloor();
  await page.screenshot({ path: path.join(output, 'keep-walking-built.png'), fullPage: true });
  const restored = await saveAndColdContinue('complete', 'ending-complete');
  if (errors.length) throw new Error(errors.join('\n'));
  const summary = {
    status: 'passed',
    scope: 'Meridian final course, ordinary 400m arrival, credits/Keep Walking, and cold Continue',
    source: path.resolve(source),
    final: restored,
    events,
    errors,
  };
  await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
  process.stdout.write(JSON.stringify({ status: 'passed', output, final: restored }, null, 2));
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  await record('blocked', { message, snapshot: page ? await snapshot().catch(() => null) : null });
  await page
    ?.screenshot({ path: path.join(output, 'blocked.png'), fullPage: true })
    .catch(() => {});
  await fs.writeFile(
    path.join(output, 'summary.json'),
    JSON.stringify(
      { status: 'blocked', source: path.resolve(source), message, events, errors },
      null,
      2,
    ),
  );
  process.stderr.write(JSON.stringify({ status: 'blocked', output, message, errors }, null, 2));
  process.exitCode = 1;
} finally {
  await context?.close();
}
