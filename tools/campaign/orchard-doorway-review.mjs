/** Isolated full-art geometry fixture. This is not campaign continuity evidence. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const output = 'test-results/orchard-doorway-review';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [],
  checks = [];
page.on('pageerror', (error) => errors.push(error.message));
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
try {
  await page.goto(
    'http://127.0.0.1:5201/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=medium&seed=orchard-doorway-fixture',
  );
  await page.waitForFunction(() => globalThis.__game?.game?.player?.visual?.isAnimated, null, {
    timeout: 180000,
  });
  const fixture = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    await g.prepareCampaignArt(['glass-orchard']);
    g.loop.stop();
    g.state.paused = false;
    g.closePanels(false);
    g.vehicleScene.clear();
    g.gunboatScene.clear();
    g.enemies.despawnAll();
    g.opening.restore({ phase: 'done' });
    g.firstRun.restore({
      completed: [
        'salvage',
        'build-refinery',
        'refine-components',
        'build-workbench',
        'build-defense',
        'survive-boarding',
        'repair',
      ],
      counters: {},
    });
    g.story.restore({
      format: 2,
      completed: ['wreck-one', 'relay-foundry', 'quiet-array'],
      recoveredUniques: ['course-gyro', 'salvage-controller', 'tracking-servo', 'course-actuator'],
      active: {
        expeditionId: 'glass-orchard',
        routeId: 'orchard-cold-vault',
        phase: 'docked',
        arrivalDistance: 1000,
        scriptedEncounter: 'resolved',
        journalsRead: [],
        objectivesCompleted: ['orchard-starboard-isolator'],
      },
    });
    g.destination.setActive(false);
    g.configureDestination();
    g.destination.setArrivalDistance(1000);
    g.world.reset(1000);
    g.destination.setActive(true);
    g.destination.setDocked(true);
    g.machine.setExpeditionGangwayOpen(true);
    g.machine.movement.speed = 0;
    g.titleCamera = null;
    g.playerCamera.setYaw(Math.PI);
    const root = g.destination.root.position;
    g.player.teleport({ x: root.x - 5, y: root.y + 1.03, z: root.z });
    g.input.clearAll();
    g.syncInputContext();
    const port = g.destination.interactables.find((t) => t.id === 'orchard-port-isolator');
    g.loop.start();
    return {
      authored: g.destination.root.userData.authored,
      root: root.toArray(),
      port: port?.position.toArray(),
    };
  });
  check(
    'Rebuilt Orchard uses authored geometry and relocated anchor',
    fixture.authored && Math.abs(fixture.port[0] - fixture.root[0] + 7.1) < 0.001,
    fixture,
  );
  await page.waitForTimeout(450);
  const start = await page.evaluate(() => globalThis.__game.game.player.worldPosition.toArray());
  await page.screenshot({ path: `${output}/entrance-before-walk.png` });
  await page.keyboard.down('KeyW');
  try {
    await page.waitForFunction(
      (z) => globalThis.__game.game.player.worldPosition.z >= z + 3.15,
      start[2],
      { timeout: 20000 },
    );
  } finally {
    await page.keyboard.up('KeyW');
  }
  const end = await page.evaluate(() => {
    const g = globalThis.__game.game;
    return {
      player: g.player.worldPosition.toArray(),
      phase: g.story.currentPhase,
      simTime: g.state.simTime,
    };
  });
  check(
    'Normal forward input clears the former cabinet obstruction',
    Math.abs(end.player[0] - start[0]) < 0.3 &&
      end.player[2] - start[2] >= 3.15 &&
      Math.abs(end.player[1] - start[1]) < 0.2,
    { start, end },
  );
  await page.screenshot({ path: `${output}/entrance-after-walk.png` });
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.loop.stop();
    g.titleCamera = g.renderer.camera;
    g.titleCamera.position.set(7, 20, -4);
    g.titleCamera.lookAt(12, 16, 3);
    g.render(0);
  });
  await page.screenshot({ path: `${output}/doorway-overview.png` });
} catch (error) {
  errors.push(error.stack ?? String(error));
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
} finally {
  await browser.close();
}
const result = {
  evidence:
    'isolated full-art geometry fixture; normal-speed keyboard traversal after explicit fixture setup; not a campaign playthrough',
  checks,
  errors,
};
await writeFile(`${output}/report.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (errors.length || checks.some((c) => !c.ok)) process.exitCode = 1;
