/** Staged cameras and encounters in the actual playable build. No offline renders. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const raw = resolve(root, 'assets/trailer/raw');
await mkdir(raw, { recursive: true });
const selected = process.argv[2];
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11', '--enable-gpu'] });
const evidence = [];
const delay = (page, ms) => page.waitForTimeout(ms);
async function capture(name, duration, stage, action) {
  if (selected && selected !== name) return;
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, recordVideo: { dir: raw, size: { width: 1280, height: 720 } } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${process.env.MMF_PORT ?? 5193}/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=trailer-${name}`);
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 120000 });
  await page.click('#game');
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.state.paused = false;
    g.player.stats.invulnerable = true;
    g.machine.power.restore({ fuel: 100 });
    g.opening.restore({ phase: 'done' });
    g.firstRun.restore({ completed: ['salvage', 'build-refinery', 'refine-components', 'build-workbench', 'build-defense', 'survive-boarding', 'repair'], counters: {} });
    g.closePanels();
    document.querySelector('#hud').style.opacity = '0';
    if (!g.machine.group.getObjectByName('IronNomad_FourLegWalker') || !g.player.visual.isS07) throw new Error('Trailer requires authored Iron Nomad and S07');
    globalThis.__trailerEvents = { fired: 0, hits: 0, kills: 0, enemyFired: 0, radio: false };
    for (const [event, key] of [['weapon:fired', 'fired'], ['combat:hit', 'hits'], ['enemy:killed', 'kills'], ['enemy:fired', 'enemyFired']]) g.bus.on(event, () => globalThis.__trailerEvents[key]++);
    g.bus.on('radio:found', () => { globalThis.__trailerEvents.radio = true; });
  });
  await delay(page, 1200);
  await stage(page);
  await delay(page, 500);
  const before = await page.evaluate(() => globalThis.__game.debugStats());
  if (action) await action(page, duration); else await delay(page, duration * 1000);
  const after = await page.evaluate(() => ({ ...globalThis.__game.debugStats(), events: globalThis.__trailerEvents }));
  await page.screenshot({ path: resolve(raw, `${name}.png`) });
  const video = page.video();
  await context.close();
  await video.saveAs(resolve(raw, `${name}.webm`));
  const report = { name, duration, before, after, errors };
  evidence.push(report);
  await writeFile(resolve(raw, `${name}-report.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (errors.length || after.simTime - before.simTime < duration * .65) throw new Error(`${name}: simulation/error check failed`);
  if (name === 'combat' && (!after.events.fired || !after.events.hits || !after.events.kills)) throw new Error('Combat must show real shots and a defeated enemy');
  if (name === 'salvage' && !after.events.radio) throw new Error('Salvage must reel in the radio chest');
}
async function portrait(page, id) {
  await page.evaluate(id => {
    const g = globalThis.__game.game;
    g.freeCamera = g.renderer.camera;
    const position = g.player.worldPosition.clone().set(5.8, 15.8, 1.4);
    if (id === 'hero') { g.player.teleport(position); g.player.facing = 0; }
    else {
      g.player.teleport(position.clone().set(0, 15.8, 3));
      const enemy = g.enemies.spawn(id, position);
      if (!enemy?.visual.mech) throw new Error(`Missing authored ${id}`);
      enemy.visual.bar.removeFromParent();
      enemy.visual.setState('idle');
    }
    const start = performance.now();
    const orbit = () => {
      const angle = .10 + (performance.now() - start) * .00002;
      g.freeCamera.position.set(5.8 + Math.sin(angle) * 2.9, 16.15, 1.4 + Math.cos(angle) * 2.9);
      g.freeCamera.lookAt(5.8, 15.85, 1.4);
    };
    orbit(); setInterval(orbit, 16);
  }, id);
}
try {
  await capture('walker', 7, async page => {
    await page.evaluate(() => {
      const g = globalThis.__game.game;
      g.freeCamera = g.renderer.camera;
      const start = performance.now();
      const orbit = () => {
        const angle = -2.46 + (performance.now() - start) * .000035;
        g.freeCamera.position.set(Math.sin(angle) * 43, 23, Math.cos(angle) * 43);
        g.freeCamera.lookAt(0, 12, 0);
      };
      orbit(); setInterval(orbit, 16);
    });
  });
  await capture('hero', 5, page => portrait(page, 'hero'));
  for (const id of ['warden', 'revenant', 'bastion', 'sovereign']) await capture(id, 2.5, page => portrait(page, id));
  await capture('combat', 8, async page => {
    await page.evaluate(() => {
      const g = globalThis.__game.game;
      g.player.teleport(g.player.worldPosition.clone().set(5.4, 15.8, 3.8));
      g.playerCamera.setYaw(0); g.playerCamera.pitch = -.05;
      g.enemies.spawn('warden', g.player.worldPosition.clone().set(5.4, 15.8, -2.6));
      g.enemies.spawn('revenant', g.player.worldPosition.clone().set(5.2, 15.8, -6.5));
    });
    await page.mouse.down({ button: 'right' });
  }, async (page, duration) => {
    await delay(page, 900);
    const start = Date.now();
    while (Date.now() - start < duration * 1000 - 900) {
      const target = await page.evaluate(() => {
        const g = globalThis.__game.game, c = g.playerCamera;
        const e = g.enemies.active.find(e => e.health > 0);
        if (!e) return false;
        const p = e.worldPosition;
        const dx = p.x - c.camera.position.x, dy = p.y + .18 - c.camera.position.y, dz = p.z - c.camera.position.z;
        c.setYaw(Math.atan2(-dx, -dz) - c.recoilYaw); c.pitch = Math.atan2(dy, Math.hypot(dx, dz)) - c.recoilPitch;
        return true;
      });
      if (!target) { await delay(page, 100); continue; }
      await page.mouse.down(); await delay(page, 95); await page.mouse.up(); await delay(page, 210);
    }
    await page.mouse.up({ button: 'right' });
  });
  await capture('salvage', 7, async page => {
    await page.evaluate(() => {
      const g = globalThis.__game.game;
      g.player.teleport(g.player.worldPosition.clone().set(-5.8, 15.8, 0));
      g.salvage.armAfterOpening(g.world.distanceTraveled);
    });
    await page.waitForFunction(() => {
      const g = globalThis.__game.game, p = g.salvage.targets[0];
      return p && g.player.worldPosition.distanceTo(p) < 24;
    }, null, { timeout: 30000 });
  }, async (page, duration) => {
    await page.evaluate(() => {
      const g = globalThis.__game.game, p = g.salvage.targets[0], c = g.playerCamera;
      const target = g.player.worldPosition.clone().copy(p); target.z += 1.3;
      const from = g.player.worldPosition.clone(); from.y += .35;
      const d = target.clone().sub(from);
      c.setYaw(Math.atan2(-d.x, -d.z)); c.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      g.freeCamera = g.renderer.camera; g.freeCamera.position.copy(from); g.freeCamera.lookAt(target);
      g.fireReel(); g.freeCamera = null;
      // Exterior tracking shot through the ordinary camera update: physics and
      // the real reel state machine continue running throughout the recovery.
      const updateCamera = c.fixedUpdate.bind(c);
      c.fixedUpdate = (...args) => {
        updateCamera(...args);
        c.camera.position.set(-22, 19, 9);
        c.camera.lookAt(-9, 9.8, -1);
      };
    });
    await delay(page, duration * 1000);
  });
  await capture('decks', 5, async page => {
    await page.evaluate(() => {
      const g = globalThis.__game.game;
      g.player.teleport(g.player.worldPosition.clone().set(1, 12.8, -3.5));
      g.freeCamera = g.renderer.camera;
      const start = performance.now();
      const glide = () => {
        const t = Math.min(1, (performance.now() - start) / 5500);
        g.freeCamera.position.set(4.2, 13.1, t * .6);
        g.freeCamera.lookAt(0, 12.6, -3.8);
      };
      glide(); setInterval(glide, 16);
    });
  });
} finally {
  await browser.close();
  await writeFile(resolve(raw, 'capture-report.json'), JSON.stringify(evidence, null, 2));
}
