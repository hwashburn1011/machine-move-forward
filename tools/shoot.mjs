/**
 * Visual verification harness.
 *
 * Boots the dev server page in headless Chromium with a real GPU-backed WebGL
 * context, waits for the scene, and writes a screenshot. Also reports any
 * console errors, which is how most render bugs announce themselves.
 *
 * Usage: node tools/shoot.mjs <outfile.png> [waitMs] [hashUrlParams]
 */
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'shot.png';
const waitMs = Number(process.argv[3] ?? 3500);
const params = process.argv[4] ?? '';

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

await page.goto(`http://localhost:5173/${params}`, { waitUntil: 'load' });
await page.waitForTimeout(waitMs);

// Optional: jump the world forward before shooting, to exercise recycling.
const jump = Number(process.env.SHOOT_JUMP ?? 0);
if (jump > 0) {
  await page.evaluate((d) => globalThis.__game?.world?.reset(d), jump);
  await page.waitForTimeout(600);
}

await page.screenshot({ path: out });

// Report whether the frame actually has content, not just that it rendered.
const stats = await page.evaluate(() => {
  const g = globalThis.__game;
  return g?.debugStats ? g.debugStats() : null;
});

await browser.close();

console.log(`wrote ${out}`);
if (stats) console.log('stats:', JSON.stringify(stats));
if (errors.length) {
  console.log(`\n${errors.length} CONSOLE ERROR(S):`);
  for (const e of errors.slice(0, 12)) console.log(' -', e);
  process.exitCode = 1;
} else {
  console.log('no console errors');
}
