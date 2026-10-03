import fs from 'node:fs';
import {validateBytes} from 'gltf-validator';
const path='godot/art/art200-signs.glb',data=fs.readFileSync(path);
const doc=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());
const manifest=JSON.parse(fs.readFileSync('assets/art200/signs/manifest.json','utf8'));
const validation=await validateBytes(new Uint8Array(data),{uri:path,maxIssues:1000});
const roots=doc.scenes[doc.scene??0].nodes.map(i=>doc.nodes[i]);
const triangles=doc.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+doc.accessors[p.indices].count/3,0);
const report={models:manifest.models.length,roots:roots.length,triangles,bytes:data.length,
  namesExact:manifest.models.every(m=>roots.some(n=>n.name===m.id)),
  grounded:manifest.models.every(m=>Math.abs(m.bounds_godot.min[1])<.0001),
  identityRoots:roots.every(n=>!n.matrix&&!n.rotation&&!n.translation&&!n.scale),
  paletteFamilies:manifest.palette_families.length,
  maxTriangles:Math.max(...manifest.models.map(m=>m.triangles)),
  accounting:triangles===manifest.triangles,
  embedded:doc.images.every(im=>im.bufferView!==undefined),
  errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,messages:validation.issues.messages};
fs.writeFileSync('assets/art200/signs/validation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,messages:report.messages.length}));
if(report.models!==25||!report.namesExact||!report.grounded||!report.identityRoots||!report.accounting||report.errors||report.warnings)process.exitCode=1;
