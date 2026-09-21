import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Controlled integration fixtures in an isolated browser profile; no user saves.
const out = 'test-results/nomad-v3-reel-save';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(`http://127.0.0.1:${process.env.MMF_PORT ?? 5206}/?nomenu=1&nolock=1&nospawn=1&nosound=1&quality=medium`);
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 120000 });
  const reel = await page.evaluate(() => {
    const g = __game.game;
    g.stop();
    g.player.teleport(g.player.worldPosition.clone().set(0, 9.87, -14));
    g.freeCamera = g.renderer.camera;
    const records = [];
    for (const side of [-1, 1]) {
      g.salvage.reset();
      g.salvage.spawn();
      const crate = g.salvage.crates.find(c => c.active);
      const spawnX = crate.object3D.position.x;
      // Isolate reel reach at the new fore deck, not distance-based spawn timing.
      crate.object3D.position.set(side * 18, 2, -23);
      const start = { ...crate.object3D.position };
      g.freeCamera.position.copy(g.player.worldPosition);
      g.freeCamera.position.y += .35;
      g.freeCamera.lookAt(crate.object3D.position);
      g.freeCamera.updateMatrixWorld(true);
      const before = g.resources.count('scrap');
      g.fireReel();
      for (let i = 0; i < 300 && g.hook; i++) g.updateReel(1 / 60);
      records.push({ side, spawnX, start, before, after: g.resources.count('scrap'), active: crate.active, hookActive: !!g.hook, aboard: g.destination.playerOnMachine(g.player.worldPosition) });
    }
    return records;
  });
  for (const row of reel) {
    if (Math.abs(row.spawnX) < 14.5 || row.after <= row.before || row.active || row.hookActive || !row.aboard) errors.push(`Reel failed: ${JSON.stringify(row)}`);
  }
  const legacy = await page.evaluate(async () => {
    const g = __game.game;
    const save = g.buildSave();
    save.machine.layout = 'iron-nomad-v2';
    save.progression.opening = { phase: 'rooftop' };
    save.player.position = { x: 20.5, y: 20.482, z: 0 };
    const inventory = JSON.stringify(save.player.inventory);
    const fuel = save.machine.fuel;
    await g.saves.save('v3-opening-migration-fixture', save);
    const loaded = await g.loadFrom('v3-opening-migration-fixture');
    g.stop();
    const restored = g.buildSave();
    return { loaded, phase: g.opening.phase, cinematicActive: !!g.openingScene, aboard: g.destination.playerOnMachine(g.player.worldPosition), position: { ...g.player.worldPosition }, layout: restored.machine.layout, inventoryPreserved: inventory === JSON.stringify(restored.player.inventory), fuelPreserved: fuel === restored.machine.fuel };
  });
  if (!legacy.loaded || legacy.phase !== 'done' || legacy.cinematicActive || !legacy.aboard || legacy.layout !== 'iron-nomad-v3' || !legacy.inventoryPreserved || !legacy.fuelPreserved) errors.push(`Legacy opening restore failed: ${JSON.stringify(legacy)}`);
  const report = { reel, legacy, errors };
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
