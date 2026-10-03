import { readFile,writeFile } from 'node:fs/promises';
import { validateBytes } from 'gltf-validator';
const bytes=await readFile('godot/art/opening-rooftop.glb');
const result=await validateBytes(new Uint8Array(bytes),{uri:'opening-rooftop.glb',maxIssues:100});
const report={bytes:bytes.length,errors:result.issues.numErrors,warnings:result.issues.numWarnings,messages:result.issues.messages};
await writeFile('assets/native-rooftop/gltf-validation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(report.errors)process.exitCode=1;
