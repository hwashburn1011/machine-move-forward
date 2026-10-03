import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import validator from 'gltf-validator';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out=path.join(root,'assets/art100/story-robots');
const manifest=JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8'));
const bytes=new Uint8Array(await fs.readFile(path.join(root,'godot/art/art100-story-robots.glb')));
const result=await validator.validateBytes(bytes,{maxIssues:200,ignoredIssues:['UNUSED_OBJECT']});
const ids=manifest.models.map(x=>x.id);
const failures=[];
if (ids.length!==25||new Set(ids).size!==25) failures.push('Exactly 25 unique assembled model IDs required.');
if (manifest.models.filter(x=>x.status==='new').length!==19) failures.push('19 complete new story assemblies required.');
if (manifest.models.filter(x=>x.status==='refined').length!==6) failures.push('Six complete refined enemy assemblies required.');
for (const entry of manifest.models) {
 if (!(entry.triangles>1000&&entry.triangles<30000)) failures.push(entry.id+': unexpected authored geometry budget.');
 if (entry.status==='new'&&Math.abs(entry.bounds_min[1])>.015) failures.push(entry.id+': floor origin is not grounded.');
 if (!entry.materials.length||!entry.runtime_meshes) failures.push(entry.id+': missing materials/geometry.');
}
if(result.issues.numErrors)failures.push(`glTF validator errors: ${result.issues.numErrors}`);
const report={modelCount:ids.length,new:19,refined:6,bytes:bytes.length,triangles:manifest.models.reduce((s,e)=>s+e.triangles,0),gltf:result.issues,failures};
await fs.writeFile(path.join(out,'validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
process.exitCode=failures.length?1:0;
