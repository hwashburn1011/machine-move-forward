import fs from 'node:fs';
import path from 'node:path';
import validator from 'gltf-validator';
const dir=path.resolve('assets/gunner-s07/exports');const result=[];
for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.glb'))){
 const bytes=fs.readFileSync(path.join(dir,file));const report=await validator.validateBytes(new Uint8Array(bytes),{uri:file,maxIssues:2000});
 result.push({file,errors:report.issues.numErrors,warnings:report.issues.numWarnings,infos:report.issues.numInfos,messages:report.issues.messages});
 console.log(file,JSON.stringify({errors:report.issues.numErrors,warnings:report.issues.numWarnings}));
}
fs.writeFileSync('assets/gunner-s07/source/gltf_validation.json',JSON.stringify(result,null,2));
if(result.some(r=>r.errors))process.exitCode=1;
