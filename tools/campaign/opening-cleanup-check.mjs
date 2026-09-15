/** Isolated ownership/pool regression; this deliberately calls scene lifecycle seams. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5206/';
const out = process.env.MMF_QA_OUT ?? 'test-results/opening-cleanup';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const errors = [];
let result = null;
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(
    `${site}?nomenu=1&opening=1&nolock=1&nosound=1&nospawn=1&nomodel=1&notex=1&quality=low`,
  );
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 120000 });
  result = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.stop();
    let kills = 0;
    g.bus.on('enemy:killed', () => kills++);
    const inventory = JSON.stringify(g.inventory.serialise());
    const samples = [];
    for (let cycle = 0; cycle <= 100; cycle++) {
      g.raiseRooftop();
      const owned = [...g.rooftopPursuers];
      // An unrelated actor proves retirement is scoped to this scene's owners.
      const outsider = g.enemies.spawn('scavenger', g.machine.deckSpawn);
      if (owned.length !== 2 || !outsider || owned.includes(outsider))
        throw new Error('Opening fixture ownership was not established');
      g.releaseRooftop();
      samples.push({
        cycle,
        ownedRetired: owned.every((enemy) => !enemy.isActive),
        outsiderPreserved: outsider.isActive,
        active: g.enemies.activeCount,
        tags: g.rooftopPursuers.size,
        bodies: g.physics.bodyCount,
        colliders: g.physics.colliderCount,
        pool: g.enemies.pool.length,
      });
      outsider.despawn();
    }
    return {
      samples,
      kills,
      inventoryPreserved: inventory === JSON.stringify(g.inventory.serialise()),
      spawnsEnabled: g.enemySpawnsEnabled,
    };
  });
} catch (error) {
  errors.push(error.stack ?? String(error));
} finally {
  await browser.close();
}
const baseline = result?.samples[0];
const cycles = result?.samples.slice(1) ?? [];
const checks = [
  {
    name: '100 scene releases retire only their two owned pursuers',
    ok:
      cycles.length === 100 &&
      cycles.every(
        (sample) =>
          sample.ownedRetired &&
          sample.outsiderPreserved &&
          sample.active === 1 &&
          sample.tags === 0,
      ),
  },
  {
    name: 'No kill reward and no inventory mutation on escape',
    ok: result?.kills === 0 && result?.inventoryPreserved,
  },
  {
    name: 'Repeated opening pool and physics allocation remain stable',
    ok:
      !!baseline &&
      cycles.every(
        (sample) =>
          sample.bodies === baseline.bodies &&
          sample.colliders === baseline.colliders &&
          sample.pool === baseline.pool,
      ),
  },
  { name: 'Teardown retains configured no-spawn preference', ok: result?.spawnsEnabled === false },
];
await writeFile(
  `${out}/qa.json`,
  JSON.stringify(
    { site, fixture: 'scene lifecycle seams, placeholder art', checks, result, errors },
    null,
    2,
  ),
);
console.log(JSON.stringify({ checks, errors }));
if (errors.length || checks.some((check) => !check.ok)) process.exitCode = 1;
