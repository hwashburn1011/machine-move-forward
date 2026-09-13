/** Browser acceptance probes for the build/catalog/storage handoff.
 * Run with MMF_PORT=5201 node tools/polish/build-storage-qa.mjs [out-dir]. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const BASE_URL = `http://127.0.0.1:${process.env.MMF_PORT ?? 5201}`;

const outDir = path.resolve(process.argv[2] ?? 'docs/gameplay-polish/acceptance/build-storage');
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` -- ${detail}` : ''}`); };
try {
  await page.goto(`${BASE_URL}/?nolock=1&nomenu=1&quality=low&nospawn=1&notex=1&nomodel=1&nosound=1&seed=polish-build-storage`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 60000 });
} catch (error) {
  await fs.writeFile(path.join(outDir, 'results.json'), JSON.stringify({ url: page.url(), checks, errors, bootError: String(error) }, null, 2));
  console.error(`BOOT FAILED ${String(error)}\nBrowser errors: ${errors.join(' | ')}`);
  await browser.close(); process.exit(1);
}
await page.screenshot({ path: path.join(outDir, 'boot.png') });

const stat = () => page.evaluate(() => globalThis.__game.debugStats());
const sim = async (seconds) => { const start = (await stat()).simTime; const end = Date.now() + 60000; while ((await stat()).simTime - start < seconds) { if (Date.now() > end) throw new Error('sim timeout'); await page.waitForTimeout(100); } };
check('game initializes', await page.evaluate(() => Boolean(globalThis.__game?.game?.build)));

// Real catalog entry and card click.
await page.keyboard.press('b'); await sim(0.3);
check('B opens build catalog', await page.locator('.build-catalog').isVisible());
check('build HUD is hidden while catalog owns cursor', !(await page.locator('#build-panel').isVisible()));
const card = page.locator('.build-catalog-card').first();
if (await card.count()) { await card.click(); await sim(0.2); check('catalog card selects a piece', await page.locator('#build-panel').isVisible()); }
await page.screenshot({ path: path.join(outDir, 'catalog-selection.png') });

// Real key input: confirm must be consumed by build, with no weapon fire.
const before = await stat(); await page.mouse.down(); await sim(0.2); await page.mouse.up(); await sim(0.2); const after = await stat();
check('build confirm does not fire weapon', (before.ammo ?? 0) === (after.ammo ?? 0), `${before.ammo} -> ${after.ammo}`);
await page.screenshot({ path: path.join(outDir, 'placement.png') });

// Exercise level controls, including negative decks, through real keyboard input.
await page.keyboard.press('PageDown'); await page.keyboard.press('PageDown'); await sim(0.1);
const levelText = await page.locator('#build-panel').textContent();
check('manual level control reaches lower deck', /Lower deck|Service deck/.test(levelText ?? ''), levelText ?? '');
await page.keyboard.press('Home'); await sim(0.1);

// Threat interruption is observable through build panel visibility and sim time.
const threatResult = await page.evaluate(() => {
  const g = globalThis.__game?.game; if (!g) return { supported: false };
  const guard = g.buildCombatGuard ?? g.buildGuard; if (!guard) return { supported: false };
  return { supported: true, before: guard.current?.active ?? false };
});
check('build threat guard exposed for integration', threatResult.supported, JSON.stringify(threatResult));

// Storage controls: create a real crate, move the player beside it, and open
// it through Game's public interaction seam (the same path as pressing E).
await page.keyboard.press('b'); await sim(0.2);
const crateReady = await page.evaluate(() => {
  const g = globalThis.__game.game;
  g.build.clear(); g.resetInventory?.();
  const floor = g.build.place({ piece: 'floor', cell: { x: -3, y: 0, z: -1 }, rotation: 0 }, true);
  const crate = g.build.place({ piece: 'crate', cell: { x: -3, y: 0, z: -1 }, rotation: 0 }, true);
  if (!crate) return { ok: false };
  g.player.teleport({ x: -6, y: 14.9, z: -2 });
  return { ok: g.openInteractable({ kind: 'crate', id: crate.instanceId, label: 'QA crate' }), id: crate.instanceId };
});
check('opens real crate transfer panel', crateReady.ok, JSON.stringify(crateReady));
if (!crateReady.ok || !crateReady.id) throw new Error(`crate fixture unsupported: ${JSON.stringify(crateReady)}`);
const storageButtons = await page.locator('#inv-panel [data-action]').allTextContents();
check('storage bulk controls are labeled', storageButtons.includes('Take all') && storageButtons.includes('Deposit matching') && storageButtons.includes('Sort'), storageButtons.join(' | '));
const storageBefore = await page.evaluate((id) => {
  const g = globalThis.__game.game; const crate = g.build.crateContainer(id);
  if (!crate || !g.inventory) return { supported: false };
  crate.slots.fill(null); g.inventory.slots.fill(null);
  g.inventory.slots[0] = { itemId: 'scrap', count: 95 };
  for (let i = 1; i < g.inventory.slots.length; i++) g.inventory.slots[i] = { itemId: 'components', count: 50 };
  crate.slots[0] = { itemId: 'scrap', count: 20 };
  return { supported: true, id, invScrap: g.inventory.count('scrap'), crateScrap: crate.count('scrap') };
}, crateReady.id);
if (!storageBefore.supported) throw new Error(`storage fixture unsupported: ${JSON.stringify(storageBefore)}`);
{
  await page.locator('#inv-panel [data-action="take-all"]').click(); await page.waitForTimeout(100);
  check('Take All reports partial overflow', (await page.locator('#inv-panel .inv-feedback').textContent() ?? '').includes('left'));
  const afterTake = await page.evaluate((id) => { const g = globalThis.__game.game; const c = g.build.crateContainer(id); return { inv: g.inventory.count('scrap'), crate: c?.count('scrap') ?? 0 }; }, storageBefore.id);
  const takeTotal = storageBefore.invScrap + storageBefore.crateScrap;
  check('Take All conserves items and leaves exact overflow', afterTake.inv + afterTake.crate === takeTotal && afterTake.inv === 100 && afterTake.crate === 15, JSON.stringify({ before: storageBefore, after: afterTake }));
  const depositBefore = await page.evaluate((id) => {
    const g = globalThis.__game.game, c = g.build.crateContainer(id);
    c.slots.fill(null); g.inventory.slots.fill(null);
    c.slots[0] = { itemId: 'components', count: 5 };
    c.slots[1] = { itemId: 'fuel', count: 4 };
    g.inventory.slots[0] = { itemId: 'components', count: 3 };
    g.inventory.slots[1] = { itemId: 'scrap', count: 7 };
    return { inv: g.inventory.count('components'), crate: c.count('components'), unmatched: g.inventory.count('scrap') };
  }, storageBefore.id);
  await page.locator('#inv-panel [data-action="deposit-matching"]').click(); await page.waitForTimeout(100);
  const afterDeposit = await page.evaluate((id) => { const g = globalThis.__game.game; const c = g.build.crateContainer(id); return { inv: g.inventory.count('components'), crate: c?.count('components') ?? 0 }; }, storageBefore.id);
  check('Deposit Matching conserves and moves only matching items', afterDeposit.inv + afterDeposit.crate === depositBefore.inv + depositBefore.crate && afterDeposit.inv === 0 && afterDeposit.crate === 8 && await page.evaluate(() => globalThis.__game.game.inventory.count('scrap')) === depositBefore.unmatched, JSON.stringify({ before: depositBefore, after: afterDeposit }));
  const sortBefore = await page.evaluate((id) => {
    const c = globalThis.__game.game.build.crateContainer(id); c.slots.fill(null);
    c.slots[0] = { itemId: 'fuel', count: 2 }; c.slots[2] = { itemId: 'scrap', count: 4 }; c.slots[4] = { itemId: 'components', count: 3 };
    return c.serialise().filter(Boolean).reduce((out,s) => ({ ...out, [s.itemId]: (out[s.itemId] ?? 0) + s.count }), {});
  }, storageBefore.id);
  await page.locator('#inv-panel [data-action="sort"]').click(); await page.waitForTimeout(100);
  const sorted = await page.evaluate((id) => { const c=globalThis.__game.game.build.crateContainer(id); return { ids:c.slots.filter(Boolean).map(s=>s.itemId), totals:c.serialise().filter(Boolean).reduce((out,s)=>({...out,[s.itemId]:(out[s.itemId]??0)+s.count}),{}) }; }, storageBefore.id);
  await page.locator('#inv-panel [data-action="sort"]').click(); await page.waitForTimeout(100);
  const sortedAgain = await page.evaluate((id) => globalThis.__game.game.build.crateContainer(id).slots.filter(Boolean).map(s=>s.itemId), storageBefore.id);
  const sortConserved = ['scrap','components','fuel'].every(id => (sorted.totals[id] ?? 0) === (sortBefore[id] ?? 0));
  check('Sort conserves crate totals and produces deterministic actual order', sortConserved && sorted.ids.join(',') === sortedAgain.join(','), JSON.stringify({ before:sortBefore, first:sorted, second:sortedAgain }));
  await page.evaluate((id) => { const g = globalThis.__game.game; g.build.damagePiece(id, 99999); }, storageBefore.id);
  await page.waitForTimeout(250);
  check('storage panel invalidates when target is destroyed', !(await page.locator('#inv-panel').isVisible()));
}
await page.screenshot({ path: path.join(outDir, 'storage.png') });

await fs.writeFile(path.join(outDir, 'results.json'), JSON.stringify({ url: page.url(), checks, errors }, null, 2));
await browser.close();
const failed = checks.filter((x) => !x.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed; ${errors.length} browser errors`);
if (failed.length || errors.length) process.exitCode = 1;
