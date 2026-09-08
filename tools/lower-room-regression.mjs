/**
 * Focused lower-room regression harness.
 *
 * Run against a dev server when browser time is available:
 *   MMF_PORT=5196 node tools/lower-room-regression.mjs
 *
 * It deliberately stays on the shared SwiftShader launch path by default;
 * MMF_HARDWARE=1 is an explicit visual-review opt-in. The checks exercise the
 * real player controller, stair route, lower-room wall, camera follow, and an
 * enemy's navigation route without changing gameplay state from the page.
 */
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { BASE_URL } from './base-url.mjs';
import { browserLaunchOptions } from './browser-options.mjs';

const stagedArt = process.env.MMF_ART_ROUTE === 'staged';
const browser = await chromium.launch(browserLaunchOptions);
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
const results = [];

page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));

const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
};

const stats = () => page.evaluate(() => globalThis.__game.debugStats());
async function sim(seconds) {
  const start = (await stats()).simTime;
  const deadline = Date.now() + 90_000;
  while (true) {
    await page.waitForTimeout(120);
    if ((await stats()).simTime - start >= seconds) return;
    if (Date.now() > deadline) throw new Error('sim() timed out');
  }
}

const position = () =>
  page.evaluate(() => {
    const g = globalThis.__game;
    const p = g.player.worldPosition;
    return {
      x: p.x,
      y: p.y,
      z: p.z,
      grounded: g.player.isGrounded,
      camera: {
        x: g.playerCamera.camera.position.x,
        y: g.playerCamera.camera.position.y,
        z: g.playerCamera.camera.position.z,
      },
    };
  });

try {
  if (stagedArt) {
    await page.route('**/models/authored/machine-walker-v3.glb', async (route) => {
      await route.fulfill({
        contentType: 'model/gltf-binary',
        body: await readFile('assets/graphics-v3/staging/machine-walker.glb'),
      });
    });
  }
  await page.goto(
    `${BASE_URL}/?nolock=1&nomenu=1&quality=low&seed=lower-room-regression&nospawn=1&notex=1&${stagedArt ? '' : 'nomodel=1&'}nosound=1`,
    { waitUntil: 'load' },
  );
  await page.waitForFunction(() => '__game' in globalThis, null, { timeout: 60_000 });
  await sim(1);

  const art = await page.evaluate(() => {
    const g = globalThis.__game;
    const root = g.machine.group.getObjectByName('authored-machine-details');
    const fallback = g.machine.group.getObjectByName('lower-room-ceiling-frame');
    const segment = g.machine.group.getObjectByName('MMF_WalkerLeg_front-left_Thigh-runtime');
    fallback?.traverse((object) => {
      if (object === fallback && object.isMesh) object.geometry.computeBoundingBox();
    });
    const gaitFootSamples = [];
    const legs = g.machine.group.getObjectByName('legs');
    const legIds = ['front-left', 'front-right', 'rear-left', 'rear-right'];
    const transformY = (elements, x, y, z) => elements[1] * x + elements[5] * y + elements[9] * z + elements[13];
    const multiply = (a, b) => {
      const out = new Array(16).fill(0);
      for (let column = 0; column < 4; column++) {
        for (let row = 0; row < 4; row++) {
          for (let i = 0; i < 4; i++) out[column * 4 + row] += a[i * 4 + row] * b[column * 4 + i];
        }
      }
      return out;
    };
    const relativeMatrix = (object, ancestor) => {
      let matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      for (let node = object; node && node !== ancestor; node = node.parent) {
        matrix = multiply(node.matrix.elements, matrix);
      }
      return matrix;
    };
    for (const pose of [
      { heave: 0, pitch: 0, roll: 0 },
      { heave: 0.12, pitch: 0.12, roll: -0.12 },
    ]) {
      g.machine.setPose(pose);
      g.machine.fixedUpdate(0);
      for (const distance of [0, 0.5, 1, 1.5, 2, 2.5, 3]) {
        g.machine.updateVisuals(distance);
        g.machine.group.updateMatrixWorld(true);
        for (let index = 0; index < legIds.length; index++) {
          const foot = legs?.getObjectByName(`leg-${legIds[index]}`)?.getObjectByName('foot');
          let minY = Number.POSITIVE_INFINITY;
          let minLocalY = Number.POSITIVE_INFINITY;
          foot?.traverse((object) => {
            if (!object.isMesh || !object.visible) return;
            object.geometry.computeBoundingBox();
            const bounds = object.geometry.boundingBox;
            if (!bounds) return;
            const e = object.matrixWorld.elements;
            const local = relativeMatrix(object, foot);
            for (const x of [bounds.min.x, bounds.max.x]) {
              for (const y of [bounds.min.y, bounds.max.y]) {
                for (const z of [bounds.min.z, bounds.max.z]) {
                  minY = Math.min(minY, transformY(e, x, y, z));
                  minLocalY = Math.min(minLocalY, transformY(local, x, y, z));
                }
              }
            }
          });
          const targetY = g.machine.footPosition(index).y;
          gaitFootSamples.push({ minY, minLocalY, targetY, delta: minY - targetY });
        }
      }
    }
    g.machine.setPose({ heave: 0, pitch: 0, roll: 0 });
    g.machine.fixedUpdate(0);
    const maxFootDelta = gaitFootSamples.reduce(
      (max, sample) => Math.max(max, Math.abs(sample.delta)),
      0,
    );
    const maxFootLocalBottomError = gaitFootSamples.reduce(
      (max, sample) => Math.max(max, Math.abs(sample.minLocalY)),
      0,
    );
    return {
      authored: Boolean(root),
      skinRoots: root
        ? ['MMF_HullSkin', 'MMF_EngineSkin', 'MMF_ProwSkin', 'MMF_DeckTrim'].filter((name) => Boolean(root.getObjectByName(name)))
        : [],
      articulatedThigh: Boolean(segment),
      ceilingFrameMinY: fallback?.isMesh ? fallback.geometry.boundingBox?.min.y ?? null : null,
      maxFootDelta,
      maxFootLocalBottomError,
    };
  });
  check(
    stagedArt ? 'staged v3 authored roots attach' : 'model-disabled mode keeps authored root absent',
    stagedArt ? art.authored && art.skinRoots.length === 4 && art.articulatedThigh : !art.authored,
    JSON.stringify(art),
  );
  check(
    'lower-room ceiling frame stays above walkable volume',
    art.ceilingFrameMinY === null || art.ceilingFrameMinY > 2.9,
    `minY=${art.ceilingFrameMinY}`,
  );
  check(
    'rendered feet keep their sole at the foot target through the gait',
    Number.isFinite(art.maxFootDelta) && art.maxFootDelta < 0.02 &&
      Number.isFinite(art.maxFootLocalBottomError) && art.maxFootLocalBottomError < 0.03,
    `max|localMinY-footAt|=${art.maxFootLocalBottomError.toFixed(3)}m (world min delta ${art.maxFootDelta.toFixed(3)}m)`,
  );

  // The ramp head is the aft edge of the port-side well: x=-2, z=+2.
  await page.evaluate(() => globalThis.__game.player.teleport({ x: -2, y: 4.6, z: 1.55 }));
  await sim(0.5);
  const deckTop = await position();
  check('player can stand at the stair head', deckTop.grounded && deckTop.y > 3.5, `y=${deckTop.y.toFixed(2)}`);

  await page.keyboard.down('w');
  await sim(1.6);
  await page.keyboard.up('w');
  await sim(0.2);
  const lower = await position();
  check('player walks down into the lower room', lower.grounded && lower.y < 2.7, `y=${lower.y.toFixed(2)}`);
  check(
    'lower-room camera remains finite and follows the actor',
    Object.values(lower.camera).every(Number.isFinite) && Math.hypot(lower.camera.x - lower.x, lower.camera.z - lower.z) < 12,
    `camera=(${lower.camera.x.toFixed(2)},${lower.camera.y.toFixed(2)},${lower.camera.z.toFixed(2)})`,
  );

  // The lower-room shell is authoritative collision, not decorative framing.
  // Each direction starts as a plain teleport setup, then uses real movement.
  const walls = [
    { name: 'east', at: { x: 3.7, y: 1.6, z: 0 }, key: 'd', axis: 'x', limit: 4.5, sign: 1 },
    { name: 'west', at: { x: -3.7, y: 1.6, z: 0 }, key: 'a', axis: 'x', limit: -4.5, sign: -1 },
    { name: 'south', at: { x: 0, y: 1.6, z: 6.9 }, key: 's', axis: 'z', limit: 7.5, sign: 1 },
    { name: 'north', at: { x: 0, y: 1.6, z: -6.9 }, key: 'w', axis: 'z', limit: -7.5, sign: -1 },
  ];
  for (const wall of walls) {
    await page.evaluate((at) => globalThis.__game.player.teleport(at), wall.at);
    await sim(0.25);
    await page.keyboard.down(wall.key);
    await sim(1.1);
    await page.keyboard.up(wall.key);
    await sim(0.15);
    const hit = await position();
    const value = hit[wall.axis];
    const stopped = wall.sign > 0 ? value < wall.limit : value > wall.limit;
    check(`lower-room ${wall.name} wall stops the player`, stopped, `${wall.axis}=${value.toFixed(2)}`);
  }

  // Reverse the setup and use actual movement back up the ramp.
  await page.evaluate(() => globalThis.__game.player.teleport({ x: -2, y: 1.6, z: -1.55 }));
  await sim(0.25);
  await page.keyboard.down('s');
  await sim(1.7);
  await page.keyboard.up('s');
  await sim(0.2);
  const upper = await position();
  check('player walks back up to the deck', upper.grounded && upper.y > 3.5, `y=${upper.y.toFixed(2)}`);

  // A scavenger routed from the deck to the lower-room player must receive a
  // non-empty graph route and eventually enter level -1 through the stair link.
  await page.evaluate(() => {
    const g = globalThis.__game;
    g.player.teleport({ x: -2, y: 1.6, z: -4 });
    if (!g.enemies.spawn('scavenger', { x: -2, y: 4.6, z: 5 })) throw new Error('scavenger spawn failed');
  });
  const routeStart = Date.now();
  await page.waitForFunction(
    () => globalThis.__game.enemies.active.some((enemy) => enemy.gridCell.y === -1),
    null,
    { timeout: 60_000 },
  );
  const routeWaitMs = Date.now() - routeStart;
  const actor = await page.evaluate(() => {
    const enemy = globalThis.__game.enemies.active[0];
    return enemy
      ? { y: enemy.gridCell.y, pathLength: enemy.pathLength, x: enemy.worldPosition.x, z: enemy.worldPosition.z }
      : null;
  });
  check('enemy receives a route toward the lower room', Boolean(actor && (actor.pathLength > 0 || actor.y === -1)), JSON.stringify(actor));
  check('enemy can enter level -1 through the stair route', actor?.y === -1, `${JSON.stringify(actor)} wait=${routeWaitMs}ms`);

  await mkdir('docs/art/graphics-v3', { recursive: true });
  await page.screenshot({ path: `docs/art/graphics-v3/lower-room-${stagedArt ? 'staged' : 'fallback'}.png` });

  if (errors.length) check('no browser console errors', false, errors.join(' | '));
  else check('no browser console errors', true);
} finally {
  await browser.close();
}

console.log(JSON.stringify({ results, errors }, null, 2));
await writeFile(
  `docs/art/graphics-v3/lower-room-${stagedArt ? 'staged' : 'fallback'}.json`,
  JSON.stringify({ mode: stagedArt ? 'staged-v3' : 'model-disabled', results, errors }, null, 2) + '\n',
);
if (results.some((result) => !result.ok) || errors.length) process.exitCode = 1;
