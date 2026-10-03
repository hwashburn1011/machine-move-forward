import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const out = 'test-results/grounded-machine-browser';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(
    `http://127.0.0.1:${process.env.MMF_PORT ?? 5206}/?nomenu=1&nolock=1&nospawn=1&nosound=1&quality=medium`,
  );
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 120000 });
  const report = await page.evaluate(() => {
    const g = __game.game;
    g.state.paused = true;
    g.freeCamera = g.renderer.camera;
    const V = () => g.player.worldPosition.clone();
    const floors = [];
    const placements = [];
    for (const y of [-2, -1, 0]) {
      for (const x of [5, 6, 7, 8]) {
        const placement = { piece: 'floor', cell: { x, y, z: 5 }, rotation: 0 };
        const piece = g.build.place(placement, true);
        placements.push({
          cell: placement.cell,
          placed: !!piece,
          validation: g.build.canPlace(placement),
        });
        if (piece) floors.push(piece);
      }
    }
    let maxDrift = 0,
      maxCollisionError = 0;
    for (let frame = 0; frame < 120; frame++) {
      g.machine.setPose({
        heave: 0.1 * Math.sin(frame * 0.18),
        pitch: 0.012 * Math.cos(frame * 0.1),
        roll: 0.014 * Math.sin(frame * 0.13),
      });
      g.machine.fixedUpdate(0);
      g.physics.step();
      g.machine.group.updateMatrixWorld(true);
      for (const floor of floors) {
        const expected = V()
          .set(floor.cell.x * 2, 16.03 + floor.cell.y * 3.6, 10)
          .applyMatrix4(g.machine.group.matrixWorld);
        const visual = g.build.visual(floor.instanceId).getWorldPosition(V());
        maxDrift = Math.max(maxDrift, visual.distanceTo(expected));
        const up = V().set(0, 1, 0).transformDirection(g.machine.group.matrixWorld);
        const hit = g.physics.raycast(
          expected.clone().addScaledVector(up, 2),
          up.clone().negate(),
          3,
          undefined,
          (c) => g.physics.getUserData(c)?.id === floor.instanceId,
        );
        maxCollisionError = Math.max(
          maxCollisionError,
          hit ? hit.point.distanceTo(expected) : 1000,
        );
      }
    }
    g.machine.setPose({ heave: 0, pitch: 0, roll: 0 });
    g.machine.fixedUpdate(0);
    g.physics.step();
    const at = V().set(13.2, 17.03, 10),
      h = g.physics.addCharacter(0.34, 0.65, at);
    for (let i = 0; i < 65; i++) {
      g.physics.moveCharacter(h, at, { x: 0.05, y: -0.035, z: 0 }, { x: 0, y: 0, z: 0 });
      g.physics.step();
    }
    const crossing = { x: at.x, y: at.y, z: at.z };
    g.physics.removeCharacter(h);
    return {
      placements,
      floorCount: floors.length,
      maxDrift,
      maxCollisionError,
      crossing,
      groundedModule: !!g.machine.group.getObjectByName('Grounded_Workshop_Assemblies'),
      fittedBraces: !!g.machine.group.getObjectByName('Fitted_Deck_Gussets'),
    };
  });
  for (const [name, eye, target] of [
    ['flush-platforms', [17, 19.8, 15], [11, 16.03, 10]],
    ['fore-controls', [3, 14.5, -6], [-3, 13.6, -11]],
    ['starboard-controls', [5, 14.5, -6], [9.5, 13.4, -10]],
    ['port-machinery', [-3, 14.5, -4], [-9.5, 13.5, -7]],
    ['aft-braces', [17, 15.1, 18], [9.8, 14.5, 10]],
  ]) {
    await page.evaluate(
      ({ eye, target }) => {
        const g = __game.game,
          c = g.freeCamera;
        g.player.teleport(g.player.worldPosition.clone().set(0, 17.04, 5));
        c.position.set(...eye);
        c.lookAt(...target);
        c.updateMatrixWorld(true);
      },
      { eye, target },
    );
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${out}/${name}.png` });
  }
  if (report.floorCount < 3) errors.push('Could not place platform samples');
  if (report.maxDrift > 1e-5 || report.maxCollisionError > 0.001)
    errors.push('Platform alignment drifted');
  if (report.crossing.x < 16 || Math.abs(report.crossing.y - 17.04) > 0.15)
    errors.push('Platform traversal blocked');
  if (!report.groundedModule || !report.fittedBraces)
    errors.push('Refined Blender assemblies missing');
  await writeFile(`${out}/report.json`, JSON.stringify({ ...report, errors }, null, 2));
  console.log(JSON.stringify({ ...report, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
