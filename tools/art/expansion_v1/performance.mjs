/**
 * Expansion v1 hardware performance and lifecycle review.
 *
 * This is an art/performance fixture. It exercises the live Game and
 * BuildSystem seams, but it does not claim gameplay, reward, or balance
 * acceptance. Do not run this from CI: it requires a hardware accelerated
 * Chrome session and a local Vite server.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.MMF_PORT ?? 5193);
const seconds = Number(
  process.argv.find((arg) => arg.startsWith('--seconds='))?.split('=')[1] ?? 15,
);
const cycles = Number(process.argv.find((arg) => arg.startsWith('--cycles='))?.split('=')[1] ?? 24);
const output = new URL('../../../docs/art/expansion-validation/', import.meta.url);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});

const errors = [];
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
page.on('pageerror', (error) => errors.push(error.message));

async function capture(label, durationSeconds, renderManually = false) {
  const result = await page.evaluate(
    async ({ label, durationSeconds, renderManually }) => {
      const game = globalThis.__game.game;
      const samples = [];
      const calls = [];
      const triangles = [];
      const start = performance.now();
      let previous = start;
      await new Promise((resolve) => {
        const tick = (now) => {
          const frameMs = now - previous;
          previous = now;
          if (renderManually) {
            game.fixedUpdate(1 / 60);
            game.playerCamera.camera.position.set(-28, 12, 30);
            game.playerCamera.camera.lookAt(0, 2, 0);
            game.render(1 / 60);
          }
          const stats = globalThis.__game.debugStats();
          samples.push(frameMs);
          calls.push(stats.calls);
          triangles.push(stats.tris);
          if (now - start >= durationSeconds * 1000) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      samples.sort((a, b) => a - b);
      const at = (ratio) =>
        samples[Math.min(samples.length - 1, Math.floor(samples.length * ratio))] ?? 0;
      const renderer = globalThis.__game.game.renderer.three;
      return {
        label,
        frames: samples.length,
        durationMs: previous - start,
        frameMs: { median: at(0.5), p95: at(0.95), p99: at(0.99) },
        fps: {
          mean: (samples.length * 1000) / Math.max(1, previous - start),
          median: 1000 / Math.max(0.001, at(0.5)),
          p95: 1000 / Math.max(0.001, at(0.95)),
          p99: 1000 / Math.max(0.001, at(0.99)),
        },
        render: {
          calls: {
            median: calls.sort((a, b) => a - b)[Math.floor(calls.length / 2)] ?? 0,
            peak: Math.max(...calls),
          },
          triangles: {
            median: triangles.sort((a, b) => a - b)[Math.floor(triangles.length / 2)] ?? 0,
            peak: Math.max(...triangles),
          },
        },
        debug: globalThis.__game.debugStats(),
        memory: { ...renderer.info.memory },
      };
    },
    { label, durationSeconds, renderManually },
  );
  return result;
}

try {
  await page.goto(
    `http://127.0.0.1:${port}/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=expansion-performance`,
  );
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 60000 });
  await page.waitForTimeout(1500);

  const hardware = await page.evaluate(() => {
    const renderer = globalThis.__game.game.renderer.three;
    const gl = renderer.getContext();
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    const backend = extension
      ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    return {
      backend,
      browser: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight, dpr: renderer.getPixelRatio() },
      drawingBuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
      webgl2: renderer.capabilities.isWebGL2,
      context: gl.getContextAttributes(),
      graphics: globalThis.__game.debugStats().graphics,
    };
  });
  if (/swiftshader|software/i.test(hardware.backend)) {
    throw new Error(`Hardware review requires acceleration; detected ${hardware.backend}`);
  }

  const baseline = await capture('travel-baseline', seconds);
  await page.screenshot({ path: fileURLToPath(new URL('travel-baseline.png', output)) });

  const fixture = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    const { RELAY_FOUNDRY } = await import('/src/data/story.ts');
    g.destination.configure(RELAY_FOUNDRY);
    g.destination.setActive(true);
    g.destination.setDocked(true);
    g.destination.fixedUpdate(g.world.distanceTraveled);
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
    g.progression.grantBlueprint('automatic-salvage-collector');
    g.progression.grantBlueprint('automatic-defense-turret');
    const candidates = [
      { x: -4, z: -6 },
      { x: -3, z: -6 },
      { x: -2, z: -6 },
      { x: -1, z: -6 },
      { x: 0, z: -6 },
      { x: 1, z: -6 },
    ];
    const floorIds = [];
    const placeFloor = (candidate) => {
      const cell = { x: candidate.x, y: 0, z: candidate.z };
      const floor = g.build.place({ piece: 'floor', cell, rotation: 0 }, true);
      if (floor) floorIds.push(floor.instanceId);
      return g.build.gridView.getCell(cell) === 'floor';
    };
    let collector = null;
    let collectorCell = null;
    for (const candidate of candidates) {
      if (!placeFloor(candidate)) continue;
      collectorCell = { x: candidate.x, y: 0, z: candidate.z };
      collector = g.build.place(
        { piece: 'collector-auto', cell: collectorCell, rotation: 0 },
        true,
      );
      if (collector) break;
    }
    let turret = null;
    let turretCell = null;
    for (const candidate of candidates) {
      const cell = { x: candidate.x, y: 0, z: candidate.z };
      if (cell.x === collectorCell?.x && cell.z === collectorCell?.z) continue;
      if (!placeFloor(candidate)) continue;
      turretCell = cell;
      turret = g.build.place({ piece: 'turret-auto', cell: turretCell, rotation: 0 }, true);
      if (turret) break;
    }
    if (!collector || !turret)
      throw new Error('Expansion fixture could not place collector and auto turret');
    const gunboat = g.gunboatScene.spawn('port');
    if (!gunboat) throw new Error('Expansion fixture could not spawn authored gunboat');
    g.stop();
    g.playerCamera.camera.position.set(-28, 12, 30);
    g.playerCamera.camera.lookAt(0, 2, 0);
    g.render(0.016);
    return {
      collectorId: collector.instanceId,
      turretId: turret.instanceId,
      collectorCell,
      turretCell,
      floorIds,
      authored: {
        collector: Boolean(g.build.collectorVisual(collector.instanceId)?.root.userData.authored),
        turret: Boolean(g.build.turretVisual(turret.instanceId)?.root.userData.authored),
        gunboat: Boolean(g.gunboatScene.group.getObjectByName('GunboatRoot')?.userData.authored),
      },
      pieces: g.build.pieceCount,
    };
  });
  const authoredModels = await page.evaluate(
    ({ collectorId, turretId }) => {
      const g = globalThis.__game.game;
      const countMeshes = (root) => {
        let meshes = 0;
        let triangles = 0;
        root.traverse((object) => {
          const mesh = object;
          if (!mesh.isMesh) return;
          meshes++;
          const index = mesh.geometry?.index;
          const position = mesh.geometry?.getAttribute('position');
          triangles += index ? index.count / 3 : position ? position.count / 3 : 0;
        });
        return { meshes, triangles };
      };
      const collector = g.build.collectorVisual(collectorId);
      const turret = g.build.turretVisual(turretId);
      const gunboatRoot = g.gunboatScene.group.getObjectByName('GunboatRoot');
      const helmRoot = g.machine.group.getObjectByName('HelmRoot');
      const requiredHelm = ['HelmRoot', 'GyroInstalled', 'HelmPowerLamp', 'HelmInteract'];
      return {
        collector: Boolean(collector?.root.userData.authored),
        turret: Boolean(turret?.root.userData.authored),
        gunboat: Boolean(gunboatRoot?.userData.authored),
        foundry: {
          authored: Boolean(g.destination.root.userData.authored),
          ...countMeshes(g.destination.root),
        },
        helm: {
          sourceLoaded: Boolean(helmRoot?.userData.authored),
          anchors: requiredHelm.every((name) => Boolean(helmRoot?.getObjectByName(name))),
          runtime: helmRoot ? countMeshes(helmRoot) : { meshes: 0, triangles: 0 },
        },
      };
    },
    { collectorId: fixture.collectorId, turretId: fixture.turretId },
  );
  const authoredReady =
    authoredModels.collector &&
    authoredModels.turret &&
    authoredModels.gunboat &&
    authoredModels.foundry.authored &&
    authoredModels.foundry.meshes > 0 &&
    authoredModels.helm.sourceLoaded &&
    authoredModels.helm.anchors &&
    authoredModels.helm.runtime.triangles > 5000;
  if (!authoredReady)
    throw new Error(`Authored model acceptance failed: ${JSON.stringify(authoredModels)}`);
  const expansion = await capture('expansion-scene', seconds, true);
  await page.screenshot({ path: fileURLToPath(new URL('expansion-scene.png', output)) });

  const lifecycle = await page.evaluate(
    async ({ cycles, collectorId, turretId, collectorCell, turretCell }) => {
      const g = globalThis.__game.game;
      const memory = [];
      let currentCollectorId = collectorId;
      let currentTurretId = turretId;
      for (let cycle = 0; cycle < cycles; cycle++) {
        g.build.damagePiece(currentCollectorId, 999999);
        g.build.damagePiece(currentTurretId, 999999);
        const collector = g.build.place(
          { piece: 'collector-auto', cell: collectorCell, rotation: 0 },
          true,
        );
        const turret = g.build.place({ piece: 'turret-auto', cell: turretCell, rotation: 0 }, true);
        if (!collector || !turret) throw new Error(`Lifecycle fixture failed at cycle ${cycle}`);
        currentCollectorId = collector.instanceId;
        currentTurretId = turret.instanceId;
        g.render(0.016);
        memory.push({ cycle, pieces: g.build.pieceCount, ...g.renderer.three.info.memory });
      }
      return {
        cycles,
        samples: memory,
        first: memory[0],
        last: memory[memory.length - 1],
        plateau: memory.slice(Math.floor(memory.length / 2)),
      };
    },
    {
      cycles,
      collectorId: fixture.collectorId,
      turretId: fixture.turretId,
      collectorCell: fixture.collectorCell,
      turretCell: fixture.turretCell,
    },
  );

  const result = {
    generatedAt: new Date().toISOString(),
    port,
    hardware,
    fixture,
    authoredModels,
    baseline,
    expansion,
    lifecycle,
    errors,
    method:
      '1920x1080 High, live Game/BuildSystem fixture, authored gunboat plus one automatic collector and one automatic turret, repeated damage/remove/rebuild cycles; fixture only and not gameplay/reward acceptance.',
  };
  await writeFile(
    fileURLToPath(new URL('expansion-performance.json', output)),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(JSON.stringify(result, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await page.close();
  await browser.close();
}
