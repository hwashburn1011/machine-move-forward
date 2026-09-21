import fs from 'node:fs/promises';
import validator from 'gltf-validator';
const names=['salvage-chest','fuel-canister','generator-refined','salvaged-radio','wrist-terminal','workbench-refined','refinery-refined','storage-refined','iron-nomad-playable','iron-nomad-collision'];
const report=[];
for(const name of names){
 const bytes=await fs.readFile('public/models/authored/'+name+'.glb');
 const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
 const validation=await validator.validateBytes(new Uint8Array(bytes),{uri:name+'.glb',maxIssues:100});
 const nodes=json.nodes??[];
 const finite=nodes.every(n=>['translation','scale','rotation','matrix'].every(k=>!n[k]||n[k].every(Number.isFinite)));
 const triangles=(json.meshes??[]).reduce((total,m)=>total+m.primitives.reduce((sum,p)=>sum+(json.accessors[p.indices??p.attributes.POSITION].count/3),0),0);
 const embedded=!(json.images??[]).some(i=>i.uri)&&!(json.buffers??[]).some(b=>b.uri);
 const required=name==='iron-nomad-playable'?['FrontLeft','FrontRight','RearLeft','RearRight'].every(leg=>nodes.some(n=>n.name==='Leg_'+leg+'_Hip')):true;
 const entry={name,bytes:bytes.length,triangles,materials:json.materials?.length??0,finite,embedded,required,errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,messages:validation.issues.messages};
 report.push(entry);console.log(name,JSON.stringify({...entry,messages:undefined}));
}
await fs.writeFile('assets/nomad-foundations/gltf-validation.json',JSON.stringify(report,null,2));
if(report.some(x=>!x.finite||!x.embedded||!x.required||x.errors))process.exitCode=1;
