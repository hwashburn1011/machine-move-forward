import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const out = 'test-results/refinement-50-gameplay';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    'http://127.0.0.1:5206/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=desert-review',
  );
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180000 });
  await page.click('#game');
  const report = await page.evaluate(() => {
    const g = __game.game;
    g.stop();
    g.state.paused = false;
    g.opening.restore({ phase: 'done' });
    g.player.stats.invulnerable = true;
    g.freeCamera = g.renderer.camera;
    const library = g.world.propModels.desert;
    const buffer = g.world.desert.batch.geometry.attributes.position.array;
    const streaming = [];
    for (const distance of [0, 64, 128, 3000, 1000000, 0]) {
      g.world.reset(distance);
      g.render(0);
      streaming.push({
        distance,
        instances: g.world.desert.batch.instanceCount,
        reusedBuffer: g.world.desert.batch.geometry.attributes.position.array === buffer,
      });
    }
    return {
      models: Object.keys(library.models),
      materials: 1,
      atlasTextures: 3,
      streaming,
      modelsGrounded: Object.values(library.models).every(
        (m) => Math.abs(m.geometry.boundingBox.min.y) < 1e-5,
      ),
      gpuMemory: { ...g.renderer.three.info.memory },
    };
  });
  for (const shot of [
    { name: 'deck-district', distance: 180, eye: [-12, 17.3, 4], at: [-70, 5, -35] },
    { name: 'roadside-artifacts', distance: 360, eye: [-20, 6.5, 10], at: [-38, 2.4, -20] },
    { name: 'ruined-skyline', distance: 800, eye: [0, 21, 0], at: [15, 9, -140] },
  ]) {
    await page.evaluate(async (s) => {
      const g = __game.game;
      g.world.reset(s.distance);
      g.freeCamera.position.set(...s.eye);
      g.freeCamera.lookAt(...s.at);
      for (let i = 0; i < 8; i++) {
        g.render(0);
        await new Promise(requestAnimationFrame);
      }
    }, shot);
    await page.screenshot({ path: `${out}/${shot.name}.png` });
  }
  // Close render of the actual loaded, normalized library. The normal gameplay
  // scenery remains intact; this temporary inspection mesh is removed afterward.
  for (const kind of [
    'wreck-pickup',
    'transformer',
    'air-compressor',
    'wreck-forklift',
    'bulk-fuel-tank',
    'water-tower',
  ]) {
    await page.evaluate(async (kind) => {
      const g = __game.game;
      g.world.reset(0);
      const library = g.world.propModels.desert,
        geometry = library.models[kind].geometry;
      // Reuse an ordinary mesh constructor, never the player's skinned rig.
      const template = g.machine.group.getObjectByProperty('isMesh', true);
      const mesh = template.clone(false);
      mesh.geometry = geometry;
      mesh.material = library.material;
      mesh.name = 'catalog-review';
      mesh.position.set(-22, 18, 0);
      mesh.rotation.set(0, 0, 0);
      mesh.scale.setScalar(4);
      mesh.matrixAutoUpdate = true;
      mesh.visible = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.renderer.scene.add(mesh);
      globalThis.__catalogReview = mesh;
      const height = geometry.boundingBox.max.y * 4;
      g.freeCamera.position.set(-22 + 6, 18 + height * 0.55 + 3, 8);
      g.freeCamera.lookAt(-22, 18 + height * 0.5, 0);
      for (let i = 0; i < 8; i++) {
        g.render(0);
        await new Promise(requestAnimationFrame);
      }
    }, kind);
    await page.screenshot({ path: `${out}/model-${kind}.png` });
    await page.evaluate(() => {
      globalThis.__catalogReview.removeFromParent();
      delete globalThis.__catalogReview;
    });
  }
  report.errors = errors;
  await fs.writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  if (
    report.models.length !== 50 ||
    !report.modelsGrounded ||
    !report.streaming.every((s) => s.reusedBuffer && s.instances === 297) ||
    errors.length
  )
    throw new Error(JSON.stringify(report));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
