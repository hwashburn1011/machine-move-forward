import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import validator from 'gltf-validator';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const out=path.join(root,'assets/art100/story-robots/native-assemblies');
const characters=[];
for(const kind of ['warden','revenant','bastion','sovereign','raider','scavenger']){
 const bytes=new Uint8Array(await fs.readFile(path.join(out,kind+'.glb')));
 const result=await validator.validateBytes(bytes,{maxIssues:100,ignoredIssues:['UNUSED_OBJECT']});
 const json=JSON.parse(new TextDecoder().decode(bytes.slice(20,20+new DataView(bytes.buffer).getUint32(12,true))));
 characters.push({kind,bytes:bytes.length,skin_joints:json.skins.reduce((n,s)=>n+s.joints.length,0),errors:result.issues.numErrors,warnings:result.issues.numWarnings,messages:result.issues.messages.filter(m=>m.severity<=1)});
}
await fs.writeFile(path.join(out,'gltf-validation.json'),JSON.stringify({characters},null,2)+'\n');
console.log(JSON.stringify(characters,null,2));process.exitCode=characters.some(c=>c.errors||!c.skin_joints)?1:0;
