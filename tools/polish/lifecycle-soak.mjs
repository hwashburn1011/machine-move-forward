/** Ten-minute wall-clock build/save/combat lifecycle soak. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const port = process.env.MMF_PORT ?? '5201';
const cycles = 100, minimumCycleMs = 6000, slot = 'polish-lifecycle-soak';
const outDir = path.resolve(process.argv[2] ?? 'docs/gameplay-polish/acceptance/lifecycle-soak');
await fs.mkdir(outDir, { recursive: true });
const evidencePath = path.join(outDir, 'results.json');
const evidence = { generatedAt: new Date().toISOString(), url: '', cyclesRequested: cycles, minimumCycleMs, samples: [], checks: [], errors: [], complete: false };
const persist = () => fs.writeFile(evidencePath, JSON.stringify(evidence, null, 2));
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
page.on('console', message => { if (message.type() === 'error') evidence.errors.push(`console: ${message.text()}`); });
page.on('pageerror', error => evidence.errors.push(`page: ${error.message}`));

const waitGuard = async () => page.waitForFunction(() => globalThis.__game.game.buildGuard.canEnter(), null, { timeout: 15000 });
const sample = async cycle => page.evaluate(cycle => {
  const g = globalThis.__game.game, info = g.renderer.three.info;
  const materialIds = new Set();
  g.renderer.scene.traverse(object => {
    if (!object.isMesh && !object.isLine && !object.isPoints && !object.isSprite) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material?.uuid) materialIds.add(material.uuid);
  });
  const crate = g.build.serialise().find(piece => piece.definitionId === 'crate');
  const container = crate ? g.build.crateContainer(crate.instanceId) : null;
  return {
    cycle, wallTime: Date.now(), simTime: g.state.simTime, paused: g.state.paused,
    buildMode: g.buildMode, buildSession: g.buildSession.state,
    pieces: g.build.pieceCount, crateId: crate?.instanceId ?? null,
    crateItems: container?.serialise().reduce((sum, stack) => sum + (stack?.count ?? 0), 0) ?? -1,
    bodies: g.physics.bodyCount, geometries: info.memory.geometries,
    textures: info.memory.textures, programs: info.programs?.length ?? 0,
    materials: materialIds.size,
  };
}, cycle);

try {
  evidence.url = `http://127.0.0.1:${port}/?nomenu=1&nolock=1&nospawn=1&nosound=1&quality=high&seed=polish-lifecycle-soak`;
  await page.goto(evidence.url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game?.player?.visual?.isAnimated), null, { timeout: 120000 });
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.player.stats.invulnerable = true;
    g.player.teleport({ x: 5.6, y: 15.8, z: 1.5 });
    g.build.clear(); g.resetInventory();
    const a = g.build.place({ piece: 'floor', cell: { x: 2, y: 0, z: 3 }, rotation: 0 }, true);
    const b = g.build.place({ piece: 'floor', cell: { x: 3, y: 0, z: 3 }, rotation: 0 }, true);
    const crate = a && b && g.build.place({ piece: 'crate', cell: { x: 2, y: 0, z: 3 }, rotation: 0 }, true);
    if (!crate) throw new Error('fixture placement failed');
    const box = g.build.crateContainer(crate.instanceId);
    box.add('scrap', 20); box.add('components', 10); box.add('fuel', 5);
  });

  const soakStarted = Date.now();
  for (let cycle = 0; cycle < cycles; cycle++) {
    const cycleStarted = Date.now();
    await waitGuard();
    await page.keyboard.press('b');
    await page.locator('.build-catalog').waitFor({ state: 'visible', timeout: 3000 });
    await page.locator('.build-catalog-card[data-piece="floor"]').click();
    await page.locator('#build-panel').waitFor({ state: 'visible', timeout: 3000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !globalThis.__game.game.buildMode && globalThis.__game.game.buildSession.state === 'closed', null, { timeout: 3000 });

    const relocated = await page.evaluate(cycle => {
      const g = globalThis.__game.game, crate = g.build.serialise().find(piece => piece.definitionId === 'crate');
      if (!crate) return { ok: false, reason: 'crate-missing' };
      const cell = cycle % 2 === 0 ? { x: 3, y: 0, z: 3 } : { x: 2, y: 0, z: 3 };
      return g.build.relocate(crate.instanceId, { piece: 'crate', cell, rotation: cycle % 4 }, g.relocationOptions);
    }, cycle);
    if (!relocated.ok) throw new Error(`cycle ${cycle}: relocate failed: ${relocated.reason}`);

    const saved = await page.evaluate(async slot => { const g = globalThis.__game.game; g.world.reset(800); return g.saveTo(slot, 'manual', true); }, slot);
    if (!saved) throw new Error(`cycle ${cycle}: save failed`);

    if (cycle % 5 === 0) {
      const loadedBefore = await page.evaluate(async slot => globalThis.__game.game.loadFrom(slot), slot);
      if (!loadedBefore) throw new Error(`cycle ${cycle}: pre-fight load failed`);
      await page.evaluate(() => {
        const g = globalThis.__game.game; g.player.stats.invulnerable = true;
        const ids = ['bastion', 'revenant', 'warden', 'sovereign'], zs = [-5, -2, 1, 4];
        ids.forEach((id, index) => g.enemies.spawn(id, g.player.worldPosition.clone().set(index % 2 ? -5 : 5, 15.8, zs[index])));
      });
      await page.waitForTimeout(2200);
      await page.evaluate(() => globalThis.__game.game.enemies.despawnAll());
      const loadedAfter = await page.evaluate(async slot => globalThis.__game.game.loadFrom(slot), slot);
      if (!loadedAfter) throw new Error(`cycle ${cycle}: post-fight reset load failed`);
      await page.evaluate(() => { const g = globalThis.__game.game; g.player.stats.invulnerable = true; g.player.teleport({ x: 5.6, y: 15.8, z: 1.5 }); });
      await page.waitForTimeout(250);
    }

    const remaining = minimumCycleMs - (Date.now() - cycleStarted);
    if (remaining > 0) await page.waitForTimeout(remaining);
    const reading = await sample(cycle + 1);
    evidence.samples.push(reading);
    if (reading.pieces !== 3 || reading.crateItems !== 35 || reading.paused || reading.buildMode || reading.buildSession !== 'closed')
      evidence.errors.push(`cycle ${cycle + 1} invariant: ${JSON.stringify(reading)}`);
    await persist();
    console.log(JSON.stringify(reading));
  }

  const warm = evidence.samples[9], postWarm = evidence.samples.slice(9);
  const bounded = (field, allowance) => Math.max(...postWarm.map(sample => sample[field])) <= warm[field] + allowance;
  evidence.checks = [
    { name: '100 cycles completed', ok: evidence.samples.length === cycles },
    { name: 'ten minutes wall clock', ok: Date.now() - soakStarted >= cycles * minimumCycleMs },
    { name: 'geometry count bounded after warmup', ok: bounded('geometries', 2) },
    { name: 'texture count bounded after warmup', ok: bounded('textures', 2) },
    { name: 'program count bounded after warmup', ok: bounded('programs', 1) },
    { name: 'material UUID count bounded after warmup', ok: bounded('materials', 4) },
    { name: 'physics body count bounded after warmup', ok: bounded('bodies', 4) },
    { name: 'all lifecycle invariants held', ok: evidence.errors.length === 0 },
  ];
  evidence.complete = true;
  await page.screenshot({ path: path.join(outDir, 'final.png') });
} catch (error) {
  evidence.errors.push(error?.stack ?? String(error));
} finally {
  await persist();
  await context.close(); await browser.close();
}
for (const check of evidence.checks) console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`);
console.log(`Lifecycle soak: ${evidence.samples.length}/${cycles} cycles; errors=${evidence.errors.length}`);
if (!evidence.complete || evidence.errors.length || evidence.checks.some(check => !check.ok)) process.exitCode = 1;
