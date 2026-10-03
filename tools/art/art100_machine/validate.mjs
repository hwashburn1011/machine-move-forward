import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import validator from 'gltf-validator';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const folder=path.join(root,'assets/art100/machine');
const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json')));
const glb=fs.readFileSync(path.join(root,'godot/art/art100-machine.glb'));
const result=await validator.validateBytes(new Uint8Array(glb),{uri:'art100-machine.glb',maxIssues:200});
const errors=[];
function check(ok,label){if(!ok)errors.push(label);}
check(Object.keys(manifest).length===25,'Exactly 25 complete assemblies');
const jsonLength=glb.readUInt32LE(12);
const document=JSON.parse(glb.subarray(20,20+jsonLength).toString());
const names=new Set(document.nodes.map(n=>n.name));
for(const [id,piece] of Object.entries(manifest)){
  check(names.has(id),`GLB named root ${id}`);
  check(piece.bounds.material_batches<=8,`Material budget ${id}`);
  check(piece.bounds.triangles<=13000,`Triangle budget ${id}`);
  check(Math.abs(piece.bounds.min[1])<0.007,`Ground contact ${id}`);
  check(piece.bounds.min[0]>=-1&&piece.bounds.max[0]<=1&&piece.bounds.min[2]>=-1&&piece.bounds.max[2]<=1,`Single tile footprint ${id}`);
  check(piece.colliders.length>0,`Has solid collision ${id}`);
  for(const shape of piece.colliders){
    check(Object.values(shape.half).every(n=>Number.isFinite(n)&&n>0),`Finite positive compound collider ${id}`);
    check(shape.offset.y-shape.half.y>=-.007,`Collision above deck ${id}`);
  }
}
check(result.issues.numErrors===0,'glTF has no schema/geometry errors');
check(result.issues.numWarnings===0,'glTF has no interoperability warnings');
const summary={assemblies:Object.keys(manifest).length,total_triangles:Object.values(manifest).reduce((s,p)=>s+p.bounds.triangles,0),
  bytes:glb.length,validation_errors:errors,gltf:result};
fs.writeFileSync(path.join(folder,'validation.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({assemblies:summary.assemblies,triangles:summary.total_triangles,bytes:summary.bytes,
  gltf_errors:result.issues.numErrors,gltf_warnings:result.issues.numWarnings,failures:errors},null,2));
if(errors.length)process.exitCode=1;
