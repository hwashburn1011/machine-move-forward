import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

const out = process.env.MMF_QA_OUT ?? 'test-results/single-campaign';
await mkdir(out, { recursive: true });
const profile = await mkdtemp(path.resolve(out, 'browser-'));
const url = `http://127.0.0.1:${process.env.MMF_PORT ?? 5206}/?nolock=1&nospawn=1&nosound=1&quality=low`;
const errors = [];
const launch = () =>
  chromium.launchPersistentContext(profile, {
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=d3d11', '--enable-gpu'],
    viewport: { width: 1280, height: 720 },
  });
const watch = (page) => {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
};
let context = await launch();
let page = await context.newPage();
watch(page);
try {
  await page.goto(url);
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 120000 });
  assert.equal(await page.locator('[data-profile]').count(), 0);
  assert(
    !(await page
      .locator('#title-screen')
      .innerText()
      .then((text) => text.includes('Survival'))),
  );
  await page.screenshot({ path: `${out}/standard-title.png` });
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page.waitForFunction(() => __game.game.openingScene?.active, null, { timeout: 30000 });
  await page.keyboard.down('Escape');
  await page.waitForFunction(() => __game.game.opening.phase === 'done');
  await page.keyboard.up('Escape');
  const legacy = await page.evaluate(async () => {
    const g = __game.game;
    g.stop();
    const save = g.buildSave();
    save.profile = 'survival';
    save.player.health = 84;
    save.machine.fuel = 73;
    save.player.equipment.weapons[0].ammoInMag = 7;
    save.player.equipment.weapons[0].reserveAmmo = 0;
    // Seed a genuinely old on-disk record, bypassing today's write migration.
    await g.saves.tx('readwrite', (store) => store.put(save, 'quicksave'));
    return save;
  });
  await context.close();
  context = await launch();
  page = await context.newPage();
  watch(page);
  await page.goto(url);
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 120000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).waitFor();
  await page.evaluate(() => __game.game.stop());
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(() => !__game.game.titleScreen.isOpen && !__game.game.continuing);
  const restored = await page.evaluate(() => {
    const g = __game.game;
    return {
      save: g.buildSave(),
      infinite: g.combat.current.infiniteReserve,
      profile: g.campaignProfile,
    };
  });
  assert.equal(restored.profile, 'story');
  assert.equal(restored.save.profile, 'story');
  assert.equal(restored.infinite, true);
  assert.equal(restored.save.seed, legacy.seed);
  assert.equal(restored.save.player.health, legacy.player.health);
  assert.equal(restored.save.machine.fuel, legacy.machine.fuel);
  assert.equal(restored.save.player.equipment.weapons[0].ammoInMag, 7);
  assert.deepEqual(restored.save.player.inventory, legacy.player.inventory);
  assert.deepEqual(restored.save.machine.structures, legacy.machine.structures);
  assert.deepEqual(restored.save.progression, legacy.progression);
  await page.evaluate(() => __game.game.titleScreen.show('boot'));
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page.locator('[data-campaign-preserve]').waitFor({ state: 'visible' });
  assert(
    await page.locator('[data-campaign-preserve]').evaluate((el) => el === document.activeElement),
  );
  await page.screenshot({ path: `${out}/preserve-existing-run.png` });
  await page.locator('[data-campaign-back]').click();
  assert(await page.getByRole('button', { name: 'New Game', exact: true }).isVisible());
  assert.equal(await page.locator('[data-profile]').count(), 0);
  assert.deepEqual(errors, []);
  const report = {
    url,
    legacy,
    restored,
    errors,
    checks: [
      'Direct standard campaign start',
      'Cold Continue migrates legacy Survival',
      'Progress, storage, fuel and magazine preserved',
      'Infinite reserve restored',
      'Existing-run preservation and Back',
    ],
  };
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks, errors }));
} finally {
  await context.close();
}
