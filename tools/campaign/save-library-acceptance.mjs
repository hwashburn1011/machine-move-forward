/** Player-facing save library acceptance; no direct save writes or simulation grants. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const source = path.resolve(
  process.env.MMF_CONTINUITY_PROFILE ??
    'test-results/continuity-ending/run-2026-09-15T18-11-26-503Z/browser-profile',
);
const output = path.resolve(
  'test-results/save-library',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
const profile = path.join(output, 'source-profile');
await fs.mkdir(output, { recursive: true });
await fs.cp(source, profile, { recursive: true, errorOnExist: true });
const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5205/?quality=medium&nosound=1';
const report = {
  source,
  output,
  authority:
    'Normal menus, download, file chooser, keyboard pause and Continue. Saved data read only for assertions.',
  checks: [],
  errors: [],
};
let context;
let page;
async function open(profilePath) {
  context = await chromium.launchPersistentContext(profilePath, {
    headless: true,
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true,
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.goto(site, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180000 });
  await page.waitForFunction(() => globalThis.__game.game.titleScreen?.isOpen);
}
async function library() {
  await page.getByRole('button', { name: 'Campaigns', exact: true }).click();
  await page.waitForFunction(
    () => globalThis.__game.game.saveLibrary.isOpen && !globalThis.__game.game.libraryBusy,
  );
}
async function closeLibrary() {
  await page.getByRole('button', { name: 'Close campaign library', exact: true }).click();
  await page.waitForFunction(() => globalThis.__game.game.titleScreen.isOpen);
}
async function readRecords() {
  return page.evaluate(async () => {
    const saves = globalThis.__game.game.saves;
    const slots = await saves.list();
    return Promise.all(slots.map(async (slot) => ({ slot, save: await saves.load(slot) })));
  });
}
const withoutName = (save) => {
  const copy = JSON.parse(JSON.stringify(save));
  delete copy.saveName;
  return copy;
};
const structuresById = (value) =>
  JSON.parse(JSON.stringify(value)).sort((a, b) => a.instanceId.localeCompare(b.instanceId));
async function importFile(file) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON', exact: true }).click();
  await (await chooser).setFiles(file);
  await page.waitForFunction(() => !globalThis.__game.game.libraryBusy);
}
async function continueAndPause() {
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(
    () => !globalThis.__game.game.titleScreen.isOpen && !globalThis.__game.game.artTransition,
    null,
    { timeout: 60000 },
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () =>
      globalThis.__game.game.state.paused &&
      globalThis.__game.game.titleScreen.isOpen &&
      !document.pointerLockElement,
  );
}
try {
  await open(profile);
  await library();
  const records = await readRecords();
  const original = records.find((row) => row.slot === 'quicksave');
  assert(original);
  assert(await page.locator('[data-save-slot="quicksave"]').isVisible());
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-save-slot="quicksave"] [data-save-export]').click();
  const downloaded = await downloadPromise;
  const file = path.join(output, 'campaign-export.json');
  await downloaded.saveAs(file);
  const exported = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.deepEqual(withoutName(exported.save), withoutName(original.save));
  report.checks.push('Existing published campaign appears and exports completely.');
  await closeLibrary();
  await continueAndPause();
  await library();
  const paused = await page.evaluate(() => globalThis.__game.game.state.simTime);
  await page.locator('#save-library-name').fill('Meridian — preserved 🌱');
  await page.getByRole('button', { name: 'Save Snapshot', exact: true }).click();
  await page.waitForFunction(() => !globalThis.__game.game.libraryBusy);
  const snapshot = (await readRecords()).find(
    (row) => row.save.saveName === 'Meridian — preserved 🌱',
  );
  assert(snapshot, await page.locator('#save-library-status').textContent());
  assert.equal(await page.evaluate(() => globalThis.__game.game.state.simTime), paused);
  assert.equal(
    await page.locator(`[data-save-slot="${snapshot.slot}"] [data-save-load]`).isDisabled(),
    true,
  );
  await page.screenshot({ path: path.join(output, 'paused-library.png') });
  report.snapshot = snapshot;
  report.checks.push(
    'Pause snapshot writes a distinct Unicode-named record while the simulation stays frozen.',
  );
  await closeLibrary();
  await page.getByRole('button', { name: 'Save & Quit', exact: true }).click();
  await page.waitForFunction(
    () =>
      !globalThis.__game.game.state.paused &&
      globalThis.__game.game.titleScreen.isOpen &&
      !document.pointerLockElement,
  );
  const savedBeforeCold = (await readRecords()).find((row) => row.slot === 'quicksave').save;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180000 });
  await continueAndPause();
  const restored = await page.evaluate(() => globalThis.__game.game.buildSave());
  assert.deepEqual(restored.machine.structures, savedBeforeCold.machine.structures);
  assert.deepEqual(restored.player.inventory, savedBeforeCold.player.inventory);
  assert.equal(restored.seed, savedBeforeCold.seed);
  report.checks.push(
    'Save & Quit and cold Continue preserve structures, contents and campaign seed.',
  );
  await page.getByRole('button', { name: 'Quit to Title', exact: true }).click();
  const recovery = await page.evaluate(async () => {
    const saves = globalThis.__game.game.saves;
    const slot = await saves.latestSlot();
    return { slot, save: await saves.load(slot) };
  });
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page.locator('[data-profile="story"]').click();
  await page.locator('[data-campaign-preserve]').waitFor({ state: 'visible' });
  assert(
    await page.locator('[data-campaign-preserve]').evaluate((el) => el === document.activeElement),
  );
  await page.screenshot({ path: path.join(output, 'preserve-before-new-game.png') });
  await page.locator('[data-campaign-preserve]').click();
  await page.waitForFunction(
    () => !globalThis.__game.game.newCampaignBusy && !globalThis.__game.game.titleScreen.isOpen,
  );
  const preserved = (await readRecords()).find(
    (row) => row.save.saveName === 'Before new campaign',
  );
  assert(preserved);
  assert.deepEqual(withoutName(preserved.save), withoutName(recovery.save));
  report.checks.push(
    'Preserve & Start snapshots the exact Continue authority before beginning a new rooftop opening.',
  );
  await context.close();
  context = null;

  await open(path.join(output, 'fresh-profile'));
  assert.equal((await readRecords()).length, 0);
  await library();
  await importFile(file);
  const imported = (await readRecords())[0];
  assert(imported, await page.locator('#save-library-status').textContent());
  assert.deepEqual(withoutName(imported.save), withoutName(exported.save));
  report.checks.push(
    'Downloaded JSON imports into a clean browser with the complete saved state intact.',
  );
  await importFile(file);
  const duplicate = await readRecords();
  assert.equal(duplicate.length, 2);
  assert.equal(new Set(duplicate.map((row) => row.save.saveName)).size, 2);
  await importFile({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{broken'),
  });
  assert.equal((await readRecords()).length, 2);
  assert((await page.locator('#save-library-status').getAttribute('role')) === 'alert');
  report.checks.push(
    'Duplicate imports create separate names/slots; malformed JSON writes nothing and leaves the menu usable.',
  );
  const extra = duplicate.find((row) => row.slot !== imported.slot);
  await page.locator(`[data-save-slot="${extra.slot}"] [data-save-delete]`).click();
  assert.equal((await readRecords()).length, 2);
  await page.locator('[data-save-delete-cancel]').click();
  assert.equal((await readRecords()).length, 2);
  await page.locator(`[data-save-slot="${extra.slot}"] [data-save-delete]`).click();
  await page.locator('[data-save-delete-confirm]').click();
  await page.waitForFunction(() => !globalThis.__game.game.libraryBusy);
  assert.equal((await readRecords()).length, 1);
  await page.screenshot({ path: path.join(output, 'imported-campaign.png') });
  await page.locator(`[data-save-slot="${imported.slot}"] [data-save-load]`).click();
  await page.waitForFunction(
    () => !globalThis.__game.game.saveLibrary.isOpen && !globalThis.__game.game.artTransition,
    null,
    { timeout: 60000 },
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__game.game.state.paused);
  const loaded = await page.evaluate(() => globalThis.__game.game.buildSave());
  assert.equal(loaded.seed, exported.save.seed);
  assert.deepEqual(loaded.player.inventory, exported.save.player.inventory);
  assert.deepEqual(
    structuresById(loaded.machine.structures),
    structuresById(exported.save.machine.structures),
  );
  report.checks.push(
    'Delete requires confirmation; exact selected imported snapshot loads with its campaign, structures and inventory.',
  );
  report.loaded = loaded;
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack ?? String(error);
  await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        status: report.status,
        output,
        checks: report.checks,
        failure: report.failure,
        errors: report.errors,
      },
      null,
      2,
    ),
  );
  await context?.close();
}
