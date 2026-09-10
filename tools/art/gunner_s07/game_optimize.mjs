/**
 * Optimize complete graphics-v3 GLBs without changing their authored graph.
 *
 * The pass keeps original PNG masters untouched in staging, adds high-quality
 * WebP images as required texture sources, and encodes geometry bufferViews with
 * EXT_meshopt_compression.  It deliberately does not decimate meshes: named
 * pivots and close silhouettes remain exactly authored until an inspected LOD
 * source is available.
 *
 * Run from repository root:
 *   node tools/art/graphics_v2/optimize.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const INPUT = path.join(ROOT, 'assets', 'gunner-s07', 'game');
const OUTPUT = path.join(ROOT, 'public', 'models', 'authored');
await fs.mkdir(OUTPUT, { recursive: true });
await MeshoptEncoder.ready;

const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function align4(n) { return (n + 3) & ~3; }

function parseGlb(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2)
    throw new Error('not a glTF 2.0 GLB');
  const jsonLength = bytes.readUInt32LE(12);
  const jsonStart = 20;
  const json = JSON.parse(bytes.toString('utf8', jsonStart, jsonStart + jsonLength).trim());
  let offset = jsonStart + jsonLength;
  let bin = null;
  while (offset < bytes.length) {
    const len = bytes.readUInt32LE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'BIN\u0000') bin = bytes.subarray(offset + 8, offset + 8 + len);
    offset += 8 + len;
  }
  if (!bin) throw new Error('GLB has no BIN chunk');
  return { json, bin };
}

function makeGlb(json, bin) {
  const jsonRaw = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonBytes = Buffer.concat([jsonRaw, Buffer.alloc((4 - jsonRaw.length % 4) % 4, 0x20)]);
  const binBytes = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
  const total = 12 + 8 + jsonBytes.length + 8 + binBytes.length;
  const out = Buffer.alloc(total);
  out.write('glTF', 0, 4, 'ascii');
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBytes.length, 12);
  out.write('JSON', 16, 4, 'ascii');
  jsonBytes.copy(out, 20);
  const binHeader = 20 + jsonBytes.length;
  out.writeUInt32LE(binBytes.length, binHeader);
  out.write('BIN\u0000', binHeader + 4, 4, 'ascii');
  binBytes.copy(out, binHeader + 8);
  return out;
}

function addChunk(parts, data) {
  const offset = parts.bytes;
  parts.items.push(data);
  parts.bytes += data.length;
  const pad = (4 - parts.bytes % 4) % 4;
  if (pad) {
    parts.items.push(Buffer.alloc(pad));
    parts.bytes += pad;
  }
  return { offset, length: data.length };
}

function accessorBytes(accessor) {
  const component = COMPONENT_BYTES[accessor.componentType];
  const components = TYPE_COMPONENTS[accessor.type];
  if (!component || !components) throw new Error(`unsupported accessor ${accessor.type}/${accessor.componentType}`);
  return component * components;
}

function extensionArray(json, key) {
  json.extensionsUsed ||= [];
  if (!json.extensionsUsed.includes(key)) json.extensionsUsed.push(key);
  json.extensionsRequired ||= [];
  if (!json.extensionsRequired.includes(key)) json.extensionsRequired.push(key);
}

function collectGeometry(json) {
  const byView = new Map();
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      for (const accessorIndex of [...Object.values(primitive.attributes || {}), primitive.indices].filter(Number.isInteger)) {
        const accessor = json.accessors[accessorIndex];
        if (!accessor || !Number.isInteger(accessor.bufferView)) continue;
        const viewIndex = accessor.bufferView;
        const prior = byView.get(viewIndex);
        if (prior && prior.accessorIndex !== accessorIndex) {
          // Interleaved/shared accessors need a dedicated glTF transform pass.
          byView.set(viewIndex, { unsupported: true });
        } else {
          byView.set(viewIndex, { accessorIndex, mode: accessorIndex === primitive.indices ? 'TRIANGLES' : 'ATTRIBUTES' });
        }
      }
    }
  }
  return byView;
}

function imageRoles(json) {
  const roles = new Map();
  const textures = json.textures || [];
  const note = (textureIndex, role) => {
    const ti = textures[textureIndex];
    if (!ti || !Number.isInteger(ti.source)) return;
    if (!roles.has(ti.source)) roles.set(ti.source, new Set());
    roles.get(ti.source).add(role);
  };
  for (const mat of json.materials || []) {
    const pbr = mat.pbrMetallicRoughness || {};
    if (pbr.baseColorTexture) note(pbr.baseColorTexture.index, 'baseColor');
    if (pbr.metallicRoughnessTexture) note(pbr.metallicRoughnessTexture.index, 'ORM');
    if (mat.normalTexture) note(mat.normalTexture.index, 'normal');
    if (mat.emissiveTexture) note(mat.emissiveTexture.index, 'emissive');
  }
  return roles;
}

async function optimizeOne(file) {
  const original = await fs.readFile(file);
  const { json, bin } = parseGlb(original);
  if (json.buffers?.length !== 1) throw new Error('only one BIN buffer is supported');
  const sourceViews = json.bufferViews || [];
  const originalImages = [...(json.images || [])];
  const originalImageViews = originalImages.map((image) => image.bufferView);
  const imageViewSet = new Set(originalImageViews.filter(Number.isInteger));
  const geometry = collectGeometry(json);
  const parts = { items: [], bytes: 0 };
  const remap = new Map();
  let geometryOriginalBytes = 0;
  let geometryCompressedBytes = 0;
  let fallbackCursor = 0;

  // Rebuild views in one pass. Geometry parents point to a standards-valid
  // placeholder fallback buffer while the extension points to compressed data.
  const newViews = [];
  for (let i = 0; i < sourceViews.length; i++) {
    const view = sourceViews[i];
    if (imageViewSet.has(i)) {
      remap.set(i, null);
      continue;
    }
    const raw = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const info = geometry.get(i);
    const outView = { buffer: 0 };
    if (info && !info.unsupported && !view.byteStride) {
      const accessor = json.accessors[info.accessorIndex];
      const stride = accessorBytes(accessor);
      const compressed = Buffer.from(MeshoptEncoder.encodeGltfBuffer(raw, accessor.count, stride, info.mode));
      geometryOriginalBytes += raw.length;
      geometryCompressedBytes += compressed.length;
      // Keep a standards-valid decoded fallback view. EXT_meshopt points to a
      // separate compressed payload; validators and non-Meshopt readers can
      // still inspect the accessor without interpreting the extension.
      const compressedChunk = addChunk(parts, compressed);
      outView.buffer = 1;
      outView.byteOffset = fallbackCursor;
      outView.byteLength = raw.length;
      fallbackCursor += align4(raw.length);
      outView.extensions = { EXT_meshopt_compression: { buffer: 0, byteOffset: compressedChunk.offset, byteLength: compressedChunk.length, byteStride: stride, count: accessor.count, mode: info.mode } };
      accessor.byteOffset = 0;
    } else {
      const chunk = addChunk(parts, raw);
      outView.byteOffset = chunk.offset;
      outView.byteLength = chunk.length;
    }
    if (view.target) outView.target = view.target;
    remap.set(i, newViews.length);
    newViews.push(outView);
  }
  for (const accessor of json.accessors || []) if (Number.isInteger(accessor.bufferView)) accessor.bufferView = remap.get(accessor.bufferView);

  const roles = imageRoles(json);
  const webpImage = new Map();
  const webpEntries = [];
  let textureOriginalBytes = 0;
  let textureWebPBytes = 0;
  const imageReport = [];
  for (let imageIndex = 0; imageIndex < originalImages.length; imageIndex++) {
    const image = originalImages[imageIndex];
    if (image.mimeType !== 'image/png' || !Number.isInteger(image.bufferView)) continue;
    const originalViewIndex = originalImageViews[imageIndex];
    const sourceView = Number.isInteger(originalViewIndex) ? sourceViews[originalViewIndex] : null;
    if (!sourceView) continue;
    const png = bin.subarray(sourceView.byteOffset || 0, (sourceView.byteOffset || 0) + sourceView.byteLength);
    const role = [...(roles.get(imageIndex) || ['unreferenced'])];
    const meta = await sharp(png).metadata();
    const isBase = role.includes('baseColor') || role.includes('emissive');
    const smallDetail = !isBase && (role.includes('normal') || role.includes('ORM'));
    const prepared = sharp(png).resize({ width: smallDetail ? 512 : 1024, height: smallDetail ? 512 : 1024, fit: 'inside', withoutEnlargement: true });
    const webp = await prepared.webp(isBase ? { quality: 92, effort: 5 } : { lossless: true, effort: 5 }).toBuffer();
    const chunk = addChunk(parts, webp);
    const webpIndex = webpEntries.length;
    webpEntries.push({ name: `${image.name || `image_${imageIndex}`}_webp`, bufferView: newViews.length, mimeType: 'image/webp' });
    newViews.push({ buffer: 0, byteOffset: chunk.offset, byteLength: chunk.length });
    webpImage.set(imageIndex, webpIndex);
    
    textureOriginalBytes += png.length;
    textureWebPBytes += webp.length;
    imageReport.push({ image: image.name || `image_${imageIndex}`, roles: role, width: smallDetail ? 512 : Math.min(1024, meta.width), height: smallDetail ? 512 : Math.min(1024, meta.height), sourceWidth: meta.width, sourceHeight: meta.height, pngBytes: png.length, webpBytes: webp.length, format: 'webp', lossless: !isBase });
  }
  json.images = webpEntries;
  for (const texture of json.textures || []) {
    if (!Number.isInteger(texture.source) || !webpImage.has(texture.source)) continue;
    const source = webpImage.get(texture.source);
    delete texture.source;
    texture.extensions ||= {};
    texture.extensions.EXT_texture_webp = { source };
  }
  extensionArray(json, 'EXT_meshopt_compression');
  extensionArray(json, 'EXT_texture_webp');
  json.buffers.push({ byteLength: fallbackCursor, extensions: { EXT_meshopt_compression: { fallback: true } } });
  json.bufferViews = newViews;
  json.buffers[0].byteLength = parts.bytes;

  const rootNode = (json.nodes || []).find((node) => /^MMF_[^_]+$/.test(node.name || '') || node.extras?.graphicsVersion);
  const rootExtras = rootNode?.extras || {};
  const stem = path.basename(file, '.glb');
  const required = stem === 'salvaged-radio' ? ['SignalLamp'] : stem === 'manual-turret' ? ['TurretYaw', 'TurretPitch', 'Muzzle'] : stem === 'scrap-rifle' || stem === 'scrap-shotgun' ? ['GripOrigin', 'Muzzle'] : stem === 'expedition-wreck' ? ['Gangway', 'CourseGyro', 'JournalCargo', 'JournalCrew', 'JournalRoute'] : stem === 'raider-skiff' ? ['SkiffGunPitch', 'SkiffMuzzle', 'PilotSeat', 'CrewSeatLeft', 'CrewSeatRight'] : [];
  const names = new Set((json.nodes || []).map((node) => node.name));
  const missing = required.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`${stem}: contract missing ${missing.join(', ')}`);
  const out = makeGlb(json, Buffer.concat(parts.items));
  const outPath = path.join(OUTPUT, `${stem}.glb`);
  await fs.writeFile(outPath, out);
  const gpu = imageReport.reduce((sum, item) => sum + (item.width * item.height * 4 * 4 / 3), 0);
  return { asset: stem, sourceBytes: original.length, optimizedBytes: out.length, sourceGeometryBytes: geometryOriginalBytes, compressedGeometryBytes: geometryCompressedBytes, meshoptFallbackBufferBytes: fallbackCursor, sourceTextureBytes: textureOriginalBytes, webpTextureBytes: textureWebPBytes, selectedTextureGpuBytesWithMips: Math.round(gpu), images: imageReport, requiredNodes: required, extras: rootExtras, lod: null, output: outPath };
}

const args = process.argv.slice(2);
const selected = args.length ? args.map((name) => path.resolve(INPUT, name.endsWith('.glb') ? name : `${name}.glb`)) : (await fs.readdir(INPUT)).filter((name) => name.endsWith('.glb')).sort().map((name) => path.join(INPUT, name));
const reports = [];
for (const file of selected) {
  try {
    reports.push(await optimizeOne(file));
  } catch (error) {
    reports.push({ asset: path.basename(file, '.glb'), error: String(error?.stack || error) });
  }
}
await fs.writeFile(path.join(INPUT, 'optimize-manifest.json'), JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), encoder: 'meshoptimizer 1.1.1', texturePolicy: 'optimized GLBs require EXT_texture_webp and select baseColor/emissive WebP q92 at 1K or normal/ORM lossless WebP at 512; original 1K PNG masters remain in staging; WebP does not reduce GPU residency', geometryPolicy: 'EXT_meshopt parents use a placeholder fallback buffer sized for decoded accessors; compressed payloads remain in GLB BIN', assets: reports }, null, 2) + '\n');
console.log(JSON.stringify({ optimized: reports }, null, 2));
if (reports.some((r) => r.error)) process.exitCode = 1;

