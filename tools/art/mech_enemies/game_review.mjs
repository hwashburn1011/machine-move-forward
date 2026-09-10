import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11', '--enable-gpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5193/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=mech-review');
  await page.waitForFunction(() => globalThis.__game?.game?.state.simTime > 2, null, { timeout: 120000 });
  const initial = await page.evaluate(() => {
    const g = __game.game;
    g.player.stats.invulnerable = true;
    const ids = ['bastion', 'revenant', 'warden', 'sovereign'];
    const enemies = ids.map((id, i) => g.enemies.spawn(id, g.player.worldPosition.clone().set((i - 1.5) * 1.9, 4.9, -5)));
    globalThis.__mechShots = [];
    g.bus.on('enemy:fired', e => globalThis.__mechShots.push(e));
    return enemies.map(e => ({ id: e.def.id, model: !!e.object3D.getObjectByName(e.def.id + '_Rig'), clips: e.visual.clipNames }));
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/art/mech-enemies/gameplay.png' });
  const live = await page.evaluate(() => __game.game.enemies.active.map(e => ({ id: e.def.id, state: e.aiState, position: e.worldPosition.toArray(), clip: e.visual.current?.getClip().name, muzzle: e.object3D.getObjectByName('EnemyMuzzle')?.getWorldPosition(e.worldPosition.clone()).toArray() })));
  const performance = await page.evaluate(async () => {
    const samples = []; let start = window.performance.now(), previous = start, peak = 0;
    await new Promise(resolve => { function tick(now) { samples.push(now - previous); previous = now; peak = Math.max(peak, __game.enemies.activeCount); if (now - start > 10000) resolve(); else requestAnimationFrame(tick); } requestAnimationFrame(tick); });
    samples.sort((a,b) => a-b);
    return { fps: samples.length * 1000 / (previous - start), p95Ms: samples[Math.floor(samples.length * .95)], peakEnemies: peak, stats: __game.debugStats() };
  });
  const combat = await page.evaluate(() => ({ shots: __mechShots, enemies: __game.game.enemies.active.map(e => ({ id: e.def.id, state: e.aiState, position: e.worldPosition.toArray() })) }));
  await page.screenshot({ path: 'docs/art/mech-enemies/combat.png' });
  const animation = await page.evaluate(() => __game.game.enemies.active.map(e => {
    const meshes = []; e.object3D.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
    const sample = () => {
      e.object3D.updateMatrixWorld(true); const vertices = [];
      for (const mesh of meshes) for (let i = 0; i < mesh.geometry.attributes.position.count; i += Math.ceil(mesh.geometry.attributes.position.count / 60)) {
        vertices.push(mesh.getVertexPosition(i, e.worldPosition.clone()).toArray());
      }
      return vertices;
    };
    e.visual.reset(); e.visual.setState('idle'); e.visual.update(.2); const idle = sample();
    e.visual.setState('navigate'); e.visual.update(.35); const walk = sample();
    let moved = 0, bad = 0;
    for (let i = 0; i < walk.length; i++) {
      if (!walk[i].every(Number.isFinite)) bad++;
      if (Math.hypot(...walk[i].map((v,j) => v - idle[i][j])) > .003) moved++;
    }
    e.visual.setState('dead'); e.visual.update(1.6); const dead = sample();
    for (const v of dead) if (!v.every(Number.isFinite)) bad++;
    e.visual.reset(); e.visual.setState(e.aiState);
    return { id: e.def.id, moved, bad, samples: walk.length };
  }));
  const lifecycle = await page.evaluate(() => {
    const g = __game.game, killed = [];
    const off = g.bus.on('enemy:killed', e => killed.push(e.defId));
    const enemies = [...g.enemies.active]; enemies.forEach(e => e.takeDamage(999));
    const collidersRemoved = enemies.every(e => e.handle === null);
    off(); globalThis.__deadMechs = enemies;
    return { killed, collidersRemoved };
  });
  await page.waitForTimeout(2800);
  lifecycle.allRetired = await page.evaluate(() => __deadMechs.every(e => !e.isActive));
  // Exercise the actual Game -> director -> placement -> enemy-manager route.
  const scheduled = await page.evaluate(() => {
    const g = __game.game, ids = ['warden','revenant','bastion','sovereign'];
    g.enemies.despawnAll(); g.enemySpawnsEnabled = true;
    g.firstRun.restore({ completed: ['salvage','build-refinery','refine-components','build-workbench','build-defense','survive-boarding','repair'], counters: {} });
    g.director.restore({ ...g.director.toSave(), phase: 'contact', wavesSurvived: 8, pending: ids,
      nextReleaseAt: 0, externalEncounterActive: false, sanctuaryActive: false });
    for (let i = 0; i < 4; i++) {
      const save = g.director.toSave(); g.director.restore({ ...save, nextReleaseAt: 0 }); g.updateSpawns();
    }
    g.enemySpawnsEnabled = false;
    return g.enemies.active.map(e => ({ id: e.def.id, model: !!e.object3D.getObjectByName(e.def.id + '_Rig'), health: e.currentHealth }));
  });
  const result = { initial, live, performance, combat, animation, lifecycle, scheduled, errors };
  await writeFile('docs/art/mech-enemies/gameplay-check.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  assert(initial.every(e => e.model && e.clips.length === 5));
  assert(animation.every(a => a.moved > 20 && a.bad === 0));
  assert(lifecycle.collidersRemoved && lifecycle.allRetired && lifecycle.killed.length === 4);
  assert(scheduled.length === 4 && scheduled.every(e => e.model));
  assert(['bastion','warden','sovereign'].every(id => combat.shots.some(s => s.defId === id)));
  assert.equal(errors.length, 0);
} finally { await browser.close(); }
