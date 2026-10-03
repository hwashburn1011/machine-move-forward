import fs from 'node:fs';
import { validateBytes } from 'gltf-validator';
const bytes=fs.readFileSync('godot/art/raider-craft.glb');
const result=await validateBytes(new Uint8Array(bytes),{uri:'raider-craft.glb',maxIssues:100});
const report={bytes:bytes.length,errors:result.issues.numErrors,warnings:result.issues.numWarnings,messages:result.issues.messages};
fs.writeFileSync('assets/native-raiders/validation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({bytes:report.bytes,errors:report.errors,warnings:report.warnings}));if(report.errors||report.warnings)process.exitCode=1;
