import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import validator from 'gltf-validator';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out=path.join(root,'assets/art200/story');
const manifest=JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8'));
const bytes=new Uint8Array(await fs.readFile(path.join(root,'godot/art/art200-story.glb')));
const result=await validator.validateBytes(bytes,{maxIssues:200,ignoredIssues:['UNUSED_OBJECT']});
const ids=manifest.models.map(x=>x.id),failures=[];
if(ids.length!==25||new Set(ids).size!==25||manifest.models.some(x=>x.status!=='new'))failures.push('Exactly 25 unique new assembled models required.');
if(new Set(manifest.models.map(x=>x.paint_family)).size<8)failures.push('At least 8 muted paint families required.');
for(const e of manifest.models){
 if(!(e.triangles>1000&&e.triangles<45000))failures.push(e.id+': unexpected assembled triangle budget.');
 if(Math.abs(e.bounds_min[1])>.015)failures.push(e.id+': grounded floor origin required.');
 if(!e.materials.length||!e.runtime_meshes||!e.collision_shapes.length)failures.push(e.id+': missing runtime or physical metadata.');
}
if(result.issues.numErrors)failures.push(`glTF validator errors: ${result.issues.numErrors}`);
const report={modelCount:ids.length,new:25,bytes:bytes.length,triangles:manifest.models.reduce((s,e)=>s+e.triangles,0),paintFamilies:[...new Set(manifest.models.map(x=>x.paint_family))],gltf:result.issues,failures};
await fs.writeFile(path.join(out,'validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));process.exitCode=failures.length?1:0;
