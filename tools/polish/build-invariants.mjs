/** High-risk build/runtime acceptance invariants.
 * Run: MMF_PORT=5201 node tools/polish/build-invariants.mjs [output-directory]
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = `http://127.0.0.1:${process.env.MMF_PORT ?? 5201}`;
const outDir = path.resolve(process.argv[2] ?? 'docs/gameplay-polish/acceptance/build-invariants');
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const checks = [], browserErrors = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` -- ${detail}` : ''}`); };
page.on('pageerror', (error) => browserErrors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
const waitSim = async (seconds) => {
  const start = await page.evaluate(() => globalThis.__game.debugStats().simTime);
  await page.waitForFunction(([from, duration]) => globalThis.__game.debugStats().simTime >= from + duration, [start, seconds], { timeout: 15000 });
};

try {
  await page.goto(`${base}/?nolock=1&nomenu=1&quality=low&nospawn=1&notex=1&nomodel=1&nosound=1&seed=build-invariants`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game?.build), null, { timeout: 60000 });
  await waitSim(0.2);

  // Exercise Game's runtime resolver, including its physical endpoint raycast,
  // from three legitimate player-to-target distances and one illegal distance.
  const reach = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.enemies.despawnAll();
    g.build.clear(); g.resetInventory();
    const results = [];
    for (const distance of [4, 8, 11, 12.6]) {
      const target = { x: 0, y: 14.83, z: 0 };
      g.buildMode = true;
      g.buildSession.enter(g.combat.current.def.id);
      g.buildSession.selectPiece('floor');
      g.selectedPiece = 'floor'; g.buildLevel = 0; g.buildLevelPinned = true;
      let result = null;
      for (let step = 0; step < 16; step++) {
        const angle = step * Math.PI / 8, x = Math.cos(angle) * distance, z = Math.sin(angle) * distance;
        g.player.teleport({ x, y: 15.71, z });
        const camera = g.activeCamera; camera.position.set(x, 16.8, z); camera.lookAt(target.x, target.y, target.z); camera.updateMatrixWorld(true);
        g.refreshBuildTarget();
        result = { distance, angle, rejection: g.buildPreview.target?.rejection ?? null, placement: g.buildPreview.placement };
        if (!result.rejection || result.rejection === 'out-of-reach') break;
      }
      results.push(result);
      g.buildSession.exit('load'); g.buildMode = false;
    }
    return results;
  });
  for (const row of reach.slice(0, 3)) check(`physical endpoint resolves at ${row.distance}m`, !!row.placement && row.rejection === null, JSON.stringify(row));
  check('physical endpoint rejects beyond 12m', reach[3]?.rejection === 'out-of-reach', JSON.stringify(reach[3]));

  const deckPlacements = await page.evaluate(() => {
    const g = globalThis.__game.game, out = [];
    g.build.clear(); g.resetInventory();
    for (const level of [-2, -1, 0]) {
      g.buildMode = true;
      if (g.buildSession.state === 'closed') g.buildSession.enter(g.combat.current.def.id);
      g.buildSession.selectPiece('floor'); g.selectedPiece = 'floor'; g.buildLevel = level; g.buildLevelPinned = true; g.syncInputContext();
      let wanted = null, target = null, cameraAt = null;
      for (let z = -4; z <= 4 && !wanted; z++) for (let x = -4; x <= 4 && !wanted; x++) {
        const placement = { piece: 'floor', cell: { x, y: level, z }, rotation: 0 };
        if (!g.build.canPlace(placement).ok) continue;
        const p = { x: x * 2, y: 14.74 + level * 3, z: z * 2 };
        for (let step = 0; step < 16 && !wanted; step++) {
          const angle = step * Math.PI / 8, cx = p.x + Math.cos(angle) * 4, cz = p.z + Math.sin(angle) * 4;
          g.player.teleport({ x: cx, y: p.y + 1.0, z: cz });
          g.activeCamera.position.set(cx, p.y + 1.6, cz); g.activeCamera.lookAt(p.x, p.y, p.z); g.activeCamera.updateMatrixWorld(true);
          g.refreshBuildTarget();
          const resolved = g.buildPreview.placement;
          if (!g.buildPreview.target?.rejection && resolved?.cell.x === x && resolved?.cell.y === level && resolved?.cell.z === z) {
            wanted = placement; target = { placement: resolved, rejection: null }; cameraAt = { x: cx, y: p.y + 1.6, z: cz };
          }
        }
      }
      if (!wanted) { out.push({ level, error: 'no-visible-valid-cell' }); g.buildSession.exit('load'); g.buildMode = false; continue; }
      const before = g.build.pieceCount;
      window.dispatchEvent(new MouseEvent('mousedown', { button: 0 })); g.updateBuildMode(1 / 60); window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
      out.push({ level, wanted: wanted.cell, cameraAt, target, placed: g.build.pieceCount === before + 1 });
      g.buildSession.exit('load'); g.buildMode = false;
    }
    return out;
  });
  for (const result of deckPlacements)
    check(`real LMB places floor on level ${result.level}`, result.placed && !result.target?.rejection && result.target?.placement?.cell?.y === result.level, JSON.stringify(result));

  // Set up a full crate through public build/container APIs, then relocate it
  // through the actual V + LMB command path.
  const relocationSetup = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.build.clear(); g.resetInventory();
    const floor = g.build.place({ piece: 'floor', cell: { x: 2, y: 0, z: 3 }, rotation: 0 }, true);
    let destinationFloor = null;
    for (const cell of [{ x: 3, y: 0, z: 3 }, { x: 2, y: 0, z: 2 }, { x: 1, y: 0, z: 3 }, { x: 2, y: 0, z: 4 }]) {
      destinationFloor = g.build.place({ piece: 'floor', cell, rotation: 0 }, true);
      if (destinationFloor) break;
    }
    const crate = floor && g.build.place({ piece: 'crate', cell: { x: 2, y: 0, z: 3 }, rotation: 0 }, true);
    if (!crate || !destinationFloor) return null;
    const box = g.build.crateContainer(crate.instanceId);
    box?.add('scrap', 20); box?.add('components', 10); box?.add('fuel', 5);
    g.buildMode = true; g.buildSession.enter(g.combat.current.def.id); g.buildSession.selectPiece('floor');
    g.selectedPiece = 'floor'; g.buildLevel = 0; g.buildLevelPinned = true;
    g.syncInputContext();
    const worldAt = g.build.visual(crate.instanceId).getWorldPosition(g.buildViewOrigin);
    const at = { x: worldAt.x, y: worldAt.y, z: worldAt.z };
    let aimed = null, cameraAt = { x: at.x, z: at.z, overhead: true };
    g.player.teleport({ x: at.x, y: at.y + 4, z: at.z });
    g.activeCamera.position.set(at.x, at.y + 4, at.z); g.activeCamera.lookAt(at.x, at.y, at.z); g.activeCamera.updateMatrixWorld(true);
    g.refreshBuildTarget(); aimed = g.aimedBuildId;
    for (let step = 0; step < 16 && aimed !== crate.instanceId; step++) {
      const angle = step * Math.PI / 8, x = at.x + Math.cos(angle) * 4, z = at.z + Math.sin(angle) * 4;
      g.player.teleport({ x, y: at.y + 0.9, z });
      const camera = g.activeCamera; camera.position.set(x, at.y + 1.6, z); camera.lookAt(at.x, at.y + 0.5, at.z); camera.updateMatrixWorld(true);
      g.refreshBuildTarget(); aimed = g.aimedBuildId; cameraAt = { x, z, overhead: false };
    }
    const origin = g.activeCamera.getWorldPosition(g.buildViewOrigin), direction = g.activeCamera.getWorldDirection(g.buildViewDirection);
    const raw = g.physics.raycast(origin, direction, 22, g.player.collider);
    const placement = { piece: crate.definitionId, cell: { ...crate.cell }, rotation: crate.rotation };
    return { id: crate.instanceId, destinationFloorId: destinationFloor.instanceId, before: box?.serialise(), aimed, cameraAt, oldCell: { ...crate.cell }, context: g.input.inputContext, paused: g.state.paused, canRelocate: g.build.canRelocate(crate.instanceId, placement, g.relocationOptions), rawHit: raw ? { distance: raw.distance, userData: raw.userData, point: raw.point } : null };
  });
  const relocationInput = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const crate = g.build.serialise().find((piece) => piece.definitionId === 'crate');
    const p = crate && g.build.visual(crate.instanceId).getWorldPosition(g.buildViewOrigin);
    if (p) {
      for (let step = -1; step < 16 && g.aimedBuildId !== crate.instanceId; step++) {
        const angle = Math.max(0, step) * Math.PI / 8;
        const x = step < 0 ? p.x : p.x + Math.cos(angle) * 4, z = step < 0 ? p.z : p.z + Math.sin(angle) * 4;
        const y = step < 0 ? p.y + 4 : p.y + 1.6;
        g.player.teleport({ x, y, z }); g.activeCamera.position.set(x, y, z); g.activeCamera.lookAt(p.x, p.y + (step < 0 ? 0 : 0.5), p.z); g.activeCamera.updateMatrixWorld(true); g.refreshBuildTarget();
      }
    }
    const aimedImmediately = g.aimedBuildId;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' }));
    const before = { pressed: [...g.input.pressed], held: [...g.input.held], suppressed: [...g.input.suppressed] };
    g.updateBuildMode(1 / 60);
    const after = { pressed: [...g.input.pressed], state: g.buildSession.state };
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyV' }));
    return { aimedImmediately, before, after };
  });
  const relocationState = relocationInput.after.state;
  await page.evaluate((destinationFloorId) => {
    const g = globalThis.__game.game, c = g.activeCamera;
    const p = g.build.visual(destinationFloorId).getWorldPosition(g.buildViewOrigin);
    c.lookAt(p.x, p.y, p.z); c.updateMatrixWorld(true); g.refreshBuildTarget();
    window.dispatchEvent(new MouseEvent('mousedown', { button: 0 })); g.updateBuildMode(1 / 60); window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
  }, relocationSetup?.destinationFloorId);
  await waitSim(0.05);
  const relocated = await page.evaluate((setup) => {
    const g = globalThis.__game.game, live = setup && g.build.instance(setup.id);
    return { live: !!live, id: live?.instanceId, cell: live?.cell, after: setup ? g.build.crateContainer(setup.id)?.serialise() : null, state: g.buildSession.state };
  }, relocationSetup);
  check('V selects the aimed crate', relocationInput.aimedImmediately === relocationSetup?.id && relocationState === 'relocation', JSON.stringify({ relocationSetup, relocationInput }));
  check('LMB relocation preserves crate id and full contents', relocated.live && relocated.id === relocationSetup?.id && JSON.stringify(relocated.cell) !== JSON.stringify(relocationSetup?.oldCell) && JSON.stringify(relocated.after) === JSON.stringify(relocationSetup?.before), JSON.stringify(relocated));

  // A committed threat while confirm is held must close construction before a
  // weapon shot or placement can escape into the next fixed step.
  const beforeThreat = await page.evaluate(() => ({ ammo: globalThis.__game.debugStats().ammo, pieces: globalThis.__game.game.build.pieceCount }));
  await page.mouse.down();
  await page.evaluate(() => globalThis.__game.game.spawnEnemyAhead(5));
  await waitSim(0.12); await page.mouse.up();
  const afterThreat = await page.evaluate(() => ({ ammo: globalThis.__game.debugStats().ammo, pieces: globalThis.__game.game.build.pieceCount, buildMode: globalThis.__game.game.buildMode }));
  check('hostile cancels held-confirm build without firing', !afterThreat.buildMode && afterThreat.ammo === beforeThreat.ammo && afterThreat.pieces === beforeThreat.pieces, JSON.stringify({ beforeThreat, afterThreat }));

  // Cursor-owned catalog interruption pauses atomically. LMB is held across
  // the hostile spawn to prove that the click cannot become a weapon shot.
  await page.evaluate(() => globalThis.__game.game.enemies.despawnAll());
  await waitSim(2.2);
  const catalogBefore = await page.evaluate(() => {
    const g = globalThis.__game.game; g.toggleBuildMode();
    window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    const ammo = g.combat.current.ammoInMag, simTime = g.state.simTime;
    g.spawnEnemyAhead(5);
    return { ammo, simTime, state: g.buildSession.state, buildMode: g.buildMode };
  });
  await page.waitForFunction(() => globalThis.__game.game.state.paused, null, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(250);
  const catalogAfter = await page.evaluate(() => {
    const g = globalThis.__game.game;
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    return { ammo: g.combat.current.ammoInMag, simTime: g.state.simTime, paused: g.state.paused, buildMode: g.buildMode, session: g.buildSession.state };
  });
  check('catalog hostile interruption pauses atomically with held fire suppressed', catalogBefore.state === 'catalog' && catalogBefore.buildMode && catalogAfter.paused && !catalogAfter.buildMode && catalogAfter.session === 'closed' && catalogAfter.ammo === catalogBefore.ammo && catalogAfter.simTime - catalogBefore.simTime < 0.08, JSON.stringify({ catalogBefore, catalogAfter }));

  // Resume the harness through the same pointer-lock bypass path as the game.
  await page.evaluate(() => globalThis.__game.game.resume());
  await waitSim(0.05);

  // Preview/session state is transient across the real IndexedDB save path.
  const saveProbe = await page.evaluate(async () => {
    const g = globalThis.__game.game; g.enemies.despawnAll();
    const before = g.build.serialise();
    g.buildMode = true; g.buildSession.enter(g.combat.current.def.id); g.buildSession.selectPiece('lamp'); g.selectedPiece = 'lamp';
    const saved = await g.saveTo('build-invariants', 'manual', true);
    g.build.place({ piece: 'floor', cell: { x: 3, y: 0, z: 0 }, rotation: 0 }, true);
    const loaded = await g.loadFrom('build-invariants');
    const after = g.build.serialise();
    const ordered = (items) => [...items].sort((a, b) => a.instanceId.localeCompare(b.instanceId));
    return { saved, loaded, same: JSON.stringify(ordered(before)) === JSON.stringify(ordered(after)), before, after, buildMode: g.buildMode, session: g.buildSession.state };
  });
  check('save/load excludes preview and closes build session', saveProbe.saved && saveProbe.loaded && saveProbe.same && !saveProbe.buildMode && saveProbe.session === 'closed', JSON.stringify(saveProbe));
} catch (error) {
  check('harness completed', false, error?.stack ?? String(error));
} finally {
  await page.screenshot({ path: path.join(outDir, 'final.png') }).catch(() => {});
  await fs.writeFile(path.join(outDir, 'results.json'), JSON.stringify({ url: page.url(), checks, browserErrors }, null, 2));
  await browser.close();
}
const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed; ${browserErrors.length} browser errors`);
if (failed.length || browserErrors.length) process.exitCode = 1;
