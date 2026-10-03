import fs from 'node:fs';
import crypto from 'node:crypto';
import {validateBytes} from 'gltf-validator';
const rows=[];
for(const key of ['art100-legacy','art100-wasteland','art100-machine','art100-story-robots','art200-signs','art200-wasteland','art200-machine','art200-story']) {
  const path=`godot/art/${key}.glb`, bytes=fs.readFileSync(path);
  const document=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const result=await validateBytes(new Uint8Array(bytes),{uri:path,maxIssues:2000});
  const row={path,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,
    roots:document.scenes[document.scene??0].nodes.length,
    triangles:document.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+(p.indices===undefined?document.accessors[p.attributes.POSITION].count:document.accessors[p.indices].count)/3,0),
    embeddedImages:(document.images??[]).every(i=>i.bufferView!==undefined),
    errors:result.issues.numErrors,warnings:result.issues.numWarnings,information:result.issues.numInfos,
    diagnostics:result.issues.messages.filter(m=>m.severity<2)};
  rows.push(row);console.log(JSON.stringify(row));
}
fs.writeFileSync('assets/art200/validation.json',JSON.stringify({packs:rows,passed:rows.every(r=>r.errors===0&&r.warnings===0&&r.roots===25&&r.embeddedImages)},null,2)+'\n');
if(rows.some(r=>r.errors||r.warnings||r.roots!==25||!r.embeddedImages))process.exitCode=1;
