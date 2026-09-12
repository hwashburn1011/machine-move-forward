/** Real player input on the authored deck; isolated saves, unchanged movement/physics. */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const out = 'docs/performance-smoothness';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(
    `http://127.0.0.1:${process.env.MMF_PORT ?? 5201}/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=movement-review`,
  );
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180000 });
  await page.click('#game');
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.opening.restore({ phase: 'done' });
    g.state.paused = false;
    g.player.stats.invulnerable = true;
    g.player.teleport(g.player.worldPosition.clone().set(5.9, 15.94, 2));
    g.playerCamera.setYaw(0);
  });
  await page.waitForTimeout(1500);
  const movement = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const g = globalThis.__game.game;
        const start = performance.now(),
          simStart = g.state.simTime;
        let last = start,
          key = '',
          previous = g.player.worldPosition.clone();
        let path = 0,
          groundedFrames = 0,
          frames = 0;
        const positions = [],
          intervals = [];
        const keyEvent = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
        function tick(now) {
          const elapsed = (now - start) / 1000;
          intervals.push(now - last);
          last = now;
          const next = Math.floor(elapsed / 0.65) % 2 === 0 ? 'KeyW' : 'KeyS';
          if (next !== key) {
            if (key) keyEvent('keyup', key);
            key = next;
            keyEvent('keydown', key);
          }
          // Small repeated view corrections while walking, as in ordinary play.
          const targetYaw = Math.sin(elapsed * 7) * 0.06;
          window.dispatchEvent(
            new MouseEvent('mousemove', {
              movementX: (g.playerCamera.yawAngle - targetYaw) / 0.0022,
            }),
          );
          const at = g.player.worldPosition;
          path += Math.hypot(at.x - previous.x, at.z - previous.z);
          previous.copy(at);
          positions.push(at.toArray());
          frames++;
          if (g.player.isGrounded) groundedFrames++;
          if (elapsed < 10.4) {
            requestAnimationFrame(tick);
            return;
          }
          keyEvent('keyup', key);
          intervals.sort((a, b) => a - b);
          resolve({
            frames,
            path,
            groundedFraction: groundedFrames / frames,
            simulationSeconds: g.state.simTime - simStart,
            min: [0, 1, 2].map((i) => Math.min(...positions.map((p) => p[i]))),
            max: [0, 1, 2].map((i) => Math.max(...positions.map((p) => p[i]))),
            p95FrameMs: intervals[Math.floor(intervals.length * 0.95)],
            cameraFinite: g.playerCamera.camera.position.toArray().every(Number.isFinite),
          });
        }
        requestAnimationFrame(tick);
      }),
  );
  assert(movement.path > 20, 'W/S must move the real player, not just animate the rig');
  assert(movement.groundedFraction > 0.95, 'walking must remain grounded on the moving deck');
  assert(movement.min[1] > 15.5 && movement.max[1] < 16.2, 'player must stay on the top deck');
  assert(movement.simulationSeconds > 10, 'simulation must keep up with real time');
  assert(movement.cameraFinite);
  await page.screenshot({ path: `${out}/walking.jpg`, quality: 82 });

  const handoff = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.stop();
    const before = g.playerCamera.yawAngle;
    g.freeCamera = g.renderer.camera;
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: 10000 }));
    g.render(0.5);
    g.freeCamera = null;
    g.render(0.5);
    const cinematicTravel = g.playerCamera.yawAngle - before;
    g.state.paused = true;
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: 10000 }));
    g.render(0.5);
    g.state.paused = false;
    g.render(0.5);
    const pauseTravel = g.playerCamera.yawAngle - before;
    g.start();
    return { cinematicTravel, pauseTravel };
  });
  assert.equal(handoff.cinematicTravel, 0);
  assert.equal(handoff.pauseTravel, 0);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(500);
  const aimedFov = await page.evaluate(() => globalThis.__game.game.playerCamera.camera.fov);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(700);
  const hipFov = await page.evaluate(() => globalThis.__game.game.playerCamera.camera.fov);
  assert(Math.abs(aimedFov - 38) < 0.05);
  assert(Math.abs(hipFov - 55) < 0.05);
  assert.deepEqual(errors, []);
  const result = { movement, handoff, aimedFov, hipFov, errors };
  await writeFile(`${out}/movement-qa.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
