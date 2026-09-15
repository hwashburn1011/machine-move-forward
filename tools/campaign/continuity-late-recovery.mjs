/** REC-LATE: normal-input recovery from the accepted Quiet Array checkpoint. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const source = process.env.MMF_CONTINUITY_PROFILE;
if (!source) throw new Error('MMF_CONTINUITY_PROFILE is required');
const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5205/';
const stage = process.env.MMF_RECOVERY_STAGE ?? 'infrastructure';
if (!['infrastructure', 'sustain'].includes(stage))
  throw new Error('MMF_RECOVERY_STAGE must be infrastructure or sustain');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve('test-results', 'continuity-late-recovery', `run-${stamp}`);
const profile = path.join(output, 'browser-profile');
await fs.mkdir(output, { recursive: true });
await fs.cp(path.resolve(source), profile, { recursive: true, errorOnExist: true });
const parentEvidence = await fs
  .readFile(path.join(path.dirname(path.resolve(source)), 'summary.json'), 'utf8')
  .then((text) => JSON.parse(text))
  .catch(() => null);
const lineage = [];
let lineageEvidence = parentEvidence;
for (let depth = 0; lineageEvidence && depth < 8; depth += 1) {
  const provenance = lineageEvidence.events?.find((event) => event.type === 'provenance');
  lineage.push({ evidence: lineageEvidence, provenance });
  if (!provenance?.source) break;
  lineageEvidence = await fs
    .readFile(path.join(path.dirname(path.resolve(provenance.source)), 'summary.json'), 'utf8')
    .then((text) => JSON.parse(text))
    .catch(() => null);
}
const acceptedInfrastructure = lineage.some(
  ({ evidence }) => evidence?.status === 'passed' && evidence?.stage === 'infrastructure',
);
const priorWaterUse = lineage.some(({ evidence }) =>
  evidence?.events?.some((event) => event.type === 'item-used' && event.itemId === 'water'),
);
const priorRationUse = lineage.some(({ evidence }) =>
  evidence?.events?.some(
    (event) =>
      event.type === 'item-used' &&
      event.itemId === 'rations' &&
      event.after?.resources?.rations === event.before?.resources?.rations - 1 &&
      event.after?.needs?.nourishment > event.before?.needs?.nourishment,
  ),
);
if (stage === 'sustain' && !acceptedInfrastructure)
  throw new Error(
    'Sustain stage requires a passed infrastructure summary beside its source profile',
  );
const eventsPath = path.join(output, 'events.jsonl');
const events = [],
  errors = [];
const record = async (type, detail = {}) => {
  const event = { at: new Date().toISOString(), type, ...detail };
  events.push(event);
  await fs.appendFile(eventsPath, `${JSON.stringify(event)}\n`);
};
const url = new URL(site);
if (
  ['seed', 'nospawn', 'nolock', 'nomenu', 'noload', 'nomodel', 'notex'].some((k) =>
    url.searchParams.has(k),
  )
)
  throw new Error('REC-LATE requires an unmodified full-art campaign URL');
url.searchParams.set('quality', 'medium');
url.searchParams.set('nosound', '1');
let context, page;
const snap = () =>
  page.evaluate(() => {
    const g = globalThis.__game.game;
    return {
      seed: g.state.seed,
      profile: g.buildSave().profile,
      phase: g.story.currentPhase,
      simTime: g.state.simTime,
      distanceM: g.world.distanceTraveled,
      paused: g.state.paused,
      health: g.player.stats.health,
      player: g.player.worldPosition.toArray(),
      needs: g.player.needs.toSave(),
      inventory: g.inventory.serialise(),
      resources: Object.fromEntries(
        ['scrap', 'components', 'fuel', 'water', 'greens', 'rations', 'repair-kit'].map((id) => [
          id,
          g.resources.count(id),
        ]),
      ),
      power: {
        fuel: g.machine.power.fuel,
        capacity: g.machine.power.capacity,
        draw: g.machine.power.draw,
        demand: g.machine.power.registeredDemand,
        generators: g.machine.power.generatorCount,
        burnRate: g.machine.power.effectiveFuelBurnPerSecond,
      },
      maxSpeed: g.machine.movement.maxSpeed,
      pieces: g.build.serialise(),
      damage: g.machine.damage.toSave(),
      story: g.buildSave().world.story,
      course: g.course.toSave(),
      buildState: {
        selectedPiece: g.selectedPiece,
        buildMode: g.buildMode,
        preview: {
          placement: g.buildPreview.placement,
          validation: g.buildPreview.validation,
          target: g.buildPreview.target,
        },
      },
      interaction: g.interaction.current
        ? {
            id: g.interaction.current.id,
            kind: g.interaction.current.kind,
            position: g.interaction.current.position?.toArray?.() ?? null,
          }
        : null,
      enemies: g.enemies.active.map((e) => ({
        id: e.id,
        position: e.worldPosition.toArray(),
        health: e.health,
      })),
      vehicle: g.vehicleScene?.active
        ? { active: true, position: g.vehicleScene.group.position.toArray() }
        : { active: false },
      safe: g.isSafeToSave(),
      errors: globalThis.__lateRecoveryEvents ?? [],
    };
  });
const moveAim = async (target) => {
  for (let i = 0; i < 24; i++) {
    const e = await page.evaluate((at) => {
      const g = globalThis.__game.game,
        c = g.playerCamera.camera;
      const dx = at[0] - c.position.x,
        dy = at[1] - c.position.y,
        dz = at[2] - c.position.z,
        w = (v) => Math.atan2(Math.sin(v), Math.cos(v));
      return {
        x: w(Math.atan2(-dx, -dz) - g.playerCamera.yawAngle),
        y: Math.atan2(dy, Math.hypot(dx, dz)) - g.playerCamera.pitchAngle,
      };
    }, target);
    if (Math.abs(e.x) < 0.014 && Math.abs(e.y) < 0.014) return;
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
      e,
    );
    await page.waitForTimeout(55);
  }
};
const faceWalk = async (target) => {
  for (let i = 0; i < 20; i++) {
    const e = await page.evaluate((at) => {
      const g = globalThis.__game.game,
        p = g.player.worldPosition,
        w = (v) => Math.atan2(Math.sin(v), Math.cos(v));
      return w(Math.atan2(-(at[0] - p.x), -(at[2] - p.z)) - g.playerCamera.yawAngle);
    }, target);
    if (Math.abs(e) < 0.014) return;
    await page.keyboard.up('KeyW').catch(() => {});
    await page.evaluate(
      (x) =>
        window.dispatchEvent(
          new MouseEvent('mousemove', {
            movementX: Math.max(-600, Math.min(600, -x / 0.0022)),
            movementY: 0,
            bubbles: true,
          }),
        ),
      e,
    );
    await page.waitForTimeout(55);
  }
};
const settle = async (label) => {
  await page.waitForFunction(
    () => document.pointerLockElement && !globalThis.__game.game.state.paused,
    null,
    { timeout: 20000 },
  );
  await record('active-settled', { label });
};
const installObservers = () =>
  page.evaluate(() => {
    const g = globalThis.__game.game;
    globalThis.__lateRecoveryEvents = [];
    for (const type of [
      'craft:completed',
      'weapon:fired',
      'weapon:reload-started',
      'weapon:reload-finished',
      'enemy:spawned',
      'enemy:killed',
      'player:damaged',
      'build:damaged',
      'build:removed',
      'producer:output',
      'loot:collected',
      'repair:completed',
    ])
      g.bus.on(type, (event) =>
        globalThis.__lateRecoveryEvents.push({ type, event, simTime: g.state.simTime }),
      );
  });
const walkTo = async (target, label, radius = 1.55, timeout = 35000) => {
  const start = Date.now();
  try {
    while (Date.now() - start < timeout) {
      const v = await page.evaluate((at) => {
        const p = globalThis.__game.game.player.worldPosition;
        return { d: Math.hypot(p.x - at[0], p.z - at[2]), p: p.toArray() };
      }, target);
      if (v.d <= radius) {
        await record('waypoint', { label, target, position: v.p });
        return;
      }
      await faceWalk(target);
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(Math.min(160, Math.max(55, (v.d - radius) * 180)));
      await page.keyboard.up('KeyW');
      await page.waitForTimeout(70);
    }
  } finally {
    await page.keyboard.up('KeyW').catch(() => {});
  }
  throw new Error(`walk ${label} timed out`);
};
const station = (piece) =>
  page.evaluate((id) => {
    const g = globalThis.__game.game;
    return (
      g.build
        .stationsNear(g.player.worldPosition, Infinity)
        .find((s) => s.piece === id)
        ?.position.toArray() ?? null
    );
  }, piece);
const targetStation = async (piece, at) => {
  await walkTo(at, `approach-${piece}`, 1.55);
  await moveAim(at);
  await page.waitForFunction(
    ({ piece }) => {
      const kind = globalThis.__game.game.interaction.current?.kind;
      return (
        kind === 'repair' ||
        kind === piece ||
        ((piece === 'condenser' || piece === 'planter') && kind === 'producer')
      );
    },
    { piece },
    { timeout: 6000 },
  );
  if (await page.evaluate(() => globalThis.__game.game.interaction.current?.kind === 'repair')) {
    const before = await snap();
    await page.keyboard.down('KeyE');
    try {
      await page.waitForFunction(
        ({ piece }) => {
          const kind = globalThis.__game.game.interaction.current?.kind;
          return (
            kind !== 'repair' &&
            (kind === piece ||
              ((piece === 'condenser' || piece === 'planter') && kind === 'producer'))
          );
        },
        { piece },
        { timeout: 9000 },
      );
    } finally {
      await page.keyboard.up('KeyE');
    }
    await record('station-support-repaired', { piece, before, after: await snap() });
    await moveAim(at);
  }
};
const targetGenerator = async () => {
  const at = await station('generator');
  if (!at) throw new Error('generator lost during recovery');
  const y = (await snap()).player[1];
  await walkTo([at[0] - 2.5, y, at[2] - 3.5], 'generator-left-turn', 0.65);
  await walkTo([at[0] - 2.5, y, at[2]], 'generator-left-aisle', 0.65);
  await walkTo([at[0] - 1.5, y, at[2]], 'generator-left-approach', 0.55);
  await targetStation('generator', at);
  return at;
};
const demolishStation = async (piece, expectedRefund) => {
  const target = await page.evaluate((id) => {
    const g = globalThis.__game.game,
      s = g.build.stationsNear(g.player.worldPosition, Infinity).find((x) => x.piece === id);
    return s ? { id: s.instanceId, position: s.position.toArray() } : null;
  }, piece);
  if (!target) throw new Error(`missing ${piece} to recycle`);
  await walkTo(target.position, `recycle-${piece}`, 1.55);
  await waitBuildReady('recycle');
  await page.keyboard.press('KeyB');
  await page.locator('[data-category="structure"]').waitFor({ state: 'visible', timeout: 8000 });
  await page.locator('[data-category="structure"]').click();
  await page.locator('[data-piece="floor"]').click();
  await page.waitForFunction(
    () => globalThis.__game.game.buildMode && document.pointerLockElement,
    null,
    { timeout: 8000 },
  );
  await moveAim(target.position);
  await page.waitForFunction((id) => globalThis.__game.game.aimedBuildId === id, target.id, {
    timeout: 6000,
  });
  const before = await snap(),
    floorsBefore = before.pieces.filter((p) => p.definitionId === 'floor').length;
  await page.keyboard.down('KeyX');
  try {
    await page.waitForFunction((id) => !globalThis.__game.game.build.instance(id), target.id, {
      timeout: 5000,
    });
  } finally {
    await page.keyboard.up('KeyX');
  }
  await page.keyboard.press('Escape');
  await settle(`recycled-${piece}`);
  const after = await snap();
  if (
    after.resources.scrap - before.resources.scrap !== expectedRefund ||
    after.pieces.filter((p) => p.definitionId === 'floor').length !== floorsBefore
  )
    throw new Error(`${piece} demolition refund/support ledger mismatch`);
  await record('station-recycled', { piece, target, before, after, expectedRefund });
  return after;
};
const defend = async () => {
  const threat = await snap();
  if (!threat.enemies.length) return false;
  const target = threat.enemies[0];
  await page.mouse.down({ button: 'right' });
  await moveAim(target.position);
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(450);
  await page.mouse.up({ button: 'left' });
  await page.mouse.up({ button: 'right' });
  const w = await page.evaluate(() => globalThis.__game.game.combat.current);
  if (w.ammoInMag === 0 && w.reserveAmmo > 0) {
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => !globalThis.__game.game.combat.current.reloading, null, {
      timeout: 7000,
    });
  }
  await record('ordinary-defense', {
    target: target.id,
    before: target.health,
    after: await snap(),
  });
  return true;
};
const waitBuildReady = async (label) => {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const state = await snap();
    if (state.health <= 0) throw new Error(`player died waiting to ${label}`);
    if (state.enemies.length) {
      await defend();
      continue;
    }
    const ready = await page.evaluate(() => {
      const g = globalThis.__game.game;
      return !g.state.paused && g.buildGuard.canEnter();
    });
    if (ready) {
      await record('build-guard-ready', { label, snapshot: state });
      return;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`combat/build guard did not clear for ${label}`);
};
const choosePlacement = (piece) =>
  page.evaluate((id) => {
    const g = globalThis.__game.game,
      p = g.player.worldPosition,
      out = [];
    for (let x = -5; x <= 5; x++)
      for (let z = -5; z <= 5; z++) {
        const q = { piece: id, cell: { x, y: 0, z }, rotation: 0 };
        if (!g.build.canPlace(q).ok) continue;
        const v = g.build.constructor.transformFor(id, q.cell, q.edge, q.rotation).position;
        g.build.group.localToWorld(v);
        const d = Math.hypot(v.x - p.x, v.z - p.z);
        if (d >= 2.5 && d <= 7) out.push({ world: v.toArray(), placement: q, d });
      }
    return out.sort((a, b) => a.d - b.d);
  }, piece);
const place = async (piece) => {
  const before = await snap();
  const category = piece === 'floor' ? 'structure' : 'station';
  let catalogOpened = false;
  for (let attempt = 0; attempt < 3 && !catalogOpened; attempt += 1) {
    await waitBuildReady(`place-${piece}`);
    await page.keyboard.press('KeyB');
    catalogOpened = await page
      .locator(`[data-category="${category}"]`)
      .waitFor({ state: 'visible', timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (!catalogOpened && (await page.evaluate(() => globalThis.__game.game.buildMode))) {
      await page.keyboard.press('Escape');
      await settle(`retry-place-${piece}`);
    }
  }
  if (!catalogOpened) throw new Error(`combat/build guard repeatedly rejected ${piece}`);
  await page.locator(`[data-category="${category}"]`).click();
  await page.locator(`[data-piece="${piece}"]`).click();
  await page.waitForFunction(
    (id) => globalThis.__game.game.selectedPiece === id && document.pointerLockElement,
    piece,
    { timeout: 8000 },
  );
  let picked = null;
  for (const c of await choosePlacement(piece)) {
    await moveAim(c.world);
    await page.waitForTimeout(140);
    const preview = await page.evaluate(() => {
      const p = globalThis.__game.game.buildPreview;
      return { placement: p.placement, validation: p.validation, target: p.target };
    });
    if (
      preview.placement?.piece === piece &&
      preview.placement.cell?.x === c.placement.cell.x &&
      preview.placement.cell?.y === c.placement.cell.y &&
      preview.placement.cell?.z === c.placement.cell.z &&
      preview.validation.ok &&
      !preview.target?.rejection
    ) {
      picked = { ...c, preview };
      break;
    }
  }
  if (!picked)
    throw new Error(
      `no camera-visible exact placement candidate for ${piece}: ${JSON.stringify((await snap()).buildState)}`,
    );
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(90);
  await page.mouse.up({ button: 'left' });
  await page
    .waitForFunction(
      ({ id, n }) =>
        globalThis.__game.game.build.serialise().filter((p) => p.definitionId === id).length > n,
      { id: piece, n: before.pieces.filter((p) => p.definitionId === piece).length },
      { timeout: 8000 },
    )
    .catch(async (error) => {
      throw new Error(
        `${piece} placement input did not commit: ${JSON.stringify((await snap()).buildState)}; ${error.message}`,
      );
    });
  await page.keyboard.press('Escape');
  await settle(`placed-${piece}`);
  const after = await snap();
  await record('placed', { piece, picked, before, after });
  return station(piece);
};
const openStation = async (piece) => {
  const at = await station(piece);
  if (!at) throw new Error(`missing ${piece}`);
  await targetStation(piece, at);
  await page.keyboard.press('KeyE');
  await page.locator('#inv-panel').waitFor({ state: 'visible', timeout: 8000 });
  return at;
};
const craft = async (id) => {
  const before = await snap(),
    button = page.locator(`[data-recipe="${id}"]`);
  await button.waitFor({ state: 'visible', timeout: 8000 });
  if (await button.isDisabled()) throw new Error(`${id} disabled`);
  const count = await page.evaluate(
    (x) =>
      (globalThis.__lateRecoveryEvents ?? []).filter(
        (e) => e.type === 'craft:completed' && e.event.recipeId === x,
      ).length,
    id,
  );
  await button.click();
  await page.waitForFunction(
    ({ id, count }) =>
      (globalThis.__lateRecoveryEvents ?? []).filter(
        (e) => e.type === 'craft:completed' && e.event.recipeId === id,
      ).length > count,
    { id, count },
    { timeout: 8000 },
  );
  await record('crafted', { id, before, after: await snap() });
};
const claimProducer = async (piece) => {
  const at = await station(piece);
  if (!at) throw new Error(`missing producer ${piece}`);
  await targetStation(piece, at);
  const before = await snap();
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const after = await snap();
  await record('producer-claimed', { piece, before, after });
  return { before, after };
};
const useItem = async (itemId) => {
  await page.keyboard.press('Tab');
  await page.locator('#inv-panel').waitFor({ state: 'visible', timeout: 8000 });
  const slot = page
    .locator('.inv-slot[data-side="player"]')
    .filter({
      hasText: itemId === 'water' ? 'Clean Water' : itemId === 'rations' ? 'Rations' : 'Repair Kit',
    })
    .first();
  await slot.waitFor({ state: 'visible', timeout: 5000 });
  const before = await snap();
  await slot.click();
  await page.waitForTimeout(200);
  const after = await snap();
  await record('item-used', { itemId, before, after });
  await page.keyboard.press('Escape');
  await settle(`used-${itemId}`);
  return { before, after };
};
const reelOne = async () => {
  await page.waitForFunction(
    () => {
      const g = globalThis.__game.game,
        p = g.player.worldPosition;
      return g.salvage.targets.some(
        (t) => Math.hypot(t.x - p.x, t.y - (p.y + 0.35), t.z - p.z) <= 33.5,
      );
    },
    null,
    { timeout: 45000 },
  );
  const before = await snap();
  const lootBefore = await page.evaluate(
    () => (globalThis.__lateRecoveryEvents ?? []).filter((e) => e.type === 'loot:collected').length,
  );
  let targetId = null;
  for (let i = 0; i < 12; i++) {
    const target = await page.evaluate(() => {
      const g = globalThis.__game.game,
        p = g.player.worldPosition,
        t = g.salvage.targets
          .filter((t) => Math.hypot(t.x - p.x, t.y - (p.y + 0.35), t.z - p.z) <= 33.5)
          .sort(
            (a, b) =>
              Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z) -
              Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z),
          )[0];
      return t ? { id: t.id, point: [t.x, t.y, t.z] } : null;
    });
    if (!target) throw new Error('salvage target vanished');
    await moveAim(target.point);
    await page.waitForTimeout(100);
    if (await page.evaluate(() => globalThis.__game.game.reelReady)) {
      targetId = target.id;
      break;
    }
  }
  if (!targetId) throw new Error('normal look could not acquire salvage');
  await page.keyboard.press('KeyF');
  await page.waitForFunction(
    ({ id, lootBefore }) =>
      !globalThis.__game.game.salvage.targets.some((t) => t.id === id) &&
      (globalThis.__lateRecoveryEvents ?? []).filter((e) => e.type === 'loot:collected').length >
        lootBefore,
    { id: targetId, lootBefore },
    { timeout: 18000 },
  );
  await page.waitForTimeout(250);
  const after = await snap();
  if (JSON.stringify(after.resources) === JSON.stringify(before.resources))
    throw new Error('salvage hook retired target without transferring contents');
  await record('salvage-recovered', { targetId, before, after });
  return after;
};
const recoveryStep = async () => {
  const state = await snap();
  if (state.resources.fuel > 0 && state.power.fuel < 5) {
    await targetGenerator();
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(250);
    await record('recovery-refuel', { before: state, after: await snap() });
    return 'refuel';
  }
  if (await defend()) return 'defense';
  const ready = await page.evaluate(() => {
    const g = globalThis.__game.game,
      p = g.player.worldPosition;
    return g.salvage.targets.some(
      (t) => Math.hypot(t.x - p.x, t.y - (p.y + 0.35), t.z - p.z) <= 33.5,
    );
  });
  if (ready) {
    await reelOne();
    return 'salvage';
  }
  await page.waitForTimeout(600);
  return 'travel';
};
const saveAndContinue = async (label) => {
  await waitBuildReady(`save-${label}`);
  await page.waitForFunction(() => globalThis.__game.game.isSafeToSave(), null, {
    timeout: 10000,
  });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__game.game.state.paused, null, { timeout: 10000 });
  const checkpoint = await page.evaluate(() => globalThis.__game.game.buildSave());
  const checkpointSnapshot = await snap();
  await record('checkpoint-precommit', { label, checkpoint, snapshot: checkpointSnapshot });
  await page.getByRole('button', { name: 'Save & Quit', exact: true }).click();
  await page
    .getByRole('button', { name: 'Continue', exact: true })
    .waitFor({ state: 'visible', timeout: 25000 });
  const committed = await page.evaluate(async () => {
    const g = globalThis.__game.game,
      s = await g.saves.latestSlot();
    return s ? await g.saves.load(s) : null;
  });
  if (
    !committed ||
    JSON.stringify({ ...committed, savedAt: 0 }) !== JSON.stringify({ ...checkpoint, savedAt: 0 })
  )
    throw new Error(`${label} committed save mismatch`);
  await context.close();
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1280, height: 720 },
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(() => !globalThis.__game.game.titleScreen?.isOpen, null, {
    timeout: 30000,
  });
  await settle(`${label}-cold-continue`);
  await installObservers();
  const restored = await snap(),
    savedCourse = checkpoint.machine.course;
  const failures = [],
    epsilon = 0.02,
    elapsed = restored.simTime,
    producer = new Map([
      ['condenser', { period: 90, capacity: 1 }],
      ['planter', { period: 150, capacity: 3 }],
    ]),
    staticPiece = (piece) => {
      if (!producer.has(piece.definitionId)) return piece;
      const { state, ...withoutState } = piece;
      return withoutState;
    },
    sortPieces = (pieces) =>
      pieces.map(staticPiece).sort((a, b) => a.instanceId.localeCompare(b.instanceId));
  if (restored.seed !== checkpoint.seed) failures.push('seed changed');
  if (restored.profile !== checkpoint.profile) failures.push('campaign profile changed');
  if (restored.health !== checkpoint.player.health) failures.push('player health changed');
  if (JSON.stringify(restored.inventory) !== JSON.stringify(checkpoint.player.inventory))
    failures.push('inventory changed');
  if (
    JSON.stringify(sortPieces(restored.pieces)) !==
    JSON.stringify(sortPieces(checkpoint.machine.structures))
  )
    failures.push('structure identity or nonproducer state changed');
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 5)
    failures.push(`cold load elapsed ${elapsed}s`);
  for (const saved of checkpoint.machine.structures.filter((piece) =>
    producer.has(piece.definitionId),
  )) {
    const live = restored.pieces.find((piece) => piece.instanceId === saved.instanceId),
      spec = producer.get(saved.definitionId),
      a = saved.state ?? {},
      b = live?.state ?? {},
      beforeWork = a.stored * spec.period + a.progress,
      afterWork = b.stored * spec.period + b.progress,
      gained = afterWork - beforeWork;
    if (
      !live ||
      !Number.isFinite(a.progress) ||
      !Number.isInteger(a.stored) ||
      !Number.isFinite(b.progress) ||
      !Number.isInteger(b.stored) ||
      b.stored < a.stored ||
      b.stored > spec.capacity ||
      gained < -epsilon ||
      gained > elapsed + epsilon
    )
      failures.push(`${saved.definitionId} ${saved.instanceId} advanced ${gained}s in ${elapsed}s`);
  }
  if (JSON.stringify(restored.damage) !== JSON.stringify(checkpoint.machine.subsystems))
    failures.push('machine damage changed');
  if (JSON.stringify(restored.story) !== JSON.stringify(checkpoint.world.story))
    failures.push('campaign or ending story changed');
  const distanceDelta = restored.distanceM - checkpoint.distanceTraveled;
  if (distanceDelta < -epsilon || distanceDelta > checkpointSnapshot.maxSpeed * elapsed + 0.1)
    failures.push(`distance advanced ${distanceDelta}m in ${elapsed}s`);
  const fuelDelta = checkpoint.machine.fuel - restored.power.fuel;
  if (fuelDelta < -epsilon || fuelDelta > checkpointSnapshot.power.burnRate * elapsed + epsilon)
    failures.push(`fuel changed ${fuelDelta} in ${elapsed}s`);
  for (const key of ['hydration', 'nourishment']) {
    const before = checkpoint.player.needs?.[key],
      after = restored.needs[key],
      drained = before - after;
    if (Number.isFinite(before) && (drained < -epsilon || drained > 0.1 * elapsed + epsilon))
      failures.push(`${key} changed ${drained} in ${elapsed}s`);
  }
  if (
    restored.course.tier !== savedCourse.tier ||
    restored.course.desiredDeg !== savedCourse.desiredDeg ||
    restored.course.throttle !== savedCourse.throttle
  )
    failures.push('course authority changed');
  if (Math.abs(restored.course.bearingDeg - savedCourse.bearingDeg) > 1.6 * elapsed + epsilon)
    failures.push('course bearing advanced too far');
  if (Math.abs(restored.course.lateralM - savedCourse.lateralM) > Math.abs(distanceDelta) + epsilon)
    failures.push('course lateral projection advanced too far');
  if (failures.length) throw new Error(`${label} cold Continue mismatch: ${failures.join('; ')}`);
  await record('checkpoint-restored', { label, checkpoint, snapshot: restored });
};

try {
  await record('provenance', {
    source: path.resolve(source),
    profile,
    url: url.toString(),
    stage,
    parentSummary: parentEvidence
      ? { status: parentEvidence.status, stage: parentEvidence.stage }
      : null,
    lineage: lineage.map(({ evidence, provenance }) => ({
      status: evidence.status,
      stage: evidence.stage ?? provenance?.stage ?? null,
      source: provenance?.source ?? null,
    })),
    authority: 'normal input; no state writes or bypass flags',
  });
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1280, height: 720 },
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180000 });
  const sourceSave = await page.evaluate(async () => {
    const g = globalThis.__game.game,
      s = await g.saves.latestSlot();
    return s ? { slot: s, data: await g.saves.load(s) } : null;
  });
  if (!sourceSave?.data) throw new Error('missing source save');
  if (!sourceSave.data.world.story.completed.includes('quiet-array'))
    throw new Error('source is not accepted Quiet completion');
  await record('source-save-readonly', sourceSave);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(() => !globalThis.__game.game.titleScreen?.isOpen, null, {
    timeout: 30000,
  });
  await settle('initial-continue');
  await installObservers();
  const initial = await snap();
  if (initial.phase !== 'complete' || initial.power.generators < 1)
    throw new Error('Quiet checkpoint did not restore complete with generator');
  if (stage === 'infrastructure') {
    if (initial.resources.components > 7 || initial.resources.fuel > 4 || initial.pieces.length < 7)
      throw new Error(
        `source is not a compatible Quiet recovery checkpoint: ${JSON.stringify({ resources: initial.resources, pieces: initial.pieces.length })}`,
      );
    const hadRefinery = Boolean(await station('refinery')),
      hadCondenser = Boolean(await station('condenser'));
    const gen = await station('generator');
    if (!gen) throw new Error('live generator not found');
    if (initial.resources.fuel > 0) {
      await targetStation('generator', gen);
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(250);
      const refueled = await snap();
      if (
        refueled.resources.fuel !== 0 ||
        refueled.power.fuel <= initial.power.fuel + initial.resources.fuel - 0.5 ||
        refueled.power.fuel > initial.power.fuel + initial.resources.fuel + 0.01
      )
        throw new Error('generator E refuel ledger mismatch');
      await record('refueled', { initial, refueled, transferred: initial.resources.fuel });
    }
    let refineBatches = 0;
    if (!hadCondenser) {
      if (!hadRefinery) await place('refinery');
      await openStation('refinery');
      while ((await snap()).resources.components < 7) {
        const before = await snap();
        await craft('refine-components');
        const after = await snap();
        if (
          before.resources.scrap - after.resources.scrap !== 8 ||
          after.resources.components - before.resources.components !== 2
        )
          throw new Error('refine-components ledger mismatch');
        refineBatches++;
      }
      await page.keyboard.press('Escape');
      await settle('refinery-close');
      await place('floor');
      await place('condenser');
    } else if (initial.resources.components !== 2)
      throw new Error(
        `resumed infrastructure checkpoint has unexpected components: ${initial.resources.components}`,
      );
    const repairSpend = events
      .filter((e) => e.type === 'station-support-repaired')
      .reduce((sum, e) => sum + e.before.resources.scrap - e.after.resources.scrap, 0);
    const expectedScrap =
      initial.resources.scrap -
      (hadRefinery ? 0 : 80) -
      refineBatches * 8 -
      (hadCondenser ? 0 : 48) -
      repairSpend;
    await saveAndContinue('recovery-infrastructure');
    const final = await snap();
    if (
      !(await station('refinery')) ||
      !(await station('condenser')) ||
      final.resources.scrap !== expectedScrap ||
      final.resources.components !== 2 ||
      final.pieces.length !== initial.pieces.length + (hadRefinery ? 0 : 1) + (hadCondenser ? 0 : 2)
    )
      throw new Error(
        `infrastructure checkpoint ledger mismatch: ${JSON.stringify({ expectedScrap, actual: final.resources, pieces: final.pieces.length })}`,
      );
    if (errors.length) throw new Error(errors.join('\n'));
    await fs.writeFile(
      path.join(output, 'summary.json'),
      JSON.stringify(
        {
          status: 'passed',
          stage,
          events,
          final,
          nextStage: 'sustain',
          ledger: { hadRefinery, hadCondenser, refineBatches, repairSpend, expectedScrap },
        },
        null,
        2,
      ),
    );
    process.stdout.write(JSON.stringify({ status: 'passed', stage, output, final }, null, 2));
  } else {
    if (!(await station('condenser')))
      throw new Error('sustain stage requires accepted infrastructure checkpoint');
    const refineryPresent = Boolean(await station('refinery'));
    const recycled = refineryPresent ? await demolishStation('refinery', 48) : initial;
    if (await station('refinery')) throw new Error('recycled refinery remained registered');
    const condenserPower = await page.evaluate(() => {
      const g = globalThis.__game.game,
        s = g.build
          .stationsNear(g.player.worldPosition, Infinity)
          .find((x) => x.piece === 'condenser');
      return s
        ? {
            id: s.instanceId,
            powered: g.machine.power.isPowered(s.instanceId),
            capacity: g.machine.power.capacity,
            draw: g.machine.power.draw,
            demand: g.machine.power.registeredDemand,
          }
        : null;
    });
    if (
      !condenserPower?.powered ||
      condenserPower.demand !== 9 ||
      condenserPower.capacity < condenserPower.demand
    )
      throw new Error(
        `refinery recycling did not restore condenser power: ${JSON.stringify(condenserPower)}`,
      );
    await record('condenser-power-restored', { afterRecycle: recycled, power: condenserPower });
    if (!(priorWaterUse && initial.needs.hydration > 60)) {
      const productionStart = initial.simTime;
      while (true) {
        const state = await snap();
        if (state.health <= 0) throw new Error('player died awaiting water');
        const ready = await page.evaluate(() =>
          globalThis.__game.game.build
            .producersNear(globalThis.__game.game.player.worldPosition, Infinity)
            .some((p) => p.piece === 'condenser' && p.stored > 0),
        );
        if (ready) break;
        if (state.simTime - productionStart > 150)
          throw new Error('powered condenser produced no water within150 simulation seconds');
        await recoveryStep();
      }
      const water = await claimProducer('condenser');
      if (water.after.resources.water <= water.before.resources.water)
        throw new Error('condenser E did not transfer water');
      const drank = await useItem('water');
      if (
        !(drank.after.needs.hydration > drank.before.needs.hydration) ||
        drank.after.resources.water !== drank.before.resources.water - 1
      )
        throw new Error('water use ledger mismatch');
    } else await record('water-recovery-retained', { hydration: initial.needs.hydration });
    await waitBuildReady('prepare-kitchen');
    const beforeHealing = await snap();
    if (beforeHealing.health < 60 && beforeHealing.resources.components >= 2) {
      await openStation('workbench');
      await craft('craft-repair-kit');
      await page.keyboard.press('Escape');
      await settle('repair-kit-crafted');
      const healed = await useItem('repair-kit');
      if (
        healed.after.health <= healed.before.health ||
        healed.after.resources['repair-kit'] !== healed.before.resources['repair-kit'] - 1
      )
        throw new Error('repair-kit use did not heal and consume exactly one kit');
    }
    let recovered = await snap();
    const fuelPerM = await page.evaluate(() => {
      const g = globalThis.__game.game;
      return (
        (0.06 * g.progression.upgrades.modifiers().fuelBurnMultiplier) /
        Math.max(0.001, g.machine.movement.maxSpeed)
      );
    });
    const orchardEstimate = Math.ceil(900 * fuelPerM);
    let catches = 0;
    const salvageDeadline = recovered.simTime + 600;
    while (
      (recovered.power.fuel + recovered.resources.fuel < orchardEstimate + 11 ||
        recovered.resources.scrap < 53) &&
      catches < 6
    ) {
      if (recovered.health <= 0) throw new Error('player died during recovery salvage');
      if (recovered.simTime > salvageDeadline)
        throw new Error('recovery salvage did not arrive within600 simulation seconds');
      if ((await recoveryStep()) === 'salvage') catches++;
      recovered = await snap();
    }
    if (recovered.resources.fuel > 0) {
      await targetGenerator();
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(250);
      recovered = await snap();
    }
    let foodCompleted = priorRationUse && initial.needs.nourishment > 60;
    if (foodCompleted)
      await record('ration-recovery-retained', { nourishment: initial.needs.nourishment });
    if (!foodCompleted && recovered.resources.scrap >= 53 && recovered.resources.components >= 2) {
      const kitchenBefore = await snap(),
        missingPlanter = !(await station('planter')),
        missingStove = !(await station('stove'));
      if (missingPlanter) {
        if (!(await choosePlacement('planter')).length) await place('floor');
        await place('planter');
      }
      if (missingStove) {
        if (!(await choosePlacement('stove')).length) await place('floor');
        await place('stove');
      }
      const kitchenBuilt = await snap(),
        newFloors =
          kitchenBuilt.pieces.filter((p) => p.definitionId === 'floor').length -
          kitchenBefore.pieces.filter((p) => p.definitionId === 'floor').length,
        expectedScrap = (missingPlanter ? 20 : 0) + (missingStove ? 25 : 0) + newFloors * 8,
        expectedComponents = missingStove ? 2 : 0;
      if (
        kitchenBefore.resources.scrap - kitchenBuilt.resources.scrap !== expectedScrap ||
        kitchenBefore.resources.components - kitchenBuilt.resources.components !==
          expectedComponents ||
        (missingPlanter && missingStove && newFloors !== 1)
      )
        throw new Error('kitchen support reuse and purchase ledger mismatch');
      await record('kitchen-built', {
        before: kitchenBefore,
        after: kitchenBuilt,
        expected: { scrap: expectedScrap, components: expectedComponents, newFloors },
      });
      const foodStart = kitchenBuilt.simTime;
      while (true) {
        const ready = await page.evaluate(() => {
          const g = globalThis.__game.game,
            refs = g.build.producersNear(g.player.worldPosition, Infinity);
          return (
            refs.some((p) => p.piece === 'planter' && p.stored > 0) &&
            refs.some((p) => p.piece === 'condenser' && p.stored > 0)
          );
        });
        if (ready) break;
        const state = await snap();
        if (state.health <= 0) throw new Error('player died awaiting food production');
        if (state.simTime - foodStart > 190)
          throw new Error('planter/condenser did not produce food inputs');
        await recoveryStep();
      }
      await waitBuildReady('collect-food');
      await claimProducer('planter');
      await claimProducer('condenser');
      await openStation('stove');
      await craft('cook-rations');
      await page.keyboard.press('Escape');
      await settle('stove-close');
      const ate = await useItem('rations');
      foodCompleted =
        ate.after.needs.nourishment > ate.before.needs.nourishment &&
        ate.after.resources.rations === ate.before.resources.rations - 1;
      if (!foodCompleted) throw new Error('real ration did not restore nourishment');
      recovered = await snap();
    }
    await waitBuildReady('final-recovery-checkpoint');
    if ((await snap()).resources.fuel > 0) {
      await targetGenerator();
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(250);
      await record('final-recovery-refuel', { after: await snap() });
    }
    recovered = await snap();
    await record('orchard-readiness', {
      snapshot: recovered,
      orchardEstimate,
      margin: recovered.power.fuel - orchardEstimate,
      foodCompleted,
    });
    if (recovered.power.fuel < orchardEstimate)
      throw new Error(
        `normal salvage did not recover enough route fuel: need ${orchardEstimate}, tank ${recovered.power.fuel}`,
      );
    await saveAndContinue('sustenance-recovered');
    const final = await snap();
    if (errors.length) throw new Error(errors.join('\n'));
    await fs.writeFile(
      path.join(output, 'summary.json'),
      JSON.stringify(
        {
          status: 'passed',
          stage,
          events,
          final,
          orchardEstimate,
          food: {
            completed: foodCompleted,
            remainingRequirement: foodCompleted
              ? null
              : 'Normal recovery did not retain the 53 scrap needed for planter, stove, and one additional support floor after recycling the refinery; no food was seeded.',
          },
        },
        null,
        2,
      ),
    );
    process.stdout.write(
      JSON.stringify(
        { status: 'passed', stage, output, orchardEstimate, foodCompleted, final },
        null,
        2,
      ),
    );
  }
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  await record('blocked', {
    message,
    snapshot: page ? await snap().catch(() => null) : null,
    errors,
  });
  await fs.writeFile(
    path.join(output, 'summary.json'),
    JSON.stringify({ status: 'blocked', message, events, errors }, null, 2),
  );
  process.stderr.write(JSON.stringify({ status: 'blocked', output, message, errors }, null, 2));
  process.exitCode = 1;
} finally {
  await context?.close();
}
