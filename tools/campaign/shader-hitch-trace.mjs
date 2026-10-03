import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(
    'http://127.0.0.1:5206/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=smoothness-review',
  );
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180000 });
  await page.click('#game');
  const result = await page.evaluate(async () => {
    const g = __game.game;
    g.stop();
    g.state.paused = false;
    g.opening.restore({ phase: 'done' });
    g.player.stats.invulnerable = true;
    g.player.teleport(g.player.worldPosition.clone().set(5.6, 17.05, 1.5));
    const programs = g.renderer.three.info.programs;
    const original = new Set(programs.map((p) => p.id));
    const originalPrograms = programs.map((p) => ({
      id: p.id,
      name: p.name,
      cacheKey: p.cacheKey,
    }));
    const captures = [];
    const gl = g.renderer.three.getContext();
    const info = gl.getProgramInfoLog.bind(gl);
    gl.getProgramInfoLog = (program) => {
      const start = performance.now();
      const result = info(program);
      captures.push({
        ms: performance.now() - start,
        shaders: gl.getAttachedShaders(program).map((s) => gl.getShaderSource(s).slice(0, 7000)),
      });
      return result;
    };
    for (let i = 0; i < 8; i++)
      g.enemies.spawn(
        ['bastion', 'warden', 'revenant', 'sovereign'][i % 4],
        g.player.worldPosition.clone().set(i < 4 ? -6 : 6, 17.05, -6 + (i % 4) * 4),
      );
    for (let frame = 0; frame < 1100; frame++) {
      window.dispatchEvent(new MouseEvent('mousemove', { movementX: 30, movementY: 0 }));
      g.fixedUpdate(1 / 60);
      g.render(0);
      await new Promise(requestAnimationFrame);
    }
    const materials = [];
    g.renderer.scene.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.name !== 'MECH_VentPaint') continue;
        const props = g.renderer.three.properties.get(m);
        materials.push({
          object: o.name,
          material: m.uuid,
          side: m.side,
          transparent: m.transparent,
          forceSinglePass: m.forceSinglePass,
          programs: props.programs ? [...props.programs.values()].map((p) => p.id) : [],
        });
      }
    });
    return {
      originalPrograms,
      materials,
      programs: programs
        .filter((p) => !original.has(p.id))
        .map((p) => ({ id: p.id, name: p.name, cacheKey: p.cacheKey })),
      captures,
    };
  });
  await fs.writeFile('test-results/shader-hitch-trace.json', JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      newPrograms: result.programs.map((p) => ({ id: p.id, name: p.name })),
      logs: result.captures.map((c) => c.ms),
    }),
  );
} finally {
  await browser.close();
}
