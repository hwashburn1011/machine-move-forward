import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = process.env.MMF_QA_OUT ?? 'test-results/opening-performance';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
try {
  await page.goto(
    `http://127.0.0.1:${process.env.MMF_PORT ?? 5206}/?nomenu=1&nolock=1&nospawn=1&nosound=1&quality=medium`,
  );
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 120000 });
  const frames = await page.evaluate(async () => {
    const g = __game.game;
    g.stop();
    g.startNewGame('story');
    const samples = [],
      render = g.render.bind(g);
    let previous = performance.now();
    g.render = (...args) => {
      const start = performance.now(),
        time = g.openingScene?.time ?? null;
      render(...args);
      let lights = 0;
      g.renderer.scene.traverseVisible((o) => {
        if (o.isPointLight) lights++;
      });
      samples.push({
        time,
        frameMs: start - previous,
        renderMs: performance.now() - start,
        programs: g.renderer.three.info.programs.length,
        geometries: g.renderer.three.info.memory.geometries,
        lights,
      });
      previous = start;
    };
    g.start();
    await new Promise((resolve, reject) => {
      const began = performance.now();
      const poll = () => {
        if (!g.openingScene) {
          resolve();
          return;
        }
        if (performance.now() - began > 45000) {
          reject(new Error('Opening did not complete'));
          return;
        }
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
    g.stop();
    g.render = render;
    return samples;
  });
  const steady = frames.filter((f) => f.time > 0.3);
  const sorted = steady.map((f) => f.frameMs).sort((a, b) => a - b);
  const changes = frames.filter(
    (f, i) => i && (f.programs !== frames[i - 1].programs || f.lights !== frames[i - 1].lights),
  );
  const cinematic = frames.filter((f) => f.time !== null);
  const shaderGrowth = changes.filter((f) => {
    const previous = frames[frames.indexOf(f) - 1];
    return f.time > 0.3 && f.programs > previous.programs;
  });
  if (shaderGrowth.length) errors.push('Shaders first compiled during cinematic playback');
  if (cinematic.some((f) => f.lights !== cinematic[0].lights))
    errors.push('Flash lights changed the shader light count during playback');
  const report = {
    frames,
    changes,
    summary: {
      count: frames.length,
      median: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      max: Math.max(...sorted),
    },
    errors,
  };
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ summary: report.summary, changes, errors }));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
