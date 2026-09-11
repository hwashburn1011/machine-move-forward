/** Capture the real-time reveal in an isolated browser save profile. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const raw = 'assets/trailer/signal-crossfire';
await mkdir(raw, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: raw, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
const began = Date.now(),
  errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(
    `http://127.0.0.1:${process.env.MMF_PORT ?? 5200}/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=medium`,
  );
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 120000 });
  await page.click('#game');
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.stop();
    g.state.paused = false;
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
    g.closePanels();
    g.player.teleport(g.player.worldPosition.clone().set(5.6, 15.8, 1.5));
    g.machine.power.restore({ fuel: 100 });
    for (let i = 0; i < 60; i++) g.fixedUpdate(1 / 60);
    g.render(1);
    globalThis.__previewFrames = [];
    let last = performance.now();
    function frame(now) {
      if (g.signalBattle?.active && last) globalThis.__previewFrames.push(now - last);
      last = now;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  const start = (Date.now() - began) / 1000;
  const launch = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const began = performance.now(),
      programsBefore = g.renderer.three.info.programs.length;
    g.story.restore({
      format: 2,
      completed: [],
      recoveredUniques: [],
      active: {
        expeditionId: 'wreck-one',
        routeId: null,
        phase: 'crossfire',
        arrivalDistance: null,
        journalsRead: [],
        scriptedEncounter: 'not-due',
      },
    });
    g.updateStory();
    const updated = performance.now();
    g.start();
    return { updateStoryMs: updated - began, startMs: performance.now() - updated, programsBefore };
  });
  await page.waitForFunction(() => globalThis.__game.game.story.currentPhase === 'raids', null, {
    timeout: 60000,
  });
  const seconds = (Date.now() - began) / 1000 - start;
  const performance = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.stop();
    const frames = globalThis.__previewFrames.sort((a, b) => a - b);
    return {
      sampledFrames: frames.length,
      averageFps: 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length),
      p95FrameMs: frames[Math.floor(frames.length * 0.95)],
      longestFrameMs: frames.at(-1),
      programsAfter: g.renderer.three.info.programs.length,
      renderer: g.renderer.three.getContext().getParameter(g.renderer.three.getContext().RENDERER),
    };
  });
  const video = page.video();
  await context.close();
  await video.saveAs(`${raw}/reveal.webm`);
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-ss',
      String(start),
      '-i',
      `${raw}/reveal.webm`,
      '-t',
      String(seconds),
      '-vf',
      'fps=30',
      '-c:v',
      'libx264',
      '-crf',
      '21',
      '-preset',
      'fast',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      'docs/signal-crossfire/preview.mp4',
    ],
    { stdio: 'ignore' },
  );
  await writeFile(
    'docs/signal-crossfire/performance.json',
    JSON.stringify({ seconds, ...launch, ...performance, errors }, null, 2),
  );
  console.log(JSON.stringify({ seconds, ...launch, ...performance, errors }));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
