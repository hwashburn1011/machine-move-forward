import fs from 'node:fs/promises';
import sharp from 'sharp';
const root = 'docs/art/refinement-50';
const models = JSON.parse(
  await fs.readFile('assets/desert-ruins/source/model-report.json', 'utf8'),
);
const escape = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
for (let page = 0; page < 5; page++) {
  const images = [];
  for (let n = 0; n < 10; n++) {
    const index = page * 10 + n;
    const model = models[index];
    const filename = `${String(index + 1).padStart(2, '0')}-${model.name}.png`;
    const buffer = await sharp(`${root}/renders/${filename}`).resize(360, 360).png().toBuffer();
    const x = (n % 5) * 360,
      y = Math.floor(n / 5) * 398;
    images.push({ input: buffer, left: x, top: y });
    images.push({
      input: Buffer.from(
        `<svg width="360" height="38"><rect width="360" height="38" fill="#191e20"/><text x="12" y="24" font-family="Arial" font-size="17" fill="#efcc93">${index + 1}. ${model.name}</text></svg>`,
      ),
      left: x,
      top: y + 360,
    });
  }
  await sharp({ create: { width: 1800, height: 796, channels: 3, background: '#191e20' } })
    .composite(images)
    .webp({ quality: 94 })
    .toFile(`${root}/catalog-${page + 1}.webp`);
}
const cards = models
  .map(
    (model, index) =>
      `<article><a href="renders/${String(index + 1).padStart(2, '0')}-${model.name}.png"><img loading="lazy" src="renders/${String(index + 1).padStart(2, '0')}-${model.name}.png" alt="${escape(model.name)}"></a><h2>${index + 1}. ${model.name}</h2><p>${escape(model.detail)}</p><small>${model.status} · ${model.editable_parts} editable parts · ${model.triangles.toLocaleString()} near / ${model.lod_triangles.toLocaleString()} distant triangles</small></article>`,
  )
  .join('\n');
await fs.writeFile(
  `${root}/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Nomad — 50 artifact review</title><style>body{margin:0;background:#11191c;color:#e4d7bd;font:16px/1.5 system-ui}header{padding:40px;max-width:1000px}h1{font-size:38px;margin:0}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px;padding:0 40px 40px}article{background:#202b2f;padding:16px;border:1px solid #536063}img{width:100%;display:block}h2{color:#efb96d;font-size:20px}small{color:#a2bbb7}a{color:#efb96d}</style><header><h1>Nomad / 50 desert artifacts</h1><p>14 refined models + 36 new assemblies. Original Blender geometry, shared weathered PBR atlas, smooth manufactured curves, real openings and physical supports. All 50 have editable source, near and distant meshes, and seeded in-game placement.</p><p><a href="../../../assets/desert-ruins/source/DesertRuins.blend">Editable Blender source</a> · <a href="../../../public/models/props/ruins/desert-ruins.glb">Runtime model library</a></p></header><main>${cards}</main></html>`,
);
console.log('Five contact sheets and 50-model review gallery written.');
