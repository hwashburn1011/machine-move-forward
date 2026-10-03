import fs from 'node:fs';
import validator from 'gltf-validator';
const path='godot/art/roadside-outposts.glb';
const result=await validator.validateBytes(new Uint8Array(fs.readFileSync(path)),{uri:path,maxIssues:1000});
fs.writeFileSync('assets/roadside-outposts/gltf-validation.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.issues));
process.exitCode=result.issues.numErrors||result.issues.numWarnings?1:0;
