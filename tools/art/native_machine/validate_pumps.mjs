import {readFile,writeFile} from 'node:fs/promises';
import {validateBytes} from 'gltf-validator';
const results=[];
for (const name of ['nomad-service-pump','nomad-pumps-retained','nomad-pump-collision']) {
  const bytes=await readFile(`godot/art/${name}.glb`);
  const result=await validateBytes(new Uint8Array(bytes),{uri:`${name}.glb`,maxIssues:100});
  results.push({asset:name,bytes:bytes.length,errors:result.issues.numErrors,warnings:result.issues.numWarnings,messages:result.issues.messages});
}
await writeFile('assets/native-pumps/gltf-validation.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results));
if(results.some(r=>r.errors||r.warnings))process.exitCode=1;
