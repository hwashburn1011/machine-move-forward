/** Export canonical TS data and losslessly expand meshopt GLBs for native import. */
import fs from 'node:fs/promises';
import sync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { MeshoptDecoder } from 'meshoptimizer';
const root = path.resolve(import.meta.dirname, '../..');
const dest = path.join(root, 'godot');
const cache = new Map();
const packageRequire = createRequire(import.meta.url);
function moduleData(file) {
  if (!path.extname(file)) file += '.ts';
  if (cache.has(file)) return cache.get(file);
  if (file.endsWith('.json')) return JSON.parse(sync.readFileSync(file, 'utf8'));
  const module = { exports: {} };
  cache.set(file, module.exports);
  const code = ts.transpileModule(sync.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const require = name => name.startsWith('@/') ? moduleData(path.join(root, 'src', name.slice(2))) : name.startsWith('.') ? moduleData(path.resolve(path.dirname(file), name)) : packageRequire(name);
  new Function('require', 'module', 'exports', code)(require, module, module.exports);
  return module.exports;
}
await fs.mkdir(path.join(dest, 'data'), { recursive: true });
const definitions = {};
for (const name of (await fs.readdir(path.join(root, 'src/data'))).filter(n => n.endsWith('.ts'))) {
  for (const [key, value] of Object.entries(moduleData(path.join(root, 'src/data', name)))) {
    if (typeof value !== 'function') definitions[key] = value;
  }
}
definitions.constants = moduleData(path.join(root, 'src/game/constants.ts'));
for (const name of ['iron-nomad', 'iron-nomad-side-stairs', 'iron-nomad-obstacles', 'iron-nomad-shared-solids']) {
  definitions[name] = JSON.parse(await fs.readFile(path.join(root, 'src/data', name + '.json'), 'utf8'));
}
await fs.writeFile(path.join(dest, 'data/definitions.json'), JSON.stringify(definitions, null, 2));
const desert = moduleData(path.join(root, 'src/world/DesertScenery.ts'));
const fixtures = [];
for (const seed of ['mmf-default-seed', 'native-parity:α']) for (const chunk of [-55, -3, -2, -1, 0, 1, 2, 3, 55])
  fixtures.push({ seed, chunk, placements: desert.desertLayout(seed, chunk, 20) });
await fs.writeFile(path.join(dest, 'data/desert-fixtures.json'), JSON.stringify(fixtures));
const opening = moduleData(path.join(root, 'src/game/OpeningCinematicTimeline.ts'));
const roofY = 16.03 + 3.6 * 0.97;
const openingSamples = Array.from({ length: 613 }, (_, i) => opening.sampleOpeningCinematic(i / 60,
  { x: 20.5, y: roofY + 0.96, z: 0 }, { x: 10, y: 17.02, z: 0 }, { x: 14.5, y: roofY + 0.96, z: 0 }));
await fs.writeFile(path.join(dest, 'data/opening.json'), JSON.stringify({ fps: 60, samples: openingSamples, events: opening.OPENING_CINEMATIC_EVENTS }));
await fs.mkdir(path.join(dest, 'shaders'), { recursive: true });
const sky = moduleData(path.join(root, 'src/art/shaders/skyShader.ts')).SKY_FRAGMENT
  .replace('precision highp float;', 'shader_type sky;')
  .replace('varying vec3 vWorldDirection;', '')
  .replace('const float PI = 3.141592653589793;', '')
  .replace('void main()', 'void sky()').replace('vWorldDirection', 'EYEDIR')
  .replace('gl_FragColor = vec4(max(sky, vec3(0.0)), 1.0);', 'COLOR = max(sky, vec3(0.0));')
  .replace(/#include <[^>]+>/g, '');
await fs.writeFile(path.join(dest, 'shaders/sky.gdshader'), sky.replace(/[\t ]+$/gm, ''));
const terrainSource = moduleData(path.join(root, 'src/art/shaders/terrainShader.ts'));
let noise = terrainSource.TERRAIN_NOISE;
const fragmentUniforms = terrainSource.TERRAIN_FRAGMENT_PARS.replace(/uniform sampler2D uSandMap;/, 'uniform sampler2D uSandMap : source_color, filter_linear_mipmap_anisotropic, repeat_enable;').replace(/uniform sampler2D uSandNormalMap;/, 'uniform sampler2D uSandNormalMap : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;').replace(/uniform sampler2D uSandArmMap;/, 'uniform sampler2D uSandArmMap : filter_linear_mipmap_anisotropic, repeat_enable;');
const fragmentDetail = terrainSource.TERRAIN_FRAGMENT_MAIN.replaceAll('cameraPosition', 'CAMERA_POSITION_WORLD').replaceAll('viewMatrix', 'VIEW_MATRIX').replaceAll('texture2D', 'texture');
const terrain = `shader_type spatial;
#define TERRAIN_SAND_TEXTURE
uniform float distance_m; uniform float lateral_m;
varying vec2 ground_xz;
` + noise + fragmentUniforms + `
void vertex() {
  ground_xz = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz + vec2(lateral_m, -distance_m);
  float h=duneHeight(ground_xz);
  VERTEX.y = h;
  float dx=duneHeight(ground_xz+vec2(0.12,0.0))-duneHeight(ground_xz-vec2(0.12,0.0));
  float dz=duneHeight(ground_xz+vec2(0.0,0.12))-duneHeight(ground_xz-vec2(0.0,0.12));
  NORMAL=normalize(vec3(-dx,0.24,-dz));
  TANGENT=normalize(vec3(0.24,dx,0.0)); BINORMAL=cross(NORMAL,TANGENT);
  vTerrainWorld=vec3(ground_xz.x,h,ground_xz.y);
  vTerrainRender=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
  vTerrainSlope=1.0-NORMAL.y;
}
void fragment() {
  vec3 normal=NORMAL;
  float roughnessFactor=0.94;
  vec4 diffuseColor=vec4(1.0);
  ${fragmentDetail}
  NORMAL=normal;
  ROUGHNESS=roughnessFactor;
  ALBEDO=diffuseColor.rgb;
}
`;
await fs.writeFile(path.join(dest, 'shaders/desert.gdshader'), terrain.replace(/[\t ]+$/gm, ''));
if (process.argv.includes('--data-only')) process.exit(0);
await MeshoptDecoder.ready;
async function files(dir) {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await files(file)); else result.push(file);
  }
  return result;
}
function unpack(data) {
  const jsonLength = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + jsonLength).toString());
  const binStart = 20 + jsonLength + 8;
  const bin = data.subarray(binStart);
  let byteLength = bin.length;
  const parts = [bin];
  let expanded = 0;
  for (const view of json.bufferViews ?? []) {
    const ext = view.extensions?.EXT_meshopt_compression;
    if (!ext) continue;
    if (ext.buffer !== 0) throw new Error('Unexpected external compressed buffer');
    const decoded = Buffer.alloc(ext.count * ext.byteStride);
    MeshoptDecoder.decodeGltfBuffer(decoded, ext.count, ext.byteStride,
      bin.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength), ext.mode, ext.filter);
    const padding = (4 - byteLength % 4) % 4;
    if (padding) { parts.push(Buffer.alloc(padding)); byteLength += padding; }
    view.buffer = 0; view.byteOffset = byteLength; view.byteLength = decoded.length;
    delete view.extensions.EXT_meshopt_compression;
    if (!Object.keys(view.extensions).length) delete view.extensions;
    parts.push(decoded); byteLength += decoded.length; expanded++;
  }
  if (!expanded) return { data, json, expanded };
  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    if (json[key]) json[key] = json[key].filter(v => v !== 'EXT_meshopt_compression');
  }
  // All imported views now address the sole unpacked binary buffer.
  json.buffers = [{ byteLength }];
  let bytes = Buffer.from(JSON.stringify(json));
  if (bytes.length % 4) bytes = Buffer.concat([bytes, Buffer.alloc(4 - bytes.length % 4, 0x20)]);
  let body = Buffer.concat(parts);
  if (body.length % 4) body = Buffer.concat([body, Buffer.alloc(4 - body.length % 4)]);
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + bytes.length + body.length, 8);
  header.writeUInt32LE(bytes.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(body.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  return { data: Buffer.concat([header, bytes, binHeader, body]), json, expanded };
}
const manifest = [];
for (const file of await files(path.join(root, 'public/models'))) {
  if (!file.endsWith('.glb')) continue;
  const source = await fs.readFile(file);
  const converted = unpack(source);
  const relative = path.relative(path.join(root, 'public'), file).replaceAll('\\', '/');
  const output = path.join(dest, 'assets', relative);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, converted.data);
  manifest.push({ path: relative, sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
    bytes: converted.data.length, expandedViews: converted.expanded,
    nodes: (converted.json.nodes ?? []).map(n => n.name).filter(Boolean),
    animations: (converted.json.animations ?? []).map(n => n.name),
    extensions: converted.json.extensionsRequired ?? [] });
}
await fs.cp(path.join(root, 'public/textures'), path.join(dest, 'assets/textures'), { recursive: true });
await fs.writeFile(path.join(dest, 'data/assets.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ models: manifest.length, definitions: Object.keys(definitions).length,
  expandedViews: manifest.reduce((n, x) => n + x.expandedViews, 0) }));
