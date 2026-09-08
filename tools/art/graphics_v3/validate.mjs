/** Native browser GLB validation: actual decoded textures, animated bounds and pivots. */
import {chromium} from '@playwright/test';
import {readFile,access,mkdir,writeFile} from 'node:fs/promises';
const kind=process.argv.includes('--staged')?'staging':process.argv.includes('--optimized')?'optimized':null;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}});const pageErrors=[];
 page.on('pageerror',e=>pageErrors.push(e.message));
 if(kind)await page.route('**/models/authored/*.glb',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1),path=`assets/graphics-v3/${kind}/${name==='machine-walker-v3.glb'?'machine-walker.glb':name}`;
  try{await access(path);await route.fulfill({contentType:'model/gltf-binary',body:await readFile(path)});}catch{await route.continue();}
 });
 await page.route('**/validate-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><script type="module" src="/tools/art/graphics_v3/validate-entry.ts"></script></body></html>'}));
 await page.goto('http://127.0.0.1:5193/validate-fixture');
 await page.waitForFunction(()=>globalThis.artReady||globalThis.artError,null,{timeout:120000});
 const result=await page.evaluate(()=>globalThis.artError?{errors:[globalThis.artError]}:{reports:globalThis.assetReview.reports,errors:globalThis.assetReview.errors});
 result.errors.push(...pageErrors);await mkdir('docs/art/graphics-v3',{recursive:true});
 await writeFile(`docs/art/graphics-v3/asset-validation-${kind??'runtime'}.json`,JSON.stringify(result,null,2)+'\n');
 for(const id of ['salvaged-radio','manual-turret','expedition-wreck','raider-skiff','station-kit','salvage-chest']){
  await page.evaluate(id=>globalThis.assetReview?.show(id),id);
  await page.screenshot({path:`docs/art/graphics-v3/${id}-${kind??'runtime'}.png`});
 }
 console.log(JSON.stringify({assets:result.reports?.length,errors:result.errors}));
 if(result.errors.length)process.exitCode=1;
}finally{await browser.close();}

