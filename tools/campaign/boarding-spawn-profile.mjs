/** PERF-BOARDING: read-only timing of the first ordinary boarding visual spawn. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const source = process.env.MMF_CONTINUITY_PROFILE;
if (!source) throw new Error('MMF_CONTINUITY_PROFILE is required');
const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5205/';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve('test-results', 'boarding-spawn-profile', `run-${stamp}`);
const profile = path.join(output, 'browser-profile');
await fs.mkdir(output, { recursive: true });
await fs.cp(path.resolve(source), profile, { recursive: true, errorOnExist: true });
const url = new URL(site);
for (const key of ['seed', 'nospawn', 'nolock', 'nomenu', 'noload', 'nomodel', 'notex'])
  if (url.searchParams.has(key)) throw new Error(`profiler rejects URL override: ${key}`);
url.searchParams.set('quality', process.env.MMF_QUALITY ?? 'medium');
url.searchParams.set('nosound', '1');

let context;
let page;
const events = [];
const errors = [];
const record = async (type, detail = {}) => {
  const event = { at: new Date().toISOString(), type, ...detail };
  events.push(event);
  await fs.appendFile(path.join(output, 'events.jsonl'), `${JSON.stringify(event)}\n`);
};
const attach = () => {
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
};

try {
  await record('provenance', {
    source: path.resolve(source),
    profile,
    url: url.toString(),
    assetRoot: process.env.MMF_ASSET_ROOT ? path.resolve(process.env.MMF_ASSET_ROOT) : null,
    authority:
      'ordinary Continue only; no encounter spawn, state writes, fixed stepping, or suppression',
  });
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1280, height: 720 },
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  page = context.pages()[0] ?? (await context.newPage());
  attach();
  if (process.env.MMF_ASSET_ROOT) {
    const assetRoot = path.resolve(process.env.MMF_ASSET_ROOT);
    await page.route(new URL('/**', site).toString(), async route => {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
      const file = path.resolve(assetRoot, pathname === '/' ? 'index.html' : pathname.slice(1));
      if (file !== assetRoot && !file.startsWith(assetRoot + path.sep)) return route.abort();
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.wasm': 'application/wasm' };
      try { await route.fulfill({ contentType: types[path.extname(file)] ?? 'application/octet-stream', body: await fs.readFile(file) }); }
      catch { await route.fulfill({ status: 404, body: 'Not found' }); }
    });
  }
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180_000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(() => !globalThis.__game.game.titleScreen?.isOpen, null, {
    timeout: 30_000,
  });
  await page.mouse.click(640, 360);
  await page.waitForFunction(
    () => Boolean(document.pointerLockElement) && !globalThis.__game.game.state.paused,
    null,
    { timeout: 30_000 },
  );
  await page.evaluate(() => {
    const scene = globalThis.__game.game.vehicleScene;
    const proto = Object.getPrototypeOf(scene);
    const names = [
      'spawnActors',
      'addHullCollider',
      'addCrewCollider',
      'addHookCollider',
      'cleanup',
      'fixedUpdate',
    ];
    const originals = {};
    const timings = [];
    const resourceSnapshot = () => {
      const renderer = globalThis.__game.game.renderer?.three;
      return {
        now: performance.now(),
        heap: performance.memory
          ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize }
          : null,
        renderer: renderer
          ? {
              calls: renderer.info.render.calls,
              triangles: renderer.info.render.triangles,
              geometries: renderer.info.memory.geometries,
              textures: renderer.info.memory.textures,
              programs: renderer.info.programs?.length ?? null,
            }
          : null,
      };
    };
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      if (!descriptor?.value || typeof descriptor.value !== 'function') {
        timings.push({ name, callable: false });
        continue;
      }
      originals[name] = descriptor.value;
      proto[name] = function profiled(...args) {
        const measureResources = name !== 'fixedUpdate';
        const before = measureResources ? resourceSnapshot() : null;
        const started = performance.now();
        let result;
        try {
          result = descriptor.value.apply(this, args);
        } catch (error) {
          timings.push({
            name,
            phase: 'error',
            ms: performance.now() - started,
            error: String(error),
            before,
            after: resourceSnapshot(),
          });
          throw error;
        }
        const after = measureResources ? resourceSnapshot() : null;
        timings.push({
          name,
          phase: 'call',
          ms: performance.now() - started,
          before,
          after,
          roster: this.roster ? [...this.roster] : null,
          crewCount: this.crew?.length ?? null,
          statePhase: this.state?.phase ?? null,
        });
        if (name === 'spawnActors') {
          globalThis.__boardingSpawnProfiler?.markSpawned();
          const spawnedAt = performance.now();
          let frame = 0;
          let previousFrame = spawnedAt;
          const nextFrame = () => {
            frame += 1;
            const now = performance.now();
            timings.push({
              name: 'post-spawn-frame',
              frame,
              sinceSpawnMs: now - spawnedAt,
              intervalMs: frame === 1 ? null : now - previousFrame,
              resources: resourceSnapshot(),
            });
            previousFrame = now;
            if (frame < 3) requestAnimationFrame(nextFrame);
          };
          requestAnimationFrame(nextFrame);
        }
        return result;
      };
    }
    const rafIntervals = [];
    let lastRaf = performance.now();
    let rafWindow = 'before';
    let afterRafFrames = 0;
    const sampleRaf = (now) => {
      rafIntervals.push({ phase: rafWindow, intervalMs: now - lastRaf });
      if (rafIntervals.length > 360) rafIntervals.shift();
      lastRaf = now;
      if (rafWindow === 'after') afterRafFrames += 1;
      requestAnimationFrame(sampleRaf);
    };
    requestAnimationFrame(sampleRaf);
    globalThis.__boardingSpawnProfiler = {
      originals,
      timings,
      resourceSnapshot,
      rafIntervals,
      markSpawned: () => {
        rafWindow = 'after';
        afterRafFrames = 0;
      },
      get afterRafFrames() {
        return afterRafFrames;
      },
    };
  });
  await record(
    'instrumented',
    await page.evaluate(() => globalThis.__boardingSpawnProfiler.timings),
  );
  const deadline = Date.now() + Number(process.env.MMF_SECONDS ?? 45) * 1000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const g = globalThis.__game.game;
      const profiler = globalThis.__boardingSpawnProfiler;
      return {
        simTime: g.state.simTime,
        distance: g.world.distanceTraveled,
        active: g.vehicleScene.active,
        timings: profiler.timings,
        resources: profiler.resourceSnapshot(),
      };
    });
    if (state.timings.some((event) => event.name === 'spawnActors')) {
      await page.waitForFunction(
        () => globalThis.__boardingSpawnProfiler.afterRafFrames >= 180,
        null,
        { timeout: 15_000 },
      );
      const sample = await page.evaluate(() => ({
        timings: globalThis.__boardingSpawnProfiler.timings,
        resources: globalThis.__boardingSpawnProfiler.resourceSnapshot(),
        rafIntervals: globalThis.__boardingSpawnProfiler.rafIntervals,
        active: globalThis.__game.game.vehicleScene.active,
      }));
      await record('first-spawn-observed', sample);
      break;
    }
    await page.waitForTimeout(500);
  }
  const final = await page.evaluate(() => ({
    simTime: globalThis.__game.game.state.simTime,
    distance: globalThis.__game.game.world.distanceTraveled,
    profiler: globalThis.__boardingSpawnProfiler.timings,
    rafIntervals: globalThis.__boardingSpawnProfiler.rafIntervals,
    resources: globalThis.__boardingSpawnProfiler.resourceSnapshot(),
    roster: globalThis.__game.game.vehicleScene.roster ?? null,
    active: globalThis.__game.game.vehicleScene.active,
  }));
  await page.screenshot({ path: path.join(output, 'spawn-profile.png'), fullPage: true });
  await record('final', final);
  await page.evaluate(() => {
    const profiler = globalThis.__boardingSpawnProfiler;
    const proto = Object.getPrototypeOf(globalThis.__game.game.vehicleScene);
    for (const [name, method] of Object.entries(profiler.originals)) proto[name] = method;
  });
  const spawn = final.profiler.find((event) => event.name === 'spawnActors');
  const summary = {
    status: spawn ? 'observed' : 'no-spawn-before-deadline',
    source: path.resolve(source),
    output,
    firstSpawn: spawn ?? null,
    postSpawnFrames: final.profiler.filter((event) => event.name === 'post-spawn-frame'),
    finalResources: final.resources,
    finalSimTime: final.simTime,
    finalDistance: final.distance,
    errors,
    events,
  };
  await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
  process.stdout.write(JSON.stringify(summary, null, 2));
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  await record('blocked', { message, errors });
  await fs.writeFile(
    path.join(output, 'summary.json'),
    JSON.stringify(
      { status: 'blocked', source: path.resolve(source), message, errors, events },
      null,
      2,
    ),
  );
  process.stderr.write(JSON.stringify({ status: 'blocked', output, message, errors }, null, 2));
  process.exitCode = 1;
} finally {
  await page
    ?.evaluate(() => {
      const profiler = globalThis.__boardingSpawnProfiler;
      if (!profiler) return;
      const proto = Object.getPrototypeOf(globalThis.__game.game.vehicleScene);
      for (const [name, method] of Object.entries(profiler.originals)) proto[name] = method;
    })
    .catch(() => {});
  await context?.close();
}
