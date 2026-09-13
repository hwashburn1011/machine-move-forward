/** Preserve shipped geometry, sockets and original animation bytes; append Blender clips only. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const kind = process.argv[2] ?? 's07';
const runtimeName = kind === 's07' ? 's07-player' : kind;
const originalPath = path.join(process.env.MMF_ORIGINAL_ROOT ?? root, `public/models/authored/${runtimeName}.glb`);
const stage = path.join(root, 'assets/animation-polish');
const read = (bytes) => {
  if (bytes.toString('ascii', 0, 4) !== 'glTF') throw Error('Invalid GLB');
  const n = bytes.readUInt32LE(12), json = JSON.parse(bytes.toString('utf8', 20, 20+n));
  return { json, bin: bytes.subarray(28+n, 28+n+bytes.readUInt32LE(20+n)) };
};
const original = await fs.readFile(originalPath), { json, bin } = read(original);
const authored = read(await fs.readFile(path.join(stage, 'exports', `${kind}.glb`)));
const names = new Map();
for (const [i, node] of json.nodes.entries()) {
  if (names.has(node.name)) names.set(node.name, null);
  else names.set(node.name, i);
}
const wanted = (name) => kind === 's07'
  ? /^armed_(walk|run|crouch_walk)_(fwd|back|left|right)$/.test(name) || /^reload_(rifle|shotgun)$/.test(name)
  : /^polish_(attack|hit|death)$/.test(name);
const parts = [Buffer.from(bin)], viewMap = new Map(), accessorMap = new Map();
let length = bin.length;
const align = () => { const pad = (4-length%4)%4; if (pad) { parts.push(Buffer.alloc(pad)); length += pad; } };
function accessor(index) {
  if (accessorMap.has(index)) return accessorMap.get(index);
  const ac = structuredClone(authored.json.accessors[index]);
  if (ac.sparse || ac.bufferView === undefined) throw Error('Unsupported animation accessor');
  if (!viewMap.has(ac.bufferView)) {
    const v = authored.json.bufferViews[ac.bufferView];
    if (v.buffer !== 0 || v.extensions) throw Error('Unexpected source animation view');
    align();
    const data = authored.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0)+v.byteLength);
    const newIndex = json.bufferViews.length;
    json.bufferViews.push({ ...v, byteOffset: length, buffer: 0 });
    parts.push(data); length += data.length;
    viewMap.set(ac.bufferView, newIndex);
  }
  ac.bufferView = viewMap.get(ac.bufferView);
  const result = json.accessors.length; json.accessors.push(ac); accessorMap.set(index, result);
  return result;
}
const originalAnimationCount = json.animations?.length ?? 0;
json.animations ??= [];
const added = [];
for (const animation of authored.json.animations ?? []) {
  if (!wanted(animation.name)) continue;
  if (json.animations.some(a => a.name === animation.name)) throw Error('Use original GLB as input, not a previously appended file');
  const copy = structuredClone(animation);
  for (const channel of copy.channels) {
    const source = authored.json.nodes[channel.target.node];
    const target = names.get(source.name);
    if (!Number.isInteger(target)) throw Error(`Missing/ambiguous target ${source.name}`);
    channel.target.node = target;
  }
  for (const sampler of copy.samplers) {
    sampler.input = accessor(sampler.input); sampler.output = accessor(sampler.output);
  }
  json.animations.push(copy); added.push(copy.name);
}
if (added.length !== (kind === 's07' ? 14 : 3)) throw Error(`Wrong clip count: ${added}`);
align(); json.buffers[0].byteLength = length;
const jsonRaw = Buffer.from(JSON.stringify(json));
const jsonPadded = Buffer.concat([jsonRaw, Buffer.alloc((4-jsonRaw.length%4)%4, 0x20)]);
const header = Buffer.alloc(20); header.write('glTF'); header.writeUInt32LE(2, 4);
header.writeUInt32LE(28+jsonPadded.length+length, 8); header.writeUInt32LE(jsonPadded.length, 12); header.write('JSON', 16);
const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(length); binHeader.write('BIN\0', 4);
const output = Buffer.concat([header, jsonPadded, binHeader, ...parts]);
const outputDir = path.join(stage, 'optimized'); await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, `${runtimeName}.glb`), output);
const check = read(output);
if (!check.bin.subarray(0, bin.length).equals(bin)) throw Error('Original buffer mutated');
const report = { kind, originalSha256: createHash('sha256').update(original).digest('hex'),
  originalBytes: original.length, outputBytes: output.length, originalAnimationCount,
  originalBufferPreserved: true, added };
await fs.writeFile(path.join(outputDir, `${kind}-append-report.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
