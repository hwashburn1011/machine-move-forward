import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const site = process.env.MMF_SITE ?? 'https://hwashburn1011.github.io/machine-move-forward/';
const revision = process.env.MMF_REV ? `?rev=${encodeURIComponent(process.env.MMF_REV)}` : '';
const out = process.env.MMF_QA_OUT ?? 'test-results/gameplay-polish-release';
const assets = ['s07-player.glb', 'bastion.glb', 'revenant.glb', 'warden.glb', 'sovereign.glb'];
const checks = [],
  errors = [],
  loaded = new Set();
const hashes = {};
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: Boolean(ok), detail });
};
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
await mkdir(out, { recursive: true });
let browser, page;
try {
  browser = await chromium.launch({
    executablePath:
      process.env.MMF_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`);
  });
  page.on('response', (response) => {
    if (
      response.url().includes('.js') ||
      response.url().includes('.css') ||
      response.url().includes('.glb')
    )
      loaded.add(response.url());
    if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  const entry = new URL(site);
  for (const [key, value] of Object.entries({
    nomenu: '1',
    nolock: '1',
    nospawn: '1',
    nosound: '1',
    quality: 'high',
    seed: 'release-polish',
    rev: process.env.MMF_REV ?? 'smoke',
  }))
    entry.searchParams.set(key, value);
  await page.goto(entry.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 180000 });
  check('game booted', true);
  check(
    'S-07 authored model active',
    await page.evaluate(() => globalThis.__game.game.player.visual.isAnimated),
  );
  await page.evaluate(() => globalThis.__game.game.player.teleport({ x: 5.6, y: 15.8, z: 1.5 }));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/gameplay.png` });
  await page.keyboard.press('b');
  await page.waitForSelector('.build-catalog', { state: 'visible', timeout: 10000 });
  check('B opens build catalog', true);
  const floor = page.locator('.build-catalog-card[data-piece="floor"]');
  check('catalog has floor card', (await floor.count()) > 0);
  await floor.click();
  await page.locator('#build-panel').waitFor({ state: 'visible' });
  const bounds = await page.locator('#build-panel').boundingBox();
  check(
    'floor selection opens readable placement',
    !!bounds && bounds.x >= 0 && bounds.x + bounds.width <= 1280,
  );
  await page.screenshot({ path: `${out}/placement.png` });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !globalThis.__game.game.buildMode, null, { timeout: 5000 });
  check(
    'Escape closes building',
    (await page.locator('.build-catalog').isHidden()) &&
      (await page.locator('#build-panel').isHidden()),
  );
  const shoulder = await page.evaluate(() => globalThis.__game.game.playerCamera.shoulderSide);
  await page.keyboard.press('v');
  await page.waitForFunction(
    (side) => globalThis.__game.game.playerCamera.shoulderSide !== side,
    shoulder,
    { timeout: 5000 },
  );
  check(
    'V swaps shoulder',
    (await page.evaluate(() => globalThis.__game.game.playerCamera.shoulderSide)) !== shoulder,
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#title-settings.is-open').waitFor({ state: 'visible' });
  check(
    'pause Settings exposes controls',
    (await page.locator('#title-sensitivity').isVisible()) &&
      (await page.locator('#title-fov').isVisible()) &&
      (await page.locator('#title-binding-list').isVisible()),
  );
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/release-smoke.png`, fullPage: true });
  for (const name of assets) {
    const local = await readFile(`public/models/authored/${name}`);
    const response = await fetch(new URL(`models/authored/${name}${revision}`, site), {
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw Error(`Asset ${name}: HTTP ${response.status}`);
    const localHash = digest(local),
      remoteHash = digest(new Uint8Array(await response.arrayBuffer()));
    hashes[name] = { local: localHash, remote: remoteHash, match: localHash === remoteHash };
  }
  check(
    'authored GLB hashes match deployed files',
    Object.values(hashes).every((entry) => entry.match),
  );
} catch (error) {
  errors.push(String(error));
  if (page && !page.isClosed())
    await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
} finally {
  await browser?.close();
  await writeFile(
    `${out}/release-smoke.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        site,
        revision: process.env.MMF_REV ?? null,
        fixtures:
          'Prepared player start; real browser B, card click, Escape, V and Settings controls; isolated storage.',
        checks,
        errors,
        loadedUrls: [...loaded].sort(),
        hashes,
      },
      null,
      2,
    ),
  );
}
console.log(JSON.stringify({ checks, errors }, null, 2));
if (checks.length !== 9 || errors.length || checks.some((item) => !item.ok)) process.exitCode = 1;
