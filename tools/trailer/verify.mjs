/** Check deployed-layout media playback and the real production game. */
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const base = process.env.MMF_VERIFY_URL ?? 'http://127.0.0.1:5198/machine-move-forward/';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11','--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
    for (const at of [3,9,13,16,18.5,21,25,32,40,44]) {
      await new Promise(resolve => { v.addEventListener('seeked', resolve, { once: true }); v.currentTime = at; });
      frames.push({ at, actual: v.currentTime, ready: v.readyState });
    }
    return { width: v.videoWidth, height: v.videoHeight, duration: v.duration, controls: v.controls, advanced, frames };
  });
  if (!video.advanced || !video.controls || video.width !== 1280 || Math.abs(video.duration - 46) > .2 || video.frames.some(f => f.ready < 2)) throw new Error('Video playback failed');
  await page.goto(base + '?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=medium');
  await page.waitForFunction(() => globalThis.__game, null, { timeout: 120000 });
  await page.click('#game');
  const before = await page.evaluate(() => globalThis.__game.debugStats());
  await page.waitForTimeout(1500);
  const game = await page.evaluate(() => {
    const g = globalThis.__game.game;
    return { stats: globalThis.__game.debugStats(), machine: !!g.machine.group.getObjectByName('IronNomad_FourLegWalker'), player: g.player.visual.isS07,
      mechs: ['warden','revenant','bastion','sovereign'].map(id => ({id, loaded: !!g.enemies.modelByDefinition.get(id)})) };
  });
  if (!game.machine || !game.player || game.mechs.some(e => !e.loaded) || game.stats.simTime <= before.simTime || game.stats.playerY < 15) throw new Error('Production model/game smoke failed');
  const report = { base, video, game, errors, failed };
  await writeFile('docs/media/playback-verification.json', JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  if (errors.length || failed.length) process.exitCode = 1;
} finally { await browser.close(); }
