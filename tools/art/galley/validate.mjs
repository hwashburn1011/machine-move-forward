import { readFile, writeFile } from 'node:fs/promises';
import { validateBytes } from 'gltf-validator';
import { Matrix4, Quaternion, Vector3 } from 'three';

const MODEL = 'galley-kit';
const ROOTS = ['GalleyStove', 'GalleyCondenser', 'GalleyPlanter'];
const CELL = 2;
const EPS = 0.002;
const IDENTITY = new Matrix4();

function multiply(a, b) {
  return new Matrix4().multiplyMatrices(a, b);
}
function transform(m, p) {
  return new Vector3().fromArray(p).applyMatrix4(m).toArray();
}
function nodeMatrix(node) {
  if (Array.isArray(node.matrix)) return new Matrix4().fromArray(node.matrix);
  return new Matrix4().compose(
    new Vector3().fromArray(node.translation ?? [0, 0, 0]),
    new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
    new Vector3().fromArray(node.scale ?? [1, 1, 1]),
  );
}
function corners(min, max) {
  return [min[0], max[0]].flatMap((x) =>
    [min[1], max[1]].flatMap((y) => [min[2], max[2]].map((z) => [x, y, z])),
  );
}
function inspectGeometry(gltf) {
  const nodes = gltf.nodes ?? [];
  const result = {};
  const visitedMeshes = new Set();
  for (const name of ROOTS) {
    const matches = nodes.flatMap((node, index) => (node.name === name ? [index] : []));
    if (matches.length !== 1)
      throw new Error(`${name}: expected one named root, found ${matches.length}`);
    const root = nodes[matches[0]];
    if (new Vector3().setFromMatrixPosition(nodeMatrix(root)).length() > EPS)
      throw new Error(`${name}: root is not at local origin`);
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    let triangles = 0;
    const visit = (index, parent) => {
      const node = nodes[index];
      const matrix = multiply(parent, nodeMatrix(node));
      const mesh = gltf.meshes?.[node.mesh];
      if (mesh) {
        if (visitedMeshes.has(index)) throw new Error('Mesh shared across two station roots');
        visitedMeshes.add(index);
      }
      for (const primitive of mesh?.primitives ?? []) {
        const accessor = gltf.accessors?.[primitive.attributes?.POSITION];
        if (!accessor?.min || !accessor?.max) throw new Error(`${name}: POSITION bounds missing`);
        if ((primitive.mode ?? 4) !== 4) throw new Error('Expected triangle primitives');
        triangles += Math.floor(
          (gltf.accessors?.[primitive.indices]?.count ?? accessor.count ?? 0) / 3,
        );
        for (const point of corners(accessor.min, accessor.max)) {
          const value = transform(matrix, point);
          for (let axis = 0; axis < 3; axis++) {
            min[axis] = Math.min(min[axis], value[axis]);
            max[axis] = Math.max(max[axis], value[axis]);
          }
        }
      }
      for (const child of node.children ?? []) visit(child, matrix);
    };
    visit(matches[0], IDENTITY);
    result[name] = { min, max, triangles, width: max[0] - min[0], depth: max[2] - min[2] };
  }
  if (nodes.some((node, index) => node.mesh !== undefined && !visitedMeshes.has(index)))
    throw new Error('Export contains geometry outside the three station roots');
  return result;
}

const bytes = await readFile(`public/models/authored/${MODEL}.glb`);
const validation = await validateBytes(new Uint8Array(bytes), {
  uri: `${MODEL}.glb`,
  maxIssues: 100,
});
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const jsonLength = view.getUint32(12, true);
const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trim());
const expected = JSON.parse(await readFile('assets/galley/bounds.json', 'utf8'));
const measured = inspectGeometry(gltf);
const geometry = {};
for (const name of ROOTS) {
  const actual = measured[name],
    reference = expected[name],
    errors = [];
  if (!reference) errors.push('missing Blender bounds reference');
  else
    for (let axis = 0; axis < 3; axis++)
      if (
        Math.abs(actual.min[axis] - reference.min[axis]) > EPS ||
        Math.abs(actual.max[axis] - reference.max[axis]) > EPS
      )
        errors.push('GLB bounds differ from bounds.json');
  if (
    [0, 2].some((axis) => actual.min[axis] < -CELL / 2 - EPS || actual.max[axis] > CELL / 2 + EPS)
  )
    errors.push('footprint exceeds 2m cell');
  if (actual.triangles > 16000) errors.push('root exceeds 16k triangle budget');
  geometry[name] = { ...actual, reference, errors };
}
const totalTriangles = Object.values(geometry).reduce((sum, item) => sum + item.triangles, 0);
if (totalTriangles > 40000)
  throw new Error(`whole kit exceeds 40k triangle budget (${totalTriangles})`);
if (Object.values(geometry).some((item) => item.errors.length))
  throw new Error(JSON.stringify(geometry, null, 2));
const report = {
  name: MODEL,
  bytes: bytes.length,
  errors: validation.issues.numErrors,
  warnings: validation.issues.numWarnings,
  infos: validation.issues.numInfos,
  geometry: { roots: geometry, totalTriangles },
  messages: validation.issues.messages,
};
await writeFile('assets/galley/gltf-validation.json', JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    { name: MODEL, bytes: bytes.length, errors: report.errors, totalTriangles, roots: geometry },
    null,
    2,
  ),
);
if (report.errors) process.exitCode = 1;
