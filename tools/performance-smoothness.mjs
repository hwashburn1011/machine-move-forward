/** Reproducible full-detail camera/boarding stress test on isolated browser saves. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const label = process.argv.find((x) => x.startsWith('--label='))?.split('=')[1] ?? 'after';
const seconds = Number(process.argv.find((x) => x.startsWith('--seconds='))?.split('=')[1] ?? 12);
const seed =
  process.argv.find((x) => x.startsWith('--seed='))?.split('=')[1] ?? 'smoothness-review';
const distance = Number(process.argv.find((x) => x.startsWith('--distance='))?.split('=')[1] ?? 0);
const out = process.env.MMF_QA_OUT ?? 'docs/performance-smoothness';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    `http://127.0.0.1:${process.env.MMF_PORT ?? 5201}/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=${encodeURIComponent(seed)}`,
  );
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180000 });
  await page.click('#game');
  if (distance) await page.evaluate((d) => globalThis.__game.game.world.reset(d), distance);
  const hardware = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.state.paused = false;
    g.opening.restore({ phase: 'done' });
    g.player.stats.invulnerable = true;
    g.player.teleport(g.player.worldPosition.clone().set(5.6, 15.8, 1.5));
    const gl = g.renderer.three.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      backend: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
      dpr: g.renderer.three.getPixelRatio(),
      quality: g.quality.tier,
    };
  });
  if (/swiftshader|software/i.test(hardware.backend)) throw new Error('Hardware renderer required');
  console.log(JSON.stringify({ hardware }));
  const results = [];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  for (const scenario of ['deck', 'rapid-look', 'crowded-look']) {
    if (scenario === 'crowded-look') {
      await page.evaluate(() => {
        const g = globalThis.__game.game;
        for (let i = 0; i < 8; i++)
          g.enemies.spawn(
            ['bastion', 'warden', 'revenant', 'sovereign'][i % 4],
            g.player.worldPosition.clone().set(i < 4 ? -6 : 6, 15.94, -6 + (i % 4) * 4),
          );
      });
    }
    await page.waitForTimeout(2500);
    await cdp.send('Profiler.start');
    const result = await page.evaluate(
      async ({ scenario, seconds }) => {
        const g = globalThis.__game.game;
        g.stop();
        g.loop.accumulator = 0;
        g.state.paused = false;
        const samples = [],
          renderTimes = [],
          fixedTimes = [],
          draws = [],
          tris = [];
        const breakdown = {};
        const restore = [];
        for (const [object, key, name] of [
          ...g.enemies.active.map((e) => [
            e.handle.controller,
            'computeColliderMovement',
            e.id + '-' + e.def.id,
          ]),
          [g.physics, 'step', 'physicsStep'],
          [g.physics, 'moveCharacter', 'characterMove'],
          [g.physics, 'raycast', 'raycast'],
          [g.enemies, 'fixedUpdate', 'enemyTick'],
          [g.player, 'fixedUpdate', 'playerTick'],
          [g.machine, 'fixedUpdate', 'machineTick'],
        ]) {
          const original = object[key].bind(object);
          breakdown[name] = { calls: 0, ms: 0, max: 0 };
          object[key] = (...a) => {
            const t = performance.now();
            const r = original(...a);
            const d = performance.now() - t;
            const s = breakdown[name];
            s.calls++;
            s.ms += d;
            s.max = Math.max(s.max, d);
            return r;
          };
          restore.push(() => {
            object[key] = original;
          });
        }
        const render = g.render.bind(g),
          fixed = g.fixedUpdate.bind(g);
        g.render = (...a) => {
          const t = performance.now();
          render(...a);
          renderTimes.push(performance.now() - t);
        };
        g.fixedUpdate = (...a) => {
          const t = performance.now();
          fixed(...a);
          fixedTimes.push(performance.now() - t);
        };
        const start = performance.now();
        let last = start;
        let deliveredX = 0;
        const initialYaw = g.playerCamera.yawAngle;
        const simStart = g.state.simTime;
        await new Promise((resolve) => {
          const tick = (now) => {
            const delta = Math.max(0, now - last);
            last = now;
            if (delta > 0) samples.push(delta);
            if (scenario !== 'deck') {
              const dx = (1800 * delta) / 1000;
              const event = new MouseEvent('mousemove', { movementX: dx, movementY: 0 });
              deliveredX += event.movementX;
              window.dispatchEvent(event);
            }
            g.loop.advance(Math.min(delta / 1000, 0.25));
            draws.push(g.renderer.three.info.render.calls);
            tris.push(g.renderer.three.info.render.triangles);
            if (now - start >= seconds * 1000) {
              resolve();
              return;
            }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        g.render = render;
        g.fixedUpdate = fixed;
        for (const reset of restore) reset();
        g.start();
        const stats = (values) => {
          const sorted = [...values].sort((a, b) => a - b);
          return {
            mean: values.reduce((a, b) => a + b, 0) / values.length,
            p50: sorted[Math.floor(sorted.length * 0.5)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
            p99: sorted[Math.floor(sorted.length * 0.99)],
            max: sorted.at(-1),
          };
        };
        return {
          scenario,
          simulationSeconds: g.state.simTime - simStart,
          steps: fixedTimes.length,
          frames: samples.length,
          fps: 1000 / stats(samples).mean,
          frameMs: stats(samples),
          renderCpuMs: stats(renderTimes),
          fixedCpuMs: stats(fixedTimes),
          breakdown,
          over25ms: samples.filter((x) => x > 25).length,
          over50ms: samples.filter((x) => x > 50).length,
          peakDraws: Math.max(...draws),
          peakTriangles: Math.max(...tris),
          enemies: g.enemies.activeCount,
          enemyStates: g.enemies.active.map((e) => ({
            id: e.id,
            kind: e.def.id,
            state: e.state,
            at: e.worldPosition.toArray(),
            grounded: e.handle.controller.computedGrounded(),
          })),
          yawTravel: initialYaw - g.playerCamera.yawAngle,
          deliveredX,
          memory: g.renderer.three.info.memory,
          programs: g.renderer.three.info.programs.length,
        };
      },
      { scenario, seconds },
    );
    const { profile } = await cdp.send('Profiler.stop');
    // Store compact self-time hot spots; raw profiles can be large and are unnecessary for comparisons.
    const byId = new Map(profile.nodes.map((n) => [n.id, n.callFrame]));
    const times = new Map();
    profile.samples?.forEach((id, i) => {
      const f = byId.get(id);
      const key = `${f.functionName || '(anonymous)'} ${f.url.replace(/^.*\/node_modules\//, 'node_modules/')} :${f.lineNumber + 1}`;
      times.set(key, (times.get(key) ?? 0) + (profile.timeDeltas?.[i] ?? 0));
    });
    result.hotspots = [...times]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([location, microseconds]) => ({ location, selfMs: microseconds / 1000 }));
    results.push(result);
    console.log(JSON.stringify({ ...result, hotspots: result.hotspots.slice(0, 8) }));
    await page.screenshot({ path: `${out}/${label}-${scenario}.jpg`, quality: 82 });
  }
  await writeFile(
    `${out}/${label}.json`,
    JSON.stringify({ hardware, seconds, seed, distance, results, errors }, null, 2) + '\n',
  );
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
