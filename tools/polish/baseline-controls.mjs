import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const port = process.env.MMF_PORT ?? '5203';
const out = process.env.MMF_QA_OUT ?? 'docs/gameplay-polish/baseline';
await mkdir(`${out}/screenshots`, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(`http://127.0.0.1:${port}/?nomenu=1&nolock=1&nospawn=1&nosound=1&quality=low&seed=baseline-controls`, { waitUntil: 'load' });
await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 120000 });
const result = await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.stop();
  g.state.paused = false;
  g.opening.restore({ phase: 'done' });
  g.player.stats.invulnerable = true;
  const cases = [];
  for (const y of [8.7, 11.7]) {
    g.player.teleport(g.player.worldPosition.clone().set(0, y, 0));
    g.buildMode = true;
    g.fixedUpdate(1 / 60);
    cases.push({ requestedY: y, playerY: g.player.worldPosition.y, currentBuildLevel: g.currentBuildLevel });
  }
  g.player.teleport(g.player.worldPosition.clone().set(0, 15.8, 0));
  g.fixedUpdate(1 / 60);
  return { cases, camera: { x: g.playerCamera.camera.position.x, y: g.playerCamera.camera.position.y, z: g.playerCamera.camera.position.z }, target: g.buildPreview?.lastTarget ?? null };
});
await page.screenshot({ path: `${out}/screenshots/baseline-build-clamp.png`, fullPage: true });
const evidence = { generatedAt: new Date().toISOString(), baselineCheckout: '1cf3835739d7e5318ec9506faaed149c6957c4bc', port, result, errors };
await writeFile(`${out}/control-reproduction.json`, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
await browser.close();
