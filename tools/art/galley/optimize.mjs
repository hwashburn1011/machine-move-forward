/** Repack original Blender exports with WebP; repair singular UV tangents without changing geometry. */
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import sharp from 'sharp';
const names = ['galley-kit'];
const report = [];
const pad4 = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
for (const name of names) {
  const source = 'assets/galley/exports/' + name + '.glb';
  try {
    await readFile(source);
  } catch {
    await copyFile('public/models/authored/' + name + '.glb', source);
  }
  const bytes = await readFile(source);
  const length = bytes.readUInt32LE(12),
    doc = JSON.parse(bytes.toString('utf8', 20, 20 + length));
  const bin = Buffer.from(bytes.subarray(28 + length));
  let repairedTangents = 0;
  for (const mesh of doc.meshes ?? [])
    for (const primitive of mesh.primitives ?? []) {
      const tangent = doc.accessors[primitive.attributes?.TANGENT];
      const normal = doc.accessors[primitive.attributes?.NORMAL];
      if (!tangent || tangent.componentType !== 5126 || !normal) continue;
      const tv = doc.bufferViews[tangent.bufferView],
        nv = doc.bufferViews[normal.bufferView];
      for (let i = 0; i < tangent.count; i++) {
        const offset = (tv.byteOffset ?? 0) + (tangent.byteOffset ?? 0) + i * (tv.byteStride ?? 16);
        const x = bin.readFloatLE(offset),
          y = bin.readFloatLE(offset + 4),
          z = bin.readFloatLE(offset + 8);
        const len = Math.hypot(x, y, z);
        if (len > 0.999 && len < 1.001) continue;
        if (len > 1e-6) {
          bin.writeFloatLE(x / len, offset);
          bin.writeFloatLE(y / len, offset + 4);
          bin.writeFloatLE(z / len, offset + 8);
        } else {
          const no = (nv.byteOffset ?? 0) + (normal.byteOffset ?? 0) + i * (nv.byteStride ?? 12);
          const nx = bin.readFloatLE(no),
            ny = bin.readFloatLE(no + 4),
            nz = bin.readFloatLE(no + 8);
          const t = Math.abs(ny) < 0.9 ? [nz, 0, -nx] : [0, -nz, ny],
            tl = Math.hypot(...t) || 1;
          t.forEach((v, j) => bin.writeFloatLE(v / tl, offset + j * 4));
        }
        bin.writeFloatLE(1, offset + 12);
        repairedTangents++;
      }
    }
  const imageByView = new Map((doc.images ?? []).map((image, i) => [image.bufferView, i]));
  const normalImages = new Set();
  for (const mat of doc.materials ?? [])
    for (const tex of [mat.normalTexture, mat.pbrMetallicRoughness?.metallicRoughnessTexture]) {
      if (tex) normalImages.add(doc.textures[tex.index].source);
    }
  const parts = [];
  let offset = 0;
  let textureBytes = 0;
  for (let i = 0; i < doc.bufferViews.length; i++) {
    const view = doc.bufferViews[i];
    let data = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    if (imageByView.has(i)) {
      const imageIndex = imageByView.get(i);
      data = await sharp(data)
        .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
        .webp(
          normalImages.has(imageIndex) ? { lossless: true, effort: 6 } : { quality: 90, effort: 6 },
        )
        .toBuffer();
      doc.images[imageIndex].mimeType = 'image/webp';
      textureBytes += data.length;
    }
    view.byteOffset = offset;
    view.byteLength = data.length;
    const padded = pad4(data);
    parts.push(padded);
    offset += padded.length;
  }
  for (const texture of doc.textures ?? []) {
    texture.extensions ??= {};
    texture.extensions.EXT_texture_webp = { source: texture.source };
    delete texture.source;
  }
  doc.extensionsUsed = [...new Set([...(doc.extensionsUsed ?? []), 'EXT_texture_webp'])];
  doc.extensionsRequired = [...new Set([...(doc.extensionsRequired ?? []), 'EXT_texture_webp'])];
  doc.buffers[0].byteLength = offset;
  const jsonBytes = Buffer.from(JSON.stringify(doc));
  const json = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 32)]);
  const payload = Buffer.concat(parts),
    out = Buffer.alloc(28 + json.length + payload.length);
  out.write('glTF');
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(json.length, 12);
  out.write('JSON', 16);
  json.copy(out, 20);
  out.writeUInt32LE(payload.length, 20 + json.length);
  out.write('BIN\0', 24 + json.length);
  payload.copy(out, 28 + json.length);
  await writeFile('public/models/authored/' + name + '.glb', out);
  report.push({
    name,
    sourceBytes: bytes.length,
    optimizedBytes: out.length,
    textureBytes,
    repairedTangents,
  });
}
await writeFile('assets/galley/optimization.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
