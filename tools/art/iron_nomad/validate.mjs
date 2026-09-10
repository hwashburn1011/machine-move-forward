import fs from 'node:fs';
import path from 'node:path';
import validator from 'gltf-validator';
const base = path.resolve('assets/iron-nomad');
const results = [];
const statsPath = path.join(base, 'source/export-manifest.json');
const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
for (const folder of ['exports', 'optimized']) {
  for (const name of fs.readdirSync(path.join(base, folder)).filter(n => n.endsWith('.glb'))) {
    const bytes = fs.readFileSync(path.join(base, folder, name));
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    const report = await validator.validateBytes(new Uint8Array(bytes), { uri: name, maxIssues: 2000 });
    const nodes = json.nodes || [], names = new Set(nodes.map(n => n.name));
    const collider = name.includes('colliders');
    if (folder === 'exports' && !collider) {
      const variant = name.includes('-full') ? 'full' : 'game';
      const triangles = json.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((n, p) => n + json.accessors[p.indices ?? p.attributes.POSITION].count / 3, 0), 0);
      stats[variant].sourceTriangles ??= stats[variant].triangles;
      stats[variant].triangles = triangles;
    }
    const assertions = {
      singleScene: json.scenes.length === 1,
      expectedAssembly: collider ? nodes.filter(n => n.mesh !== undefined).length === 46 : ['FrontLeft','FrontRight','RearLeft','RearRight'].every(id => ['Hip','Upper','Lower','Foot'].every(part => names.has(`Leg_${id}_${part}`))),
      expectedAnimation: collider ? !json.animations?.length : json.animations?.length === 1 && json.animations[0].name === 'Walker_Walk',
      finiteTransforms: nodes.every(n => ['translation','rotation','scale','matrix'].every(k => !n[k] || n[k].every(Number.isFinite))),
      portableSources: !json.images?.some(i => i.uri) && !json.buffers?.some(b => b.uri),
    };
    const result = { file: `${folder}/${name}`, bytes: bytes.length, errors: report.issues.numErrors, warnings: report.issues.numWarnings, assertions, messages: report.issues.messages };
    results.push(result);
    console.log(result.file, JSON.stringify({ errors: result.errors, warnings: result.warnings, assertions }));
  }
}
fs.writeFileSync(path.join(base, 'source/gltf-validation.json'), JSON.stringify(results, null, 2));
fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
if (results.some(r => r.errors || r.warnings || Object.values(r.assertions).some(v => !v))) process.exitCode = 1;
