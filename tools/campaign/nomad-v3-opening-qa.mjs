import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = process.env.MMF_QA_OUT ?? 'test-results/nomad-v3-opening';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
try {
  await page.goto(
    `http://127.0.0.1:${process.env.MMF_PORT ?? 5206}/?nomenu=1&opening=1&nolock=1&nospawn=1&nosound=1&quality=medium`,
  );
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 120000 });
  const initial = await page.evaluate(() => {
    const g = __game.game;
    g.stop();
    g.startNewGame('story');
    globalThis.openingSounds = [];
    g.openingScene.sound = (kind) => openingSounds.push(kind);
    return {
      phase: g.opening.phase,
      ammo: g.combat.current.ammoInMag,
      fuel: g.machine.power.fuel,
      health: g.player.stats.health,
      activeEnemies: g.enemies.activeCount,
    };
  });
  const frames = [];
  for (const time of [
    0.2, 0.8, 1.3, 1.65, 2.1, 2.4, 2.75, 3.67, 3.85, 4.12, 5.02, 5.2, 5.5, 6.5, 8.5, 10.1,
  ]) {
    frames.push(
      await page.evaluate((time) => {
        const g = __game.game;
        while (g.openingScene && g.openingScene.time < time) {
          g.fixedUpdate(1 / 60);
          g.openingScene?.render(1, 1 / 60);
        }
        g.render(1);
        const scene = g.openingScene;
        return {
          time: scene?.time,
          phase: g.opening.phase,
          playerHidden: !g.player.object3D.visible,
          camera: { ...g.activeCamera.position },
          player: { ...scene?.player.object3D.position },
          enemies: g.enemies.activeCount,
        };
      }, time),
    );
    await page.screenshot({ path: `${out}/beat-${time}.png` });
  }
  const natural = await page.evaluate(() => {
    const g = __game.game;
    for (let i = 0; i < 30; i++) {
      g.fixedUpdate(1 / 60);
      g.openingScene?.render(1, 1 / 60);
    }
    g.render(1);
    return {
      phase: g.opening.phase,
      sceneActive: !!g.openingScene,
      visible: g.player.object3D.visible,
      at: { ...g.player.worldPosition },
      health: g.player.stats.health,
      ammo: g.combat.current.ammoInMag,
      fuel: g.machine.power.fuel,
      aboard: g.destination.playerOnMachine(g.player.worldPosition),
      sounds: openingSounds,
      armed: g.playerArmed,
    };
  });
  await page.screenshot({ path: `${out}/handoff.png` });
  const beforeMove = await page.evaluate(() => ({ ...__game.player.worldPosition }));
  await page.keyboard.down('w');
  await page.evaluate(() => {
    for (let i = 0; i < 30; i++) __game.game.fixedUpdate(1 / 60);
    __game.game.render(1);
  });
  await page.keyboard.up('w');
  const afterMove = await page.evaluate(() => ({ ...__game.player.worldPosition }));
  const skips = [];
  for (const at of [0, 2.6, 5.5]) {
    await page.evaluate((at) => {
      const g = __game.game;
      g.startNewGame('story');
      for (let i = 0; i < at * 60; i++) {
        g.fixedUpdate(1 / 60);
        g.openingScene?.render(1, 1 / 60);
      }
    }, at);
    await page.keyboard.down('Escape');
    skips.push(
      await page.evaluate(() => {
        const g = __game.game;
        for (let i = 0; i < 65; i++) g.fixedUpdate(1 / 60);
        g.render(1);
        return {
          phase: g.opening.phase,
          visible: g.player.object3D.visible,
          sceneActive: !!g.openingScene,
          aboard: g.destination.playerOnMachine(g.player.worldPosition),
          armed: g.playerArmed,
        };
      }),
    );
    await page.keyboard.up('Escape');
  }
  if (
    natural.phase !== 'done' ||
    natural.sceneActive ||
    !natural.armed ||
    !natural.aboard ||
    !natural.visible ||
    natural.health !== initial.health ||
    natural.ammo !== initial.ammo
  )
    errors.push('Invalid natural handoff');
  if (natural.sounds.join(',') !== 'shot,explosion,shot,explosion')
    errors.push('Cinematic shot/death beats duplicated or missing');
  if (afterMove.z >= beforeMove.z - 0.2) errors.push('Movement not restored');
  if (skips.some((s) => s.phase !== 'done' || s.sceneActive || !s.visible || !s.aboard || !s.armed))
    errors.push('Skip failed');
  const report = { initial, frames, natural, movement: { beforeMove, afterMove }, skips, errors };
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
