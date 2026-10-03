import fs from 'node:fs';
import assert from 'node:assert/strict';
import {validateBytes} from 'gltf-validator';
const base='assets/art100/wasteland/';
const manifest=JSON.parse(fs.readFileSync(base+'manifest.json','utf8'));
const bytes=fs.readFileSync('godot/art/art100-wasteland.glb');
const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
const result=await validateBytes(new Uint8Array(bytes),{uri:'art100-wasteland.glb',maxIssues:5000});
const triangles=doc.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+doc.accessors[p.indices].count/3,0);
assert.equal(doc.meshes.length,25);
assert.equal(doc.scenes[0].nodes.length,25);
assert.equal(new Set(manifest.models.map(m=>m.id)).size,25);
assert.deepEqual(new Set(doc.nodes.map(n=>n.name)),new Set(manifest.models.map(m=>m.id)));
assert.ok(doc.nodes.every(n=>!['translation','rotation','scale','matrix','children'].some(k=>k in n)));
for(const node of doc.nodes){
 const entry=manifest.models.find(e=>e.id===node.name),mesh=doc.meshes[node.mesh];
 const positions=mesh.primitives.map(p=>doc.accessors[p.attributes.POSITION]);
 for(let axis=0;axis<3;axis++){
  assert.ok(Math.abs(Math.min(...positions.map(p=>p.min[axis]))-entry.bounds_godot.min[axis])<1e-4);
  assert.ok(Math.abs(Math.max(...positions.map(p=>p.max[axis]))-entry.bounds_godot.max[axis])<1e-4);
 }
 assert.equal(mesh.primitives.length,entry.materials.length);
}
assert.ok(doc.images.every(i=>i.bufferView!==undefined));
assert.equal(triangles,manifest.totalTriangles);
assert.ok(manifest.models.every(m=>Math.abs(m.ground_min_m)<1e-6));
assert.ok(manifest.models.every(m=>m.triangles>100&&m.triangles<=22000));
assert.ok(manifest.totalTriangles<=245000);
assert.ok(manifest.models.every(m=>m.materials.length<=6));
assert.ok(manifest.models.every(m=>m.diagnostics.zero_area_faces===0&&m.diagnostics.loose_vertices===0));
assert.ok(manifest.models.filter(m=>m.status==='new').every(m=>m.diagnostics.boundary_edges===0&&m.diagnostics.nonmanifold_edges===0));
assert.equal(manifest.models.filter(m=>m.status==='new').length,15);
assert.equal(manifest.models.filter(m=>m.status==='refined').length,10);
const report={models:25,triangles,bytes:bytes.length,materials:doc.materials.length,embeddedImages:doc.images.length,
 identityRoots:true,grounded:true,errors:result.issues.numErrors,warnings:result.issues.numWarnings,messages:result.issues.messages};
fs.writeFileSync(base+'validation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,messages:report.messages.filter(m=>m.severity<2).slice(0,12)},null,2));
assert.equal(result.issues.numErrors,0);
