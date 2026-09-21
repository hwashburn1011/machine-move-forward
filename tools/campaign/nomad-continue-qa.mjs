import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = process.env.MMF_PORT ?? '5206';
const out = process.env.MMF_QA_OUT ?? 'test-results/nomad-continue-qa';
const fixtureUrl = `http://127.0.0.1:${port}/?nomenu=1&nolock=1&nospawn=1&nosound=1&quality=low`;
const bootUrl = `http://127.0.0.1:${port}/?nolock=1&nospawn=1&nosound=1&quality=low`;
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'mmf-nomad-continue-'));
const launch = () => chromium.launchPersistentContext(profile, {
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
  viewport: { width: 1280, height: 720 },
});
const check = (ok, message) => { if (!ok) throw new Error(message); };
const errors = [];

let context = await launch();
let page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));

try {
  await page.goto(fixtureUrl);
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 120_000 });
  const written = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    g.opening.restore({ phase: 'done' });
    g.story.restore({ format: 2, completed: [], recoveredUniques: [], active: {
      expeditionId: 'wreck-one', routeId: null, phase: 'signal', arrivalDistance: null,
      journalsRead: [], scriptedEncounter: 'not-due', signalStartedAt: 0,
    }});
    g.progression.earlyRadioDrop.restore({ status: 'found' });
    g.adoptCampaignSeed('qa-nondefault-seed', 240);
    g.scanner.restore({ format: 1, phase: 'scanning', elapsedS: 42, pendingDelayS: 0 });
    g.machine.power.restore({ fuel: 73 });
    g.build.setBuildAuthorization(() => true);
    let crateId = null;
    for (const cell of g.machine.deckCells) {
      const floor = { piece: 'floor', cell, rotation: 0 };
      if (!g.build.canPlace(floor).ok) continue;
      g.build.place(floor, true);
      const placed = g.build.place({ piece: 'crate', cell, rotation: 0 }, true);
      if (placed) { crateId = typeof placed === 'string' ? placed : placed.instanceId; break; }
    }
    if (!crateId) throw new Error('could not place controlled storage crate');
    const crate = g.build.crateContainer(crateId);
    if (!crate || crate.add('scrap', 17) !== 0 || crate.add('water', 2) !== 0) throw new Error('could not seed crate contents');
    g.state.paused = false;
    const save = g.buildSave();
    await g.saves.save('quicksave', save);
    return {
      seed: save.seed,
      scanner: save.progression.scanner,
      fuel: save.machine.fuel,
      distance: save.distanceTraveled,
      layout: save.machine.layout,
      position: save.player.position,
      crateId,
      crate: crate.serialise(),
      pieces: save.machine.structures.map((piece) => ({ id: piece.instanceId, definitionId: piece.definitionId, cell: piece.cell })),
    };
  });
  await page.screenshot({ path: `${out}/saved-source.png` });
  await context.close();

  context = await launch();
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  await page.goto(bootUrl);
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 120_000 });
  const continueButton = page.locator('[data-id="continue"]');
  await continueButton.waitFor({ state: 'visible', timeout: 10_000 });
  await continueButton.click();
  await page.waitForFunction(() => globalThis.__game?.game && !globalThis.__game.game.titleScreen?.isOpen, null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const restored = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const crate = g.build.crateContainer('bp-2') ?? g.terminal.onboardResources().storage.find((entry) => entry.kind === 'crate')?.container;
    return {
      seed: g.state.seed,
      scanner: g.scanner.snapshot(),
      fuel: g.machine.power.fuel,
      distance: g.world.distanceTraveled,
      position: { x: g.player.worldPosition.x, y: g.player.worldPosition.y, z: g.player.worldPosition.z },
      layout: g.buildSave().machine.layout,
      aboard: g.destination.playerOnMachine(g.player.worldPosition),
      storage: g.terminal.onboardResources().storage.map((entry) => ({ id: entry.id, online: entry.online, slots: entry.container.serialise() })),
      crateFallback: crate?.serialise() ?? null,
      phase: g.story.currentPhase,
    };
  });
  await writeFile(`${out}/cold-diagnostic.json`, JSON.stringify({ written, restored, errors }, null, 2));
  check(restored.seed === written.seed, 'cold Continue changed campaign seed');
  check(restored.scanner.phase === written.scanner.phase && restored.scanner.elapsedS >= written.scanner.elapsedS, 'scanner phase/progress did not survive cold Continue');
  check(restored.fuel > 0 && restored.fuel <= written.fuel, 'fuel did not survive cold Continue');
  check(restored.distance >= written.distance, 'distance did not survive cold Continue');
  check(restored.aboard && Number.isFinite(restored.position.x) && Number.isFinite(restored.position.z), 'cold Continue restored an invalid aboard pose');
  check(JSON.stringify(restored.layout) === JSON.stringify(written.layout), 'v2 machine layout did not survive cold Continue');
  const restoredCrate = restored.storage.find((entry) => entry.id === written.crateId);
  check(restoredCrate && JSON.stringify(restoredCrate.slots) === JSON.stringify(written.crate), 'cold Continue changed storage identity or contents');
  check(restoredCrate?.slots.some((slot) => slot?.itemId === 'scrap' && slot.count === 17), 'saved crate scrap contents did not survive cold Continue');
  check(restoredCrate?.slots.some((slot) => slot?.itemId === 'water' && slot.count === 2), 'saved crate water contents did not survive cold Continue');
  await page.screenshot({ path: `${out}/continued-signal.png` });
  await page.keyboard.press('Tab');
  await page.locator('.terminal-ui').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('[data-tab="signal"]').click();
  await page.locator('.terminal-ui').getByRole('heading', { name: 'Let the scanner run', exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.screenshot({ path: `${out}/continued-signal-terminal.png` });
  const report = { fixtureUrl, bootUrl, profile, written, restored, errors };
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  if (errors.length) throw new Error(`browser errors: ${errors.join('; ')}`);
  console.log(JSON.stringify(report));
} finally {
  await context.close();
}
