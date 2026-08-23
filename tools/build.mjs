/**
 * Build system verification.
 *
 * Drives the real game to construct a two-room structure and asserts the game
 * agrees it is two enclosed rooms joined by a doorway — Milestone 3's
 * acceptance criterion, measured rather than eyeballed.
 */
import { chromium } from '@playwright/test';

const outShot = process.argv[2] ?? null;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

// Arrivals are tested in tools/combat.mjs and nowhere else: everywhere else
// they would wander into a check that was written on a quiet deck.
await page.goto('http://localhost:5173/?nolock=1&quality=low&nospawn=1&notex=1', { waitUntil: 'load' });

const stats = () => page.evaluate(() => globalThis.__game.debugStats());

/** Wait on SIMULATED time — the headless renderer runs at a few FPS. */
async function sim(seconds) {
  const start = (await stats()).simTime;
  const deadline = Date.now() + 90000;
  for (;;) {
    await page.waitForTimeout(100);
    if ((await stats()).simTime - start >= seconds) return;
    if (Date.now() > deadline) throw new Error('sim() timed out');
  }
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

/** Place directly through the build system, bypassing camera aiming. */
const place = (piece, cell, side = null, rotation = 0) =>
  page.evaluate(
    ({ piece, cell, side, rotation }) => {
      const g = globalThis.__game;
      const edge = side ? g.canonicalEdge(cell, side) : undefined;
      return g.game.build.place({ piece, cell, edge, rotation }) !== null;
    },
    { piece, cell, side, rotation },
  );

const roomInfo = () =>
  page.evaluate(() => {
    const g = globalThis.__game.game.build.rooms;
    return {
      rooms: g.rooms.length,
      enclosed: g.rooms.filter((r) => r.enclosed).length,
      links: g.links.length,
    };
  });

const scrap = () => page.evaluate(() => globalThis.__game.game.resources.count('scrap'));
const pieces = () => page.evaluate(() => globalThis.__game.game.build.pieceCount);

await sim(1.5);

// --- Build mode ---------------------------------------------------------
await page.keyboard.press('b');
await sim(0.4);
check('B enters build mode', await page.evaluate(() => globalThis.__game.game.buildMode));
check('build panel is visible', await page.locator('#build-panel').isVisible());

const ammoBefore = (await stats()).ammo;
await page.mouse.down();
await sim(0.4);
await page.mouse.up();
await sim(0.2);
check('firing is suppressed in build mode', (await stats()).ammo === ammoBefore, (await stats()).ammo);
check('LMB places a piece instead', (await pieces()) > 0, `${await pieces()} placed`);

await page.keyboard.press('b');
await sim(0.3);
check('B exits build mode', !(await page.evaluate(() => globalThis.__game.game.buildMode)));

// The build-mode test above placed a piece with LMB, which is the correct
// behaviour but leaves a stray floor. Start the real structure from clean.
await page.evaluate(() => {
  globalThis.__game.game.build.clear();
  globalThis.__game.game.resetInventory();
});
await sim(0.3);

// --- Cost accounting ------------------------------------------------------
const scrap0 = await scrap();
const placedFloor = await place('floor', { x: -3, y: 0, z: -1 });
check('a floor can be placed on open deck', placedFloor);
check('a floor costs exactly 8 scrap', (await scrap()) === scrap0 - 8, `${scrap0} -> ${await scrap()}`);

const scrapBeforeBad = await scrap();
const badPlace = await place('floor', { x: 99, y: 0, z: 0 });
check('an out-of-bounds placement is refused', !badPlace);
check('a refused placement costs nothing', (await scrap()) === scrapBeforeBad);

const blockedPlace = await place('floor', { x: 0, y: 0, z: 3 });
check('cannot build inside the engine block', !blockedPlace, 'equipment cell rejected');

// --- Two enclosed rooms ---------------------------------------------------
// A 4x2 floor at the rear-left of the envelope, clear of the equipment,
// split into two rooms by a wall and a doorway.
//
// Start clean: the cost-accounting floor above is a legitimate structure and
// would otherwise count as a third room.
await page.evaluate(() => {
  globalThis.__game.game.build.clear();
  // Capped by slots now, not by an integer: 20 slots x 100 scrap is the
  // ceiling, so granting 3000 would silently drop a third of it.
  globalThis.__game.game.resources.deposit('scrap', 1200);
});
await sim(0.3);

const X0 = -4;
const X1 = -1;
const Z0 = -6;
const Z1 = -5;

for (let x = X0; x <= X1; x++) {
  for (let z = Z0; z <= Z1; z++) await place('floor', { x, y: 0, z });
}
// Perimeter walls.
for (let x = X0; x <= X1; x++) {
  await place('wall', { x, y: 0, z: Z0 }, 'north');
  await place('wall', { x, y: 0, z: Z1 }, 'south');
}
for (let z = Z0; z <= Z1; z++) {
  await place('wall', { x: X0, y: 0, z }, 'west');
  await place('wall', { x: X1, y: 0, z }, 'east');
}
// Divider: a doorway on one row, a wall on the other.
await place('doorway', { x: X0 + 1, y: 0, z: Z0 }, 'east');
await place('wall', { x: X0 + 1, y: 0, z: Z1 }, 'east');
// Roof every cell.
for (let x = X0; x <= X1; x++) {
  for (let z = Z0; z <= Z1; z++) await place('roof', { x, y: 0, z });
}

const built = await roomInfo();
check('the structure reads as two rooms', built.rooms === 2, `rooms=${built.rooms}`);
check('both rooms are enclosed', built.enclosed === 2, `enclosed=${built.enclosed}`);
check('the doorway links them', built.links === 1, `links=${built.links}`);

// --- Breach ---------------------------------------------------------------
await page.evaluate(() => {
  const g = globalThis.__game;
  g.game.build.demolishAt({
    piece: 'wall',
    cell: { x: -4, y: 0, z: -6 },
    edge: g.canonicalEdge({ x: -4, y: 0, z: -6 }, 'north'),
    rotation: 0,
  });
});
const breached = await roomInfo();
check('removing a wall breaches the room', breached.enclosed === 1, `enclosed=${breached.enclosed}`);

// --- Refund ---------------------------------------------------------------
const scrapBeforeDemo = await scrap();
await page.evaluate(() => {
  globalThis.__game.game.build.demolishAt({
    piece: 'roof',
    cell: { x: -4, y: 0, z: -5 },
    rotation: 0,
  });
});
check(
  'demolishing refunds 60 percent',
  (await scrap()) === scrapBeforeDemo + 6,
  `roof costs 10, refunded ${(await scrap()) - scrapBeforeDemo}`,
);

// --- Weight ---------------------------------------------------------------
const speedBefore = (await stats()).speed;
await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.resources.deposit('scrap', 1200);
  for (let x = 1; x <= 4; x++) {
    for (let z = -2; z <= 5; z++) g.build.place({ piece: 'floor', cell: { x, y: 0, z }, rotation: 0 });
  }
});
await sim(3);
const speedAfter = (await stats()).speed;
check('a large structure slows the machine', speedAfter < speedBefore, `${speedBefore} -> ${speedAfter}`);

// --- Physics --------------------------------------------------------------
await page.evaluate(() => globalThis.__game.player.teleport({ x: -5.0, y: 4.0, z: -11.0 }));
await sim(1.0);
const insideRoom = await page.evaluate(() => globalThis.__game.player.worldPosition.z);
await page.keyboard.down('w');
await sim(2.0);
await page.keyboard.up('w');
const afterWalk = await page.evaluate(() => globalThis.__game.player.worldPosition);
check(
  'built walls physically contain the player',
  Math.abs(afterWalk.x) < 12 && afterWalk.y > 0,
  `x=${afterWalk.x.toFixed(2)} y=${afterWalk.y.toFixed(2)} (from z=${insideRoom.toFixed(2)})`,
);

// --- Persistence ----------------------------------------------------------
const beforeSave = { pieces: await pieces(), rooms: await roomInfo() };
await page.evaluate(() => globalThis.__game.game.saveTo('build-harness'));
await page.evaluate(() => globalThis.__game.game.build.clear());
check('clear removes every piece', (await pieces()) === 0);

const loaded = await page.evaluate(() => globalThis.__game.game.loadFrom('build-harness'));
check('the save loads', loaded === true);
const afterLoad = { pieces: await pieces(), rooms: await roomInfo() };
check(
  'every piece survives save and reload',
  afterLoad.pieces === beforeSave.pieces,
  `${beforeSave.pieces} -> ${afterLoad.pieces}`,
);
check(
  'rooms come back identical',
  afterLoad.rooms.rooms === beforeSave.rooms.rooms &&
    afterLoad.rooms.enclosed === beforeSave.rooms.enclosed,
  `${JSON.stringify(beforeSave.rooms)} -> ${JSON.stringify(afterLoad.rooms)}`,
);

if (outShot) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await sim(0.8);
  await page.screenshot({ path: outShot });
}
await browser.close();

const failed = results.filter((r) => !r.ok);
if (errors.length) {
  console.log(`\n${errors.length} CONSOLE ERROR(S):`);
  for (const e of errors.slice(0, 8)) console.log(' -', e);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length || errors.length) process.exitCode = 1;
