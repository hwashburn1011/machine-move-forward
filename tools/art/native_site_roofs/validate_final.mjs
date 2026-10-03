import fs from 'node:fs';
import validator from 'gltf-validator';
const paths=['godot/assets/models/authored/relay-foundry.glb','godot/art/native-site-roofs.glb','godot/art/native-rooftop-workshop.glb','godot/assets/models/authored/glass-orchard.glb','godot/assets/models/authored/last-garden-meridian.glb'];
const reports=[];
for(const path of paths){const report=await validator.validateBytes(new Uint8Array(fs.readFileSync(path)),{uri:path,maxIssues:1000});reports.push({path,report});console.log(path,report.issues.numErrors,'errors',report.issues.numWarnings,'warnings');}
fs.writeFileSync('assets/native-site-roofs/final-gltf-validation.json',JSON.stringify(reports,null,2)+'\n');
process.exitCode=reports.some(r=>r.report.issues.numErrors||r.report.issues.numWarnings)?1:0;
