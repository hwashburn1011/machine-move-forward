/** Read-only runtime observation after a passed ending save; Continue is normal UI input. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const source = path.resolve(process.env.MMF_CONTINUITY_PROFILE ?? '');
const parent = JSON.parse(await fs.readFile(path.join(source, '..', 'summary.json'), 'utf8'));
if (parent.status !== 'passed' || parent.final?.ending?.phase !== 'complete')
  throw new Error('A passed Keep Walking checkpoint is required');
const output = path.resolve(
  'test-results/keep-walking-observation',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
const profile = path.join(output, 'browser-profile');
await fs.mkdir(output, { recursive: true });
await fs.cp(source, profile, { recursive: true, errorOnExist: true });
const errors = [];
const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  viewport: { width: 1280, height: 720 },
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
let report = {
  source,
  authority:
    'Normal Continue followed by read-only observations; no state writes or accelerated simulation.',
};
try {
  const page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:5205/?quality=medium&nosound=1');
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180_000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(
    () => document.pointerLockElement && !globalThis.__game.game.titleScreen?.isOpen,
  );
  const read = () =>
    page.evaluate(() => {
      const g = globalThis.__game.game;
      return {
        ending: g.ending.phase,
        story: g.story.currentPhase,
        simTime: g.state.simTime,
        distanceM: g.world.distanceTraveled,
        pointerLocked: Boolean(document.pointerLockElement),
        paused: g.state.paused,
        firstRunComplete: g.firstRun.isComplete,
        enemySpawnsEnabled: g.enemySpawnsEnabled,
        permitsRadioRaids: g.story.permitsRadioRaids,
        raid: g.radioRaids.toSave(),
        chart: g.chartContext,
        contact: g.routeChart.contact,
        enemyCount: g.enemies.activeCount,
        vehicleActive: g.vehicleScene.active,
        gunboatActive: g.gunboatScene.active,
        runtimeBundle: [...document.scripts]
          .map((script) => script.src)
          .filter((src) => src.includes('/assets/')),
      };
    });
  const before = await read();
  await page.waitForTimeout(5_000);
  const after = await read();
  const checks = {
    normalControls: after.pointerLocked && !after.paused && after.ending === 'complete',
    raidEligibility: after.firstRunComplete && after.enemySpawnsEnabled && after.permitsRadioRaids,
    raidClockAdvances: after.raid.remaining < before.raid.remaining || after.vehicleActive,
    optionalRoutesReleased: !after.chart.storyPriority && after.chart.poweredHelm,
    normalTravel: after.distanceM > before.distanceM && after.simTime > before.simTime,
  };
  report = { ...report, before, after, checks, errors };
  if (errors.length || Object.values(checks).some((ok) => !ok))
    throw new Error('Post-ending runtime observation failed');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.message = String(error);
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2));
  await context.close();
  console.log(
    JSON.stringify({
      status: report.status,
      output,
      checks: report.checks,
      message: report.message,
    }),
  );
}
