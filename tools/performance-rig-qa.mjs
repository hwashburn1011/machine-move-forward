/** Compare shared skin palettes with Three's original per-primitive palettes in the same scene. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = process.env.MMF_QA_OUT ?? 'test-results/performance-render-pass';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    `http://127.0.0.1:${process.env.MMF_PORT ?? 5206}/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=smoothness-review`,
  );
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180000 });
  const parity = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    g.stop();
    g.opening.restore({ phase: 'done' });
    g.player.teleport(g.player.worldPosition.clone().set(5.6, 17.05, 1.5));
    for (let i = 0; i < 8; i++)
      g.enemies.spawn(
        ['bastion', 'warden', 'revenant', 'sovereign'][i % 4],
        g.player.worldPosition.clone().set(i < 4 ? -6 : 6, 17.05, -6 + (i % 4) * 4),
      );
    g.render(0);
    const r = g.renderer.three,
      gl = r.getContext();
    const records = [];
    g.renderer.scene.traverse((mesh) => {
      if (mesh.isSkinnedMesh)
        records.push({ mesh, shared: mesh.skeleton, original: mesh.skeleton.clone() });
    });
    globalThis.__rigRecords = records;
    globalThis.__rigToggle = (enabled) =>
      records.forEach(({ mesh, shared, original }) => {
        mesh.skeleton = enabled ? shared : original;
      });
    const camera = g.playerCamera.camera.clone();
    globalThis.__reviewCamera = camera;
    g.post.setCamera(camera);
    const reports = [];
    for (const [name, at, target] of [
      ['combat-deck', [12, 19, 15], [0, 17, 0]],
      ['gunner-close', [7, 18.5, 4], [5.6, 17.4, 1.5]],
      ['mech-lineup', [-10, 18, 3], [-6, 17, -2]],
      ['workshop', [9, 10.6, 6], [0, 10, -1]],
    ]) {
      camera.position.set(...at);
      camera.lookAt(...target);
      camera.updateMatrixWorld(true);
      const pixels = [],
        draws = [];
      for (const enabled of [false, true]) {
        globalThis.__rigToggle(enabled);
        await r.compileAsync(g.renderer.scene, camera);
        // Finish first-use uploads and camera-dependent pass state before readback.
        for (let warm = 0; warm < 3; warm++) {
          g.renderer.beginFrame();
          g.post.render(0, g.renderer.scene, camera);
        }
        g.renderer.beginFrame();
        g.post.render(0, g.renderer.scene, camera);
        const buffer = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        gl.readPixels(
          0,
          0,
          gl.drawingBufferWidth,
          gl.drawingBufferHeight,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          buffer,
        );
        if (!buffer.some((v, i) => i % 4 !== 3 && v > 0)) throw new Error('Empty framebuffer read');
        pixels.push(buffer);
        draws.push({ calls: r.info.render.calls, triangles: r.info.render.triangles });
      }
      let changed = 0,
        maximum = 0;
      for (let i = 0; i < pixels[0].length; i++) {
        const d = Math.abs(pixels[0][i] - pixels[1][i]);
        if (d) changed++;
        maximum = Math.max(maximum, d);
      }
      reports.push({
        name,
        changedChannels: changed,
        maximumError: maximum,
        before: draws[0],
        after: draws[1],
      });
    }
    return {
      primitives: records.length,
      sharedPalettes: new Set(records.map((r) => r.shared)).size,
      views: reports,
    };
  });
  const timings = await page.evaluate(async () => {
    const g = globalThis.__game.game,
      r = g.renderer.three,
      gl = r.getContext(),
      camera = globalThis.__reviewCamera;
    camera.position.set(12, 19, 15);
    camera.lookAt(0, 17, 0);
    camera.updateMatrixWorld(true);
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const results = [];
    const prototype = Object.getPrototypeOf(globalThis.__rigRecords[0].shared),
      update = prototype.update;
    let updates = 0;
    prototype.update = function () {
      updates++;
      return update.call(this);
    };
    try {
      for (const enabled of [false, true, true, false]) {
        globalThis.__rigToggle(enabled);
        const cpu = [],
          gpu = [],
          pending = [];
        let paletteUpdates = 0;
        const poll = () => {
          if (!ext) return;
          const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
          while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
            const query = pending.shift();
            if (!disjoint) gpu.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
            gl.deleteQuery(query);
          }
        };
        for (let i = 0; i < 180; i++) {
          await new Promise(requestAnimationFrame);
          poll();
          g.renderer.beginFrame();
          updates = 0;
          const query = ext && i >= 60 ? gl.createQuery() : null;
          if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
          const start = performance.now();
          g.post.render(0, g.renderer.scene, camera);
          if (i >= 60) {
            cpu.push(performance.now() - start);
            paletteUpdates += updates;
          }
          if (query) {
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            pending.push(query);
          }
        }
        for (let i = 0; pending.length && i < 120; i++) {
          await new Promise(requestAnimationFrame);
          poll();
        }
        pending.forEach((query) => gl.deleteQuery(query));
        const stats = (values) => {
          values.sort((a, b) => a - b);
          return values.length
            ? {
                mean: values.reduce((a, b) => a + b, 0) / values.length,
                p95: values[Math.floor(values.length * 0.95)],
                samples: values.length,
              }
            : null;
        };
        results.push({
          enabled,
          cpuMs: stats(cpu),
          gpuMs: stats(gpu),
          paletteUpdatesPerFrame: paletteUpdates / cpu.length,
        });
      }
    } finally {
      prototype.update = update;
      globalThis.__rigToggle(true);
    }
    globalThis.__rigRecords.forEach((record) => record.original.dispose());
    g.renderer.beginFrame();
    g.post.render(0, g.renderer.scene, camera);
    return results;
  });
  const recycling = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const source = g.enemies.modelByDefinition.get('bastion');
    const EnemyVisual = g.enemies.active[0].visual.constructor;
    const PlayerVisual = g.player.visual.constructor;
    const camera = globalThis.__reviewCamera;
    const draw = () => {
      g.renderer.beginFrame();
      g.post.render(0, g.renderer.scene, camera);
    };
    const samples = [];
    for (let i = 0; i < 10; i++) {
      const enemy = new EnemyVisual(source, g.materials);
      const player = new PlayerVisual(source, g.materials);
      enemy.object3D.position.set(2, 17, 1);
      player.object3D.position.set(-2, 17, 1);
      g.renderer.scene.add(enemy.object3D, player.object3D);
      draw();
      const live = { ...g.renderer.three.info.memory };
      enemy.dispose();
      player.dispose();
      enemy.object3D.removeFromParent();
      player.object3D.removeFromParent();
      draw();
      samples.push({ live, retired: { ...g.renderer.three.info.memory } });
    }
    if (
      samples.some(
        (s) =>
          s.retired.textures !== samples[0].retired.textures ||
          s.retired.geometries !== samples[0].retired.geometries,
      )
    )
      throw new Error('Rig disposal grew GPU resources');
    return samples;
  });
  await page.screenshot({ path: `${out}/shared-rig-combat.png` });
  await writeFile(
    `${out}/rig-comparison.json`,
    JSON.stringify({ parity, timings, recycling, errors }, null, 2),
  );
  console.log(JSON.stringify({ parity, timings, recycling, errors }));
  if (errors.length || parity.views.some((view) => view.changedChannels))
    throw new Error('Rig parity or browser error');
} finally {
  await browser.close();
}
