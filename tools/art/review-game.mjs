/** Art fixtures, deliberately separate from gameplay acceptance tests. */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { BASE_URL } from '../base-url.mjs';

const out = new URL('../../docs/art/game-review/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const modes = process.argv.includes('--authored-only') ? [false] : [false, true];
  for (const fallback of modes) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      `${BASE_URL}/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&cam=side${fallback ? '&nomodel=1&notex=1' : ''}`,
    );
    await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 60000 });
    await page.evaluate((fallback) => {
      const g = globalThis.__game.game;
      g.stop();
      g.progression.grant('manual-turret');
      let turret = null;
      for (const z of [-2, -3, 1, 2, 3]) {
        // An outboard platform gives the depressed barrel a clear line of
        // fire past the machine's existing leg housings.
        const cell = { x: -3, y: 0, z };
        if (!g.build.place({ piece: 'floor', cell, rotation: 0 }, true)) continue;
        turret = g.build.place({ piece: 'turret-manual', cell, rotation: 3 }, true);
        if (turret) break;
      }
      if (!turret) throw new Error('Art fixture cannot place turret on the port deck.');
      const visual = g.build.turretVisual(turret.instanceId);
      if (Boolean(visual?.root.userData.authored) === fallback)
        throw new Error('Turret fixture did not select the requested model path.');
      const pos = g.player.worldPosition.clone();
      pos.set(2, 4.8, -2);
      g.enemies.spawn('scavenger', pos);
      pos.set(2, 4.8, 0);
      g.enemies.spawn('raider', pos);
      for (let i = 0; i < 2; i++) g.physics.step();
      g.renderer.camera.position.set(-12, 10, 12);
      g.renderer.camera.lookAt(0, 4.6, -1);
      g.render(1);
    }, fallback);
    await page.screenshot({
      path: fileURLToPath(new URL(fallback ? 'fallback-deck.png' : 'authored-deck.png', out)),
    });
    await page.evaluate((fallback) => {
      const g = globalThis.__game.game;
      if (!g.vehicleScene.spawn('port')) throw new Error('Skiff art fixture could not spawn.');
      if (Boolean(g.vehicleScene.skiff.userData.authored) === fallback)
        throw new Error('Skiff fixture did not select the requested model path.');
      for (let i = 0; i < 900; i++) {
        g.vehicleScene.fixedUpdate(1 / 60);
        g.physics.step();
        const state = g.vehicleManager.snapshot;
        if (state.phase === 'boarding' && state.phaseElapsed > 0.8) break;
      }
      g.renderer.camera.position.set(-24, 11, 15);
      g.renderer.camera.lookAt(-7, 3.1, 0);
      g.render(1);
    }, fallback);
    await page.screenshot({
      path: fileURLToPath(
        new URL(fallback ? 'fallback-boarding.png' : 'authored-boarding.png', out),
      ),
    });
    await page.evaluate(() => {
      const g = globalThis.__game.game;
      g.renderer.camera.position.set(-20, 4, -9);
      g.renderer.camera.lookAt(-13, 1.6, 0);
      g.render(1);
    });
    await page.screenshot({
      path: fileURLToPath(new URL(fallback ? 'fallback-skiff.png' : 'authored-skiff.png', out)),
    });
    await page.evaluate(() => {
      const g = globalThis.__game.game;
      const gun = g.build.serialise().find((piece) => piece.definitionId === 'turret-manual');
      if (!gun || !g.defense.enter(gun.instanceId)) throw new Error('Art gun could not be crewed.');
      g.freeCamera = null;
      g.enemies.despawnAll();
      const visual = g.build.turretVisual(gun.instanceId);
      const target = g.vehicleScene.skiff.position.clone();
      target.y += 1;
      const local = visual.root.worldToLocal(target);
      g.defense.aim(
        Math.atan2(local.x, -local.z),
        Math.atan2(local.y - 1.2, Math.hypot(local.x, local.z)),
      );
      g.fixedUpdate(1 / 60);
      g.render(1);
    });
    await page.screenshot({
      path: fileURLToPath(
        new URL(fallback ? 'fallback-gun-view.png' : 'authored-gun-view.png', out),
      ),
    });
    await page.evaluate(() => {
      const g = globalThis.__game.game;
      g.machine.power.restore({ fuel: 0 });
      g.fixedUpdate(1 / 60);
      g.render(1);
    });
    await page.screenshot({
      path: fileURLToPath(
        new URL(fallback ? 'fallback-power-loss.png' : 'authored-power-loss.png', out),
      ),
    });
    const stats = await page.evaluate(() => globalThis.__game.debugStats());
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(
      `${fallback ? 'Fallback' : 'Authored'} game art rendered without page errors: ${JSON.stringify(stats)}`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
