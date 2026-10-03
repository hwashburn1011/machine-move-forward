import fs from 'node:fs';
import { validateBytes } from 'gltf-validator';
const reports=[];
for (const kind of ['raider','scavenger']) {
  const bytes=fs.readFileSync(`godot/art/legacy-${kind}.glb`);
  const result=await validateBytes(new Uint8Array(bytes),{uri:`legacy-${kind}.glb`,maxIssues:100});
  reports.push({kind,bytes:bytes.length,errors:result.issues.numErrors,warnings:result.issues.numWarnings,messages:result.issues.messages});
}
fs.writeFileSync('assets/native-legacy-enemies/validation.json',JSON.stringify(reports,null,2));
console.log(JSON.stringify(reports.map(({messages,...summary})=>summary)));
if(reports.some(r=>r.errors||r.warnings))process.exitCode=1;
