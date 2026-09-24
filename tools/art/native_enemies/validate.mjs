import fs from 'node:fs';
import { validateBytes } from 'gltf-validator';
const bytes=fs.readFileSync('godot/art/sovereign-drone.glb');
const result=await validateBytes(new Uint8Array(bytes),{uri:'sovereign-drone.glb',maxIssues:100});
const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
const report={bytes:bytes.length,errors:result.issues.numErrors,warnings:result.issues.numWarnings,messages:result.issues.messages,triangles:doc.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+doc.accessors[p.indices].count/3,0),meshes:doc.meshes.length,materials:doc.materials.length,embedded:doc.images.every(i=>i.bufferView!==undefined)};
fs.writeFileSync('assets/native-drone/validation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));if(report.errors||report.warnings||!report.embedded)process.exitCode=1;
