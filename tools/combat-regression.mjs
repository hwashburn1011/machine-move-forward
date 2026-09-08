/**
 * Focused combat regression runner for recurring skiff cleanup, fresh infantry
 * arrivals, and room navigation/build collision.
 *
 * This intentionally boots a normal Game and only uses fixture setup through
 * the public runtime seams. It does not teleport enemies or damage walls: the
 * skiff is ended through its live hull API, and the room enemy moves and
 * attacks through EnemyManager/BuildSystem. Simulation uses the real fixed
 * game loop without waiting for software-rendered frames. The tiny room uses
 * a shorter melee reach so an enemy must enter it to attack the player.
 */
import { chromium } from '@playwright/test';
import { BASE_URL } from './base-url.mjs';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
const results = [];

page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));

const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
};

const sim = async (seconds) => {
  await page.evaluate((duration) => {
    const game = globalThis.__game.game;
    game.stop();
    for (let tick = 0; tick < Math.ceil(duration * 60); tick++) game.fixedUpdate(1 / 60);
  }, seconds);
};

const until = async (predicate, seconds = 30) => {
  for (let elapsed = 0; elapsed <= seconds; elapsed += 0.2) {
    const value = await predicate();
    if (value) return value;
    await sim(0.2);
  }
  throw new Error(`condition timed out after ${seconds}s`);
};

const jumpToPhaseEnd = async () => {
  const end = await page.evaluate(() => globalThis.__game.game.director.phaseEnds);
  if (!Number.isFinite(end)) throw new Error('expected a distance-ended threat phase');
  await page.evaluate((distance) => globalThis.__game.world.reset(distance + 1), end);
  await sim(0.6);
};

const completedFirstRun = {
  completed: [
    'salvage',
    'build-refinery',
    'refine-components',
    'build-workbench',
    'build-defense',
    'survive-boarding',
    'repair',
  ],
  counters: {
    salvage: 1,
    refineryBuilt: 1,
    components: 8,
    workbenchBuilt: 1,
    defense: 1,
    defenseCrewed: 1,
    boardingSurvived: 1,
    repairsAfterBoarding: 1,
  },
};

try {
  await page.goto(
    `${BASE_URL}/?nolock=1&nomenu=1&quality=low&nospawn=1&notex=1&nomodel=1&nosound=1&seed=combat-regression`,
    { waitUntil: 'load' },
  );
  await page.waitForFunction(() => '__game' in globalThis, null, { timeout: 60_000 });
  await sim(1.5);

  const standY = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const deck = g.machine.deckBounds.min.y + 0.09;
    return {
      player: deck + 0.62 + 0.34 + 0.15,
      enemy: deck + 0.6 + 0.36 + 0.15,
      deck,
    };
  });

  await page.evaluate((firstRun) => {
    const g = globalThis.__game.game;
    g.enemySpawnsEnabled = false;
    g.state.godMode = true;
    g.player.stats.invulnerable = true;
    g.tutorialReadyAt = null;
    g.tutorialStarted = false;
    g.firstRun.restore(firstRun);
    g.enemies.despawnAll();
    globalThis.__regression = { ended: [], arrivals: [] };
    g.bus.on('boarding:ended', (event) => globalThis.__regression.ended.push(event));
    g.bus.on('enemy:spawned', (event) => {
      const enemy = g.enemies.active.find((candidate) => candidate.id === event.enemyId);
      if (enemy?.def.id === 'scavenger') {
        globalThis.__regression.arrivals.push({
          id: enemy.id,
          x: event.position.x,
          y: event.position.y,
          z: event.position.z,
        });
      }
    });
  }, completedFirstRun);

  // Seed the recurring encounter at the exact decision boundary. This keeps
  // the fixture independent of the random calm length while still running the
  // real director -> Game -> VehicleScene path.
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.director.restore({
      phase: 'calm',
      phaseEndsAt: 0,
      wavesSurvived: 2,
      pending: [],
      nextReleaseAt: 0,
      draws: 1,
      wavesSinceVehicle: 2,
      vehicleQueued: false,
      externalEncounterActive: false,
    });
    g.enemySpawnsEnabled = true;
    g.world.reset(0);
  });
  await sim(0.6); // calm -> buildup
  await jumpToPhaseEnd(); // buildup -> recurring skiff
  await until(() => page.evaluate(() => globalThis.__game.game.vehicleManager.active), 20);

  await page.evaluate(() => globalThis.__game.game.vehicleScene.damageHull(99999));
  await until(
    () =>
      page.evaluate(() => {
        const g = globalThis.__game.game;
        return (
          !g.vehicleManager.active &&
          g.pendingBoardingOutcome === null &&
          !g.director.hasActiveExternalEncounter
        );
      }),
    30,
  );
  const skiffEnded = await page.evaluate(() => globalThis.__regression.ended.length);
  check(
    'recurring skiff reaches terminal cleanup before infantry',
    skiffEnded === 1,
    `${skiffEnded} ended events`,
  );

  // Move through recovery and calm, then let the next contact release a fresh
  // scavenger. The event marks are cleared only after skiff cleanup, so these
  // positions cannot belong to boarders or an earlier wave.
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    globalThis.__regression.arrivals.length = 0;
    g.world.reset(g.director.phaseEnds + 1);
  });
  await sim(0.6); // recovery -> calm
  await jumpToPhaseEnd(); // calm -> buildup
  await jumpToPhaseEnd(); // buildup -> contact and first release
  await until(() => page.evaluate(() => globalThis.__regression.arrivals.length > 0), 30);
  await sim(6);

  const arrivals = await page.evaluate(() => {
    const marks = globalThis.__regression.arrivals;
    const active = new Map(globalThis.__game.game.enemies.active.map((enemy) => [enemy.id, enemy]));
    return marks.map((mark) => {
      const enemy = active.get(mark.id);
      return {
        moved: enemy
          ? Math.hypot(enemy.worldPosition.x - mark.x, enemy.worldPosition.z - mark.z)
          : 0,
        feet: mark.y - 0.96,
      };
    });
  });
  check(
    'fresh infantry arrivals are recorded after skiff cleanup',
    arrivals.length > 0,
    `${arrivals.length} scavenger arrivals`,
  );
  check(
    'fresh arrivals are dropped above the deck',
    arrivals.length > 0 && arrivals.every(({ feet }) => feet > standY.deck),
    arrivals.map(({ feet }) => feet.toFixed(2)).join(', '),
  );
  check(
    'every fresh infantry arrival walks more than one metre',
    arrivals.length > 0 && arrivals.every(({ moved }) => moved > 1),
    arrivals.map(({ moved }) => moved.toFixed(1)).join(', '),
  );

  // Room fixture: all geometry is placed through BuildSystem, and the enemy
  // starts outside the room. The first phase accepts only a real doorway route
  // or a build:damaged/build:removed event proving the blocking wall fell.
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.enemySpawnsEnabled = false;
    g.enemies.despawnAll();
    g.build.clear();
    globalThis.__regression.room = { placed: [], damaged: [], removed: [] };
    g.bus.on('build:placed', (event) => globalThis.__regression.room.placed.push(event));
    g.bus.on('build:damaged', (event) => globalThis.__regression.room.damaged.push(event));
    g.bus.on('build:removed', (event) => globalThis.__regression.room.removed.push(event));
  });
  const room = { x: 1, y: 0, z: -1 };
  const place = async (piece, side = null) =>
    page.evaluate(
      ({ piece, room, side }) => {
        const g = globalThis.__game;
        return (
          g.game.build.place(
            {
              piece,
              cell: room,
              edge: side ? g.canonicalEdge(room, side) : undefined,
              rotation: 0,
            },
            true,
          ) !== null
        );
      },
      { piece, room, side },
    );

  check(
    'room floor and doorway fixture place',
    (await place('floor')) &&
      (await place('wall', 'north')) &&
      (await place('wall', 'south')) &&
      (await place('wall', 'east')) &&
      (await place('doorway', 'west')),
  );
  await page.evaluate(
    ({ room, y }) => {
      const g = globalThis.__game;
      g.player.teleport({ x: room.x * 2, y, z: -2 });
      const enemy = g.enemies.spawn('scavenger', { x: 4.6, y, z: -2 });
      if (!enemy) throw new Error('room scavenger did not spawn');
      // The 2m room otherwise fits entirely inside normal melee reach, allowing
      // a correct enemy to stop outside after breaking the wall. Keep this
      // fixture override local to this actor; navigation and damage stay real.
      enemy.def = { ...enemy.def, attackRange: 0.6 };
    },
    { room, y: standY.player },
  );

  const wallWasBreached = async () =>
    page.evaluate(() => {
      const roomEvents = globalThis.__regression.room;
      const wallIds = new Set(
        roomEvents.placed
          .filter((event) => event.definitionId === 'wall')
          .map((event) => event.instanceId),
      );
      return (
        roomEvents.removed.some((event) => wallIds.has(event.instanceId)) ||
        roomEvents.damaged.some((event) => wallIds.has(event.instanceId) && event.health === 0)
      );
    });

  let minX = Infinity;
  let doorwayRoute = false;
  let breachBeforeEntry = false;
  for (let i = 0; i < 240; i++) {
    await sim(0.2);
    const state = await page.evaluate(() => {
      const enemy = globalThis.__game.game.enemies.active.find(
        (candidate) => candidate.def.id === 'scavenger',
      );
      return enemy ? { x: enemy.worldPosition.x, cell: enemy.gridCell } : null;
    });
    if (!state) break;
    minX = Math.min(minX, state.x);
    doorwayRoute = minX < 1;
    breachBeforeEntry ||= await wallWasBreached();
    if (doorwayRoute || breachBeforeEntry) break;
  }
  for (let i = 0; i < 60; i++) {
    await sim(0.4);
    const state = await page.evaluate(() => {
      const enemy = globalThis.__game.game.enemies.active.find(
        (candidate) => candidate.def.id === 'scavenger',
      );
      return enemy ? { cell: enemy.gridCell } : null;
    });
    breachBeforeEntry ||= await wallWasBreached();
    if (!state || (state.cell.x === room.x && state.cell.z === room.z)) break;
  }
  const entered = await page.evaluate(
    ({ room }) => {
      const enemy = globalThis.__game.game.enemies.active.find(
        (candidate) => candidate.def.id === 'scavenger',
      );
      return Boolean(enemy && enemy.gridCell.x === room.x && enemy.gridCell.z === room.z);
    },
    { room },
  );
  check(
    'room entry follows a doorway or a destroyed wall',
    entered && (doorwayRoute || breachBeforeEntry),
    `x=${minX.toFixed(2)} doorway=${doorwayRoute} breach=${breachBeforeEntry}`,
  );

  // Rebuild all four walls and add a roof. RoomDetector requires the roof or
  // an upper floor before it considers the enclosure sealed.
  const sealed = await page.evaluate((room) => {
    const g = globalThis.__game;
    for (const side of ['north', 'south', 'east', 'west']) {
      const e = g.canonicalEdge(room, side);
      for (const piece of ['doorway', 'wall']) {
        g.game.build.demolishAt({ piece, cell: room, edge: e, rotation: 0 });
      }
    }
    const walls = ['north', 'south', 'east', 'west'].map(
      (side) =>
        g.game.build.place(
          {
            piece: 'wall',
            cell: room,
            edge: g.canonicalEdge(room, side),
            rotation: 0,
          },
          true,
        ) !== null,
    );
    const roof = g.game.build.place({ piece: 'roof', cell: room, rotation: 0 }, true) !== null;
    const enclosed = g.game.build.rooms.rooms.some(
      (candidate) =>
        candidate.enclosed &&
        candidate.cells.some((cell) => cell.x === room.x && cell.y === room.y && cell.z === room.z),
    );
    return { walls, roof, enclosed };
  }, room);
  check(
    'four walls and roof produce an enclosed room',
    sealed.walls.every(Boolean) && sealed.roof && sealed.enclosed,
    `walls=${sealed.walls.filter(Boolean).length}/4 roof=${sealed.roof} enclosed=${sealed.enclosed}`,
  );

  await page.evaluate(
    ({ room, y }) => {
      const g = globalThis.__game.game;
      g.enemies.despawnAll();
      const enemy = g.enemies.spawn('scavenger', { x: 4.6, y, z: -2 });
      if (!enemy) throw new Error('sealed-room scavenger did not spawn');
    },
    { room, y: standY.enemy },
  );
  await sim(10);
  const sealedState = await page.evaluate(
    ({ room }) => {
      const g = globalThis.__game.game;
      const enemy = g.enemies.active.find((candidate) => candidate.def.id === 'scavenger');
      return {
        entered: Boolean(enemy && enemy.gridCell.x === room.x && enemy.gridCell.z === room.z),
        enclosed: g.build.rooms.rooms.some(
          (candidate) =>
            candidate.enclosed &&
            candidate.cells.some(
              (cell) => cell.x === room.x && cell.y === room.y && cell.z === room.z,
            ),
        ),
      };
    },
    { room },
  );
  check(
    'sealed room keeps the scavenger out while remaining enclosed',
    !sealedState.entered && sealedState.enclosed,
    `entered=${sealedState.entered} enclosed=${sealedState.enclosed}`,
  );

  if (errors.length) console.log(`PAGE ERRORS: ${errors.join(' | ')}`);
  const failed = results.filter((result) => !result.ok);
  console.log(`combat-regression: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length || errors.length) process.exitCode = 1;
} catch (error) {
  console.error(`combat-regression: ${error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
