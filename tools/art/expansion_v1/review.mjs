import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu']});
try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  await page.route('**/models/authored/*.glb',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').at(-1);
    await route.fulfill({contentType:'model/gltf-binary',body:await readFile(`assets/expansion-v1/optimized/${name}`)});
  });
  await page.route('**/expansion-review',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><script type="module" src="/tools/art/expansion_v1/review-entry.ts"></script></body></html>'}));
  await page.goto('http://127.0.0.1:5193/expansion-review');
  await page.waitForFunction(()=>globalThis.artReady||globalThis.artError,null,{timeout:120000});
  const err=await page.evaluate(()=>globalThis.artError);if(err)throw new Error(err);
  const result=await page.evaluate(()=>({reports:globalThis.expansionReview.reports,errors:globalThis.expansionReview.errors}));
  result.errors.push(...pageErrors);
  for(const {id} of result.reports){
    for(const side of ['front','back']){
      await page.evaluate(({id,side})=>globalThis.expansionReview.show(id,side),{id,side});
      await page.screenshot({path:`docs/art/expansion-v1/${id}-${side}.png`});
    }
  }
  await writeFile('docs/art/expansion-v1/asset-validation.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({reports:result.reports.map(({id,triangles,primitives})=>({id,triangles,primitives})),errors:result.errors}));
  if(result.errors.length)process.exitCode=1;
}finally{await browser.close();}
