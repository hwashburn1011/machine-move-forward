/** Hardware graphics review. Refuses to label SwiftShader as a hardware result. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const label = process.argv.find((arg) => arg.startsWith('--label='))?.split('=')[1] ?? 'after';
const seconds = Number(process.argv.find((arg) => arg.startsWith('--seconds='))?.split('=')[1] ?? 30);
const directory = 'docs/art/graphics-v3';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${process.env.MMF_PORT ?? 5194}/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=graphics-review`);
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 60000 });
  const hardware = await page.evaluate(() => {
    const renderer = globalThis.__game.game.renderer.three;
    const gl = renderer.getContext();
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    const backend = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return { backend, browser: navigator.userAgent, dpr: renderer.getPixelRatio(), width: gl.drawingBufferWidth, height: gl.drawingBufferHeight };
  });
  console.log(JSON.stringify({ hardware }));
  if (/swiftshader|software/i.test(hardware.backend)) throw new Error('Hardware review requires hardware acceleration');
  await page.waitForTimeout(1500);
  const capture = await page.evaluate(async (seconds) => {
    const samples = [], calls = [], triangles = [];
    const start = performance.now();
    let previous = start;
    await new Promise((resolve) => {
      const tick = (now) => {
        samples.push(now - previous);
        previous = now;
        const stats = globalThis.__game.debugStats();
        calls.push(stats.calls);
        triangles.push(stats.tris);
        if (now - start >= seconds * 1000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    samples.sort((a, b) => a - b);
    const at = (ratio) => samples[Math.min(samples.length - 1, Math.floor(samples.length * ratio))];
    return { frames: samples.length, durationMs: previous - start, medianMs: at(.5), p95Ms: at(.95), p99Ms: at(.99),
      meanFps: samples.length * 1000 / (previous - start), peakCalls: Math.max(...calls), peakSubmittedTriangles: Math.max(...triangles),
      stats: globalThis.__game.debugStats(), memory: globalThis.__game.game.renderer.three.info.memory };
  }, seconds);
  await page.screenshot({ path: `${directory}/${label}-game.png` });
  const result = { generatedAt: new Date().toISOString(), label, hardware, capture, errors,
    method: '1920x1080 High, hardware Chrome D3D11, ordinary live deck travel, rAF frame timing after warmup; not isolated GPU pass timing or combat qualification.' };
  await writeFile(`${directory}/${label}-hardware.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}

