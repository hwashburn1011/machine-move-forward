import fs from 'node:fs';
import {validateBytes} from 'gltf-validator';
const file='godot/art/art100-legacy.glb';
const bytes=fs.readFileSync(file);
const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
const expected=JSON.parse(fs.readFileSync('assets/art100/legacy/manifest.json','utf8'));
const result=await validateBytes(new Uint8Array(bytes),{uri:file,maxIssues:1000});
const tris=doc.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+doc.accessors[p.indices].count/3,0);
const roots=doc.scenes[doc.scene||0].nodes.map(i=>doc.nodes[i]);
const report={models:expected.length,roots:roots.length,triangles:tris,bytes:bytes.length,materials:doc.materials.length,
 embedded:(doc.images||[]).every(x=>x.bufferView!==undefined),
 namesExact:expected.every(x=>roots.some(n=>n.name===x.id)),
 grounded:expected.every(x=>Math.abs(x.bounds_godot.min[1])<.0001),
 identityRoots:roots.every(n=>!n.matrix&&!n.rotation&&!n.scale&&!n.translation),
 accounting:tris===expected.reduce((n,x)=>n+x.triangles,0),
 errors:result.issues.numErrors,warnings:result.issues.numWarnings,messages:result.issues.messages};
fs.writeFileSync('assets/art100/legacy/validation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(report.errors||report.warnings||!report.embedded||!report.namesExact||!report.grounded||!report.identityRoots||!report.accounting)process.exitCode=1;
