import {readFile,writeFile} from 'node:fs/promises';
import {validateBytes} from 'gltf-validator';
const reports=[];
for(const file of ['nomad-receiver.glb','nomad-receiver-rewards.glb']){
 const bytes=await readFile('godot/art/'+file);
 const result=await validateBytes(new Uint8Array(bytes),{uri:file,maxIssues:100});
 const report={file,bytes:bytes.length,errors:result.issues.numErrors,warnings:result.issues.numWarnings,messages:result.issues.messages};
 reports.push(report);console.log(JSON.stringify({file,errors:report.errors,warnings:report.warnings}));if(report.errors||report.warnings)process.exitCode=1;
}
await writeFile('assets/native-receiver/gltf-validation.json',JSON.stringify(reports,null,2)+'\n');
