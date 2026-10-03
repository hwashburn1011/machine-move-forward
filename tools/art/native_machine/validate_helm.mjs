import {readFile,writeFile} from 'node:fs/promises';
import {validateBytes} from 'gltf-validator';
const bytes=await readFile('godot/art/nomad-helm.glb');
const result=await validateBytes(new Uint8Array(bytes),{uri:'nomad-helm.glb',maxIssues:100});
const report={bytes:bytes.length,errors:result.issues.numErrors,warnings:result.issues.numWarnings,messages:result.issues.messages};
await writeFile('assets/native-helm/gltf-validation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(report.errors||report.warnings)process.exitCode=1;
