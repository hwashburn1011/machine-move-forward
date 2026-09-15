/** ORCH-LATE: full-art, normal-input Glass Orchard caretaker-route continuity. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const source = process.env.MMF_CONTINUITY_PROFILE;
if (!source) throw new Error('MMF_CONTINUITY_PROFILE is required');
const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5205/';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve('test-results', 'continuity-orchard', `run-${stamp}`);
const profile = path.join(output, 'browser-profile');
const eventsPath = path.join(output, 'events.jsonl');
await fs.mkdir(output, { recursive: true });
await fs.cp(path.resolve(source), profile, { recursive: true, errorOnExist: true });
const lineage = [];
let lineageSource = path.resolve(source);
for (let depth = 0; depth < 10; depth += 1) {
  const evidence = await fs
    .readFile(path.join(path.dirname(lineageSource), 'summary.json'), 'utf8')
    .then((text) => JSON.parse(text))
    .catch(() => null);
  if (!evidence) break;
  const provenance = evidence.events?.find((event) => event.type === 'provenance');
  lineage.push({ evidence, provenance, source: lineageSource });
  if (!provenance?.source) break;
  lineageSource = path.resolve(provenance.source);
}
if (!lineage.some(({ evidence }) => evidence.status === 'passed' && evidence.stage === 'sustain'))
  throw new Error('ORCH-LATE requires ancestry to a passed sustain checkpoint');
const priorSkiffProof = lineage.some(({ evidence }) =>
  evidence.events?.some((event) => event.type === 'scripted-skiff-resolved'),
);
const priorCompletionProof = lineage.some(({ evidence }) =>
  evidence.events?.some((event) => event.type === 'orchard-departure'),
);

const url = new URL(site);
if (
  ['seed', 'nospawn', 'nolock', 'nomenu', 'noload', 'nomodel', 'notex'].some((key) =>
    url.searchParams.has(key),
  )
)
  throw new Error('ORCH-LATE requires an unmodified full-art campaign URL');
url.searchParams.set('quality', 'medium');
url.searchParams.set('nosound', '1');

const events = [];
const errors = [];
const record = async (type, detail = {}) => {
  const event = { at: new Date().toISOString(), type, ...detail };
  events.push(event);
  await fs.appendFile(eventsPath, `${JSON.stringify(event)}\n`);
};
const captureRouteClickFailure = async (label, error) => {
  const detail = await page.evaluate(() => {
    const selectors = [
      '.expedition-panel',
      '.expedition-panel-body',
      '[data-route-options]',
      '[data-route-card="orchard-caretaker"]',
      '[data-route="orchard-caretaker"]',
      '[data-expedition-logs]',
    ];
    const describe = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        tag: element.tagName,
        classes: element.className,
        text: element.textContent?.trim().slice(0, 240) ?? '',
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        style: {
          display: style.display,
          position: style.position,
          overflow: style.overflow,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          pointerEvents: style.pointerEvents,
          visibility: style.visibility,
          zIndex: style.zIndex,
        },
      };
    };
    const button = document.querySelector('[data-route="orchard-caretaker"]');
    const rect = button?.getBoundingClientRect();
    const center = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    const routeButtons = [...document.querySelectorAll('[data-route], [data-route-confirm]')].map(
      (routeButton) => {
        const buttonRect = routeButton.getBoundingClientRect();
        const buttonCenter = {
          x: buttonRect.left + buttonRect.width / 2,
          y: buttonRect.top + buttonRect.height / 2,
        };
        return {
          button: describe(routeButton),
          center: buttonCenter,
          elementsAtCenter: document
            .elementsFromPoint(buttonCenter.x, buttonCenter.y)
            .map((element) => describe(element)),
        };
      },
    );
    return {
      elements: Object.fromEntries(
        selectors.map((selector) => [selector, describe(document.querySelector(selector))]),
      ),
      buttonCenter: center,
      elementsAtButtonCenter: center
        ? document.elementsFromPoint(center.x, center.y).map((element) => describe(element))
        : [],
      routeButtons,
      pointerLockElement: document.pointerLockElement
        ? describe(document.pointerLockElement)
        : null,
      panelsOpen: globalThis.__game.game.panelsOpen,
      expeditionOpen: Boolean(globalThis.__game.game.expeditionUI?.isOpen),
      story: globalThis.__game.game.story.snapshot(globalThis.__game.game.world.distanceTraveled),
    };
  });
  const evidence = {
    label,
    error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    detail,
  };
  await fs.writeFile(
    path.join(output, 'route-click-diagnostics.json'),
    JSON.stringify(evidence, null, 2),
  );
  await page.screenshot({ path: path.join(output, 'route-click-failure.png'), fullPage: true });
  await record('route-click-failure', evidence);
};

let context;
let page;
let observedDeaths = [];
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
      phase: g.story.currentPhase,
      simTime: g.state.simTime,
      distanceM: g.world.distanceTraveled,
      paused: g.state.paused,
      safe: g.isSafeToSave(),
      health: g.player.stats.health,
      needs: g.player.needs.toSave(),
      player: g.player.worldPosition.toArray(),
      inventory: g.inventory.serialise(),
      resources: Object.fromEntries(
        ['scrap', 'components', 'fuel', 'water', 'greens', 'rations'].map((id) => [
          id,
          g.resources.count(id),
        ]),
      ),
      power: {
        fuel: g.machine.power.fuel,
        burnRate: g.machine.power.effectiveFuelBurnPerSecond,
        capacity: g.machine.power.capacity,
        draw: g.machine.power.draw,
      },
      maxSpeed: g.machine.movement.maxSpeed,
      story: save.world.story,
      legacyStory: g.story.legacyProjection(),
      course: g.course.toSave(),
      structures: g.build.serialise(),
      damage: g.machine.damage.toSave(),
      enemies: [...g.enemies.active]
        .sort(
          (a, b) =>
            a.worldPosition.distanceToSquared(g.player.worldPosition) -
            b.worldPosition.distanceToSquared(g.player.worldPosition),
        )
        .map((enemy) => ({
          id: enemy.id,
          position: enemy.worldPosition.toArray(),
          health: enemy.health,
        })),
      skiff: g.vehicleScene.active
        ? {
            active: true,
            phase: g.vehicleManager.snapshot?.phase ?? null,
            hook: g.vehicleScene.hookWorldPosition?.toArray?.() ?? null,
          }
        : { active: false, phase: null, hook: null },
      gunboat: g.gunboatScene.active
        ? {
            active: true,
            state: g.gunboatScene.snapshot,
            target: g.gunboatScene.getTargetPosition('hull')?.toArray?.() ?? null,
          }
        : { active: false, state: null, target: null },
      destination: {
        active: g.destination.active,
        docked: g.destination.docked,
        root: g.destination.root.position.toArray(),
        authored: Boolean(g.destination.root.userData.authored),
        colliders: g.destination.colliders.filter((collider) => collider.isEnabled()).length,
        gangwayEnabled: g.destination.gangwayEnabled,
        playerOnMachine: g.destination.playerOnMachine(g.player.worldPosition),
        interactables: g.destination.interactables.map((item) => ({
          id: item.id,
          kind: item.kind,
          position: item.position.toArray(),
        })),
      },
      observed: globalThis.__orchardContinuityEvents ?? [],
    };
  });

const settle = async (label) => {
  await page.waitForFunction(
    () => document.pointerLockElement && !globalThis.__game.game.state.paused,
    null,
    { timeout: 20_000 },
  );
  await record('active-settled', { label });
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
    await page.keyboard.up('KeyW').catch(() => {});
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
const faceWalk = async (target) => {
  for (let i = 0; i < 20; i += 1) {
    const error = await page.evaluate((at) => {
      const g = globalThis.__game.game;
      const p = g.player.worldPosition;
      const delta = Math.atan2(-(at[0] - p.x), -(at[2] - p.z)) - g.playerCamera.yawAngle;
      return Math.atan2(Math.sin(delta), Math.cos(delta));
    }, target);
    if (Math.abs(error) < 0.012) return;
    await page.keyboard.up('KeyW').catch(() => {});
    await page.evaluate(
      (movementX) =>
        window.dispatchEvent(
          new MouseEvent('mousemove', { movementX, movementY: 0, bubbles: true }),
        ),
      Math.max(-600, Math.min(600, -error / 0.0022)),
    );
    await page.waitForTimeout(45);
  }
};
const walkTo = async (target, label, radius = 1.1, timeoutMs = 40_000) => {
  const started = Date.now();
  try {
    while (Date.now() - started < timeoutMs) {
      const state = await page.evaluate((at) => {
        const p = globalThis.__game.game.player.worldPosition;
        return { distance: Math.hypot(p.x - at[0], p.z - at[2]), position: p.toArray() };
      }, target);
      if (state.distance <= radius) {
        await record('waypoint', { label, target, position: state.position });
        return;
      }
      await faceWalk(target);
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(Math.min(160, Math.max(55, (state.distance - radius) * 180)));
      await page.keyboard.up('KeyW');
      await page.waitForTimeout(70);
    }
  } finally {
    await page.keyboard.up('KeyW').catch(() => {});
  }
  throw new Error(`walk ${label} timed out`);
};

const defendEnemy = async (enemy) => {
  await page.mouse.down({ button: 'right' });
  await moveAim([enemy.position[0], enemy.position[1] + 0.3, enemy.position[2]]);
  const weapon = await page.evaluate(() => {
    const current = globalThis.__game.game.combat.current;
    return {
      ammoInMag: current.ammoInMag,
      reserveAmmo: current.reserveAmmo,
      infiniteReserve: current.infiniteReserve,
    };
  });
  if (weapon.ammoInMag <= 0 && (weapon.infiniteReserve || weapon.reserveAmmo > 0)) {
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => !globalThis.__game.game.combat.current.reloading, null, {
      timeout: 7_000,
    });
  }
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(350);
  await page.mouse.up({ button: 'left' });
  await page.mouse.up({ button: 'right' });
  await record('enemy-engaged', { enemy, snapshot: await snapshot() });
};
const awaitRespawn = async (label) => {
  await page.waitForFunction(
    () =>
      globalThis.__game.game.player.stats.health > 0 && !globalThis.__game.game.state.playerDead,
    null,
    { timeout: 15_000 },
  );
  await record('normal-respawn', { label, snapshot: await snapshot() });
};
const resolveSkiff = async () => {
  const deadline = Date.now() + 150_000;
  await record('skiff-defense-started', {
    method: 'normal rifle fire against landed boarders; no hook-cut completion claimed',
  });
  const takeFiringLane = async () => {
    const state = await snapshot();
    // The cabin fills x=1.5..5.295, z=-6.6..-2.36. The deck gun
    // occupies the rear entrance to its east aisle, so walk around the bow.
    if (state.player[0] < 5.7) {
      await walkTo([0.8, state.player[1], -7.7], 'defense-west-bow', 0.3);
      await walkTo([6.1, state.player[1], -7.7], 'defense-east-bow', 0.25);
    }
    await walkTo([6.1, state.player[1], -4.5], 'defense-starboard-view', 0.35);
  };
  await takeFiringLane();
  while (Date.now() < deadline) {
    const state = await snapshot();
    if (state.health <= 0) {
      await awaitRespawn('scripted-skiff');
      await takeFiringLane();
      continue;
    }
    if (!state.skiff.active && !state.enemies.length) {
      await record('scripted-skiff-resolved', { snapshot: state });
      await walkTo([6.1, state.player[1], -7.7], 'defense-return-east-bow', 0.25);
      await walkTo([0.8, state.player[1], -7.7], 'defense-return-west-bow', 0.3);
      await walkTo([0.8, state.player[1], -1.5], 'defense-return-open-aisle', 0.6);
      return;
    }
    if (state.enemies[0]) {
      await defendEnemy(state.enemies[0]);
      continue;
    }
    await page.waitForTimeout(250);
  }
  throw new Error('scripted Orchard skiff did not resolve through normal defense');
};
const resolveGunboat = async () => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const state = await snapshot();
    if (state.health <= 0) {
      await awaitRespawn('gunboat');
      continue;
    }
    if (!state.gunboat.active) {
      await record('ordinary-gunboat-resolved', { snapshot: state });
      return;
    }
    if (!state.gunboat.target) throw new Error('active gunboat exposed no hull target');
    const weapon = await page.evaluate(() => {
      const current = globalThis.__game.game.combat.current;
      return { ammoInMag: current.ammoInMag, reserveAmmo: current.reserveAmmo };
    });
    if (weapon.ammoInMag <= 0 && weapon.reserveAmmo > 0) {
      await page.keyboard.press('KeyR');
      await page.waitForFunction(() => !globalThis.__game.game.combat.current.reloading, null, {
        timeout: 7_000,
      });
    }
    await page.mouse.down({ button: 'right' });
    await moveAim(state.gunboat.target);
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(500);
    await page.mouse.up({ button: 'left' });
    await page.mouse.up({ button: 'right' });
  }
  throw new Error('ordinary gunboat did not resolve through normal fire');
};
const waitSafeToSave = async () => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const state = await snapshot();
    if (state.health <= 0) {
      await awaitRespawn('safe-save-clearance');
      continue;
    }
    if (state.skiff.active) {
      await resolveSkiff();
      continue;
    }
    if (state.gunboat.active) {
      await resolveGunboat();
      continue;
    }
    if (state.enemies[0]) {
      await defendEnemy(state.enemies[0]);
      continue;
    }
    if (state.safe && !state.paused) {
      await record('safe-save-boundary', { snapshot: state });
      return;
    }
    await page.waitForTimeout(300);
  }
  throw new Error('campaign did not reach a safe save boundary after Orchard departure');
};

const interact = async (id, type, approach = null, radius = 1.5) => {
  const before = await snapshot();
  const retained =
    (type === 'journal' && before.story.journalArchive.includes(id)) ||
    (type === 'objective' && before.story.active?.objectivesCompleted?.includes(id));
  if (retained) {
    await record(`orchard-${type}-retained`, { id, snapshot: before });
    return;
  }
  const item = before.destination.interactables.find((candidate) => candidate.id === id);
  const factId =
    type === 'unique'
      ? await page.evaluate(
          (wanted) => globalThis.__game.game.destination.factForInteractable(wanted),
          id,
        )
      : null;
  if (type === 'unique' && factId && before.story.recoveredUniques.includes(factId)) {
    await record('orchard-unique-retained', { id, factId, snapshot: before });
    return;
  }
  if (!item) throw new Error(`missing Orchard interactable ${id}`);
  if (approach) await walkTo(approach, `${id}-approach`, 0.6);
  await walkTo(item.position, id, radius);
  await moveAim(item.position);
  await page.waitForFunction(
    (wanted) => globalThis.__game.game.interaction.current?.id === wanted,
    id,
    { timeout: 8_000 },
  );
  await page.keyboard.press('KeyE');
  if (type === 'journal') {
    await page.waitForFunction(
      (wanted) => globalThis.__game.game.story.snapshot(0).journalArchive.includes(wanted),
      id,
      { timeout: 10_000 },
    );
    await page.keyboard.press('Escape');
    await settle(`${id}-close`);
  } else if (type === 'objective') {
    await page.waitForFunction(
      (wanted) => globalThis.__game.game.story.snapshot(0).completedObjectives.includes(wanted),
      id,
      { timeout: 10_000 },
    );
  } else {
    if (!factId) throw new Error(`missing fact mapping for ${id}`);
    await page.waitForFunction(
      (wanted) => globalThis.__game.game.story.snapshot(0).recoveredUniques.includes(wanted),
      factId,
      { timeout: 10_000 },
    );
  }
  await record(`orchard-${type}`, { id, before, after: await snapshot() });
};

const saveAndColdContinue = async () => {
  await waitSafeToSave();
  await page.screenshot({
    path: path.join(output, 'orchard-final-checkpoint.png'),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__game.game.state.paused, null, { timeout: 10_000 });
  const paused = await snapshot();
  const checkpoint = await page.evaluate(() => globalThis.__game.game.buildSave());
  await record('checkpoint-precommit', { paused, checkpoint });
  await page.getByRole('button', { name: 'Save & Quit', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).waitFor({
    state: 'visible',
    timeout: 25_000,
  });
  const committed = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    const slot = await g.saves.latestSlot();
    return slot ? { slot, save: await g.saves.load(slot) } : null;
  });
  if (
    !committed ||
    JSON.stringify({ ...committed.save, savedAt: 0 }) !==
      JSON.stringify({ ...checkpoint, savedAt: 0 })
  )
    throw new Error('committed Orchard save differs from paused checkpoint');
  await fs.writeFile(path.join(output, 'committed-save.json'), JSON.stringify(committed, null, 2));
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
    phase: 'cold-continue',
    scripts: await page.evaluate(() =>
      [...document.scripts].map((script) => script.src).filter((src) => src.includes('/assets/')),
    ),
  });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(() => !globalThis.__game.game.titleScreen?.isOpen, null, {
    timeout: 30_000,
  });
  await settle('orchard-cold-continue');
  const restored = await snapshot();
  const failures = [];
  for (const key of ['seed', 'profile', 'health', 'inventory', 'resources', 'story', 'damage'])
    if (JSON.stringify(restored[key]) !== JSON.stringify(paused[key]))
      failures.push(`${key} changed`);
  const producer = new Map([
      ['condenser', { period: 90, capacity: 1 }],
      ['planter', { period: 150, capacity: 3 }],
    ]),
    staticPiece = (piece) => {
      if (!producer.has(piece.definitionId)) return piece;
      const { state, ...withoutState } = piece;
      return withoutState;
    },
    sortedStatic = (pieces) =>
      pieces.map(staticPiece).sort((a, b) => a.instanceId.localeCompare(b.instanceId));
  if (
    JSON.stringify(sortedStatic(restored.structures)) !==
    JSON.stringify(sortedStatic(paused.structures))
  )
    failures.push('structure identity or nonproducer state changed');
  for (const key of ['tier', 'desiredDeg', 'throttle'])
    if (restored.course[key] !== checkpoint.machine.course[key])
      failures.push(`course ${key} changed`);
  const elapsed = restored.simTime;
  const distanceDelta = restored.distanceM - checkpoint.distanceTraveled;
  const fuelDelta = checkpoint.machine.fuel - restored.power.fuel;
  if (!(elapsed >= 0 && elapsed <= 5)) failures.push(`elapsed ${elapsed}s`);
  for (const saved of paused.structures.filter((piece) => producer.has(piece.definitionId))) {
    const live = restored.structures.find((piece) => piece.instanceId === saved.instanceId),
      spec = producer.get(saved.definitionId),
      before = saved.state ?? {},
      after = live?.state ?? {},
      gained =
        after.stored * spec.period +
        after.progress -
        (before.stored * spec.period + before.progress);
    if (
      !live ||
      !Number.isFinite(after.progress) ||
      !Number.isInteger(after.stored) ||
      after.stored < before.stored ||
      after.stored > spec.capacity ||
      gained < -0.02 ||
      gained > elapsed + 0.02
    )
      failures.push(`${saved.definitionId} ${saved.instanceId} advanced ${gained}s in ${elapsed}s`);
  }
  if (distanceDelta < -0.02 || distanceDelta > paused.maxSpeed * elapsed + 0.1)
    failures.push(`distance changed ${distanceDelta}m`);
  if (fuelDelta < -0.02 || fuelDelta > paused.power.burnRate * elapsed + 0.02)
    failures.push(`fuel changed ${fuelDelta}`);
  for (const key of ['hydration', 'nourishment']) {
    const drained = checkpoint.player.needs[key] - restored.needs[key];
    if (drained < -0.02 || drained > 0.1 * elapsed + 0.02)
      failures.push(`${key} changed ${drained}`);
  }
  if (failures.length) throw new Error(`Orchard cold Continue mismatch: ${failures.join('; ')}`);
  await record('checkpoint-restored', { checkpoint, restored });
  return restored;
};

try {
  await record('provenance', {
    source: path.resolve(source),
    profile,
    url: url.toString(),
    lineage: lineage.map(({ evidence, provenance, source: lineageProfile }) => ({
      profile: lineageProfile,
      status: evidence.status,
      stage: evidence.stage ?? provenance?.stage ?? null,
      parent: provenance?.source ?? null,
    })),
    authority:
      'full-art normal input; no grants, fixed stepping, encounter suppression, or state writes',
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
    return slot ? { slot, data: await g.saves.load(slot) } : null;
  });
  if (!sourceSave?.data?.world?.story?.completed?.includes('quiet-array'))
    throw new Error('source is not a completed Quiet Array recovery checkpoint');
  await record('source-save-readonly', sourceSave);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(() => !globalThis.__game.game.titleScreen?.isOpen, null, {
    timeout: 30_000,
  });
  await settle('source-continue');
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    globalThis.__orchardContinuityEvents = [];
    for (const type of [
      'story:phase',
      'story:docked',
      'story:unique-collected',
      'story:expedition-complete',
      'boarding:started',
      'boarding:ended',
      'enemy:spawned',
      'enemy:killed',
      'player:damaged',
      'player:died',
      'player:respawned',
      'machine:damaged',
      'weapon:fired',
    ])
      g.bus.on(type, (event) =>
        globalThis.__orchardContinuityEvents.push({ type, event, simTime: g.state.simTime }),
      );
  });
  const initial = await snapshot();
  const completedInitially = initial.story.completed.includes('glass-orchard');
  const resumedActive = initial.story.active?.expeditionId === 'glass-orchard';
  if (
    !completedInitially &&
    !resumedActive &&
    (initial.phase !== 'complete' ||
      initial.destination.active ||
      !initial.destination.playerOnMachine)
  )
    throw new Error(`source is not a safe pre-Orchard boundary: ${JSON.stringify(initial)}`);
  const routeSelectionResume =
    resumedActive && initial.phase === 'route-selection' && initial.story.active.routeId === null;
  if (
    resumedActive &&
    !routeSelectionResume &&
    (initial.story.active.routeId !== 'orchard-caretaker' ||
      !['approach', 'braking', 'docked'].includes(initial.phase))
  )
    throw new Error(
      `source contains an incompatible active Orchard route: ${JSON.stringify(initial)}`,
    );
  if (completedInitially && (!priorSkiffProof || !priorCompletionProof))
    throw new Error('completed Orchard resume lacks prior skiff and physical-departure evidence');
  const radio = await page.evaluate(() => globalThis.__game.game.radioWorldPosition.toArray());
  if (!completedInitially) {
    if (!resumedActive || routeSelectionResume) {
      const deckY = initial.player[1];
      await walkTo([4.2, deckY, -1.5], 'radio-clear-kitchen', 0.8);
      await walkTo([0.7, deckY, -1.5], 'radio-open-aisle', 0.8);
      if (routeSelectionResume) {
        const helm = await page.evaluate(() => {
          const g = globalThis.__game.game;
          if (!g.helmInteract) return null;
          const point = g.helmInteract.position.clone();
          g.helmInteract.getWorldPosition(point);
          return point.toArray();
        });
        if (!helm) throw new Error('route-selection resume could not find the live helm');
        await walkTo(helm, 'orchard-route-resume-helm', 1.4);
        await page.keyboard.press('KeyE');
        await record('orchard-route-selection-resumed', { snapshot: await snapshot() });
      } else {
        await walkTo(radio, 'orchard-radio', 1.5);
        await page.keyboard.press('KeyE');
        await page
          .locator('[data-radio-trace-button]')
          .waitFor({ state: 'visible', timeout: 15_000 });
        const offer = await page.locator('[data-panel="radio"]').innerText();
        if (!/glass orchard/i.test(offer)) throw new Error(`Glass Orchard offer missing: ${offer}`);
        await record('orchard-offer', { offer, snapshot: await snapshot() });
        await page.locator('[data-radio-trace-button]').click();
      }
      await page
        .locator('[data-route="orchard-caretaker"]')
        .waitFor({ state: 'visible', timeout: 20_000 });
      const routeCard = await page.locator('[data-route-card="orchard-caretaker"]').innerText();
      if (!/900\s*m/i.test(routeCard) || !/skiff/i.test(routeCard) || !/420\s*m/i.test(routeCard))
        throw new Error(
          `caretaker route card did not disclose its distance and encounter: ${routeCard}`,
        );
      await record('orchard-route-card', { text: routeCard });
      try {
        await page.locator('[data-route="orchard-caretaker"]').click();
        await page.locator('[data-route-confirm="orchard-caretaker"]').click();
      } catch (error) {
        await captureRouteClickFailure('caretaker-route-select-or-confirm', error);
        throw error;
      }
      await page.waitForFunction(
        () => {
          const state = globalThis.__game.game.story.snapshot(0);
          return (
            state.expeditionId === 'glass-orchard' &&
            state.routeId === 'orchard-caretaker' &&
            state.phase === 'approach'
          );
        },
        null,
        { timeout: 20_000 },
      );
      if (
        await page
          .locator('[data-panel="expedition"]')
          .isVisible()
          .catch(() => false)
      )
        await page.keyboard.press('Escape');
      await settle('orchard-route-selected');
      await record('orchard-route-accepted', { routeCard, snapshot: await snapshot() });
    } else {
      await record('orchard-route-resumed', { snapshot: initial, priorSkiffProof });
    }
    const travelDeadline = Date.now() + 12 * 60_000;
    let sawSkiff = priorSkiffProof;
    while (Date.now() < travelDeadline) {
      const state = await snapshot();
      if (state.destination.docked) break;
      if (state.health <= 0) {
        await awaitRespawn('orchard-approach');
        continue;
      }
      if (state.paused) throw new Error('unexpected pause during Orchard approach');
      if (state.skiff.active) {
        sawSkiff = true;
        await resolveSkiff();
        continue;
      }
      if (state.gunboat.active) {
        await resolveGunboat();
        continue;
      }
      if (state.enemies[0]) {
        await defendEnemy(state.enemies[0]);
        continue;
      }
      await page.waitForTimeout(750);
    }
    const docked = await snapshot();
    sawSkiff ||= docked.observed.some(
      (event) => event.type === 'boarding:started' && event.event?.encounterId === 'skiff',
    );
    if (!docked.destination.docked || !docked.destination.authored)
      throw new Error(`full-art Orchard did not dock: ${JSON.stringify(docked)}`);
    if (!sawSkiff || docked.story.active?.scriptedEncounter !== 'resolved')
      throw new Error('caretaker route scripted skiff was not observed and resolved');
    await record('orchard-docked', { snapshot: docked });
    await page.screenshot({ path: path.join(output, 'orchard-docked.png'), fullPage: true });

    const root = docked.destination.root;
    const local = (x, z, y = 0) => [root[0] + x, root[1] + y, root[2] + z];
    const machineAisle = [
      [0.7, root[1], root[2] - 1.5],
      [4.2, root[1], root[2] - 1.5],
      [4.2, root[1], root[2]],
      [5.8, root[1], root[2]],
    ];
    if (docked.destination.playerOnMachine) {
      for (let i = 0; i < machineAisle.length; i += 1)
        await walkTo(machineAisle[i], `machine-to-orchard-${i + 1}`, 1.1);
      await walkTo(local(-9.5, 0), 'orchard-gangway', 1.2);
      await walkTo(local(-7.8, 0), 'orchard-entry', 0.7);
      await walkTo(local(-5, 0), 'orchard-center-aisle', 0.7);
    } else {
      const saved = docked.story;
      if (saved.recoveredUniques.includes('vector-governor')) {
        await walkTo(local(5, 3.5), 'resume-governor-approach', 0.8);
        await walkTo(local(3.5, 3.5), 'resume-governor-side-aisle', 0.7);
        await walkTo(local(3.5, 0), 'resume-governor-spine', 0.7);
      } else if (saved.recoveredUniques.includes('orchard-memory-core')) {
        await walkTo(local(5, -4), 'resume-memory-approach', 0.8);
        await walkTo(local(1.5, -4), 'resume-memory-lane', 0.6);
        await walkTo(local(1.5, -1), 'resume-memory-turn', 0.6);
      } else if (saved.recoveredUniques.includes('human-seed-bank')) {
        await walkTo(local(-5, -3.3), 'resume-seed-lane', 0.8);
        await walkTo(local(-5, 0), 'resume-seed-aisle', 0.6);
      } else if (saved.journalArchive.includes('orchard-caretaker-record')) {
        await walkTo(local(-5, 3.3), 'resume-caretaker-lane', 0.8);
        await walkTo(local(-5, 0), 'resume-caretaker-aisle', 0.6);
      } else if (saved.journalArchive.includes('orchard-memory-record')) {
        await walkTo(local(2.3, -3), 'resume-common-approach', 0.8);
      } else if (saved.active?.objectivesCompleted?.includes('orchard-starboard-isolator')) {
        await walkTo(local(3.5, 0), 'resume-starboard-approach', 0.8);
      } else {
        await walkTo(local(-7.8, 0), 'resume-orchard-entry', 0.8);
        await walkTo(local(-5, 0), 'resume-orchard-aisle', 0.7);
      }
      await walkTo(local(0, 0), 'resume-orchard-center', 0.8);
      await record('orchard-docked-resume-positioned', { snapshot: await snapshot() });
    }

    const preObjectives = await snapshot();
    if (!preObjectives.story.active?.objectivesCompleted?.includes('orchard-port-isolator'))
      throw new Error('caretaker route did not preserve its intact port isolator');
    await walkTo(local(0, 0), 'orchard-starboard-spine', 0.7);
    await walkTo(local(3.5, 0), 'orchard-starboard-approach', 0.6);
    await interact('orchard-starboard-isolator', 'objective');

    await walkTo(local(0, 0), 'orchard-caretaker-return', 0.7);
    await walkTo(local(-5, 0), 'orchard-caretaker-aisle', 0.5);
    await walkTo(local(-5, 3.3), 'orchard-caretaker-lane', 0.5);
    await interact('orchard-caretaker-record', 'journal');
    await walkTo(local(-5, 3.3), 'orchard-caretaker-clear', 0.5);
    await walkTo(local(-5, 0), 'orchard-caretaker-aisle-return', 0.5);
    await walkTo(local(0, 0), 'orchard-common-spine', 0.7);
    await walkTo(local(2.3, -3), 'orchard-common-approach', 0.5);
    await interact('orchard-memory-record', 'journal');
    await page.screenshot({ path: path.join(output, 'orchard-records.png'), fullPage: true });

    await walkTo(local(0, 0), 'orchard-seed-spine', 0.7);
    await walkTo(local(-5, 0), 'orchard-seed-aisle', 0.5);
    await walkTo(local(-5, -3.3), 'orchard-seed-approach', 0.5);
    await interact('orchard-human-seed-bank', 'unique');
    await walkTo(local(-5, 0), 'orchard-seed-aisle-return', 0.5);
    await walkTo(local(0, 0), 'orchard-memory-spine', 0.7);
    await walkTo(local(1.5, -1), 'orchard-memory-turn', 0.5);
    await walkTo(local(1.5, -4), 'orchard-memory-lane', 0.5);
    await walkTo(local(5, -4), 'orchard-memory-approach', 0.6);
    // Interaction selects the nearest item, independently of the camera aim.
    // Step close enough to the core to clear the adjacent common-memory prompt.
    await interact('orchard-memory-core', 'unique', null, 0.75);
    await walkTo(local(1.5, -4), 'orchard-memory-return', 0.5);
    await walkTo(local(0, 0), 'orchard-governor-spine', 0.7);
    await walkTo(local(3.5, 0), 'orchard-governor-aisle', 0.7);
    await walkTo(local(3.5, 3.5), 'orchard-governor-side-aisle', 0.7);
    await walkTo(local(5, 3.5), 'orchard-governor-approach', 0.6);
    await interact('orchard-vector-governor', 'unique');

    const objectives = await snapshot();
    const requiredObjectives = ['orchard-port-isolator', 'orchard-starboard-isolator'];
    const requiredUniques = ['human-seed-bank', 'orchard-memory-core', 'vector-governor'];
    const requiredJournals = ['orchard-caretaker-record', 'orchard-memory-record'];
    for (const id of requiredObjectives)
      if (!objectives.story.active?.objectivesCompleted?.includes(id))
        throw new Error(`missing objective ${id}`);
    for (const id of requiredUniques)
      if (!objectives.story.recoveredUniques.includes(id)) throw new Error(`missing unique ${id}`);
    for (const id of requiredJournals)
      if (!objectives.story.journalArchive.includes(id)) throw new Error(`missing journal ${id}`);
    if (objectives.story.journalArchive.includes('orchard-evacuation-record'))
      throw new Error('caretaker route incorrectly learned the cold-vault testimony');
    for (const id of requiredUniques)
      if (objectives.story.recoveredUniques.filter((fact) => fact === id).length !== 1)
        throw new Error(`${id} was not persisted exactly once`);
    if (objectives.course.tier !== 2)
      throw new Error('vector governor did not unlock course tier 2');
    await record('orchard-objectives-complete', { snapshot: objectives });

    await walkTo(local(5, 3.5), 'orchard-governor-return', 0.6);
    await walkTo(local(3.5, 3.5), 'orchard-governor-side-aisle-return', 0.7);
    await walkTo(local(3.5, 0), 'orchard-governor-aisle-return', 0.7);
    await walkTo(local(0, 0), 'orchard-exit-spine', 0.7);
    await walkTo(local(-7.8, 0), 'orchard-exit', 0.7);
    await walkTo(local(-9.5, 0), 'orchard-return-gangway', 1.1);
    await walkTo(local(-10.5, 0), 'orchard-machine-side', 1.4);
    for (let i = machineAisle.length - 1; i >= 0; i -= 1)
      await walkTo(machineAisle[i], `orchard-to-machine-${machineAisle.length - i}`, 1.1);
    await page.waitForFunction(
      () =>
        globalThis.__game.game.destination.playerOnMachine(
          globalThis.__game.game.player.worldPosition,
        ),
      null,
      { timeout: 15_000 },
    );
    await walkTo(radio, 'orchard-return-radio', 1.5);
    await page.keyboard.press('KeyE');
    await page.locator('[data-radio-depart]').waitFor({ state: 'visible', timeout: 12_000 });
    await page.locator('[data-radio-depart]').click();
    await page.waitForFunction(
      () =>
        !globalThis.__game.game.destination.active &&
        globalThis.__game.game.story.currentPhase === 'complete',
      null,
      { timeout: 20_000 },
    );
    if (
      await page
        .locator('[data-panel="expedition"]')
        .isVisible()
        .catch(() => false)
    )
      await page.keyboard.press('Escape');
    await settle('orchard-departed');
    const departed = await snapshot();
    if (
      !departed.story.completed.includes('glass-orchard') ||
      departed.destination.colliders !== 0 ||
      departed.destination.active ||
      !departed.destination.playerOnMachine
    )
      throw new Error(`Orchard departure incomplete: ${JSON.stringify(departed)}`);
    await record('orchard-departure', { snapshot: departed });
    observedDeaths = departed.observed.filter((event) => event.type === 'player:died');
    await record('observed-player-deaths', { deaths: observedDeaths });
  }

  const restored = await saveAndColdContinue();
  if (!restored.story.completed.includes('glass-orchard') || restored.course.tier !== 2)
    throw new Error('Orchard completion or tier 2 was lost on cold Continue');
  if (errors.length) throw new Error(errors.join('\n'));
  const summary = {
    status: 'passed',
    scope: 'full-art caretaker route with one scripted skiff; cold-vault route not claimed',
    source: path.resolve(source),
    final: restored,
    observedDeaths,
    events,
    errors,
  };
  await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
  process.stdout.write(JSON.stringify({ status: 'passed', output, final: restored }, null, 2));
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  observedDeaths = page
    ? await page
        .evaluate(() =>
          (globalThis.__orchardContinuityEvents ?? []).filter(
            (event) => event.type === 'player:died',
          ),
        )
        .catch(() => observedDeaths)
    : observedDeaths;
  if (page)
    await page
      .screenshot({ path: path.join(output, 'blocked.png'), fullPage: true })
      .catch(() => {});
  await record('blocked', { message, snapshot: page ? await snapshot().catch(() => null) : null });
  await fs.writeFile(
    path.join(output, 'summary.json'),
    JSON.stringify(
      { status: 'blocked', source: path.resolve(source), message, observedDeaths, events, errors },
      null,
      2,
    ),
  );
  process.stderr.write(JSON.stringify({ status: 'blocked', output, message, errors }, null, 2));
  process.exitCode = 1;
} finally {
  await context?.close();
}
