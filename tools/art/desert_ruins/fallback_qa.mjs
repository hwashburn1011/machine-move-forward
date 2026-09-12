import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
try {
  const page = await browser.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/models/props/ruins/desert-ruins.glb', (route) => route.abort());
  await page.goto(
    (process.env.MMF_URL ?? 'http://127.0.0.1:5201/') +
      '?nomenu=1&nolock=1&nospawn=1&nosound=1&quality=low',
  );
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180000 });
  const result = await page.evaluate(() => {
    const g = __game.game;
    return {
      newLibrary: !!g.world.propModels.desert,
      legacy: ['wreck', 'containers', 'debris'].map((k) => !!g.world.propModels[k]),
      speed: g.machine.speed,
    };
  });
  result.errors = errors;
  await writeFile('docs/art/desert-ruins/fallback-qa.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (result.newLibrary || !result.legacy.every(Boolean) || errors.length)
    throw new Error('Fallback failed');
} finally {
  await browser.close();
}
