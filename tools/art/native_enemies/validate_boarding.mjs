import fs from 'node:fs';
import { validateBytes } from 'gltf-validator';
const bytes=fs.readFileSync('godot/art/boarding-hardware.glb');
const result=await validateBytes(new Uint8Array(bytes),{uri:'boarding-hardware.glb',maxIssues:100});
const report={bytes:bytes.length,errors:result.issues.numErrors,warnings:result.issues.numWarnings,messages:result.issues.messages};
fs.writeFileSync('assets/native-boarding/validation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));if(report.errors||report.warnings)process.exitCode=1;
