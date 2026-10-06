/** Verify the native trailer player, not the older browser game. */
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = process.env.MMF_VERIFY_URL ?? 'http://localhost:5198/machine-move-forward/';
const expected = JSON.parse(await readFile('docs/media/capture-verification.json', 'utf8'));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], failed = [];
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.status() >= 400) failed.push({ url: r.url(), status: r.status() }); });
try {
  await page.goto(base + 'trailer/');
  await page.locator('video').evaluate(v => { v.preload = 'auto'; v.load(); });
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  const video = await page.evaluate(async () => {
    const v = document.querySelector('video'); v.muted = true; await v.play();
    await new Promise(resolve => setTimeout(resolve, 1200));
    const advanced = v.currentTime > .6; v.pause();
    const frames = [];
    for (const at of [3,8,13,18,23,27,31,36,40,43,49,54]) {
      await new Promise(resolve => { v.addEventListener('seeked', resolve, { once: true }); v.currentTime = at; });
      frames.push({ at, actual: v.currentTime, ready: v.readyState });
    }
    return { width: v.videoWidth, height: v.videoHeight, duration: v.duration, controls: v.controls, advanced, frames };
  });
  if (!video.advanced || !video.controls || video.width !== expected.width || video.height !== expected.height || Math.abs(video.duration - expected.duration) > .15 || video.frames.some(f => f.ready < 2)) throw new Error('Video playback failed');
  const remote = await page.request.get(base + 'trailer/media/machine-move-forward-trailer.mp4');
  const digest = createHash('sha256').update(await remote.body()).digest('hex');
  if (digest !== expected.sha256) throw new Error('Served trailer does not match current export');
  await mkdir('test-results/native-trailer', { recursive: true });
  await page.locator('video').evaluate(v => { v.currentTime = 3; });
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'test-results/native-trailer/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({
    fits: document.documentElement.scrollWidth <= window.innerWidth,
    controls: document.querySelector('video').controls,
    width: document.querySelector('video').getBoundingClientRect().width,
    viewport: window.innerWidth,
  }));
  if (!mobile.fits || !mobile.controls || mobile.width < 300) throw new Error('Mobile player layout failed');
  await page.screenshot({ path: 'test-results/native-trailer/mobile.png', fullPage: true });
  const report = { scope: 'Chrome playback, seeking, served file identity and desktop/mobile layout. Muted automation; not a human listening review.', base, sha256: digest, video, mobile, errors, failed };
  await writeFile('docs/media/playback-verification.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  if (errors.length || failed.length) process.exitCode = 1;
} finally { await browser.close(); }
