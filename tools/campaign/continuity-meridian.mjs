/** MER-LATE: full-art, normal-input Last Garden Meridian quiet-line continuity. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const source = process.env.MMF_CONTINUITY_PROFILE;
if (!source) throw new Error('MMF_CONTINUITY_PROFILE is required');
const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5205/';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve('test-results', 'continuity-meridian', `run-${stamp}`);
const profile = path.join(output, 'browser-profile');
const eventsPath = path.join(output, 'events.jsonl');
await fs.mkdir(output, { recursive: true });
await fs.cp(path.resolve(source), profile, { recursive: true, errorOnExist: true });
const lineage = [];
let lineageSource = path.resolve(source);
const seenLineage = new Set();
for (let depth = 0; depth < 64; depth += 1) {
  if (seenLineage.has(lineageSource))
    throw new Error(`cycle in profile provenance at ${lineageSource}`);
  seenLineage.add(lineageSource);
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
  throw new Error('MER-LATE requires ancestry to a passed sustain checkpoint');
if (
  !lineage.some(
    ({ evidence }) =>
      evidence.status === 'passed' && evidence.final?.story?.completed?.includes('glass-orchard'),
  )
)
  throw new Error('MER-LATE requires ancestry to a passed Glass Orchard checkpoint');
const priorSkiffProof = lineage.some(({ evidence }) =>
  evidence.events?.some((event) => event.type === 'meridian-scripted-skiff-resolved'),
);
const priorCompletionProof = lineage.some(({ evidence }) =>
  evidence.events?.some((event) => event.type === 'meridian-departure'),
);

const url = new URL(site);
if (
  ['seed', 'nospawn', 'nolock', 'nomenu', 'noload', 'nomodel', 'notex'].some((key) =>
    url.searchParams.has(key),
  )
)
  throw new Error('MER-LATE requires an unmodified full-art campaign URL');
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
      '[data-route-card="meridian-quiet-line"]',
      '[data-route="meridian-quiet-line"]',
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
    const button = document.querySelector('[data-route="meridian-quiet-line"]');
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
      equipment: save.player.equipment,
      upgrades: save.progression.upgrades,
      coreHealth: save.machine.coreHealth,
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
      speed: g.machine.speed,
      targetSpeed: g.machine.movement.targetSpeed,
      speedLimit: g.machine.movement.currentScriptedSpeedLimit,
      story: save.world.story,
      legacyStory: g.story.legacyProjection(),
      course: g.course.toSave(),
      structures: g.build.serialise(),
      damage: g.machine.damage.toSave(),
      enemies: g.enemies.active.map((enemy) => ({
        id: enemy.id,
        position: enemy.worldPosition.toArray(),
        health: enemy.currentHealth,
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
      observed: globalThis.__meridianContinuityEvents ?? [],
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
  let lastDistance = Infinity;
  let progressedAt = started;
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
      if (state.distance < lastDistance - 0.08) {
        lastDistance = state.distance;
        progressedAt = Date.now();
      } else if (Date.now() - progressedAt > 1_500) {
        const current = await snapshot();
        const blocker = current.enemies.find(
          (enemy) =>
            Math.abs(enemy.position[1] - current.player[1]) < 1.5 &&
            Math.hypot(
              enemy.position[0] - current.player[0],
              enemy.position[2] - current.player[2],
            ) < 4,
        );
        if (blocker) {
          await page.keyboard.up('KeyW');
          await defendEnemy(blocker);
          progressedAt = Date.now();
          continue;
        }
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
const reachWestCabinLane = async () => {
  const state = await snapshot();
  const y = state.player[1];
  if (state.player[0] > 5.5 && state.player[2] < -2) {
    await walkTo([6.1, y, -7.7], 'combat-east-bow-return', 0.25);
    await walkTo([0.8, y, -7.7], 'combat-west-bow-return', 0.3);
  }
  await walkTo([0.8, y, -1.5], 'combat-open-west-aisle', 0.5);
};
const returnToUpperDeck = async () => {
  const state = await snapshot();
  if (state.player[1] > 14.3) return;
  const y = state.player[1];
  // The middle-deck benches occupy z=-4.98..-4.3. Stay in front of
  // them while returning to the stair mouth at z=-2.7.
  await walkTo([state.player[0], y, -2.7], 'combat-middle-clear-benches', 0.3);
  await walkTo([-2, y, -2.7], 'combat-middle-stair-mouth', 0.25);
  await walkTo([-2, y + 3, 2.8], 'combat-stair-ascent', 0.25);
  await page.waitForFunction(() => globalThis.__game.game.player.worldPosition.y > 14.3, null, {
    timeout: 8_000,
  });
  await walkTo([0.7, y + 3, 2.8], 'combat-upper-stair-exit', 0.3);
};
const positionForEnemy = async (enemy) => {
  let state = await snapshot();
  const upper = state.player[1] > 14.3;
  const targetUpper = enemy.position[1] > 14.3;
  if (!upper && targetUpper) {
    await returnToUpperDeck();
    state = await snapshot();
  } else if (upper && !targetUpper) {
    await reachWestCabinLane();
    await walkTo([0.8, state.player[1], 2.8], 'combat-upper-stair-approach', 0.3);
    await walkTo([-2, state.player[1], 2.8], 'combat-upper-stair-mouth', 0.25);
    await walkTo([-2, state.player[1] - 3, -2.7], 'combat-stair-descent', 0.25);
    await page.waitForFunction(() => globalThis.__game.game.player.worldPosition.y < 14.3, null, {
      timeout: 8_000,
    });
    state = await snapshot();
  }
  if (targetUpper) {
    if (enemy.position[0] < 1.2 && state.player[0] > 5.5) {
      await reachWestCabinLane();
      await walkTo([0.8, state.player[1], -4.8], 'combat-west-cabin-view', 0.3);
    } else if (enemy.position[0] > 5.5 && state.player[0] < 1.2 && enemy.position[2] < -2) {
      await walkTo([0.8, state.player[1], -7.7], 'combat-west-bow', 0.3);
      await walkTo([6.1, state.player[1], -7.7], 'combat-east-bow', 0.25);
      await walkTo([6.1, state.player[1], -4.5], 'combat-east-cabin-view', 0.3);
    }
  } else if (enemy.position[0] > 5.1 && state.player[0] < 5.1) {
    await walkTo([state.player[0], state.player[1], -2.7], 'combat-middle-front-aisle', 0.25);
    await walkTo([5.6, state.player[1], -2.7], 'combat-middle-east-view', 0.3);
  }
};
const nearestEnemy = (state) =>
  [...state.enemies].sort((a, b) => {
    const score = (enemy) => {
      const deltaY = Math.abs(enemy.position[1] - state.player[1]);
      return (
        (deltaY > 1.5 ? 10_000 : 0) +
        enemy.position.reduce((sum, v, i) => sum + (v - state.player[i]) ** 2, 0)
      );
    };
    return score(a) - score(b);
  })[0];
const resolveSkiff = async (context = 'meridian') => {
  const deadline = Date.now() + 240_000;
  await record('skiff-defense-started', {
    method:
      'normal rifle fire against nearest landed boarders from the open starboard rail reached around the bow; no hook-cut completion claimed',
  });
  const takeFiringLane = async () => {
    await returnToUpperDeck();
    let state = await snapshot();
    if (state.player[2] > 4.1) {
      await walkTo([2.15, state.player[1], 4.05], 'defense-clear-engine', 0.2);
      await walkTo([0.7, state.player[1], 4.05], 'defense-clear-kitchen', 0.25);
      state = await snapshot();
    }
    // The cabin fills x=1.5..5.25, z=-6.6..-2.36. The deck gun occupies
    // the rear entrance to its east aisle, so reach the firing lane around
    // the bow and reverse the same route after the encounter.
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
      await record(
        context === 'meridian' ? 'meridian-scripted-skiff-resolved' : 'preflight-skiff-resolved',
        { snapshot: state },
      );
      await returnToUpperDeck();
      await reachWestCabinLane();
      return;
    }
    if (state.enemies[0]) {
      const nearest = nearestEnemy(state);
      await positionForEnemy(nearest);
      const live = (await snapshot()).enemies.find((candidate) => candidate.id === nearest.id);
      if (live) await defendEnemy(live);
      continue;
    }
    await page.waitForTimeout(250);
  }
  throw new Error('scripted Meridian skiff did not resolve through normal defense');
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

const station = (piece) =>
  page.evaluate((id) => {
    const g = globalThis.__game.game;
    return (
      g.build
        .stationsNear(g.player.worldPosition, Infinity)
        .find((candidate) => candidate.piece === id)
        ?.position.toArray() ?? null
    );
  }, piece);

const targetStation = async (piece, at) => {
  let player = (await snapshot()).player;
  const y = player[1];
  if (player[0] > 4.5 && player[2] >= -0.5 && player[2] < 3.3) {
    await walkTo([5.8, y, 0], `preflight-${piece}-workbench-clear`, 0.3);
    await walkTo([4.2, y, 0], `preflight-${piece}-kitchen-east`, 0.3);
    await walkTo([4.2, y, -1.5], `preflight-${piece}-kitchen-front`, 0.3);
    await walkTo([0.7, y, -1.5], `preflight-${piece}-kitchen-west`, 0.3);
    player = (await snapshot()).player;
  }
  // The engine housing occupies x=-1.4..1.4, z=4.7..7.3. The
  // generator is reached through its east service gap, not the centerline.
  if (player[2] > 4.1) {
    await walkTo([2.15, y, 4.05], `preflight-${piece}-clear-engine`, 0.2);
    player = (await snapshot()).player;
  }
  await walkTo([0.7, y, player[2]], `preflight-${piece}-clear-kitchen`, 0.25);
  if (piece === 'workbench') {
    await walkTo([0.7, y, -1.5], 'preflight-workbench-front-west', 0.3);
    await walkTo([4.2, y, -1.5], 'preflight-workbench-front-east', 0.3);
    await walkTo([4.2, y, 0], 'preflight-workbench-east-aisle', 0.3);
    await walkTo([5.8, y, 0], 'preflight-workbench-approach', 0.3);
    await walkTo(at, 'preflight-workbench', 1.5);
  } else if (piece === 'generator') {
    await walkTo([0.7, y, 4.05], 'preflight-generator-west-aisle', 0.25);
    await walkTo([2.15, y, 4.05], 'preflight-generator-engine-turn', 0.2);
    await walkTo([2.15, y, 5.75], 'preflight-generator-service-gap', 0.2);
  } else {
    await walkTo([0.7, y, at[2]], `preflight-${piece}-west-aisle`, 0.3);
    await walkTo([at[0] - 1.5, y, at[2]], `preflight-${piece}-west-approach`, 0.3);
    await walkTo(at, `preflight-${piece}`, 1.5);
  }
  await moveAim(at);
  await page.waitForFunction(
    ({ expected }) => {
      const kind = globalThis.__game.game.interaction.current?.kind;
      return (
        kind === 'repair' ||
        kind === expected ||
        (['condenser', 'planter'].includes(expected) && kind === 'producer')
      );
    },
    { expected: piece },
    { timeout: 8_000 },
  );
  if (await page.evaluate(() => globalThis.__game.game.interaction.current?.kind === 'repair')) {
    const before = await snapshot();
    await page.keyboard.down('KeyE');
    try {
      await page.waitForFunction(
        ({ expected }) => {
          const kind = globalThis.__game.game.interaction.current?.kind;
          return (
            kind !== 'repair' &&
            (kind === expected ||
              (['condenser', 'planter'].includes(expected) && kind === 'producer'))
          );
        },
        { expected: piece },
        { timeout: 9_000 },
      );
    } finally {
      await page.keyboard.up('KeyE');
    }
    await record('preflight-station-support-repaired', { piece, before, after: await snapshot() });
    await moveAim(at);
  }
};

const targetGenerator = async () => {
  const at = await station('generator');
  if (!at) throw new Error('Meridian preflight cannot find the live generator');
  await targetStation('generator', at);
};

const reelOne = async () => {
  const targetAvailable = await page
    .waitForFunction(
      () => {
        const g = globalThis.__game.game;
        const p = g.player.worldPosition;
        return g.salvage.targets.some(
          (target) => Math.hypot(target.x - p.x, target.y - (p.y + 0.35), target.z - p.z) <= 33.5,
        );
      },
      null,
      { timeout: 5_000 },
    )
    .then(() => true)
    .catch(() => false);
  if (!targetAvailable) {
    await record('preflight-salvage-idle', { snapshot: await snapshot() });
    return false;
  }
  const before = await snapshot();
  const lootBefore = before.observed.filter((event) => event.type === 'loot:collected').length;
  let targetId = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const target = await page.evaluate(() => {
      const g = globalThis.__game.game;
      const p = g.player.worldPosition;
      const candidate = g.salvage.targets
        .filter((item) => Math.hypot(item.x - p.x, item.y - (p.y + 0.35), item.z - p.z) <= 33.5)
        .sort(
          (a, b) =>
            Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z) -
            Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z),
        )[0];
      return candidate
        ? { id: candidate.id, point: [candidate.x, candidate.y, candidate.z] }
        : null;
    });
    if (!target) return false;
    await moveAim(target.point);
    await page.waitForTimeout(100);
    if (await page.evaluate(() => globalThis.__game.game.reelReady)) {
      targetId = target.id;
      break;
    }
  }
  if (!targetId) throw new Error('normal look could not acquire preflight salvage');
  await page.keyboard.press('KeyF');
  await page.waitForFunction(
    ({ id, count }) => {
      const g = globalThis.__game.game;
      return (
        !g.salvage.targets.some((target) => target.id === id) &&
        (globalThis.__meridianContinuityEvents ?? []).filter(
          (event) => event.type === 'loot:collected',
        ).length > count
      );
    },
    { id: targetId, count: lootBefore },
    { timeout: 20_000 },
  );
  const after = await snapshot();
  if (JSON.stringify(after.resources) === JSON.stringify(before.resources))
    throw new Error('preflight salvage retired without transferring its contents');
  await record('preflight-salvage-recovered', { targetId, before, after });
  return true;
};

const claimProducer = async (piece) => {
  // Depositing carried fuel also frees its inventory slot for the actual output.
  if ((await snapshot()).resources.fuel > 0) await refuelCarried();
  const at = await station(piece);
  if (!at) throw new Error(`Meridian preflight cannot find ${piece}`);
  await targetStation(piece, at);
  const before = await snapshot();
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const after = await snapshot();
  await record('preflight-producer-claimed', { piece, before, after });
  return { before, after };
};

const useItem = async (itemId) => {
  await page.keyboard.press('Tab');
  await page.locator('#inv-panel').waitFor({ state: 'visible', timeout: 8_000 });
  const label =
    itemId === 'water' ? 'Clean Water' : itemId === 'repair-kit' ? 'Repair Kit' : 'Rations';
  const slot = page.locator('.inv-slot[data-side="player"]').filter({ hasText: label }).first();
  await slot.waitFor({ state: 'visible', timeout: 5_000 });
  const before = await snapshot();
  await slot.click();
  await page.waitForTimeout(200);
  const after = await snapshot();
  await page.keyboard.press('Escape');
  await settle(`preflight-used-${itemId}`);
  await record('preflight-item-used', { itemId, before, after });
  return { before, after };
};

const inventoryCount = (state, itemId) =>
  state.inventory.reduce((total, slot) => total + (slot?.itemId === itemId ? slot.count : 0), 0);

const restoreHealthIfNeeded = async () => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let state = await snapshot();
    if (state.health >= 60) return;

    if (inventoryCount(state, 'repair-kit') === 0) {
      if (state.resources.scrap < 2 || state.resources.components < 2) {
        await record('preflight-repair-unavailable', { snapshot: state });
        return;
      }
      const at = await station('workbench');
      if (!at) throw new Error('Meridian preflight cannot find the workbench');
      await targetStation('workbench', at);
      await page.keyboard.press('KeyE');
      const button = page.locator('[data-recipe="craft-repair-kit"]');
      await button.waitFor({ state: 'visible', timeout: 8_000 });
      if (await button.isDisabled())
        throw new Error('craft-repair-kit is disabled despite sufficient materials');
      const before = await snapshot();
      const craftedBefore = before.observed.filter(
        (event) => event.type === 'craft:completed' && event.event.recipeId === 'craft-repair-kit',
      ).length;
      await button.click();
      await page.waitForFunction(
        (count) =>
          (globalThis.__meridianContinuityEvents ?? []).filter(
            (event) =>
              event.type === 'craft:completed' && event.event.recipeId === 'craft-repair-kit',
          ).length > count,
        craftedBefore,
        { timeout: 8_000 },
      );
      const after = await snapshot();
      await page.keyboard.press('Escape');
      await settle('preflight-workbench-close');
      if (
        after.resources.scrap !== before.resources.scrap - 2 ||
        after.resources.components !== before.resources.components - 2 ||
        inventoryCount(after, 'repair-kit') !== inventoryCount(before, 'repair-kit') + 1
      )
        throw new Error('repair-kit craft did not conserve its exact materials and output');
      await record('preflight-repair-kit-crafted', { before, after });
      state = after;
    }

    const kitBefore = inventoryCount(state, 'repair-kit');
    const used = await useItem('repair-kit');
    const healthGain = used.after.health - used.before.health;
    if (
      healthGain <= 0 ||
      healthGain > 40 ||
      inventoryCount(used.after, 'repair-kit') !== kitBefore - 1
    )
      throw new Error('repair-kit use did not heal and consume exactly one kit');
  }
};

const repairDrive = async () => {
  const definitions = [
    { id: 'engine', max: 320, scrap: 80, panel: [0, 14.74, 4.4] },
    { id: 'leg-front-left', max: 180, scrap: 45, panel: [-6.3, 14.74, -4.8] },
    { id: 'leg-front-right', max: 180, scrap: 45, panel: [6.3, 14.74, -4.8] },
    { id: 'leg-rear-left', max: 180, scrap: 45, panel: [-6.3, 14.74, 4.8] },
    { id: 'leg-rear-right', max: 180, scrap: 45, panel: [6.3, 14.74, 4.8] },
  ];
  const state = await snapshot();
  const definition = definitions.find((def) =>
    state.damage.some((part) => part.id === def.id && part.health < def.max),
  );
  if (!definition) return false;
  await returnToUpperDeck();
  let player = (await snapshot()).player;
  if (player[2] > 4.1) {
    await walkTo([2.15, player[1], 4.05], 'maintenance-clear-engine', 0.2);
    player = (await snapshot()).player;
  }
  if (definition.id === 'engine') {
    await walkTo([0.7, player[1], player[2]], 'maintenance-engine-west-aisle', 0.25);
    await walkTo([0.7, player[1], 4.05], 'maintenance-engine-panel', 0.25);
  } else {
    await reachWestCabinLane();
    await walkTo([0.8, player[1], -7.7], 'maintenance-west-bow', 0.25);
    const side = Math.sign(definition.panel[0]) * 6.1;
    await walkTo([side, player[1], -7.7], 'maintenance-outer-bow', 0.2);
    await walkTo([side, player[1], definition.panel[2]], 'maintenance-leg-panel', 0.2);
  }
  await moveAim(definition.panel);
  await page.waitForFunction(
    (id) =>
      globalThis.__game.game.interaction.current?.id === id &&
      globalThis.__game.game.interaction.current?.kind === 'repair',
    definition.id,
    { timeout: 8_000 },
  );
  const before = await snapshot();
  const oldHealth = before.damage.find((part) => part.id === definition.id).health;
  const price = Math.max(1, Math.ceil(definition.scrap * (1 - oldHealth / definition.max)));
  if (before.resources.scrap < price)
    throw new Error(`insufficient actual scrap for ${definition.id} repair`);
  await page.keyboard.down('KeyE');
  try {
    await page.waitForFunction(
      ({ id, max }) =>
        globalThis.__game.game.machine.damage
          .toSave()
          .some((part) => part.id === id && part.health === max),
      definition,
      { timeout: 9_000 },
    );
  } finally {
    await page.keyboard.up('KeyE');
  }
  const after = await snapshot();
  if (before.resources.scrap - after.resources.scrap !== price)
    throw new Error(`${definition.id} repair did not spend exactly ${price} scrap`);
  await record('preflight-subsystem-repaired', { id: definition.id, price, before, after });
  if (definition.id !== 'engine') {
    const side = Math.sign(definition.panel[0]) * 6.1;
    await walkTo([side, player[1], -7.7], 'maintenance-return-outer-bow', 0.2);
    await walkTo([0.8, player[1], -7.7], 'maintenance-return-west-bow', 0.25);
    await walkTo([0.8, player[1], -1.5], 'maintenance-return-center', 0.3);
  }
  return true;
};
const recoveryStep = async () => {
  const state = await snapshot();
  if (state.health <= 0) {
    await awaitRespawn('Meridian preflight');
    return 'respawn';
  }
  if (state.skiff.active) {
    await resolveSkiff('preflight');
    return 'skiff';
  }
  if (state.gunboat.active) {
    await resolveGunboat();
    return 'gunboat';
  }
  if (state.enemies[0]) {
    const nearest = nearestEnemy(state);
    await positionForEnemy(nearest);
    const live = (await snapshot()).enemies.find((candidate) => candidate.id === nearest.id);
    if (live) await defendEnemy(live);
    return 'enemy';
  }
  if (await repairDrive()) return 'maintenance';
  return (await reelOne()) ? 'salvage' : 'idle';
};

const refuelCarried = async () => {
  if ((await snapshot()).resources.fuel <= 0) return false;
  await targetGenerator();
  const before = await snapshot();
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  const after = await snapshot();
  const tankGain = after.power.fuel - before.power.fuel;
  const carriedSpent = before.resources.fuel - after.resources.fuel;
  const elapsed = Math.max(0, after.simTime - before.simTime);
  const burnAllowance = before.power.burnRate * elapsed + 0.02;
  if (
    carriedSpent <= 0 ||
    tankGain > carriedSpent + 0.02 ||
    carriedSpent - tankGain > burnAllowance
  )
    throw new Error(
      `generator refuel violated fuel conservation: gain=${tankGain}, spent=${carriedSpent}, elapsed=${elapsed}`,
    );
  await record('preflight-refueled', {
    before,
    after,
    tankGain,
    carriedSpent,
    elapsed,
    burnAllowance,
  });
  return true;
};

const producerReady = (piece) =>
  page.evaluate((id) => {
    const g = globalThis.__game.game;
    return g.build
      .producersNear(g.player.worldPosition, Infinity)
      .some((producer) => producer.piece === id && producer.stored > 0);
  }, piece);

const craftRations = async () => {
  const at = await station('stove');
  if (!at) throw new Error('Meridian preflight cannot find the stove');
  await targetStation('stove', at);
  await page.keyboard.press('KeyE');
  const button = page.locator('[data-recipe="cook-rations"]');
  await button.waitFor({ state: 'visible', timeout: 8_000 });
  if (await button.isDisabled()) {
    await record('preflight-cooking-refused', {
      panel: await page.locator('#inv-panel').innerText(),
      snapshot: await snapshot(),
    });
    throw new Error('cook-rations is disabled after collecting inputs');
  }
  const before = await snapshot();
  await button.click();
  await page.waitForFunction(
    (count) =>
      (globalThis.__meridianContinuityEvents ?? []).filter(
        (event) => event.type === 'craft:completed' && event.event.recipeId === 'cook-rations',
      ).length > count,
    before.observed.filter(
      (event) => event.type === 'craft:completed' && event.event.recipeId === 'cook-rations',
    ).length,
    { timeout: 8_000 },
  );
  const after = await snapshot();
  await page.keyboard.press('Escape');
  await settle('preflight-stove-close');
  await record('preflight-rations-cooked', { before, after });
};

const reachRadioAisle = async () => {
  await returnToUpperDeck();
  let { player } = await snapshot();
  const y = player[1];
  if (player[0] > 5.5 && player[2] < -2) {
    await reachWestCabinLane();
    player = (await snapshot()).player;
  }
  if (player[0] > 4.5 && player[2] >= -0.5 && player[2] < 3.3) {
    await walkTo([5.8, y, 0], 'radio-workbench-clear', 0.3);
    await walkTo([4.2, y, 0], 'radio-kitchen-east', 0.3);
    await walkTo([4.2, y, -1.5], 'radio-kitchen-front', 0.3);
    player = (await snapshot()).player;
  }
  if (player[2] > 4.1) {
    await walkTo([2.15, y, 4.05], 'radio-engine-gap', 0.2);
    player = (await snapshot()).player;
  }
  await walkTo([0.7, y, player[2]], 'radio-kitchen-west', 0.25);
  await walkTo([0.7, y, -1.5], 'radio-open-aisle', 0.25);
};

async function ensureEconomyGovernor({ page, snapshot, moveAim, walkTo, settle, record, recover }) {
  const UPGRADE_ID = 'lean-governor';
  const readUpgrade = () =>
    page.evaluate((id) => {
      const g = globalThis.__game.game;
      const save = g.progression.upgrades.toSave();
      return {
        researched: save.researched.includes(id),
        active: save.active.power === id,
        radio: g.radioWorldPosition.toArray(),
        stable: g.isStableForResearch(),
        panel: {
          radio: g.radioUI.isOpen,
          research: g.researchUI.isOpen,
        },
      };
    }, UPGRADE_ID);

  const reachRadio = async () => {
    await reachRadioAisle();
    const { radio } = await readUpgrade();
    await walkTo(radio, 'governor-radio', 1.45);
    await moveAim(radio);
    await page.waitForFunction(
      () => globalThis.__game.game.interaction.current?.kind === 'radio',
      null,
      { timeout: 8_000 },
    );
  };

  const closePanelsForRecovery = async () => {
    if (await page.evaluate(() => globalThis.__game.game.panelsOpen)) {
      await page.keyboard.press('Escape');
      await settle('governor-panel-close-for-recovery');
    }
  };

  const openResearch = async () => {
    await reachRadio();
    await page.keyboard.press('KeyE');
    await page.locator('[data-radio-research]').waitFor({ state: 'visible', timeout: 8_000 });
    await page.locator('[data-radio-research]').click();
    await page.locator('.research-panel').waitFor({ state: 'visible', timeout: 8_000 });
  };

  const deadline = Date.now() + 240_000;
  let charged = false;
  while (Date.now() < deadline) {
    const beforeState = await readUpgrade();
    if (!beforeState.stable) {
      await closePanelsForRecovery();
      await recover('economy-governor-admission');
      continue;
    }

    await openResearch();
    const row = page.locator(`[data-upgrade="${UPGRADE_ID}"]`);
    await row.waitFor({ state: 'visible', timeout: 8_000 });
    let upgrade = await readUpgrade();

    if (!upgrade.researched) {
      const research = row.locator(`[data-research-id="${UPGRADE_ID}"]`);
      if (!(await research.isVisible()) || (await research.isDisabled())) {
        await closePanelsForRecovery();
        await recover('economy-governor-research-refusal');
        continue;
      }
      const before = await snapshot();
      await research.click();
      await page.waitForFunction(
        (id) => globalThis.__game.game.progression.upgrades.hasResearched(id),
        UPGRADE_ID,
        { timeout: 8_000 },
      );
      const after = await snapshot();
      if (
        after.resources.scrap !== before.resources.scrap - 40 ||
        after.resources.components !== before.resources.components - 8
      ) {
        throw new Error(
          'Economy Governor research did not charge exactly 40 scrap and 8 components',
        );
      }
      charged = true;
      await record('economy-governor-researched', {
        before,
        after,
        charged: { scrap: 40, components: 8 },
      });
      upgrade = await readUpgrade();
    }

    if (!upgrade.active) {
      const install = row.locator(`[data-activate-id="${UPGRADE_ID}"]`);
      await install.waitFor({ state: 'visible', timeout: 8_000 });
      if (await install.isDisabled()) {
        await closePanelsForRecovery();
        await recover('economy-governor-install-refusal');
        continue;
      }
      const before = await snapshot();
      await install.click();
      await page.waitForFunction(
        (id) => globalThis.__game.game.progression.upgrades.isActive(id),
        UPGRADE_ID,
        { timeout: 8_000 },
      );
      const after = await snapshot();
      if (
        after.resources.scrap !== before.resources.scrap ||
        after.resources.components !== before.resources.components
      ) {
        throw new Error('Economy Governor installation was not free');
      }
      await record('economy-governor-installed', { before, after });
    }

    const final = await snapshot();
    const finalUpgrade = await readUpgrade();
    if (!finalUpgrade.researched || !finalUpgrade.active) {
      throw new Error('Economy Governor did not remain researched and installed');
    }
    if (
      Math.abs(final.power.burnRate - 0.033) > 0.0005 ||
      Math.abs(final.power.capacity - 14) > 0.001 ||
      Math.abs(final.power.draw - 6) > 0.001
    ) {
      throw new Error(`Economy Governor power state mismatch: ${JSON.stringify(final.power)}`);
    }
    await closePanelsForRecovery();
    await record('economy-governor-ready', { charged, snapshot: final });
    return { charged, snapshot: final };
  }

  throw new Error('Economy Governor could not be researched/installed within the recovery window');
}

async function ensureRecoveryStorage({ page, snapshot, moveAim, walkTo, settle, record, recover }) {
  const PIECE_COST = {
    floor: { scrap: 8, components: 0 },
    crate: { scrap: 15, components: 2 },
  };
  const waitBuildReady = async (label) => {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const ready = await page.evaluate(() => {
        const g = globalThis.__game.game;
        return !g.state.paused && g.buildGuard.canEnter();
      });
      if (ready) return;
      await recover(`storage-${label}`);
    }
    throw new Error(`storage build guard did not clear for ${label}`);
  };
  const storageCandidates = () =>
    page.evaluate(() => {
      const g = globalThis.__game.game;
      return g.build
        .stationsNear(g.player.worldPosition, Infinity)
        .filter((station) => station.piece === 'crate')
        .map((station) => {
          const slots = g.build.crateContainer(station.instanceId)?.serialise() ?? [];
          return {
            id: station.instanceId,
            position: station.position.toArray(),
            slots,
            empty: slots.filter((slot) => !slot).length,
            distance: station.position.distanceTo(g.player.worldPosition),
          };
        });
    });
  const placementCandidates = (piece) =>
    page.evaluate((id) => {
      const g = globalThis.__game.game;
      const p = g.player.worldPosition;
      const out = [];
      for (let x = -2; x <= -2; x += 1) {
        for (let z = -1; z <= 0; z += 1) {
          const placement = { piece: id, cell: { x, y: 0, z }, rotation: 0 };
          if (!g.build.canPlace(placement).ok) continue;
          const point = g.build.constructor.transformFor(
            id,
            placement.cell,
            placement.edge,
            placement.rotation,
          ).position;
          g.build.group.localToWorld(point);
          const distance = Math.hypot(point.x - p.x, point.z - p.z);
          // West/central upper deck only: clear of the starboard kitchen,
          // command-house shell, aft engine, and the fixed stair mouth.
          if (
            point.x <= 0.2 &&
            point.z >= -4.1 &&
            point.z <= 4.1 &&
            !(point.x > -3.1 && point.z > 1.7) &&
            distance >= 2.5 &&
            distance <= 7
          )
            out.push({ placement, world: point.toArray(), distance });
        }
      }
      return out.sort((a, b) => a.distance - b.distance);
    }, piece);
  const place = async (piece, requiredCell = null) => {
    await waitBuildReady(piece);
    const before = await snapshot();
    await page.keyboard.press('KeyB');
    await page.locator(`[data-category="${piece === 'floor' ? 'structure' : 'station'}"]`).waitFor({
      state: 'visible',
      timeout: 8_000,
    });
    await page.locator(`[data-category="${piece === 'floor' ? 'structure' : 'station'}"]`).click();
    await page.locator(`[data-piece="${piece}"]`).click();
    await page.waitForFunction(
      (id) => globalThis.__game.game.selectedPiece === id && Boolean(document.pointerLockElement),
      piece,
      { timeout: 8_000 },
    );
    const candidates = await placementCandidates(piece);
    const filtered = requiredCell
      ? candidates.filter(
          ({ placement }) =>
            placement.cell.x === requiredCell.x &&
            placement.cell.y === requiredCell.y &&
            placement.cell.z === requiredCell.z,
        )
      : candidates;
    await record('recovery-storage-candidates', { piece, requiredCell, candidates: filtered });
    let selected = null;
    for (const candidate of filtered) {
      await moveAim(candidate.world);
      await page.waitForTimeout(140);
      const preview = await page.evaluate(() => {
        const value = globalThis.__game.game.buildPreview;
        return { placement: value.placement, validation: value.validation, target: value.target };
      });
      await record('recovery-storage-preview', { piece, candidate, preview });
      if (
        preview.validation?.ok &&
        !preview.target?.rejection &&
        preview.placement?.piece === piece &&
        preview.placement?.cell?.x === candidate.placement.cell.x &&
        preview.placement?.cell?.y === candidate.placement.cell.y &&
        preview.placement?.cell?.z === candidate.placement.cell.z
      ) {
        selected = candidate;
        break;
      }
    }
    if (!selected) throw new Error(`no exact camera-visible safe ${piece} placement`);
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(90);
    await page.mouse.up({ button: 'left' });
    await page.waitForFunction(
      ({ id, count }) =>
        globalThis.__game.game.build.serialise().filter((entry) => entry.definitionId === id)
          .length > count,
      {
        id: piece,
        count: before.structures.filter((entry) => entry.definitionId === piece).length,
      },
      { timeout: 8_000 },
    );
    await page.keyboard.press('Escape');
    await settle(`storage-${piece}-placed`);
    const after = await snapshot();
    const cost = PIECE_COST[piece];
    if (
      before.resources.scrap - after.resources.scrap !== cost.scrap ||
      before.resources.components - after.resources.components !== cost.components
    )
      throw new Error(`${piece} did not consume its exact build cost`);
    for (const id of ['fuel', 'water', 'greens', 'rations'])
      if (before.resources[id] !== after.resources[id])
        throw new Error(`${piece} placement unexpectedly changed ${id}`);
    await record('recovery-storage-piece-built', { piece, selected, before, after });
    return selected;
  };

  await reachRadioAisle();
  const storageY = (await snapshot()).player[1];
  await walkTo([0.7, storageY, -7.7], 'storage-build-west-bow', 0.25);
  await walkTo([-3.7, storageY, -7.7], 'storage-build-outer-bow', 0.2);
  await walkTo([-3.7, storageY, -5.8], 'storage-build-clear-view', 0.2);
  let crates = await storageCandidates();
  const carried = (await snapshot()).inventory;
  if (crates.length && carried.filter((slot) => !slot).length >= 6) {
    await record('recovery-storage-retained', { crates, snapshot: await snapshot() });
    return { crateId: crates[0].id, movedScrap: 0 };
  }
  let crate =
    crates
      .filter((candidate) => candidate.empty >= 8 && candidate.distance <= 7)
      .sort((a, b) => a.distance - b.distance)[0] ?? null;
  if (!crate) {
    // Prefer a new crate on an existing safe floor. If none exists, place one
    // ordinary deck plate and then target that exact cell for the crate.
    let crateSites = await placementCandidates('crate');
    let cell = crateSites[0]?.placement.cell ?? null;
    if (!cell) cell = (await place('floor')).placement.cell;
    await place('crate', cell);
    crates = await storageCandidates();
    crate =
      crates
        .filter((candidate) => candidate.empty >= 8 && candidate.distance <= 7)
        .sort((a, b) => a.distance - b.distance)[0] ?? null;
  }
  if (!crate) throw new Error('storage crate with eight free slots was not created');

  const y = (await snapshot()).player[1];
  await walkTo([-3.7, y, crate.position[2] - 1.3], 'recovery-storage-crate', 0.2);
  await moveAim(crate.position);
  await page.waitForFunction(
    (id) => globalThis.__game.game.interaction.current?.id === id,
    crate.id,
    { timeout: 8_000 },
  );
  await page.keyboard.press('KeyE');
  await page.locator('#inv-panel').waitFor({ state: 'visible', timeout: 8_000 });
  await page.locator('.inv-grid.is-crate').waitFor({ state: 'visible', timeout: 8_000 });

  const containerLedger = (id) =>
    page.evaluate((crateId) => {
      const g = globalThis.__game.game;
      const player = g.inventory.serialise();
      const crateSlots = g.build.crateContainer(crateId)?.serialise() ?? [];
      const counts = (slots) => {
        const result = {};
        for (const slot of slots)
          if (slot) result[slot.itemId] = (result[slot.itemId] ?? 0) + slot.count;
        return result;
      };
      return {
        player,
        crate: crateSlots,
        playerCounts: counts(player),
        crateCounts: counts(crateSlots),
      };
    }, id);
  const beforeTransfer = await containerLedger(crate.id);
  const fullScrap = () =>
    page
      .locator('.inv-slot[data-side="player"]')
      .filter({ has: page.locator('.inv-name', { hasText: 'Scrap Metal' }) })
      .filter({ has: page.locator('.inv-count', { hasText: /^100$/ }) });
  if ((await fullScrap().count()) < 8)
    throw new Error('player does not carry eight full scrap stacks for the storage proof');
  for (let moved = 0; moved < 8; moved += 1) {
    await fullScrap().first().click();
    await page.waitForTimeout(80);
  }
  const afterTransfer = await containerLedger(crate.id);
  const allIds = new Set([
    ...Object.keys(beforeTransfer.playerCounts),
    ...Object.keys(beforeTransfer.crateCounts),
    ...Object.keys(afterTransfer.playerCounts),
    ...Object.keys(afterTransfer.crateCounts),
  ]);
  for (const id of allIds) {
    const before = (beforeTransfer.playerCounts[id] ?? 0) + (beforeTransfer.crateCounts[id] ?? 0);
    const after = (afterTransfer.playerCounts[id] ?? 0) + (afterTransfer.crateCounts[id] ?? 0);
    if (before !== after)
      throw new Error(`storage transfer lost or created ${id}: ${before} -> ${after}`);
  }
  if (
    (beforeTransfer.playerCounts.scrap ?? 0) - (afterTransfer.playerCounts.scrap ?? 0) !== 800 ||
    (afterTransfer.crateCounts.scrap ?? 0) - (beforeTransfer.crateCounts.scrap ?? 0) !== 800
  )
    throw new Error('storage transfer did not move exactly eight full scrap stacks');
  await page.keyboard.press('Escape');
  await settle('recovery-storage-closed');
  await record('recovery-storage-ready', {
    crateId: crate.id,
    movedScrap: 800,
    before: beforeTransfer,
    after: afterTransfer,
    snapshot: await snapshot(),
  });
  await walkTo([-3.7, y, -7.7], 'storage-return-outer-bow', 0.2);
  await walkTo([0.7, y, -7.7], 'storage-return-west-bow', 0.25);
  await walkTo([0.7, y, -1.5], 'storage-return-center', 0.25);
  return { crateId: crate.id, movedScrap: 800 };
}

const prepareForMeridian = async () => {
  const started = (await snapshot()).simTime;
  let catches = 0;
  const recover = async (label) => {
    const state = await snapshot();
    if (state.simTime - started > 750 || catches >= 12)
      throw new Error(`normal recovery exceeded its ${label} budget: ${JSON.stringify(state)}`);
    const result = await recoveryStep();
    if (result === 'salvage') {
      catches += 1;
      if ((await snapshot()).resources.fuel > 0) await refuelCarried();
    }
    return result;
  };
  let state = await snapshot();
  while (state.damage.some((part) => part.health < (part.id === 'engine' ? 320 : 180))) {
    await recover('machine maintenance');
    state = await snapshot();
  }
  if ((await snapshot()).resources.fuel > 0) await refuelCarried();
  await ensureEconomyGovernor({ page, snapshot, moveAim, walkTo, settle, record, recover });
  const replenishNeeds = async () => {
    state = await snapshot();
    if (state.needs.hydration < 60) {
      if (state.resources.water <= 0) {
        while (!(await producerReady('condenser'))) await recover('condenser');
        const claimed = await claimProducer('condenser');
        if (claimed.after.resources.water <= claimed.before.resources.water)
          throw new Error('condenser claim did not provide water');
      }
      const drank = await useItem('water');
      if (
        drank.after.needs.hydration <= drank.before.needs.hydration ||
        drank.after.resources.water !== drank.before.resources.water - 1
      )
        throw new Error('preflight water was not consumed exactly once');
    }

    state = await snapshot();
    if (state.needs.nourishment < 60) {
      if (state.resources.rations <= 0) {
        if (state.resources.greens <= 0) {
          while (!(await producerReady('planter'))) await recover('planter');
          const claimed = await claimProducer('planter');
          if (claimed.after.resources.greens <= claimed.before.resources.greens)
            throw new Error('planter claim did not provide greens');
        }
        if ((await snapshot()).resources.water <= 0) {
          while (!(await producerReady('condenser'))) await recover('cooking-water');
          const claimed = await claimProducer('condenser');
          if (claimed.after.resources.water <= claimed.before.resources.water)
            throw new Error('condenser claim did not provide cooking water');
        }
        await craftRations();
      }
      const ate = await useItem('rations');
      if (
        ate.after.needs.nourishment <= ate.before.needs.nourishment ||
        ate.after.resources.rations !== ate.before.resources.rations - 1
      )
        throw new Error('preflight ration was not consumed exactly once');
    }
  };
  await replenishNeeds();
  await restoreHealthIfNeeded();
  await ensureRecoveryStorage({ page, snapshot, moveAim, walkTo, settle, record, recover });

  // Recovery and cooking consume live travel time; replenish any route reserve
  // burned while meeting needs before opening the story offer.
  while ((await snapshot()).power.fuel < 28) {
    const stateBefore = await snapshot();
    if (stateBefore.simTime - started > 750 || catches >= 12)
      throw new Error(
        `normal recovery spent its bounded fuel reserve: ${JSON.stringify(stateBefore)}`,
      );
    if (stateBefore.resources.fuel > 0) await refuelCarried();
    else await recover('final-fuel');
  }
  await replenishNeeds();
  await restoreHealthIfNeeded();
  while ((await snapshot()).power.fuel < 28) {
    if ((await snapshot()).resources.fuel > 0) await refuelCarried();
    else await recover('post-maintenance-fuel');
  }
  const ready = await snapshot();
  if (ready.simTime - started > 750 || catches > 12)
    throw new Error(
      `Meridian preflight exceeded its shared recovery budget: ${JSON.stringify(ready)}`,
    );
  if (ready.needs.hydration < 60 || ready.needs.nourishment < 60 || ready.power.fuel < 28)
    throw new Error(
      `Meridian preflight did not reach its bounded reserve: ${JSON.stringify(ready)}`,
    );
  await record('meridian-readiness', {
    snapshot: ready,
    minimums: { fuel: 28, hydration: 60, nourishment: 60 },
    salvageCatches: catches,
  });
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
  throw new Error('campaign did not reach a safe save boundary after Meridian departure');
};

const interact = async (id, type, approach = null, radius = 1.5) => {
  const before = await snapshot();
  const retained =
    (type === 'journal' && before.story.journalArchive.includes(id)) ||
    (type === 'objective' && before.story.active?.objectivesCompleted?.includes(id));
  if (retained) {
    await record(`meridian-${type}-retained`, { id, snapshot: before });
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
    await record('meridian-unique-retained', { id, factId, snapshot: before });
    return;
  }
  if (!item) throw new Error(`missing Meridian interactable ${id}`);
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
  await record(`meridian-${type}`, { id, before, after: await snapshot() });
};

const saveAndColdContinue = async () => {
  await waitSafeToSave();
  await page.screenshot({
    path: path.join(output, 'meridian-final-checkpoint.png'),
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
    throw new Error('committed Meridian save differs from paused checkpoint');
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
  await settle('meridian-cold-continue');
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
  ])
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
  if (failures.length) throw new Error(`Meridian cold Continue mismatch: ${failures.join('; ')}`);
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
    globalThis.__meridianContinuityEvents = [];
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
      'loot:collected',
      'producer:output',
      'craft:completed',
    ])
      g.bus.on(type, (event) =>
        globalThis.__meridianContinuityEvents.push({ type, event, simTime: g.state.simTime }),
      );
  });
  const initial = await snapshot();
  const completedInitially = initial.story.completed.includes('last-garden-meridian');
  const resumedActive = initial.story.active?.expeditionId === 'last-garden-meridian';
  if (!initial.story.completed.includes('glass-orchard'))
    throw new Error('MER-LATE source has not durably completed Glass Orchard');
  if (
    !completedInitially &&
    !resumedActive &&
    (initial.phase !== 'complete' ||
      initial.destination.active ||
      !initial.destination.playerOnMachine)
  )
    throw new Error(`source is not a safe pre-Meridian boundary: ${JSON.stringify(initial)}`);
  const routeSelectionResume =
    resumedActive && initial.phase === 'route-selection' && initial.story.active.routeId === null;
  if (
    resumedActive &&
    !routeSelectionResume &&
    (initial.story.active.routeId !== 'meridian-quiet-line' ||
      !['approach', 'braking', 'docked'].includes(initial.phase))
  )
    throw new Error(
      `source contains an incompatible active Meridian route: ${JSON.stringify(initial)}`,
    );
  if (completedInitially && (!priorSkiffProof || !priorCompletionProof))
    throw new Error('completed Meridian resume lacks prior skiff and physical-departure evidence');
  if (!completedInitially && !resumedActive) await prepareForMeridian();
  const radio = await page.evaluate(() => globalThis.__game.game.radioWorldPosition.toArray());
  if (!completedInitially) {
    if (!resumedActive || routeSelectionResume) {
      await reachRadioAisle();
      if (routeSelectionResume) {
        const helm = await page.evaluate(() => {
          const g = globalThis.__game.game;
          if (!g.helmInteract) return null;
          const point = g.helmInteract.position.clone();
          g.helmInteract.getWorldPosition(point);
          return point.toArray();
        });
        if (!helm) throw new Error('route-selection resume could not find the live helm');
        await walkTo(helm, 'meridian-route-resume-helm', 1.4);
        await page.keyboard.press('KeyE');
        await record('meridian-route-selection-resumed', { snapshot: await snapshot() });
      } else {
        await walkTo(radio, 'meridian-radio', 1.5);
        await page.keyboard.press('KeyE');
        await page
          .locator('[data-radio-trace-button]')
          .waitFor({ state: 'visible', timeout: 15_000 });
        const offer = await page.locator('[data-panel="radio"]').innerText();
        if (!/last garden meridian/i.test(offer))
          throw new Error(`Last Garden Meridian offer missing: ${offer}`);
        await record('meridian-offer', { offer, snapshot: await snapshot() });
        await page.locator('[data-radio-trace-button]').click();
      }
      await page
        .locator('[data-route="meridian-quiet-line"]')
        .waitFor({ state: 'visible', timeout: 20_000 });
      const routeCard = await page.locator('[data-route-card="meridian-quiet-line"]').innerText();
      if (!/1250\s*m/i.test(routeCard) || !/skiff/i.test(routeCard) || !/520\s*m/i.test(routeCard))
        throw new Error(
          `quiet-line route card did not disclose its distance and encounter: ${routeCard}`,
        );
      await record('meridian-route-card', { text: routeCard });
      try {
        await page.locator('[data-route="meridian-quiet-line"]').click();
        await page.locator('[data-route-confirm="meridian-quiet-line"]').click();
      } catch (error) {
        await captureRouteClickFailure('quiet-line-route-select-or-confirm', error);
        throw error;
      }
      await page.waitForFunction(
        () => {
          const state = globalThis.__game.game.story.snapshot(0);
          return (
            state.expeditionId === 'last-garden-meridian' &&
            state.routeId === 'meridian-quiet-line' &&
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
      await settle('meridian-route-selected');
      await record('meridian-route-accepted', { routeCard, snapshot: await snapshot() });
    } else {
      await record('meridian-route-resumed', { snapshot: initial, priorSkiffProof });
    }
    const travelDeadline = Date.now() + 12 * 60_000;
    let sawSkiff = priorSkiffProof;
    while (Date.now() < travelDeadline) {
      const state = await snapshot();
      if (state.destination.docked) break;
      if (state.health <= 0) {
        await awaitRespawn('meridian-approach');
        continue;
      }
      if (state.paused) throw new Error('unexpected pause during Meridian approach');
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
        const nearest = nearestEnemy(state);
        await positionForEnemy(nearest);
        const live = (await snapshot()).enemies.find((enemy) => enemy.id === nearest.id);
        if (live) await defendEnemy(live);
        continue;
      }
      if (await repairDrive()) continue;
      await page.waitForTimeout(750);
    }
    const docked = await snapshot();
    sawSkiff ||= docked.observed.some(
      (event) => event.type === 'boarding:started' && event.event?.encounterId === 'skiff',
    );
    if (!docked.destination.docked || !docked.destination.authored)
      throw new Error(`full-art Meridian did not dock: ${JSON.stringify(docked)}`);
    if (!sawSkiff || docked.story.active?.scriptedEncounter !== 'resolved')
      throw new Error('quiet-line scripted skiff was not observed and resolved');
    await record('meridian-docked', { snapshot: docked });
    await page.screenshot({ path: path.join(output, 'meridian-docked.png'), fullPage: true });

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
        await walkTo(machineAisle[i], `machine-to-meridian-${i + 1}`, 1.1);
      await walkTo(local(-9.5, 0), 'meridian-gangway', 1.2);
      await walkTo(local(-7.8, 0), 'meridian-entry', 0.7);
      await walkTo(local(0, 0), 'meridian-center-aisle', 0.7);
    } else {
      const saved = docked.story;
      if (saved.recoveredUniques.includes('meridian-solution')) {
        await walkTo(local(4, 3.3), 'resume-solution-approach', 0.8);
        await walkTo(local(1.5, 3.3), 'resume-solution-lane', 0.7);
      } else if (saved.journalArchive.includes('meridian-civilian-record')) {
        await walkTo(local(-4, -1.1), 'resume-civilian-record', 0.8);
      } else if (saved.journalArchive.includes('meridian-common-record')) {
        await walkTo(local(0, -5.4), 'resume-common-record', 0.8);
      } else if (saved.active?.objectivesCompleted?.includes('meridian-archive-installed')) {
        await walkTo(local(-5, 3.3), 'resume-archive', 0.8);
      } else if (saved.active?.objectivesCompleted?.includes('meridian-transmitter-online')) {
        await walkTo(local(1.5, -2), 'resume-transmitter-turn', 0.8);
      } else {
        await walkTo(local(-7.8, 0), 'resume-meridian-entry', 0.8);
      }
      await walkTo(local(0, 0), 'resume-meridian-center', 0.8);
      await record('meridian-docked-resume-positioned', { snapshot: await snapshot() });
    }

    await walkTo(local(1.5, -2), 'meridian-transmitter-turn', 0.7);
    await walkTo(local(2.4, -2), 'meridian-transmitter-approach', 0.6);
    await interact('meridian-transmitter-online', 'objective');
    await walkTo(local(1.5, -2), 'meridian-transmitter-return', 0.7);
    await walkTo(local(0, 0), 'meridian-center-after-transmitter', 0.7);
    await walkTo(local(-5, 0), 'meridian-archive-aisle', 0.7);
    await walkTo(local(-5, 3.3), 'meridian-archive-approach', 0.7);
    await interact('meridian-archive-installed', 'objective');

    await walkTo(local(-5, 0), 'meridian-archive-return', 0.7);
    await walkTo(local(0, 0), 'meridian-common-spine', 0.7);
    await walkTo(local(0, -5.4), 'meridian-common-approach', 0.7);
    await interact('meridian-common-record', 'journal');
    await walkTo(local(0, 0), 'meridian-common-return', 0.7);
    await walkTo(local(-4, -1.1), 'meridian-civilian-approach', 0.7);
    await interact('meridian-civilian-record', 'journal');
    await page.screenshot({ path: path.join(output, 'meridian-records.png'), fullPage: true });

    await walkTo(local(0, 0), 'meridian-solution-spine', 0.7);
    await walkTo(local(1.5, 3.3), 'meridian-solution-lane', 0.7);
    await walkTo(local(4, 3.3), 'meridian-solution-approach', 0.7);
    await interact('meridian-solution', 'unique');

    const objectives = await snapshot();
    const requiredObjectives = ['meridian-transmitter-online', 'meridian-archive-installed'];
    const requiredUniques = ['meridian-solution'];
    const requiredJournals = ['meridian-common-record', 'meridian-civilian-record'];
    for (const id of requiredObjectives)
      if (!objectives.story.active?.objectivesCompleted?.includes(id))
        throw new Error(`missing objective ${id}`);
    for (const id of requiredUniques)
      if (!objectives.story.recoveredUniques.includes(id)) throw new Error(`missing unique ${id}`);
    for (const id of requiredJournals)
      if (!objectives.story.journalArchive.includes(id)) throw new Error(`missing journal ${id}`);
    if (objectives.story.journalArchive.includes('meridian-defense-record'))
      throw new Error('quiet-line route incorrectly learned the cordon-gap testimony');
    for (const id of requiredUniques)
      if (objectives.story.recoveredUniques.filter((fact) => fact === id).length !== 1)
        throw new Error(`${id} was not persisted exactly once`);
    if (objectives.course.tier !== 3)
      throw new Error('Meridian solution did not unlock course tier 3');
    await record('meridian-objectives-complete', { snapshot: objectives });

    await walkTo(local(1.5, 3.3), 'meridian-solution-return', 0.7);
    await walkTo(local(0, 0), 'meridian-exit-spine', 0.7);
    await walkTo(local(-7.8, 0), 'meridian-exit', 0.7);
    await walkTo(local(-9.5, 0), 'meridian-return-gangway', 1.1);
    await walkTo(local(-10.5, 0), 'meridian-machine-side', 1.4);
    for (let i = machineAisle.length - 1; i >= 0; i -= 1)
      await walkTo(machineAisle[i], `meridian-to-machine-${machineAisle.length - i}`, 1.1);
    await page.waitForFunction(
      () =>
        globalThis.__game.game.destination.playerOnMachine(
          globalThis.__game.game.player.worldPosition,
        ),
      null,
      { timeout: 15_000 },
    );
    await walkTo(radio, 'meridian-return-radio', 1.5);
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
    await settle('meridian-departed');
    const departed = await snapshot();
    if (
      !departed.story.completed.includes('last-garden-meridian') ||
      departed.destination.colliders !== 0 ||
      departed.destination.active ||
      !departed.destination.playerOnMachine
    )
      throw new Error(`Meridian departure incomplete: ${JSON.stringify(departed)}`);
    await record('meridian-departure', { snapshot: departed });
    observedDeaths = departed.observed.filter((event) => event.type === 'player:died');
    await record('observed-player-deaths', { deaths: observedDeaths });
  }

  const restored = await saveAndColdContinue();
  if (!restored.story.completed.includes('last-garden-meridian') || restored.course.tier !== 3)
    throw new Error('Meridian completion or tier 3 was lost on cold Continue');
  if (errors.length) throw new Error(errors.join('\n'));
  const summary = {
    status: 'passed',
    scope:
      'full-art Meridian quiet-line route with one scripted skiff; cordon-gap route and ending not claimed',
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
          (globalThis.__meridianContinuityEvents ?? []).filter(
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
