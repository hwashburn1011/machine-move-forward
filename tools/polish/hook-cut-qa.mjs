/** Current-build acceptance for the physical hold-E boarding-hook counterplay. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const port = process.env.MMF_PORT ?? '5201';
const output = path.resolve(process.argv[2] ?? 'docs/gameplay-polish/acceptance/hook-cut-qa.json');
await fs.mkdir(path.dirname(output), { recursive: true });
const evidence = {
  generatedAt: new Date().toISOString(),
  url: `http://127.0.0.1:${port}/?nomenu=1&nolock=1&nospawn=1&nosound=1&quality=high&seed=polish-hook-cut`,
  fixtures: [
    'VehicleScene.spawn(side) starts the real encounter because random encounter timing is outside this focused check.',
    'Player.teleport(hookWorldPosition) puts the capsule within Game updateBoarding proximity; no cut method is called by the harness.',
  ],
  inputDriven: 'Playwright holds physical KeyE; InputManager, Game proximity/phase checks, VehicleScene.holdCutHook, and VehicleManager own completion.',
  checks: [], errors: [],
};
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

try {
  for (const side of ['port', 'starboard']) {
    const page = await context.newPage();
    const browserErrors = [];
    page.on('console', message => { if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`); });
    page.on('pageerror', error => browserErrors.push(`page: ${error.message}`));
    await page.goto(evidence.url, { waitUntil: 'load', timeout: 45_000 });
    await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 120_000 });
    await page.evaluate(side => {
      const g = globalThis.__game.game;
      g.player.stats.invulnerable = true;
      if (!g.vehicleScene.spawn(side)) throw new Error(`${side} skiff fixture did not spawn`);
    }, side);
    await page.waitForFunction(
      () => ['attached', 'boarding'].includes(globalThis.__game.game.vehicleManager.snapshot?.phase),
      null,
      { timeout: 35_000 },
    );
    const before = await page.evaluate(() => {
      const g = globalThis.__game.game, hook = g.vehicleScene.hookWorldPosition;
      if (!hook) throw new Error('attached hook has no world position');
      g.player.teleport(hook.clone());
      return {
        side: g.vehicleManager.snapshot.side,
        phase: g.vehicleManager.snapshot.phase,
        hookHealth: g.vehicleManager.snapshot.hookHealth,
        simTime: g.state.simTime,
        distanceToHook: g.player.worldPosition.distanceTo(hook),
      };
    });
    await page.keyboard.down('e');
    await page.waitForFunction(
      () => {
        const g = globalThis.__game.game, snapshot = g.vehicleManager.snapshot;
        return !g.vehicleManager.active || snapshot?.hookHealth === 0 || snapshot?.phase === 'retreat';
      },
      null,
      { timeout: 8_000 },
    );
    await page.keyboard.up('e');
    const after = await page.evaluate(() => {
      const g = globalThis.__game.game, snapshot = g.vehicleManager.snapshot;
      return {
        active: g.vehicleManager.active,
        phase: snapshot?.phase ?? null,
        hookHealth: snapshot?.hookHealth ?? 0,
        simTime: g.state.simTime,
      };
    });
    const ok =
      before.side === side &&
      before.distanceToHook <= 0.01 &&
      before.hookHealth > 0 &&
      after.simTime - before.simTime >= 1.2 &&
      after.hookHealth === 0 &&
      (!after.active || after.phase === 'retreat');
    evidence.checks.push({ name: `${side} physical hold-E cuts attached hook`, ok, before, after, browserErrors });
    if (!ok || browserErrors.length) throw new Error(`${side} hook cut failed: ${JSON.stringify({ before, after, browserErrors })}`);
    await page.close();
  }
} catch (error) {
  evidence.errors.push(error?.stack ?? String(error));
} finally {
  await context.close();
  await browser.close();
  await fs.writeFile(output, JSON.stringify(evidence, null, 2));
}

for (const check of evidence.checks) console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`);
if (evidence.errors.length) console.error(evidence.errors.join('\n'));
if (evidence.errors.length || evidence.checks.some(check => !check.ok)) process.exitCode = 1;
