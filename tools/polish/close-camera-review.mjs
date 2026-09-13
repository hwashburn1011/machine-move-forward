/** Reproduce tight stair framing and rapid look using the actual Nomad and player. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const label = process.env.MMF_LABEL ?? 'current';
const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5201/';
const out = `test-results/close-camera/${label}`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 768 } });
const results = [],
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(`${site}?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=close-camera`);
  await page.waitForFunction(() => globalThis.__game?.game?.player.visual.isAnimated, null, {
    timeout: 180000,
  });
  for (const level of [-2, -1])
    for (const z of [-2.6, -1, 0.5, 2.5])
      for (const yaw of [0, Math.PI]) {
        await page.evaluate(
          ({ level, z, yaw }) => {
            const g = globalThis.__game.game,
              y =
                g.machine.deckBounds.min.y +
                level * 3 +
                1.11 +
                Math.max(0, Math.min(3, ((z + 2.2) * 3) / 4.4));
            g.player.teleport({ x: -2, y, z });
            g.playerCamera.setYaw(yaw);
            g.playerCamera.pitch = -0.08;
            g.playerCamera.resetHistory();
          },
          { level, z, yaw },
        );
        await page.waitForTimeout(750);
        const name = `deck${level}-z${z}-yaw${yaw === 0 ? 'back' : 'stairs'}`;
        const state = await page.evaluate(() => {
          const g = globalThis.__game.game,
            c = g.playerCamera,
            p = g.player.worldPosition;
          const project = (y) => {
            const v = p.clone();
            v.y += y;
            return v.project(c.camera).toArray();
          };
          return {
            player: p.toArray(),
            camera: c.camera.position.toArray(),
            anchor: c.anchor.toArray(),
            safe: c.safeAnchor.toArray(),
            distance: c.camera.position.distanceTo(p),
            visible: g.player.object3D.visible,
            opacity: g.playerFade.amount,
            grounded: g.player.isGrounded,
            torso: project(0.35),
            head: project(0.85),
            overlap: g.physics.overlapsSphere(c.camera.position, c.radius, g.player.collider),
          };
        });
        results.push({ name, ...state });
        await page.screenshot({ path: `${out}/${name}.png` });
      }
  // Raw look must orbit the player on the very same rendered frame, even without a fixed tick.
  const rapid = await page.evaluate(() => {
    const g = globalThis.__game.game,
      c = g.playerCamera;
    g.player.teleport({ x: 5.6, y: 15.95, z: 1.5 });
    c.setYaw(0);
    c.resetHistory();
    const idle = { consumeLook: () => ({ x: 0, y: 0 }), isDown: () => false };
    c.fixedUpdate(1 / 60, idle, g.player.worldPosition, g.physics, g.player.collider);
    c.update(1, idle);
    c.camera.updateMatrixWorld(true);
    const chest = g.player.worldPosition.clone();
    chest.y += 0.5;
    const before = chest.clone().project(c.camera).toArray();
    g.input.lookDelta.x = 300;
    c.update(1, g.input);
    c.camera.updateMatrixWorld(true);
    const after = chest.clone().project(c.camera).toArray();
    return { before, after };
  });
  results.push({ name: 'same-frame-rapid-look', ...rapid });
} catch (e) {
  errors.push(String(e));
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify({ label, results, errors }, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ results, errors }, null, 2));
if (errors.length) process.exitCode = 1;
