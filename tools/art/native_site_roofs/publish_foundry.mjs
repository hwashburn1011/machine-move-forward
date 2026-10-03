/** Narrow native publication. Lossless WebP maps; geometry and anchors retained. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import validator from 'gltf-validator';
const input='assets/expansion-v1/staging/relay-foundry.glb';
const destination='godot/assets/models/authored/relay-foundry.glb';
const bytes=fs.readFileSync(input),length=bytes.readUInt32LE(12);
const doc=JSON.parse(bytes.subarray(20,20+length));
const bin=bytes.subarray(28+length,28+length+bytes.readUInt32LE(20+length));
const chunks=[bin];let offset=bin.length;
// Keep every previously shipped Foundry material property and encoded image
// byte unchanged. Roof materials are the only new finish resources.
const reference=fs.readFileSync('assets/native-site-roofs/source-reference/relay-foundry-material-reference.glb');
const refLength=reference.readUInt32LE(12),refDoc=JSON.parse(reference.subarray(20,20+refLength)),refBin=reference.subarray(28+refLength);
const textureCache=new Map(),imageCache=new Map(),samplerCache=new Map();
function oldImage(index){
  if(imageCache.has(index))return imageCache.get(index);
  const image=structuredClone(refDoc.images[index]),view=refDoc.bufferViews[image.bufferView];
  const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
  chunks.push(refBin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength));
  image.bufferView=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:view.byteLength});offset+=view.byteLength;
  const at=doc.images.length;doc.images.push(image);imageCache.set(index,at);return at;
}
function oldTexture(index){
  if(textureCache.has(index))return textureCache.get(index);
  const texture=structuredClone(refDoc.textures[index]);
  if(texture.sampler!==undefined){
    if(!samplerCache.has(texture.sampler)){samplerCache.set(texture.sampler,doc.samplers.length);doc.samplers.push(structuredClone(refDoc.samplers[texture.sampler]));}
    texture.sampler=samplerCache.get(texture.sampler);
  }
  if(texture.source!==undefined)texture.source=oldImage(texture.source);
  if(texture.extensions?.EXT_texture_webp)texture.extensions.EXT_texture_webp.source=oldImage(texture.extensions.EXT_texture_webp.source);
  const at=doc.textures.length;doc.textures.push(texture);textureCache.set(index,at);return at;
}
function textureRefs(material){return [material.normalTexture,material.occlusionTexture,material.emissiveTexture,material.pbrMetallicRoughness?.baseColorTexture,material.pbrMetallicRoughness?.metallicRoughnessTexture].filter(Boolean);}
for(let i=0;i<doc.materials.length;i++){
  const source=refDoc.materials.find(m=>m.name===doc.materials[i].name);if(!source)continue;
  const material=structuredClone(source);for(const ref of textureRefs(material))ref.index=oldTexture(ref.index);doc.materials[i]=material;
}
// Discard the regenerated, superseded images instead of shipping both sets.
const keptTextures=[...new Set(doc.materials.flatMap(m=>textureRefs(m).map(r=>r.index)))];
const textureMap=new Map(keptTextures.map((old,index)=>[old,index]));
doc.textures=keptTextures.map(i=>doc.textures[i]);for(const m of doc.materials)for(const ref of textureRefs(m))ref.index=textureMap.get(ref.index);
const keptImages=[...new Set(doc.textures.map(t=>t.source??t.extensions.EXT_texture_webp.source))];
const imageMap=new Map(keptImages.map((old,index)=>[old,index]));doc.images=keptImages.map(i=>doc.images[i]);
for(const t of doc.textures){if(t.source!==undefined)t.source=imageMap.get(t.source);else t.extensions.EXT_texture_webp.source=imageMap.get(t.extensions.EXT_texture_webp.source);}
const originalCombined=Buffer.concat(chunks);
for(const image of doc.images??[]){
  if(image.mimeType==='image/webp')continue;
  const view=doc.bufferViews[image.bufferView];
  const data=originalCombined.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
  const encoded=await sharp(data).webp({lossless:true}).toBuffer();
  const padding=(4-offset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}
  const newView=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:encoded.length});
  chunks.push(encoded);offset+=encoded.length;image.bufferView=newView;image.mimeType='image/webp';
}
for(const texture of doc.textures??[]){if(texture.source!==undefined){texture.extensions??={};texture.extensions.EXT_texture_webp={source:texture.source};delete texture.source;}}
for(const key of ['extensionsUsed','extensionsRequired'])doc[key]=[...new Set([...(doc[key]??[]),'EXT_texture_webp'])];
// Compact referenced views, avoiding retention of the replaced PNG payloads.
const combined=Buffer.concat(chunks);let compactOffset=0;const compact=[];
const used=new Set();for(const a of doc.accessors??[]){if(a.bufferView!==undefined)used.add(a.bufferView);if(a.sparse){used.add(a.sparse.indices.bufferView);used.add(a.sparse.values.bufferView);}}
for(const image of doc.images??[])used.add(image.bufferView);
const mapping=new Map(),views=[];
for(const index of [...used].sort((a,b)=>a-b)){
  const view=doc.bufferViews[index];const pad=(4-compactOffset%4)%4;if(pad){compact.push(Buffer.alloc(pad));compactOffset+=pad;}
  compact.push(combined.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength));
  mapping.set(index,views.length);views.push({...view,buffer:0,byteOffset:compactOffset});compactOffset+=view.byteLength;
}
for(const a of doc.accessors??[]){if(a.bufferView!==undefined)a.bufferView=mapping.get(a.bufferView);if(a.sparse){a.sparse.indices.bufferView=mapping.get(a.sparse.indices.bufferView);a.sparse.values.bufferView=mapping.get(a.sparse.values.bufferView);}}
for(const image of doc.images??[])image.bufferView=mapping.get(image.bufferView);
doc.bufferViews=views;doc.buffers=[{byteLength:compactOffset}];
let json=Buffer.from(JSON.stringify(doc));if(json.length%4)json=Buffer.concat([json,Buffer.alloc(4-json.length%4,0x20)]);
let body=Buffer.concat(compact);if(body.length%4)body=Buffer.concat([body,Buffer.alloc(4-body.length%4)]);
const header=Buffer.alloc(20),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+body.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(body.length);bh.writeUInt32LE(0x004e4942,4);
const out=Buffer.concat([header,json,bh,body]);fs.writeFileSync(destination,out);
const sha=crypto.createHash('sha256').update(out).digest('hex');
const assetsPath='godot/data/assets.json',assets=JSON.parse(fs.readFileSync(assetsPath));
const entry=assets.find(a=>a.path==='models/authored/relay-foundry.glb');
Object.assign(entry,{sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:out.length,expandedViews:0,nodes:doc.nodes.map(n=>n.name).filter(Boolean),extensions:doc.extensionsRequired,source:'assets/expansion-v1/staging/relay-foundry.glb',nativeSha256:sha});
fs.writeFileSync(assetsPath,JSON.stringify(assets,null,2));
const report=await validator.validateBytes(new Uint8Array(out),{uri:destination,maxIssues:1000});
fs.writeFileSync('assets/native-site-roofs/foundry-gltf-validation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({destination,bytes:out.length,sha256:sha,issues:report.issues}));
if(report.issues.numErrors||report.issues.numWarnings)process.exitCode=1;
