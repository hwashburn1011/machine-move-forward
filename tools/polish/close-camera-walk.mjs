/** Browser-input walk/turn checks on authored stairs, with isolated test storage. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = process.env.MMF_QA_OUT ?? 'test-results/close-camera/walk';
const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5201/';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 768 },
  recordVideo: { dir: out, size: { width: 1280, height: 616 } },
});
const page = await context.newPage(),
  checks = [],
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(JSON.stringify(checks.at(-1)));
};
try {
  await page.goto(
    `${site}?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=close-camera-walk`,
  );
  await page.waitForFunction(() => globalThis.__game?.game?.player.visual.isAnimated, null, {
    timeout: 180000,
  });
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    globalThis.cameraFrames = [];
    globalThis.cameraRecording = false;
    const sample = () => {
      if (globalThis.cameraRecording) {
        const c = g.playerCamera,
          p = g.player.object3D.position,
          v = p.clone();
        v.y += 0.5;
        v.project(c.camera);
        globalThis.cameraFrames.push({
          visible: g.player.object3D.visible,
          opacity: g.playerFade.amount,
          x: v.x,
          y: v.y,
          z: v.z,
          overlap: g.physics.overlapsSphere(c.camera.position, c.radius, g.player.collider),
          distance: c.camera.position.distanceTo(p),
        });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  for (const level of [-2, -1]) {
    await page.evaluate((level) => {
      const g = globalThis.__game.game;
      g.player.teleport({ x: -2, y: g.machine.deckBounds.min.y + level * 3 + 1.11, z: -2.7 });
      g.playerCamera.setYaw(Math.PI);
      g.playerCamera.pitch = -0.08;
      g.playerCamera.resetHistory();
    }, level);
    await page.waitForTimeout(600);
    await page.evaluate(() => (globalThis.cameraRecording = true));
    await page.keyboard.down('w');
    await page.waitForFunction(() => globalThis.__game.game.player.worldPosition.z > 0.45, null, {
      timeout: 10000,
    });
    await page.keyboard.up('w');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/stairs-${level}.png` });
    // Actual mouse moves feed InputManager; rotate both ways near the low landing.
    await page.mouse.move(600, 384);
    await page.waitForTimeout(100);
    for (const x of [1050, 400, 1000, 550, 900, 600]) {
      await page.mouse.move(x, 384);
      await page.waitForTimeout(80);
    }
    await page.keyboard.press('v');
    await page.waitForTimeout(400);
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(450);
    for (const x of [1000, 450, 950, 600]) {
      await page.mouse.move(x, 384);
      await page.waitForTimeout(80);
    }
    await page.screenshot({ path: `${out}/aimed-turn-${level}.png` });
    await page.mouse.up({ button: 'right' });
    await page.evaluate(() => globalThis.__game.game.playerCamera.setYaw(Math.PI));
    await page.keyboard.down('w');
    await page.waitForFunction(() => globalThis.__game.game.player.worldPosition.z > 2.6, null, {
      timeout: 10000,
    });
    await page.keyboard.up('w');
    await page.waitForTimeout(400);
    const up = await page.evaluate(() => ({
      y: globalThis.__game.game.player.worldPosition.y,
      z: globalThis.__game.game.player.worldPosition.z,
      grounded: globalThis.__game.game.player.isGrounded,
    }));
    check(`ramp ${level} ascent`, up.grounded && up.z > 2.6, up);
    await page.keyboard.down('s');
    await page.waitForFunction(() => globalThis.__game.game.player.worldPosition.z < -2.6, null, {
      timeout: 10000,
    });
    await page.keyboard.up('s');
    await page.waitForTimeout(400);
    await page.evaluate(() => (globalThis.cameraRecording = false));
    check(
      `ramp ${level} descent`,
      await page.evaluate(() => globalThis.__game.game.player.isGrounded),
      null,
    );
  }
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.player.teleport({ x: 5.6, y: 15.95, z: 1.5 });
    g.playerCamera.setYaw(0);
    g.playerCamera.resetHistory();
  });
  await page.waitForTimeout(1000);
  check(
    'full character restores after leaving cover',
    await page.evaluate(
      () =>
        globalThis.__game.game.player.object3D.visible &&
        globalThis.__game.game.playerFade.amount > 0.99,
    ),
    null,
  );
  const instantTurn = await page.evaluate(() => {
    const g = globalThis.__game.game,
      c = g.playerCamera;
    const idle = { consumeLook: () => ({ x: 0, y: 0 }), isDown: () => false };
    c.fixedUpdate(1 / 60, idle, g.player.worldPosition, g.physics, g.player.collider);
    c.update(1, idle);
    c.camera.updateMatrixWorld(true);
    const chest = g.player.worldPosition.clone();
    chest.y += 0.5;
    const before = chest.clone().project(c.camera);
    g.input.lookDelta.x = 300;
    c.update(1, g.input);
    c.camera.updateMatrixWorld(true);
    const after = chest.clone().project(c.camera);
    return { before: before.toArray(), after: after.toArray(), delta: before.distanceTo(after) };
  });
  check('render-only look keeps the same player framing', instantTurn.delta < 1e-6, instantTurn);
  const frames = await page.evaluate(() => globalThis.cameraFrames);
  const visible = frames.filter((f) => f.visible && f.opacity > 0.35);
  const outside = visible.filter(
    (f) => Math.abs(f.x) > 1 || Math.abs(f.y) > 1 || f.z < -1 || f.z > 1,
  );
  check(
    'visible upper body stays in frame through stair movement and fast turns',
    visible.length > 100 && outside.length === 0,
    { frames: frames.length, visibleFrames: visible.length, outside: outside.slice(0, 10) },
  );
  check(
    'camera volume stays out of solid geometry',
    frames.length > 100 && frames.every((f) => !f.overlap),
    { overlapFrames: frames.filter((f) => f.overlap).length },
  );
  await page.screenshot({ path: `${out}/recovered.png` });
  await writeFile(`${out}/frames.json`, JSON.stringify(frames));
} catch (e) {
  errors.push(String(e));
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
} finally {
  await writeFile(
    `${out}/results.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        site,
        fixtures:
          'Isolated storage, prepared stair starts and heading resets; physical W/S/V/RMB/mouse input. Frame samples run after game render.',
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  await context.close();
  await page.video().saveAs(`${out}/review.webm`);
  await page.video().delete();
  await browser.close();
}
if (checks.length !== 8 || checks.some((c) => !c.ok) || errors.length) {
  console.log(JSON.stringify(errors));
  process.exitCode = 1;
}
