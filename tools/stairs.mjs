/**
 * Live player-built stair acceptance.
 *
 * This is deliberately a physics/navigation check rather than a graph-only
 * check.  The player crosses a real rotated flight with keyboard input, then
 * an ordinary scavenger follows the same built route to the upper landing.
 * The scavenger remains a player-seeking definition; no target or movement
 * state is injected into it.
 *
 * Fixture accelerators:
 * - `nospawn`, low quality, no model, and no sound keep this run deterministic
 *   and cheap.
 * - `build.place(..., true)` supplies the structure without spending the
 *   opening inventory.  The lower platform, stair, support wall, and upper
 *   floor are still the real BuildSystem pieces and real physics colliders.
 *   The upper floor sits beyond the stairwell, leaving the ramp opening clear.
 * - The machine throttle is set to zero before the fixture is built, so the
 *   moving-platform carry path cannot turn a traversal assertion into a
 *   measurement of deck motion.
 * - Teleporting to the lower approach only chooses the starting point.  The
 *   player climb is driven by an actual `d` key event and fixed simulation.
 */
import { chromium } from '@playwright/test';
import { BASE_URL } from './base-url.mjs';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
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

async function sim(seconds) {
  const start = await page.evaluate(() => globalThis.__game.debugStats().simTime);
  const deadline = Date.now() + 90_000;
  for (;;) {
    await page.waitForTimeout(120);
    const now = await page.evaluate(() => globalThis.__game.debugStats().simTime);
    if (now - start >= seconds) return;
    if (Date.now() > deadline) throw new Error(`sim(${seconds}) timed out`);
  }
}

async function until(predicate, seconds = 35) {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() > deadline) {
      const diagnostic = await page.evaluate(() => {
        const root = globalThis.__game;
        const p = root.player.worldPosition;
        const hit = root.game.physics.raycast(p, { x: 1, y: 0, z: 0 }, 5, root.player.collider);
        return {
          position: { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) },
          grounded: root.player.isGrounded,
          debug: root.player.debug,
          rightHeld: root.game.input.isDown('right'),
          yaw: root.playerCamera.yawAngle,
          eastHit: hit
            ? {
                distance: +hit.distance.toFixed(3),
                point: {
                  x: +hit.point.x.toFixed(3),
                  y: +hit.point.y.toFixed(3),
                  z: +hit.point.z.toFixed(3),
                },
                normal: {
                  x: +hit.normal.x.toFixed(3),
                  y: +hit.normal.y.toFixed(3),
                  z: +hit.normal.z.toFixed(3),
                },
                userData: hit.userData ?? null,
              }
            : null,
          simTime: root.debugStats().simTime,
          enemies: root.game.enemies.active.map((enemy) => ({
            position: enemy.worldPosition,
            cell: enemy.gridCell,
            state: enemy.aiState,
            path: enemy.path,
            pathIndex: enemy.pathIndex,
          })),
        };
      });
      throw new Error(`condition timed out after ${seconds}s: ${JSON.stringify(diagnostic)}`);
    }
    await page.waitForTimeout(120);
  }
}

try {
  await page.goto(
    `${BASE_URL}/?nolock=1&nomenu=1&quality=low&seed=stairs-harness&nospawn=1&notex=1&nomodel=1&nosound=1`,
    { waitUntil: 'load' },
  );
  await page.waitForFunction(
    () => Boolean(globalThis.__game?.game && globalThis.__game?.debugStats),
    null,
    { timeout: 60_000 },
  );

  await sim(1.2);
  const fixture = await page.evaluate(() => {
    const root = globalThis.__game;
    const game = root.game;
    const B = game.build;
    const cell = (x, y, z) => ({ x, y, z });
    const key = (c) => `${c.x},${c.y},${c.z}`;
    const base = cell(-2, 0, -5);
    const run = cell(-1, 0, -5);
    const landing = cell(0, 1, -5);
    const lower = [
      cell(-5, 0, -5),
      cell(-4, 0, -5),
      cell(-3, 0, -5),
      base,
      run,
      cell(0, 0, -5),
      cell(1, 0, -5),
    ];
    const upper = [landing, cell(1, 1, -5), cell(0, 1, -4), cell(1, 1, -4)];

    game.enemySpawnsEnabled = false;
    game.enemies.despawnAll();
    game.machine.movement.setThrottle(0);
    B.clear();

    const equipment = new Set(game.machine.equipmentCells.map(key));
    const equipmentConflicts = lower.filter((candidate) => equipment.has(key(candidate)));
    if (equipmentConflicts.length) {
      throw new Error(
        `z=-5 platform intersects machine equipment: ${equipmentConflicts.map(key).join(' ')}`,
      );
    }

    const placed = [];
    for (const candidate of lower) {
      const piece = B.place({ piece: 'floor', cell: candidate, rotation: 0 }, true);
      if (!piece) throw new Error(`could not place lower floor ${key(candidate)}`);
      placed.push(piece.instanceId);
    }

    const stairVerdict = B.canPlace({ piece: 'stairs', cell: base, rotation: 1 });
    const stair = B.place({ piece: 'stairs', cell: base, rotation: 1 }, true);
    if (!stair) throw new Error('could not place rotation-1 stair');
    placed.push(stair.instanceId);

    // Support the upper exit beyond the ramp; never cover the ramp opening.
    const support = B.place(
      {
        piece: 'wall',
        cell: cell(0, 0, -5),
        edge: root.canonicalEdge(cell(0, 0, -5), 'north'),
        rotation: 0,
      },
      true,
    );
    if (!support) throw new Error('could not place upper-floor support wall');
    placed.push(support.instanceId);
    for (const candidate of upper) {
      const piece = B.place({ piece: 'floor', cell: candidate, rotation: 0 }, true);
      if (!piece) throw new Error(`could not place upper floor ${key(candidate)}`);
      placed.push(piece.instanceId);
    }

    return {
      base,
      run,
      landing,
      stairVerdict,
      lowerCount: lower.length,
      upperCount: upper.length,
      equipmentConflicts,
      placedCount: placed.length,
      navLink:
        (B.navGraph.links.get(key(base)) ?? []).find(
          (candidate) =>
            candidate.x === landing.x && candidate.y === landing.y && candidate.z === landing.z,
        ) ?? null,
      lowerFloors: lower.map((candidate) => B.gridView.getCell(candidate)),
      landingFloor: B.gridView.getCell(landing),
      landingInGraph: B.navGraph.links.has(key(landing)),
    };
  });

  check(
    'rotation-1 stair sits on an equipment-free z=-5 platform',
    fixture.equipmentConflicts.length === 0 &&
      fixture.lowerFloors.every((piece) => piece === 'floor') &&
      fixture.stairVerdict.ok === true,
    JSON.stringify({
      verdict: fixture.stairVerdict,
      lower: fixture.lowerCount,
      conflicts: fixture.equipmentConflicts,
    }),
  );
  check(
    'stair has a real upper landing floor and vertical nav link',
    fixture.landingFloor === 'floor' &&
      fixture.landingInGraph === true &&
      fixture.navLink?.x === fixture.landing.x &&
      fixture.navLink?.y === fixture.landing.y &&
      fixture.navLink?.z === fixture.landing.z,
    JSON.stringify({
      landing: fixture.landingFloor,
      graph: fixture.landingInGraph,
      link: fixture.navLink,
    }),
  );
  check(
    'upper floor is supported by the placed lower wall',
    fixture.placedCount === fixture.lowerCount + fixture.upperCount + 2,
    `placed ${fixture.placedCount} pieces including stair and support`,
  );

  // Let the just-applied zero throttle settle before teleporting the player;
  // otherwise the first movement samples a half-decelerated moving platform.
  await sim(2.0);
  const heights = await page.evaluate(() => {
    const game = globalThis.__game.game;
    const deckSurface = game.machine.deckBounds.min.y + 0.09;
    return {
      deckSurface,
      lowerStandY: deckSurface + 0.62 + 0.34 + 0.15,
      upperStandY: deckSurface + 3 + 0.62 + 0.34 + 0.15,
      cameraYaw: globalThis.__game.playerCamera?.yaw ?? 0,
    };
  });

  await page.evaluate((lowerStandY) => {
    const root = globalThis.__game;
    root.player.teleport({ x: -8.1, y: lowerStandY, z: -10 });
    if (root.playerCamera && 'yaw' in root.playerCamera) root.playerCamera.yaw = 0;
  }, heights.lowerStandY);
  await sim(0.8);

  const beforeWalk = await page.evaluate(() => {
    const p = globalThis.__game.player.worldPosition;
    return { x: p.x, y: p.y, z: p.z, grounded: globalThis.__game.player.isGrounded };
  });
  await page.keyboard.down('d');
  // Walk far enough onto the upper platform that a pursuing enemy must also
  // finish the flight before it can reach the player's normal attack radius.
  await until(() => page.evaluate(() => globalThis.__game.player.worldPosition.x >= 1.6));
  await page.keyboard.up('d');
  await sim(0.5);

  const afterWalk = await page.evaluate((start) => {
    const root = globalThis.__game;
    const game = root.game;
    const p = root.player.worldPosition;
    const deckSurface = game.machine.deckBounds.min.y + 0.09;
    const level = Math.round((p.y - (deckSurface + 1.11)) / 3);
    return {
      x: p.x,
      y: p.y,
      z: p.z,
      level,
      grounded: root.player.isGrounded,
      standingError: Math.abs(p.y - (deckSurface + 3 + 1.11)),
      cell: { x: Math.round(p.x / 2), y: level, z: Math.round(p.z / 2) },
      moved: Math.hypot(p.x - start.x, p.z - start.z),
    };
  }, beforeWalk);
  check(
    'player uses actual movement input to cross the stair flight',
    afterWalk.moved > 3.2,
    `moved ${afterWalk.moved.toFixed(2)}m from (${beforeWalk.x.toFixed(2)},${beforeWalk.z.toFixed(2)})`,
  );
  check(
    'player finishes grounded at level 1 standing height',
    afterWalk.grounded === true &&
      afterWalk.level === 1 &&
      afterWalk.cell.x === 1 &&
      afterWalk.cell.z === -5 &&
      afterWalk.standingError < 0.35,
    JSON.stringify({
      cell: afterWalk.cell,
      y: afterWalk.y.toFixed(2),
      error: afterWalk.standingError.toFixed(2),
      grounded: afterWalk.grounded,
    }),
  );

  const enemy = await page.evaluate((lowerStandY) => {
    const root = globalThis.__game;
    const game = root.game;
    const spawned = game.enemies.spawn('scavenger', { x: -8.1, y: lowerStandY, z: -10 });
    if (!spawned) throw new Error('scavenger did not spawn');
    return {
      id: spawned.id,
      target: spawned.def.targetPriority,
      attackRange: spawned.def.attackRange,
    };
  }, heights.lowerStandY);
  // Rendering does not own navigation. Advance the real fixed game loop here
  // so this AI acceptance does not depend on software-renderer frame rate.
  const reached = await page.evaluate(({ id, attackRange }) => {
    const root = globalThis.__game;
    root.game.stop();
    const found = root.game.enemies.active.find((candidate) => candidate.id === id);
    if (!found) throw new Error('scavenger disappeared before traversal');
    let snapshot = null;
    for (let tick = 0; tick < 1800; tick++) {
      root.game.fixedUpdate(1 / 60);
      const player = root.player.worldPosition;
      const p = found.worldPosition;
      const distance = Math.hypot(p.x - player.x, p.y - player.y, p.z - player.z);
      snapshot = {
        cell: found.gridCell,
        state: found.aiState,
        distance,
        pathLength: found.pathLength,
        target: found.def.targetPriority,
        inAttackRange: distance <= attackRange + 0.2,
      };
      if (snapshot.cell.y === 1 && snapshot.inAttackRange && snapshot.state === 'attack')
        return snapshot;
    }
    throw new Error(
      `scavenger failed to climb: ${JSON.stringify({ ...snapshot, position: found.worldPosition, path: found.path, waypoint: found.currentWaypoint(), probe: found.probe(1, 0), blockedFor: found.blockedFor, backingOutFor: found.backingOutFor })}`,
    );
  }, enemy);
  check(
    'ordinary scavenger keeps player-seeking priority',
    reached.target === 'player' && enemy.target === 'player',
    JSON.stringify({ target: reached.target, spawned: enemy.target }),
  );
  check(
    'ordinary scavenger climbs to level 1 and reaches attack range',
    reached.cell.y === 1 && reached.inAttackRange && reached.state === 'attack',
    JSON.stringify({
      cell: reached.cell,
      state: reached.state,
      distance: reached.distance.toFixed(2),
      path: reached.pathLength,
    }),
  );

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} stair checks passed`);
  if (errors.length) {
    console.log(`\n${errors.length} console error(s):`);
    for (const error of errors.slice(0, 8)) console.log(` - ${error}`);
  }
  if (failed.length || errors.length) process.exitCode = 1;
} catch (error) {
  console.error(`STAIRS HARNESS ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
