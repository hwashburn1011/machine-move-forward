import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { caretakerStairPhysics } from './campaign/caretaker-stair-physics.mjs';
const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5201/';
const out = process.env.MMF_QA_OUT ?? 'test-results/caretaker-stairs';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const errors = [];
let result;
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (error) => errors.push(error.stack ?? String(error)));
  await page.goto(
    `${site}?nomenu=1&nolock=1&nosound=1&nospawn=1&nomodel=1&notex=1&quality=low&seed=caretaker-stairs`,
  );
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 120000 });
  result = await page.evaluate(caretakerStairPhysics);
} catch (error) {
  errors.push(error.stack ?? String(error));
} finally {
  await browser.close();
}
const checks = [
  {
    name: 'Both actual stair passages in both directions, stationary/walking and 30/60/144 frame cadences',
    ok: result?.trials.length === 24 && result.trials.every((t) => t.reached && t.maxDelta < 0.15),
  },
  {
    name: '100 consecutive physical cross-deck trips without resetting actor position',
    ok:
      result?.crossings.length === 100 &&
      result.crossings.every((t) => t.reached && t.maxDelta < 0.15),
  },
  {
    name: 'Stable body/collider counts, bounded navigation cache and disposed capsule',
    ok:
      result &&
      result.before.bodies === result.after.bodies &&
      result.before.colliders === result.after.colliders &&
      result.after.routeCache <= 32 &&
      result.disposed.bodies === result.before.bodies - 1 &&
      result.disposed.colliders === result.before.colliders - 1,
  },
];
await writeFile(
  `${out}/qa.json`,
  JSON.stringify({ site, generatedAt: new Date().toISOString(), checks, result, errors }, null, 2),
);
console.log(
  JSON.stringify(
    {
      checks,
      failures: result?.trials.filter((t) => !t.reached),
      crossings: result?.crossings.length,
      counts: result?.after,
      errors,
    },
    null,
    2,
  ),
);
if (checks.some((c) => !c.ok) || errors.length) process.exitCode = 1;
