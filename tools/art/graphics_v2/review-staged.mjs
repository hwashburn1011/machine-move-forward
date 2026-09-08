/** Real game PlayerVisual, with staged GLBs served through test-only routes. */
import { chromium } from '@playwright/test';
import { readFile, access } from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/models/authored/*.glb', async (route) => {
    const file = new URL(route.request().url()).pathname.split('/').at(-1);
    const path = `assets/graphics-v2/staging/${file}`;
    try { await access(path); } catch { await route.continue(); return; }
    await route.fulfill({ contentType: 'model/gltf-binary', body: await readFile(path) });
  });
  await page.route('**/art-fixture', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><script type="module" src="/tools/art/fixture-entry.ts"></script></body></html>',
  }));
  await page.goto('http://127.0.0.1:5193/art-fixture');
  await page.waitForFunction(() => globalThis.artReady || globalThis.artError, null, { timeout: 60000 });
  const fail = await page.evaluate(() => globalThis.artError);
  if (fail) throw new Error(fail);
  await page.screenshot({ path: 'docs/art/graphics-v2/player-front.png' });
  await page.evaluate(() => {
    const { camera, scene, renderer } = globalThis.artFixture;
    camera.position.set(-4, 2.9, -6); camera.lookAt(0, 1.1, 0); renderer.render(scene, camera);
  });
  await page.screenshot({ path: 'docs/art/graphics-v2/player-back.png' });
  console.log(JSON.stringify({ errors }));
  if (errors.length) process.exitCode = 1;
} finally { await browser.close(); }
