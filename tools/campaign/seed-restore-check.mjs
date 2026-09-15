/** Cross-seed Continue regression and full-art smoke; uses a copied profile. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const source = process.env.MMF_CONTINUITY_PROFILE;
if (!source) throw new Error('MMF_CONTINUITY_PROFILE is required');
const output = path.resolve('test-results/seed-restore', `run-${Date.now()}`);
const profile = path.join(output, 'browser-profile');
await fs.mkdir(output, { recursive: true });
await fs.cp(path.resolve(source), profile, { recursive: true, errorOnExist: true });
const url = new URL(process.env.MMF_SITE ?? 'http://127.0.0.1:5205/');
const requestedSeed = 'seed-restore-new-campaign';
url.searchParams.set('seed', requestedSeed);
url.searchParams.set('nosound', '1');
url.searchParams.set('quality', 'medium');
const checks = [],
  errors = [],
  loaded = new Set();
const check = (name, value, detail) => {
  checks.push({ name, ok: Boolean(value), detail });
  if (!value) throw new Error(name);
};
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1920, height: 1080 },
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('response', (r) => {
    if (/\.(glb|js|css)(\?|$)/.test(r.url())) loaded.add(r.url());
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 180_000 });
  const parent = await page.evaluate(async () => {
    const saves = globalThis.__game.game.saves;
    const slot = await saves.latestSlot();
    return { slot, save: slot ? await saves.load(slot) : null };
  });
  check(
    'Saved campaign and requested New Game seed differ',
    parent.save && parent.save.seed !== requestedSeed,
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(() => {
    const g = globalThis.__game.game;
    return g.input.pointerLocked && !g.state.paused && !g.titleScreen.isOpen;
  });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__game.game.state.paused);
  const read = () =>
    page.evaluate(() => {
      const g = globalThis.__game.game;
      return {
        stateSeed: g.state.seed,
        worldSeed: g.world.worldSeed,
        directorSeed: g.director.seed,
        weatherSeed: g.dustFront.seed,
        save: g.buildSave(),
        authoredPlayer: g.player.visual.isAnimated,
        tacticsModel: Boolean(g.tacticsModel),
        authoredMachine: Boolean(g.machine.authoredDetailRoot),
        machineObjects: g.machine.group.children.map((o) => ({
          name: o.name,
          authored: o.userData.authored,
        })),
        phase: g.opening.phase,
      };
    });
  const restored = await read();
  for (const key of ['stateSeed', 'worldSeed', 'directorSeed', 'weatherSeed'])
    check(`Continue restores ${key}`, restored[key] === parent.save.seed, restored[key]);
  check('Next save retains campaign seed', restored.save.seed === parent.save.seed);
  check(
    'Inventory survives cross-seed Continue',
    JSON.stringify(restored.save.player.inventory) === JSON.stringify(parent.save.player.inventory),
  );
  check(
    'Construction survives cross-seed Continue',
    JSON.stringify(restored.save.machine.structures) ===
      JSON.stringify(parent.save.machine.structures),
  );
  check('Authored S-07 is animated', restored.authoredPlayer);
  check('Authored Iron Nomad is present', restored.authoredMachine);
  check('Mech tactics art prepared', restored.tacticsModel);
  check(
    'No missing destination art notice',
    !(await page.locator('body').innerText()).includes('Some destination details are unavailable'),
  );
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForFunction(
    () => globalThis.__game.game.input.pointerLocked && !globalThis.__game.game.state.paused,
  );
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyS');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(output, 'continued-full-art.png') });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__game.game.state.paused);
  await page.getByRole('button', { name: 'Save & Quit', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).waitFor({ state: 'visible' });
  const savedSeed = await page.evaluate(async () => {
    const saves = globalThis.__game.game.saves;
    return (await saves.load(await saves.latestSlot())).seed;
  });
  check('Committed save retains source seed under different URL', savedSeed === parent.save.seed);
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page.locator('[data-profile="story"]').click();
  await page.waitForFunction(() => globalThis.__game.game.opening.phase === 'rooftop');
  const fresh = await read();
  for (const key of ['stateSeed', 'worldSeed', 'directorSeed', 'weatherSeed'])
    check(`New Game restores requested ${key}`, fresh[key] === requestedSeed, fresh[key]);
  check(
    'New Game restarts progress',
    fresh.save.distanceTraveled < 1 && fresh.save.player.health === 100,
  );
  await page.screenshot({ path: path.join(output, 'new-campaign-full-art.png') });
  check('No browser or asset errors', errors.length === 0, errors);
  await fs.writeFile(
    path.join(output, 'summary.json'),
    JSON.stringify(
      {
        status: 'passed',
        source,
        url: url.toString(),
        parent,
        restored,
        fresh,
        checks,
        errors,
        loaded: [...loaded],
      },
      null,
      2,
    ),
  );
  process.stdout.write(JSON.stringify({ status: 'passed', output, checks: checks.length }));
} catch (error) {
  await fs.writeFile(
    path.join(output, 'summary.json'),
    JSON.stringify({ status: 'failed', source, checks, errors, message: error.stack }, null, 2),
  );
  console.error(error);
  process.exitCode = 1;
} finally {
  await context?.close();
}
