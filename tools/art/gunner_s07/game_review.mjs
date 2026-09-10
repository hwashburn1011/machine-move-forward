import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu']});
await mkdir('docs/art/s07-playable',{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/art-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><script type="module" src="/tools/art/fixture-entry.ts"></script></body></html>'}));
 await page.goto('http://127.0.0.1:5193/art-fixture');await page.waitForFunction(()=>globalThis.artReady||globalThis.artError,null,{timeout:120000});
 const info=await page.evaluate(()=>{
  if(globalThis.artError)throw Error(globalThis.artError);
  const {actors,camera,scene,renderer}=globalThis.artFixture;actors.forEach((a,i)=>{a.setMotion([0,3,7][i],true);a.update(.4)});camera.position.set(3,2.7,6);camera.lookAt(0,1.05,0);renderer.render(scene,camera);
  return actors.map(a=>{a.object3D.updateWorldMatrix(true,true);const h=a.object3D.getObjectByName('held-weapon'),m=h?.getObjectByName('Muzzle'),g=h?.getObjectByName('GripOrigin');return{animated:a.isAnimated,hand:a.canHoldWeapon,clip:a.current?.getClip().name,gun:h?.matrixWorld.elements.slice(12,15),muzzle:m?.matrixWorld.elements.slice(12,15),grip:g?.matrixWorld.elements.slice(12,15)}});
 });
 await page.screenshot({path:'docs/art/s07-playable/poses-front.png'});
 await page.evaluate(()=>{const{camera,scene,renderer}=globalThis.artFixture;camera.position.set(-3,2.7,-6);camera.lookAt(0,1.05,0);renderer.render(scene,camera)});
 await page.screenshot({path:'docs/art/s07-playable/poses-back.png'});
 console.log(JSON.stringify({info,errors},null,2));await writeFile('docs/art/s07-playable/pose-check.json',JSON.stringify({info,errors},null,2));
} finally {await browser.close()}
