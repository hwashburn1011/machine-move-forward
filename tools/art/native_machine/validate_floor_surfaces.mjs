import fs from 'node:fs';
import validator from 'gltf-validator';

const path='godot/art/nomad-access.glb';
const result=await validator.validateBytes(new Uint8Array(fs.readFileSync(path)),{uri:path,maxIssues:1000});
fs.writeFileSync('test-results/roof-floor/access-gltf-validation.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({errors:result.issues.numErrors,warnings:result.issues.numWarnings,infos:result.issues.numInfos}));
process.exitCode=result.issues.numErrors||result.issues.numWarnings?1:0;
