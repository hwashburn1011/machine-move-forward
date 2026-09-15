/** Normal-input camera/mesh diagnosis from a cloned campaign checkpoint. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const source = path.resolve(
  process.env.MMF_CONTINUITY_PROFILE ??
    'test-results/continuity-meridian/run-2026-09-15T17-55-52-445Z/browser-profile',
);
const output = path.resolve(
  'test-results/interior-camera',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
const profile = path.join(output, 'browser-profile');
await fs.mkdir(output, { recursive: true });
await fs.cp(source, profile, { recursive: true, errorOnExist: true });
const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  viewport: { width: 1280, height: 720 },
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = context.pages()[0] ?? (await context.newPage());
// Optional archived graphics baseline, still on the same save origin. Only
// serve files from the named local build directory; diagnostics remain separate.
if (process.env.MMF_ASSET_ROOT) {
  const assetRoot = path.resolve(process.env.MMF_ASSET_ROOT);
  await page.route('http://127.0.0.1:5205/**', async (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = path.resolve(assetRoot, pathname === '/' ? 'index.html' : pathname.slice(1));
    if (file !== assetRoot && !file.startsWith(assetRoot + path.sep)) return route.abort();
    const types = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.glb': 'model/gltf-binary',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.jpg': 'image/jpeg',
      '.wasm': 'application/wasm',
    };
    try {
      await route.fulfill({
        contentType: types[path.extname(file)] ?? 'application/octet-stream',
        body: await fs.readFile(file),
      });
    } catch {
      await route.fulfill({ status: 404, body: 'Not found' });
    }
  });
}
const report = {
  source,
  output,
  authority:
    'Normal Continue, keyboard walking and mouse look; read-only geometry/collider probes. No state grants, teleport, or accelerated simulation.',
  captures: [],
  errors: [],
};
page.on('pageerror', (error) => report.errors.push(error.message));
await page.route('**/__diag/**', async (route) => {
  const name = new URL(route.request().url()).pathname.split('/').pop();
  if (!['three.module.js', 'three.core.js'].includes(name)) return route.abort();
  await route.fulfill({
    contentType: 'application/javascript',
    body: await fs.readFile(path.resolve('node_modules/three/build', name), 'utf8'),
  });
});
const turn = async (yaw, pitch) => {
  for (let i = 0; i < 18; i++) {
    const delta = await page.evaluate(
      ({ yaw, pitch }) => {
        const rig = globalThis.__game.game.playerCamera;
        const wrap = (n) => Math.atan2(Math.sin(n), Math.cos(n));
        return { x: wrap(yaw - rig.yawAngle), y: pitch === null ? 0 : pitch - rig.pitchAngle };
      },
      { yaw, pitch },
    );
    if (Math.abs(delta.x) < 0.008 && Math.abs(delta.y) < 0.008) return;
    await page.evaluate(
      ({ x, y }) =>
        window.dispatchEvent(
          new MouseEvent('mousemove', {
            movementX: Math.max(-600, Math.min(600, -x / 0.0022)),
            movementY: Math.max(-350, Math.min(350, -y / 0.0022)),
            bubbles: true,
          }),
        ),
      delta,
    );
    await page.waitForTimeout(60);
  }
};
const walk = async (x, z) => {
  for (let i = 0; i < 130; i++) {
    const p = await page.evaluate(() => globalThis.__game.game.player.worldPosition.toArray());
    const distance = Math.hypot(x - p[0], z - p[2]);
    if (distance < 0.12) return;
    await turn(Math.atan2(-(x - p[0]), -(z - p[2])), null);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(Math.min(140, Math.max(20, (distance - 0.07) * 160)));
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(55);
  }
  throw new Error(`Walk to ${x},${z} failed`);
};
const capture = async (label) => {
  const snapshot = await page.evaluate(async () => {
    const THREE = await import('/__diag/three.module.js');
    const g = globalThis.__game.game,
      rig = g.playerCamera,
      camera = rig.camera;
    const parentNames = (o) => {
      const out = [];
      for (let p = o; p; p = p.parent) out.push(p.name || p.type);
      return out;
    };
    const rays = [];
    const candidates = [];
    g.renderer.scene.traverseVisible((o) => {
      if (o.isMesh) candidates.push(o);
    });
    const ray = new THREE.Raycaster();
    for (const y of [-0.75, 0, 0.75])
      for (const x of [-0.75, 0, 0.75]) {
        ray.setFromCamera(new THREE.Vector2(x, y), camera);
        const hits = ray
          .intersectObjects(candidates, false)
          .filter((h) => {
            const m = Array.isArray(h.object.material)
              ? h.object.material[h.face?.materialIndex ?? 0]
              : h.object.material;
            return m?.visible && m.opacity > 0.01;
          })
          .slice(0, 3)
          .map((h) => ({
            distance: h.distance,
            name: h.object.name,
            parents: parentNames(h.object),
            point: h.point.toArray(),
            material: (Array.isArray(h.object.material)
              ? h.object.material
              : [h.object.material]
            ).map((m) => ({
              name: m.name,
              opacity: m.opacity,
              transparent: m.transparent,
              side: m.side,
            })),
          }));
        rays.push({ x, y, hits });
      }
    const direction = rig.goal.clone().sub(rig.safeAnchor).normalize();
    const hit = g.physics.sweepSphere(
      rig.safeAnchor,
      direction,
      rig.goal.distanceTo(rig.safeAnchor),
      rig.radius,
      g.player.collider,
    );
    const c = hit?.collider;
    return {
      player: g.player.worldPosition.toArray(),
      camera: camera.position.toArray(),
      yaw: rig.yawAngle,
      pitch: rig.pitchAngle,
      bodyDistance: camera.position.distanceTo(g.player.object3D.position),
      anchor: rig.anchor.toArray(),
      safeAnchor: rig.safeAnchor.toArray(),
      goal: rig.goal.toArray(),
      boomFraction: rig.boomFraction,
      compactBlend: rig.compactBlend,
      fadeAmount: g.playerFade.amount,
      playerVisible: g.player.object3D.visible,
      blocker: c
        ? {
            distance: hit.distance,
            position: c.translation(),
            half: c.halfExtents?.(),
            userData: g.physics.userData.get(c.handle),
          }
        : null,
      interaction: g.interaction.current
        ? {
            id: g.interaction.current.id,
            kind: g.interaction.current.kind,
            label: g.interaction.current.label,
          }
        : null,
      shoulder: rig.shoulderSide,
      aiming: rig.isAiming,
      warning: document.getElementById('hud-warning')?.textContent,
      cloth: g.machine.cameraClothMeshes?.map((mesh) => ({
        name: mesh.name,
        materials: (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => ({
          opacity: m.opacity,
          transparent: m.transparent,
        })),
      })),
      runtimeBundle: [...document.scripts]
        .map((script) => script.src)
        .filter((src) => src.includes('/assets/')),
      rays,
      render: JSON.parse(JSON.stringify(g.renderer.three.info.render)),
      memory: g.renderer.three.info.memory,
    };
  });
  report.captures.push({ label, ...snapshot });
  await page.screenshot({ path: path.join(output, `${label}.png`) });
  await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      label,
      player: snapshot.player,
      bodyDistance: snapshot.bodyDistance,
      boom: snapshot.boomFraction,
      blocker: snapshot.blocker,
      rays: snapshot.rays.map((r) => ({
        x: r.x,
        y: r.y,
        nearest: r.hits[0]?.name,
        d: r.hits[0]?.distance,
      })),
    }),
  );
};
const aimAt = async (at) => {
  for (let i = 0; i < 18; i++) {
    const aim = await page.evaluate((at) => {
      const p = globalThis.__game.game.playerCamera.camera.position;
      return {
        yaw: Math.atan2(-(at[0] - p.x), -(at[2] - p.z)),
        pitch: Math.atan2(at[1] - p.y, Math.hypot(at[0] - p.x, at[2] - p.z)),
      };
    }, at);
    await turn(aim.yaw, aim.pitch);
  }
};
const ledger = () =>
  page.evaluate(() => {
    const g = globalThis.__game.game;
    return {
      inventory: g.inventory.serialise(),
      resources: Object.fromEntries(
        ['water', 'greens', 'rations', 'scrap', 'components'].map((id) => [
          id,
          g.resources.count(id),
        ]),
      ),
      needs: g.player.needs.toSave(),
      structures: g.buildSave().machine.structures,
      health: g.player.stats.health,
      player: g.player.worldPosition.toArray(),
    };
  });
const coldReview = async () => {
  await page.waitForFunction(() => globalThis.__game.game.isSafeToSave(), null, { timeout: 1500 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => globalThis.__game.game.state.paused);
  const checkpoint = await page.evaluate(() => globalThis.__game.game.buildSave());
  await page.getByRole('button', { name: 'Save & Quit', exact: true }).click();
  await page
    .getByRole('button', { name: 'Continue', exact: true })
    .waitFor({ state: 'visible', timeout: 25000 });
  const committed = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    return g.saves.load(await g.saves.latestSlot());
  });
  if (
    JSON.stringify({ ...committed, savedAt: 0 }) !== JSON.stringify({ ...checkpoint, savedAt: 0 })
  )
    throw new Error('Galley save did not commit the paused checkpoint');
  await context.close();
  const cold = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1280, height: 720 },
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  try {
    const tab = cold.pages()[0] ?? (await cold.newPage());
    tab.on('pageerror', (error) => report.errors.push(error.message));
    await tab.goto(process.env.MMF_SITE ?? 'http://127.0.0.1:5205/?quality=medium&nosound=1');
    await tab.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180000 });
    await tab.getByRole('button', { name: 'Continue', exact: true }).click();
    await tab.waitForFunction(
      () => document.pointerLockElement && !globalThis.__game.game.state.paused,
    );
    const restored = await tab.evaluate(() => {
      const g = globalThis.__game.game;
      return {
        save: g.buildSave(),
        art: ['GalleyStove', 'GalleyCondenser', 'GalleyPlanter'].map((name) =>
          Boolean(g.build.group.getObjectByName(name)),
        ),
        warningVisible: document.getElementById('hud-warning')?.classList.contains('is-active'),
        bundle: [...document.scripts].map((s) => s.src).filter((s) => s.includes('/assets/')),
      };
    });
    const structureSignature = (pieces) =>
      JSON.stringify(
        pieces
          .map((piece) => {
            const copy = structuredClone(piece);
            if (['condenser', 'planter'].includes(copy.definitionId)) delete copy.state.progress;
            return copy;
          })
          .sort((a, b) => a.instanceId.localeCompare(b.instanceId)),
      );
    const checks = {
      committedMatchesPaused: true,
      structures:
        structureSignature(checkpoint.machine.structures) ===
        structureSignature(restored.save.machine.structures),
      inventory:
        Array.isArray(checkpoint.player.inventory) &&
        Array.isArray(restored.save.player.inventory) &&
        JSON.stringify(checkpoint.player.inventory) ===
          JSON.stringify(restored.save.player.inventory),
      art: restored.art.every(Boolean),
      warningClear: !restored.warningVisible,
    };
    report.cold = { checkpoint, committed, restored, checks };
    if (Object.values(checks).some((value) => !value))
      throw new Error('Galley cold Continue failed');
    await tab.screenshot({ path: path.join(output, 'galley-cold-continue.png') });
  } finally {
    await cold.close();
  }
};
const galleyReview = async () => {
  const initial = await ledger();
  for (const [piece, z, x] of [
    ['condenser', 4, 2.5],
    ['planter', 0, 0.7],
  ]) {
    await walk(0.7, z);
    if (x !== 0.7) await walk(x, z);
    const station = await page.evaluate((piece) => {
      const g = globalThis.__game.game;
      const p = g.build
        .stationsNear(g.player.worldPosition, Infinity)
        .find((p) => p.piece === piece);
      return { id: p.instanceId, position: p.position.toArray() };
    }, piece);
    await aimAt(station.position);
    await page.waitForFunction(
      (piece) => {
        const g = globalThis.__game.game;
        return g.build.instance(g.interaction.current?.id)?.definitionId === piece;
      },
      piece,
      { timeout: 5000 },
    );
    const before = await ledger();
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(150);
    const after = await ledger();
    const item = piece === 'condenser' ? 'water' : 'greens';
    if (after.resources[item] <= before.resources[item])
      throw new Error(`${piece} did not transfer its stored output`);
    report.captures.push({ label: `${piece}-collected`, before, after });
    await capture(`${piece}-service`);
    if (x !== 0.7) await walk(0.7, z);
  }
  await walk(0.7, 2);
  await aimAt([2, 14.74, 2]);
  await page.waitForFunction(
    () =>
      globalThis.__game.game.build.instance(globalThis.__game.game.interaction.current?.id)
        ?.definitionId === 'stove',
  );
  await page.keyboard.press('KeyE');
  const button = page.locator('[data-recipe="cook-rations"]');
  await button.waitFor({ state: 'visible' });
  if (await button.isDisabled()) throw new Error('Existing galley recipe unexpectedly disabled');
  const before = await ledger();
  await button.click();
  await page.waitForTimeout(150);
  const cooked = await ledger();
  if (
    cooked.resources.rations !== before.resources.rations + 1 ||
    cooked.resources.water !== before.resources.water - 1 ||
    cooked.resources.greens !== before.resources.greens - 1
  )
    throw new Error('Cooking conservation failed');
  await capture('stove-cooking');
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => document.pointerLockElement && !globalThis.__game.game.state.paused,
  );
  await page.keyboard.press('Tab');
  await page.locator('#inv-panel').waitFor({ state: 'visible' });
  await page
    .locator('.inv-slot[data-side="player"]')
    .filter({ hasText: 'Rations' })
    .first()
    .click();
  await page.waitForTimeout(150);
  const used = await ledger();
  if (
    used.resources.rations !== cooked.resources.rations - 1 ||
    used.needs.nourishment <= cooked.needs.nourishment
  )
    throw new Error('Normal ration use failed');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.pointerLockElement);
  await walk(0.7, -1.5);
  await capture('galley-exit');
  report.galley = { initial, before, cooked, used, final: await ledger() };
  if (process.env.MMF_GALLEY_COLD === '1') await coldReview();
};
try {
  await page.goto(process.env.MMF_SITE ?? 'http://127.0.0.1:5205/?quality=medium&nosound=1');
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.waitForFunction(
    () => document.pointerLockElement && !globalThis.__game.game.titleScreen?.isOpen,
  );
  await capture('continued');
  if (process.env.MMF_GALLEY_COLD_ONLY === '1') {
    await coldReview();
    report.status = report.errors.length ? 'failed' : 'passed';
  } else if (process.env.MMF_CAMERA_MATRIX === '1') {
    await walk(0.7, 3.98);
    const views = async (location) => {
      for (const shoulder of ['right', 'left']) {
        if (
          (await page.evaluate(() => globalThis.__game.game.playerCamera.shoulderSide)) !== shoulder
        )
          await page.keyboard.press('KeyV');
        for (const aiming of [false, true]) {
          if (aiming) await page.mouse.down({ button: 'right' });
          else await page.mouse.up({ button: 'right' });
          await turn(3.2, -0.35);
          await page.waitForTimeout(600);
          await capture(`${location}-${shoulder}-${aiming ? 'aim' : 'hip'}`);
          const sample = report.captures.at(-1);
          if (
            sample.shoulder !== shoulder ||
            sample.aiming !== aiming ||
            !sample.camera.every(Number.isFinite)
          )
            throw new Error('Normal camera control matrix failed');
        }
      }
      await page.mouse.up({ button: 'right' });
    };
    await views('galley');
    await walk(0.7, 2.8);
    await walk(-2, 2.8);
    await capture('upper-stair-mouth');
    await walk(-2, -2.7);
    const lowerY = await page.evaluate(() => globalThis.__game.game.player.worldPosition.y);
    if (lowerY >= 14.3) throw new Error('Normal descent did not reach the middle deck');
    await views('middle-stair-mouth');
    await walk(-2, 2.8);
    await walk(0.7, 2.8);
    const upperY = await page.evaluate(() => globalThis.__game.game.player.worldPosition.y);
    if (upperY < 14.3) throw new Error('Normal ascent did not return to the upper deck');
    await capture('upper-stair-exit');
    report.matrix = {
      lowerY,
      upperY,
      input: 'KeyV and right mouse; normal W movement on both stair directions',
    };
    report.status = report.errors.length ? 'failed' : 'passed';
  } else if (process.env.MMF_CAMERA_BENCH === '1') {
    await walk(0.68, 3.98);
    await turn(3.2, -0.35);
    await page.waitForTimeout(1000);
    report.benchmark = await page.evaluate(async () => {
      const g = globalThis.__game.game;
      const resources = () => ({
        memory: { ...g.renderer.three.info.memory },
        programs: g.renderer.three.info.programs.length,
        enemies: g.enemies.activeCount,
        skiff: g.vehicleScene.active,
        cloth: g.machine.cameraClothMeshes?.map((mesh) => ({
          name: mesh.name,
          materialIds: (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(
            (m) => m.uuid,
          ),
          opacities: (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(
            (m) => m.opacity,
          ),
        })),
      });
      const before = resources();
      const samples = [];
      for (const mode of ['still', 'orbit', 'clear']) {
        if (mode === 'clear') {
          const wrap = (n) => Math.atan2(Math.sin(n), Math.cos(n));
          window.dispatchEvent(
            new MouseEvent('mousemove', {
              movementX: -wrap(5.5 - g.playerCamera.yawAngle) / 0.0022,
              movementY: -(-0.08 - g.playerCamera.pitchAngle) / 0.0022,
              bubbles: true,
            }),
          );
          await new Promise((resolve) => setTimeout(resolve, 550));
        }
        const frames = [];
        let previous = performance.now();
        await new Promise((resolve) => {
          let frame = 0;
          function tick(now) {
            if (frame > 0) frames.push(now - previous);
            previous = now;
            if (mode === 'orbit')
              window.dispatchEvent(
                new MouseEvent('mousemove', { movementX: 16, movementY: 0, bubbles: true }),
              );
            if (++frame <= 180) requestAnimationFrame(tick);
            else resolve();
          }
          requestAnimationFrame(tick);
        });
        frames.sort((a, b) => a - b);
        samples.push({
          mode,
          frames: frames.length,
          median: frames[Math.floor(frames.length * 0.5)],
          p95: frames[Math.floor(frames.length * 0.95)],
          p99: frames[Math.floor(frames.length * 0.99)],
          over50: frames.filter((ms) => ms > 50).length,
          ...resources(),
        });
      }
      return {
        before,
        samples,
        after: resources(),
        quality: g.options?.qualityTier,
        runtimeBundle: [...document.scripts]
          .map((s) => s.src)
          .filter((s) => s.includes('/assets/')),
      };
    });
    await capture('benchmark-final');
    await turn(3.2, -0.35);
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await capture('paused-view');
    report.status = report.errors.length ? 'failed' : 'observed';
  } else if (process.env.MMF_GALLEY_REVIEW === '1') {
    await galleyReview();
    report.status = report.errors.length ? 'failed' : 'passed';
  } else {
    await walk(0.68, 3.98);
    // Match the stove-facing view, then inspect an ordinary level view from the same pose.
    for (let i = 0; i < 18; i++) {
      const aim = await page.evaluate(() => {
        const p = globalThis.__game.game.playerCamera.camera.position;
        return {
          yaw: Math.atan2(-(2 - p.x), -(2 - p.z)),
          pitch: Math.atan2(14.74 - p.y, Math.hypot(2 - p.x, 2 - p.z)),
        };
      });
      await turn(aim.yaw, aim.pitch);
    }
    await capture('stove-low-look');
    await turn(-Math.PI * 0.25, -0.08);
    await page.waitForTimeout(1200);
    await capture('stove-level-look');
    if (process.env.MMF_CAMERA_SWEEP === '1') {
      for (const yaw of [5.5, 5.95, 6.28])
        for (const pitch of [-0.9, -1.1, -1.22]) {
          await turn(yaw, pitch);
          await page.waitForTimeout(700);
          await capture(`sweep-${yaw}-${pitch}`);
        }
    }
    if (process.env.MMF_CAMERA_SWEEP === '2') {
      for (const yaw of [0, 0.8, 1.6, 2.4, 3.2, 4, 4.8, 5.6])
        for (const pitch of [-0.35, 0.2, 0.65]) {
          await turn(yaw, pitch);
          await page.waitForTimeout(650);
          await capture(`orbit-${yaw}-${pitch}`);
        }
    }
    report.status = report.errors.length ? 'failed' : 'observed';
  }
} catch (error) {
  report.status = 'failed';
  report.message = String(error);
  report.stack = error.stack;
  if (!page.isClosed())
    report.failureState = await page
      .evaluate(() => {
        const g = globalThis.__game?.game;
        return g
          ? {
              paused: g.state.paused,
              dead: g.state.playerDead,
              safe: g.isSafeToSave(),
              enemies: g.enemies.activeCount,
              skiff: g.vehicleManager.active,
              gunboat: g.gunboatScene.active,
              hook: g.hook !== null,
              crate: g.hookedCrate !== null,
              phase: g.story.currentPhase,
            }
          : null;
      })
      .catch(() => null);
  process.exitCode = 1;
} finally {
  await page.keyboard.up('KeyW').catch(() => {});
  await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2));
  await context.close();
  console.log(JSON.stringify({ status: report.status, output, message: report.message }));
}
