/** Validate animation-only promotion against the preserved baseline. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateBytes } from 'gltf-validator';

const baseline = process.env.MMF_ORIGINAL_ROOT;
if (!baseline) throw Error('Set MMF_ORIGINAL_ROOT to the original checkout');
function unpack(b) {
  const n=b.readUInt32LE(12); return {json:JSON.parse(b.toString('utf8',20,20+n)),bin:b.subarray(28+n)};
}
const reports=[];
for(const name of ['s07-player','bastion','warden','revenant','sovereign']) {
  const bytes=await fs.readFile(`assets/animation-polish/optimized/${name}.glb`);
  const original=await fs.readFile(path.join(baseline,`public/models/authored/${name}.glb`));
  const a=unpack(original),b=unpack(bytes);
  for(const key of ['nodes','meshes','materials','skins','textures','images'])
    if(JSON.stringify(a.json[key])!==JSON.stringify(b.json[key]))throw Error(`${name}: changed ${key}`);
  if(!a.bin.equals(b.bin.subarray(0,a.bin.length)))throw Error(`${name}: changed original buffer`);
  if(JSON.stringify(a.json.animations)!==JSON.stringify(b.json.animations.slice(0,a.json.animations.length)))throw Error(`${name}: changed original clips`);
  const validation=await validateBytes(new Uint8Array(bytes),{maxIssues:100});
  if(validation.issues.numErrors)throw Error(`${name}: glTF errors`);
  const socket=name==='s07-player'?'WeaponSocket':'EnemyMuzzle';
  if(!b.json.nodes.some(n=>n.name===socket))throw Error(`${name}: missing socket`);
  reports.push({name,originalBytes:original.length,bytes:bytes.length,addedBytes:bytes.length-original.length,
    originalGeometryMaterialsSocketsAndClipsPreserved:true, clips:b.json.animations.map(a=>a.name),
    errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,messages:validation.issues.messages});
}
await fs.writeFile('docs/gameplay-polish/asset-validation.json',JSON.stringify(reports,null,2));
console.log(JSON.stringify(reports.map(({messages,...r})=>r),null,2));
