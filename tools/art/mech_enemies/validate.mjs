import fs from 'node:fs';
import path from 'node:path';
import validator from 'gltf-validator';
const result=[];
for(const folder of ['exports','optimized'])for(const file of fs.readdirSync('assets/mech-enemies/'+folder).filter(f=>f.endsWith('.glb'))){
 const report=await validator.validateBytes(new Uint8Array(fs.readFileSync(path.join('assets/mech-enemies',folder,file))),{uri:file,maxIssues:1000});
 result.push({folder,file,errors:report.issues.numErrors,warnings:report.issues.numWarnings,infos:report.issues.numInfos,messages:report.issues.messages});
 console.log(folder,file,report.issues.numErrors,report.issues.numWarnings);
}
fs.writeFileSync('assets/mech-enemies/source/gltf_validation.json',JSON.stringify(result,null,2));
if(result.some(r=>r.errors))process.exitCode=1;
