import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'docs/art/desert-ruins';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
  errors = [];
page.on('pageerror', (e) => {
  errors.push(e.message);
  console.log('PAGEERROR', e.message);
});
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
try {
  await page.goto(
    (process.env.MMF_URL ?? 'http://127.0.0.1:5201/') +
      '?nomenu=1&nolock=1&nospawn=1&nosound=1&quality=high&seed=desert-review',
  );
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180000 });
  console.log('BOOTED');
  await page.click('#game');
  const report = await page.evaluate(() => {
    const g = __game.game;
    g.stop();
    g.state.paused = false;
    g.opening.restore({ phase: 'done' });
    g.player.stats.invulnerable = true;
    g.freeCamera = g.renderer.camera;
    return {
      desert: !!g.world.desert,
      instances: g.world.desert?.batch.instanceCount,
      models: Object.keys(g.world.propModels?.desert?.models ?? {}),
      material: g.world.propModels?.desert?.material.map?.name,
      memory: g.renderer.three.info.memory,
    };
  });
  for (const shot of [
    { name: 'deck-port', distance: 0, eye: [-5.7, 16.5, 0], at: [-70, 7, -25] },
    { name: 'district', distance: 180, eye: [-24, 20, 19], at: [-85, 6, -65] },
    { name: 'roadside', distance: 360, eye: [-14, 7, 10], at: [-42, 3, -23] },
    { name: 'skyline', distance: 800, eye: [0, 21, 0], at: [15, 9, -140] },
  ]) {
    await page.evaluate((s) => {
      const g = __game.game;
      g.world.reset(s.distance);
      g.freeCamera.position.set(...s.eye);
      g.freeCamera.lookAt(...s.at);
      g.renderer.three.render(g.renderer.scene, g.freeCamera);
      g.render(0);
    }, shot);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${shot.name}.png` });
  }

  report.behavior = await page.evaluate(async () => {
    const g = __game.game,
      checks = {};
    for (const tier of ['low', 'medium', 'ultra', 'high']) {
      g.setQuality(tier);
      g.render(0);
      checks[tier] = g.world.desert.batch.instanceCount;
    }
    g.freeCamera = null;
    g.player.teleport(g.player.worldPosition.clone().set(-5.6, 15.8, 0));
    g.world.reset(800);
    g.machine.power.restore({ fuel: 0 });
    g.fixedUpdate(1 / 60);
    g.render(0);
    const savedDistance = g.world.distanceTraveled;
    checks.empty = {
      target: g.machine.movement.maxSpeed,
      power: g.machine.power.capacity,
      hint: document.querySelector('#hud-fuel-help')?.textContent,
      visible: getComputedStyle(document.querySelector('#hud-fuel-help')).display,
    };
    checks.saved = await g.saveTo('desert-review');
    g.machine.power.addFuel(10);
    g.world.reset(4000);
    checks.loaded = await g.loadFrom('desert-review');
    g.fixedUpdate(1 / 60);
    checks.restored = {
      fuel: g.machine.power.fuel,
      distance: g.world.distanceTraveled,
      expectedDistance: savedDistance,
      crawl: g.machine.movement.fuelAvailable === false,
      instances: g.world.desert.batch.instanceCount,
    };
    g.resources.deposit('fuel', 4);
    const carried = g.resources.count('fuel');
    checks.refueled = g.depositFuel();
    g.fixedUpdate(1 / 60);
    g.render(0);
    checks.after = {
      fuel: g.machine.power.fuel,
      target: g.machine.movement.maxSpeed,
      consumed: carried - g.resources.count('fuel'),
      hint: getComputedStyle(document.querySelector('#hud-fuel-help')).display,
    };
    return checks;
  });
  if (
    !report.desert ||
    report.models.length !== 14 ||
    !report.behavior.saved ||
    !report.behavior.loaded ||
    !report.behavior.restored.crawl ||
    !report.behavior.refueled ||
    report.behavior.empty.visible !== 'block' ||
    report.behavior.after.hint !== 'none'
  )
    throw new Error('Gameplay regression ' + JSON.stringify(report));
  report.errors = errors;
  await writeFile(`${out}/visual-qa.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
