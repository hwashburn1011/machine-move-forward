import fs from 'node:fs';
import validator from 'gltf-validator';
const path='godot/art/native-site-grounding.glb';
const report=await validator.validateBytes(new Uint8Array(fs.readFileSync(path)),{uri:path,maxIssues:1000});
fs.writeFileSync('assets/site-grounding/gltf-validation.json',JSON.stringify(report,null,2)+'\n');
console.log(report.issues.numErrors,'errors',report.issues.numWarnings,'warnings');
process.exitCode=report.issues.numErrors||report.issues.numWarnings?1:0;
