/** Inspect actual draw submissions and texture ownership without changing game assets. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const out = process.env.MMF_QA_OUT ?? 'test-results/performance-render-pass';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(
    `http://127.0.0.1:${process.env.MMF_PORT ?? 5206}/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=smoothness-review`,
  );
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180000 });
  const result = await page.evaluate(() => {
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
    const r = g.renderer.three;
    const original = r.renderBufferDirect;
    const draws = new Map();
    const path = (object) => {
      const names = [];
      for (let n = object; n && n !== g.renderer.scene; n = n.parent)
        names.unshift(n.name || n.type + '#' + n.id);
      return names.join('/');
    };
    r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
      const name = path(object);
      const entry = draws.get(name) ?? {
        name,
        material: object.material?.name,
        calls: 0,
        passes: {},
        triangles: (geometry.index?.count ?? geometry.attributes.position?.count ?? 0) / 3,
      };
      entry.calls++;
      const pass = material.type + ':' + (material.name || '');
      entry.passes[pass] = (entry.passes[pass] ?? 0) + 1;
      draws.set(name, entry);
      return original.call(this, camera, scene, geometry, material, object, group);
    };
    g.render(0);
    r.renderBufferDirect = original;
    const textures = new Map(),
      sources = new Map(),
      groups = new Map();
    g.renderer.scene.traverse((object) => {
      if (!object.isMesh) return;
      const parent = path(object.parent);
      const summary = groups.get(parent) ?? {
        path: parent,
        meshes: 0,
        materials: new Set(),
        vertices: 0,
      };
      summary.meshes++;
      summary.vertices += object.geometry.attributes.position?.count ?? 0;
      for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
        summary.materials.add(mat.uuid);
        for (const [slot, value] of Object.entries(mat))
          if (value?.isTexture) {
            const image = value.source?.data;
            const entry = textures.get(value.uuid) ?? {
              name: value.name,
              source: value.source?.uuid,
              width: image?.width,
              height: image?.height,
              slot,
              material: mat.name,
              uses: 0,
            };
            entry.uses++;
            textures.set(value.uuid, entry);
            sources.set(value.source?.uuid, image?.width * image?.height * 4 || 0);
          }
      }
      groups.set(parent, summary);
    });
    return {
      roots: g.renderer.scene.children.map((o) => ({
        name: o.name || o.type + '#' + o.id,
        visible: o.visible,
        at: o.position.toArray(),
        children: o.children.length,
      })),
      draws: [...draws.values()].sort((a, b) => b.calls - a.calls),
      groups: [...groups.values()]
        .map((x) => ({ ...x, materials: x.materials.size }))
        .sort((a, b) => b.meshes - a.meshes),
      textures: [...textures.values()],
      uniqueSources: sources.size,
      uncompressedSourceBytes: [...sources.values()].reduce((a, b) => a + b, 0),
      gpuMemory: { ...r.info.memory },
    };
  });
  await writeFile(`${out}/draw-audit.json`, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      groups: result.groups.slice(0, 22),
      textures: result.textures.length,
      uniqueSources: result.uniqueSources,
      uncompressedSourceBytes: result.uncompressedSourceBytes,
      gpuMemory: result.gpuMemory,
    }),
  );
} finally {
  await browser.close();
}
