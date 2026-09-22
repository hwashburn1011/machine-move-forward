import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import validator from 'gltf-validator';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const models = JSON.parse(
  await fs.readFile('assets/desert-ruins/source/model-report.json', 'utf8'),
);
const file = 'public/models/props/ruins/desert-ruins.glb';
const bytes = await fs.readFile(file);
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
const binary = bytes.subarray(28 + jsonLength);
const names = new Set(gltf.nodes.map((n) => n.name));
const assertions = {
  exactly50: models.length === 50 && new Set(models.map((m) => m.name)).size === 50,
  fourteenRefined: models.filter((m) => m.status === 'refined').length === 14,
  thirtySixNew: models.filter((m) => m.status === 'new').length === 36,
  completeLods: models.every((m) => names.has(m.name) && names.has(m.name + '__lod')),
  sharedAtlas: gltf.materials.length === 1 && gltf.images.length === 3,
  finiteTransforms: gltf.nodes.every((n) =>
    ['translation', 'rotation', 'scale', 'matrix'].every(
      (k) => !n[k] || n[k].every(Number.isFinite),
    ),
  ),
  singleMaterialMeshes: gltf.meshes.every(
    (m) =>
      m.primitives.length === 1 &&
      m.primitives[0].attributes.NORMAL !== undefined &&
      m.primitives[0].attributes.TEXCOORD_0 !== undefined,
  ),
};
// Validate actual decoded accessors, not just placeholder meshopt fallbacks.
let decodedViews = 0;
for (const view of gltf.bufferViews) {
  const compression = view.extensions?.EXT_meshopt_compression;
  if (!compression) continue;
  const decoded = new Uint8Array(compression.count * compression.byteStride);
  MeshoptDecoder.decodeGltfBuffer(
    decoded,
    compression.count,
    compression.byteStride,
    binary.subarray(compression.byteOffset, compression.byteOffset + compression.byteLength),
    compression.mode,
  );
  for (const accessor of gltf.accessors.filter((a) => gltf.bufferViews[a.bufferView] === view)) {
    if (accessor.componentType === 5126) {
      const values = new Float32Array(decoded.buffer);
      if (!values.every(Number.isFinite)) throw new Error('Non-finite decoded geometry');
    }
  }
  decodedViews++;
}
const validation = await validator.validateBytes(bytes, { uri: file, maxIssues: 1000 });
// Three uses derivative tangent space for this established atlas pipeline.
// It is a portability advisory, not damaged geometry or a missing resource.
const unexpected = validation.issues.messages.filter(
  (m) => m.severity <= 1 && m.code !== 'MESH_PRIMITIVE_GENERATED_TANGENT_SPACE',
);
const report = {
  file,
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  assertions,
  decodedViews,
  errors: validation.issues.numErrors,
  tangentPortabilityAdvisories: validation.issues.messages.filter(
    (m) => m.code === 'MESH_PRIMITIVE_GENERATED_TANGENT_SPACE',
  ).length,
  unexpected,
  models,
};
await fs.writeFile(
  'assets/desert-ruins/source/refinement-50-validation.json',
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ ...report, models: undefined }));
if (unexpected.length || Object.values(assertions).includes(false)) process.exitCode = 1;
