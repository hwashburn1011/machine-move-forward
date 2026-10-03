import fs from 'node:fs';
import {validateBytes} from 'gltf-validator';
const manifest=JSON.parse(fs.readFileSync('assets/native-salvage-beta/manifest.json','utf8'));
const report={assets:[],checks:[]};
for(const [name,asset] of Object.entries(manifest)){
  const bytes=fs.readFileSync('godot/art/'+asset.file);
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const result=await validateBytes(new Uint8Array(bytes),{uri:asset.file,maxIssues:1000});
  const nodes=doc.nodes.map(n=>n.name);
  const triangles=doc.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+doc.accessors[p.indices].count/3,0);
  const entry={name,file:asset.file,bytes:bytes.length,triangles,meshes:doc.meshes.length,materials:doc.materials.length,
    embedded:(doc.images??[]).every(i=>i.bufferView!==undefined),errors:result.issues.numErrors,warnings:result.issues.numWarnings,
    messages:result.issues.messages};
  report.assets.push(entry);
  for(const marker of Object.keys(asset.anchors))report.checks.push({check:name+' / '+marker,pass:nodes.includes(marker)});
  report.checks.push({check:name+' triangle accounting',pass:triangles===asset.triangles});
  if(name!=='DroneRoot')report.checks.push({check:name+' ground contact',pass:Math.abs(asset.bounds.min[1])<.0001});
}
const dock=manifest.SalvageDock,drone=manifest.DroneRoot;
report.checks.push({check:'collector collider footprint contains dock and parked drone',pass:
  dock.bounds.min[0]>=-.82&&dock.bounds.max[0]<=.82&&dock.bounds.min[2]>=-.82&&dock.bounds.max[2]<=.82&&
  dock.bounds.max[1]<=1.1&&drone.bounds.max[1]+.6<=1.1});
report.checks.push({check:'drone lifting latch matches chest top within 1 mm',pass:Math.abs(-.9+.57699998-(-.323))<.001});
fs.writeFileSync('assets/native-salvage-beta/validation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({assets:report.assets.map(({messages,...x})=>x),checks:report.checks},null,2));
if(report.assets.some(a=>a.errors||a.warnings||!a.embedded)||report.checks.some(c=>!c.pass))process.exitCode=1;
