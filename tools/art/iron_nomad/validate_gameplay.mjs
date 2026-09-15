import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import validator from 'gltf-validator';

// Validate the actual playable derivative, including the files shipped by Vite.
const files = [
  'assets/iron-nomad/gameplay/optimized/iron-nomad-full.glb',
  'assets/iron-nomad/gameplay/optimized/iron-nomad-game.glb',
  'public/models/authored/iron-nomad-playable.glb',
  'public/models/authored/iron-nomad-collision.glb',
];
const results = [];
for (const file of files) {
  const bytes = await readFile(file);
  const document = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  const report = await validator.validateBytes(bytes, { uri: file, maxIssues: 2000 });
  const collision = file.includes('collision');
  const names = new Set(document.nodes.map((node) => node.name));
  const assertions = {
    oneScene: document.scenes.length === 1,
    finiteTransforms: document.nodes.every((node) =>
      ['translation', 'rotation', 'scale', 'matrix'].every(
        (key) => !node[key] || node[key].every(Number.isFinite),
      ),
    ),
    embeddedResources:
      !document.images?.some((image) => image.uri) &&
      !document.buffers?.some((buffer) => buffer.uri),
    assembly: collision
      ? document.meshes.length === 1
      : ['FrontLeft', 'FrontRight', 'RearLeft', 'RearRight'].every((id) =>
          ['Hip', 'Upper', 'Lower', 'Foot'].every((part) => names.has(`Leg_${id}_${part}`)),
        ),
    animation: collision
      ? !document.animations?.length
      : document.animations?.some((clip) => clip.name === 'Walker_Walk'),
  };
  const result = {
    file,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    errors: report.issues.numErrors,
    warnings: report.issues.numWarnings,
    assertions,
    messages: report.issues.messages,
  };
  results.push(result);
  console.log(JSON.stringify({ ...result, messages: undefined }));
}
const out = 'assets/iron-nomad/gameplay/source';
await mkdir(out, { recursive: true });
await writeFile(`${out}/continuity-gltf-validation.json`, JSON.stringify(results, null, 2));
if (
  results.some(
    (result) =>
      result.errors || result.warnings || Object.values(result.assertions).some((ok) => !ok),
  )
)
  process.exitCode = 1;
