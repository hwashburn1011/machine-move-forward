import {chromium} from '@playwright/test';
import {readFile,access,mkdir,writeFile} from 'node:fs/promises';
const version=process.argv.includes('--before')?'v2':'v3';
const optimized=process.argv.includes('--optimized');
await mkdir('docs/art/graphics-v3',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/models/authored/*.glb',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1),path=`assets/graphics-${version}/${optimized?'optimized':'staging'}/${name}`;
  try{await access(path);await route.fulfill({contentType:'model/gltf-binary',body:await readFile(path)});}catch{await route.continue();}
 });
 await page.route('**/review-v3',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><script type="module" src="/tools/art/graphics_v3/review-entry.ts"></script></body></html>'}));
 await page.goto('http://127.0.0.1:5193/review-v3');
 await page.waitForFunction(()=>globalThis.artReady||globalThis.artError,null,{timeout:120000});
 const error=await page.evaluate(()=>globalThis.artError);if(error)throw new Error(error);
 for(const view of ['front','back','profile']){
  await page.evaluate(view=>globalThis.reviewV3.draw(view),view);
  await page.screenshot({path:`docs/art/graphics-v3/${version}-${view}.png`});
 }
 for(const [i,id] of ['player','raider','scavenger'].entries()){
  await page.evaluate(i=>globalThis.reviewV3.solo(i),i);
  await page.screenshot({path:`docs/art/graphics-v3/${version}-${id}.png`});
 }
 await writeFile(`docs/art/graphics-v3/${version}-review.json`,JSON.stringify({errors,method:'Fixed neutral-light cameras, unmodified source bind pose; staged assets.'},null,2)+'\n');
 console.log(JSON.stringify({version,errors}));if(errors.length)process.exitCode=1;
}finally{await browser.close();}
