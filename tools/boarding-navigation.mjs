/**
 * Focused live navigation acceptance for boarding raiders.
 *
 * This deliberately keeps the raider's engine priority: it checks that a
 * landed body is an ordinary level-0 EnemyManager raider, has a live graph
 * route, and can damage a blocking wall when the player is on the far side.
 * It does not claim to prove a player-seeking enemy climbs a rotated stair;
 * that requires a separate build fixture which places the upper floor and the
 * rotated run before spawning the enemy.
 */
import { chromium } from '@playwright/test';
import { BASE_URL } from './base-url.mjs';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 540 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));

try {
  await page.goto(
    `${BASE_URL}/?nolock=1&nomenu=1&quality=low&seed=boarding-navigation&nospawn=1&notex=1&nomodel=1&nosound=1`,
    { waitUntil: 'load' },
  );
  await page.waitForFunction(
    () => Boolean(globalThis.__game?.game && globalThis.__game?.debugStats),
    null,
    { timeout: 60_000 },
  );

  const simTime = () => page.evaluate(() => globalThis.__game.debugStats().simTime);
  async function sim(seconds) {
    const start = await simTime();
    const deadline = Date.now() + 90_000;
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

  await page.evaluate(() => {
    const game = globalThis.__game.game;
    game.enemySpawnsEnabled = false;
    globalThis.__boardingNavigation = { crossed: [], damage: [] };
    game.bus.on('boarding:crossed', (event) => globalThis.__boardingNavigation.crossed.push(event));
    game.bus.on('build:damaged', (event) => globalThis.__boardingNavigation.damage.push(event));
  });
  await sim(1);

  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
  };

  async function spawnAndInspect(side) {
    await page.evaluate((requestedSide) => {
      const game = globalThis.__game.game;
      game.vehicleScene.clear();
      game.enemies.despawnAll();
      if (!game.vehicleScene.spawn(requestedSide)) throw new Error('skiff did not spawn');
    }, side);
    await until(() => page.evaluate(() =>
      globalThis.__game.game.enemies.active.some((enemy) => enemy.def.id === 'raider')));
    await until(() => page.evaluate(() =>
      globalThis.__game.game.enemies.active.some(
        (enemy) => enemy.def.id === 'raider' && enemy.pathLength > 0,
      )));
    return page.evaluate(() => {
      const game = globalThis.__game.game;
      const equipment = new Set(game.machine.equipmentCells.map((cell) => `${cell.x},${cell.y},${cell.z}`));
      const occupied = new Set([
        ...game.build.gridView.stationEntries().map(({ cell }) => `${cell.x},${cell.y},${cell.z}`),
        ...game.build.gridView.stairsEntries().map(({ cell }) => `${cell.x},${cell.y},${cell.z}`),
      ]);
      return game.enemies.active
        .filter((enemy) => enemy.def.id === 'raider')
        .map((enemy) => {
          const cell = enemy.gridCell;
          const key = `${cell.x},${cell.y},${cell.z}`;
          return {
            goal: enemy.subsystemGoal,
            cell,
            graphNode: game.build.navGraph.links.has(key),
            equipment: equipment.has(key),
            occupied: occupied.has(key),
            pathLength: enemy.pathLength,
          };
        });
    });
  }

  for (const side of ['port', 'starboard']) {
    const raiders = await spawnAndInspect(side);
    check(`${side} boarding lands ordinary raiders`, raiders.length > 0, JSON.stringify(raiders));
    check(`${side} landing stays on level 0`, raiders.every((enemy) => enemy.cell.y === 0));
    check(`${side} landing is a live nav node`, raiders.every((enemy) => enemy.graphNode));
    check(`${side} landing avoids equipment`, raiders.every((enemy) => !enemy.equipment));
    check(`${side} landing avoids occupied build cells`, raiders.every((enemy) => !enemy.occupied));
    check(`${side} raider keeps engine priority`, raiders.every((enemy) => enemy.goal === 'engine'));
    await page.evaluate(() => {
      const game = globalThis.__game.game;
      for (const enemy of game.enemies.active) enemy.takeDamage(999);
      game.vehicleScene.clear();
    });
    await sim(0.4);
  }

  // Put a wall directly across the first landed raider's east edge. The
  // player is moved to the far side, so the ordinary blocker ray can choose
  // the wall as its attack target while the raider still routes for engine.
  await page.evaluate(() => {
    const game = globalThis.__game.game;
    game.vehicleScene.clear();
    game.enemies.despawnAll();
    if (!game.vehicleScene.spawn('starboard')) throw new Error('skiff did not spawn for wall case');
  });
  await until(() => page.evaluate(() =>
    globalThis.__game.game.enemies.active.some((enemy) => enemy.def.id === 'raider')));
  const wallSetup = await page.evaluate(() => {
    const root = globalThis.__game;
    const game = root.game;
    const enemy = game.enemies.active.find((candidate) => candidate.def.id === 'raider');
    if (!enemy) throw new Error('raider did not land for wall case');
    const cell = enemy.gridCell;
    const B = game.build;
    const equipment = new Set(game.machine.equipmentCells.map((candidate) =>
      `${candidate.x},${candidate.y},${candidate.z}`));
    const occupied = new Set([
      ...B.gridView.stationEntries().map(({ cell: candidate }) =>
        `${candidate.x},${candidate.y},${candidate.z}`),
      ...B.gridView.stairsEntries().map(({ cell: candidate }) =>
        `${candidate.x},${candidate.y},${candidate.z}`),
    ]);
    const neighbours = [
      { side: 'east', cell: { x: cell.x + 1, y: 0, z: cell.z } },
      { side: 'west', cell: { x: cell.x - 1, y: 0, z: cell.z } },
      { side: 'south', cell: { x: cell.x, y: 0, z: cell.z + 1 } },
      { side: 'north', cell: { x: cell.x, y: 0, z: cell.z - 1 } },
    ].filter(({ cell: candidate }) => {
      const key = `${candidate.x},${candidate.y},${candidate.z}`;
      return game.build.navGraph.links.has(key) && !equipment.has(key) && !occupied.has(key);
    });
    const neighbour = neighbours[0]?.cell;
    const side = neighbours[0]?.side;
    if (!neighbour || !side) throw new Error('no safe adjacent graph cell for wall fixture');
    B.place({ piece: 'floor', cell, rotation: 0 }, true);
    B.place({ piece: 'floor', cell: neighbour, rotation: 0 }, true);
    const wall = B.place({
      piece: 'wall',
      cell,
      edge: root.canonicalEdge(cell, side),
      rotation: 0,
    }, true);
    if (!wall) throw new Error('wall fixture could not be placed');
    game.player.teleport({ x: neighbour.x * 2, y: 4.86, z: neighbour.z * 2 });
    return { wallId: wall.instanceId, cell, neighbour };
  });
  await until(() => page.evaluate(({ wallId }) =>
    globalThis.__boardingNavigation.damage.some((event) => event.instanceId === wallId), wallSetup), 12);
  const wallResult = await page.evaluate(({ wallId }) => {
    const game = globalThis.__game.game;
    const raider = game.enemies.active.find((enemy) => enemy.def.id === 'raider');
    return {
      damage: globalThis.__boardingNavigation.damage.filter((event) => event.instanceId === wallId).length,
      health: game.build.pieceHealth(wallId),
      goal: raider?.subsystemGoal ?? null,
      graphNode: raider ? game.build.navGraph.links.has(`${raider.gridCell.x},${raider.gridCell.y},${raider.gridCell.z}`) : false,
    };
  }, wallSetup);
  check('landed raider damages a blocking wall', wallResult.damage > 0 && (wallResult.health ?? 0) < 150,
    JSON.stringify(wallResult));
  check('wall case preserves engine priority', wallResult.goal === 'engine');
  check('wall case remains on the live nav graph', wallResult.graphNode);

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} boarding navigation checks passed`);
  if (errors.length) {
    console.log(`\n${errors.length} console error(s):`);
    for (const error of errors.slice(0, 8)) console.log(` - ${error}`);
  }
  if (failed.length || errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
