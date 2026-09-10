import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu']});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[],reports=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5196/viewer/');
 for(const id of ['bastion','revenant','warden','sovereign']){
  await page.selectOption('#archetype',id);
  for(const mode of ['showcase','rigged','game','equipment']){
   await page.selectOption('#mode',mode);await page.waitForFunction(name=>globalThis.__MECH_READY__?.name===name,id+'_'+mode,{timeout:60000});
   const info=await page.evaluate(()=>globalThis.__MECH_READY__);reports.push(info);assert(info.triangles>1000);
   if(mode==='rigged'||mode==='game'){
    assert.equal(info.bones,46);const result=await page.evaluate(()=>{const {model}=window.__MECH_VIEWER__;let mesh;model.traverse(o=>{if(o.isSkinnedMesh&&!mesh)mesh=o});const before=[];for(let i=0;i<mesh.geometry.attributes.position.count;i+=7)before.push(mesh.getVertexPosition(i,new mesh.position.constructor()).clone());const bone=model.getObjectByName('upperarm_r');bone.rotation.x+=.3;model.updateMatrixWorld(true);let changed=0,bad=0,k=0;for(let i=0;i<mesh.geometry.attributes.position.count;i+=7){const p=mesh.getVertexPosition(i,new mesh.position.constructor());if(!p.toArray().every(Number.isFinite))bad++;if(p.distanceTo(before[k++])>.001)changed++}bone.rotation.x-=.3;return{changed,bad}});assert.equal(result.bad,0);assert(result.changed>25);info.deformation=result;
   }
   if(mode==='showcase')await page.screenshot({path:'assets/mech-enemies/preview/'+id+'_browser.png'});
  }
 }
 await page.selectOption('#archetype','sovereign');await page.selectOption('#mode','showcase');await page.waitForFunction(()=>window.__MECH_READY__?.name==='sovereign_showcase');await page.click('#wire');await page.screenshot({path:'assets/mech-enemies/preview/wireframe.png'});await page.click('#wire');await page.click('#ref');await page.click('#reset');
 assert.equal(errors.length,0);await writeFile('assets/mech-enemies/source/browser_validation.json',JSON.stringify({reports,errors,status:'passed'},null,2));console.log('ALL 16 MODEL VIEWS PASSED; EIGHT SKINS DEFORM; NO BROWSER ERRORS');
}finally{await browser.close()}
