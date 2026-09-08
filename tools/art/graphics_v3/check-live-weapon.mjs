import {chromium} from '@playwright/test';
import {browserLaunchOptions} from '../../browser-options.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch(browserLaunchOptions);
try{
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:5194/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high');
 await page.waitForFunction(()=>globalThis.__game?.game,null,{timeout:120000});
 const measure=()=>page.evaluate(()=>{
  const g=globalThis.__game.game,p=g.player.object3D;p.updateWorldMatrix(true,true);
  const held=p.getObjectByName('held-weapon'),muzzle=held?.getObjectByName('Muzzle'),grip=held?.getObjectByName('GripOrigin');
  const at=o=>o?.matrixWorld.elements.slice(12,15),m=at(muzzle),h=at(grip),e=p.matrixWorld.elements;
  const d=m&&h?m.map((v,i)=>v-h[i]):null;
  return {player:at(p),camera:at(g.renderer.camera),muzzle:m,grip:h,muzzleForwardDot:d?d.reduce((s,v,i)=>s+v*e[8+i],0)/Math.hypot(...d):null,
   weaponSpan:d?Math.hypot(...d):null,heldScale:held?.scale.toArray()};
 });
 const deck=await measure();
 await page.evaluate(()=>globalThis.__game.game.player.teleport({x:0,y:1.6,z:-3.5}));
 await page.waitForTimeout(800);const lower=await measure();
 const result={deck,lower};await writeFile('docs/art/graphics-v3/live-weapon.json',JSON.stringify(result,null,2));console.log(result);
 if([deck,lower].some(r=>r.muzzleForwardDot<.99||r.weaponSpan>1.1))process.exitCode=1;
}finally{await browser.close();}
