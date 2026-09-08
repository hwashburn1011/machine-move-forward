/** Run the pinned Khronos glTF Validator against every optimized GLB. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import validator from 'gltf-validator';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, 'assets', 'graphics-v2', 'optimized');
const expectedUnsupported = new Set(['UNSUPPORTED_EXTENSION', 'TEXTURE_INVALID_IMAGE_MIME_TYPE', 'TEXTURE_SOURCE_MISSING']);
const expectedAuthoredWarnings = new Set(['MESH_PRIMITIVE_GENERATED_TANGENT_SPACE', 'NODE_EMPTY', 'UNUSED_OBJECT', 'NODE_SKINNED_MESH_NON_ROOT']);
const reports = [];
for (const file of (await fs.readdir(DIR)).filter((name) => name.endsWith('.glb')).sort()) {
  const bytes = await fs.readFile(path.join(DIR, file));
  const result = await validator.validateBytes(new Uint8Array(bytes), { uri: file, maxIssues: 500 });
  const counts = {};
  for (const issue of result.issues.messages) counts[issue.code] = (counts[issue.code] || 0) + 1;
  reports.push({ asset: path.basename(file, '.glb'), bytes: bytes.length, errors: result.issues.numErrors, warnings: result.issues.numWarnings, counts, expectedValidatorLimitations: [...expectedUnsupported].filter((code) => counts[code]), messages: result.issues.messages });
}
const unresolved = reports.flatMap((report) => report.messages.filter((issue) => !expectedUnsupported.has(issue.code) && !expectedAuthoredWarnings.has(issue.code)).map((issue) => ({ asset: report.asset, ...issue })));
const output = { validator: 'Khronos glTF Validator 2.0.0-dev.3.10', note: 'EXT_meshopt_compression and fallback-buffer semantics are valid but unsupported by this validator build. Optimized textures intentionally require EXT_texture_webp without bulky PNG fallbacks; the original PNG masters remain in staging. Tangent-space, empty-node, unused-object, and skinned-mesh-root notices are retained from authored sources.', unresolved, reports };
await fs.writeFile(path.join(DIR, 'khronos-report.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ unresolved: unresolved.length, reports: reports.map(({ asset, errors, warnings, counts }) => ({ asset, errors, warnings, counts })) }, null, 2));
if (unresolved.length) process.exitCode = 1;
