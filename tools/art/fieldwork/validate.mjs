import { readFile, writeFile } from 'node:fs/promises';
import { validateBytes } from 'gltf-validator';
const report=[];
for(const name of ['fieldwork-kit']){
 const bytes=await readFile('public/models/authored/'+name+'.glb');
 const validation=await validateBytes(new Uint8Array(bytes),{uri:name+'.glb',maxIssues:100});
 report.push({name,bytes:bytes.length,errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,infos:validation.issues.numInfos,messages:validation.issues.messages});
}
await writeFile('assets/fieldwork/gltf-validation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report.map(({messages,...x})=>x),null,2));
if(report.some(r=>r.errors))process.exitCode=1;
