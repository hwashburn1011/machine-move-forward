import { readFile, writeFile } from 'node:fs/promises';
import { validateBytes } from 'gltf-validator';
import { Matrix4, Quaternion, Vector3, Box3 } from 'three';
const asset = 'nomad-progress';
const bounds = JSON.parse(await readFile('assets/progression/bounds.json', 'utf8'));
const bytes = await readFile(`public/models/authored/${asset}.glb`);
const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
const validation = await validateBytes(new Uint8Array(bytes), {
  uri: `${asset}.glb`,
  maxIssues: 100,
});
const geometry = {};
const seen = new Set();
for (const [name, expected] of Object.entries(bounds)) {
  const matches = gltf.nodes.flatMap((n, i) => (n.name === name ? [i] : []));
  if (matches.length !== 1) throw new Error(`Missing or duplicate root ${name}`);
  const box = new Box3();
  let triangles = 0,
    meshes = 0;
  const visit = (index, parent) => {
    const n = gltf.nodes[index];
    const matrix = n.matrix
      ? new Matrix4().fromArray(n.matrix)
      : new Matrix4().compose(
          new Vector3().fromArray(n.translation ?? [0, 0, 0]),
          new Quaternion().fromArray(n.rotation ?? [0, 0, 0, 1]),
          new Vector3().fromArray(n.scale ?? [1, 1, 1]),
        );
    matrix.premultiply(parent);
    if (n.mesh !== undefined) {
      meshes++;
      seen.add(index);
    }
    for (const p of gltf.meshes?.[n.mesh]?.primitives ?? []) {
      const a = gltf.accessors[p.attributes.POSITION];
      triangles += (gltf.accessors[p.indices]?.count ?? a.count) / 3;
      for (const x of [a.min[0], a.max[0]])
        for (const y of [a.min[1], a.max[1]])
          for (const z of [a.min[2], a.max[2]])
            box.expandByPoint(new Vector3(x, y, z).applyMatrix4(matrix));
    }
    for (const child of n.children ?? []) visit(child, matrix);
  };
  visit(matches[0], new Matrix4());
  const min = box.min.toArray(),
    max = box.max.toArray();
  if ([...min, ...max].some((v) => !Number.isFinite(v)))
    throw new Error(`Invalid geometry ${name}`);
  if (
    min.some((v, i) => Math.abs(v - expected.min[i]) > 0.002) ||
    max.some((v, i) => Math.abs(v - expected.max[i]) > 0.002)
  )
    throw new Error(`Source/runtime bounds differ for ${name}`);
  const limits = name.startsWith('Preservation')
    ? [
        [-0.23, 0, -0.15],
        [0.23, 0.31, 0.15],
      ]
    : /Needle|Face/.test(name)
      ? [
          [-0.15, -0.03, -0.15],
          [0.15, 0.03, 0.15],
        ]
      : [
          [-0.57, 0, -0.375],
          [0.57, 1.36, 0.375],
        ];
  if (min.some((v, i) => v < limits[0][i] - 0.002) || max.some((v, i) => v > limits[1][i] + 0.002))
    throw new Error(`Envelope exceeded: ${name}`);
  geometry[name] = { min, max, triangles, meshes };
}
if (gltf.nodes.some((n, i) => n.mesh !== undefined && !seen.has(i)))
  throw new Error('Unowned mesh in export');
const totalTriangles = Object.values(geometry).reduce((sum, v) => sum + v.triangles, 0);
if (totalTriangles > 32000 || bytes.length > 3 * 1024 * 1024)
  throw new Error('Progression art budget exceeded');
const report = {
  name: asset,
  bytes: bytes.length,
  totalTriangles,
  geometry,
  errors: validation.issues.numErrors,
  warnings: validation.issues.numWarnings,
  messages: validation.issues.messages,
};
await writeFile('assets/progression/gltf-validation.json', JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    bytes: report.bytes,
    triangles: totalTriangles,
    errors: report.errors,
    warnings: report.warnings,
  }),
);
if (report.errors || report.warnings) process.exitCode = 1;
