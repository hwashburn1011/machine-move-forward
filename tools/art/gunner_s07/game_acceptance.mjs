import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu']});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5193/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=s07');
 await page.waitForFunction(()=>globalThis.__game?.game,null,{timeout:120000});await page.waitForFunction(()=>globalThis.__game.game.state.simTime>2,null,{timeout:30000});
 const read=()=>page.evaluate(()=>{const g=globalThis.__game.game,p=g.player,v=p.visual; p.object3D.updateWorldMatrix(true,true);const m=p.object3D.getObjectByName('Muzzle'),h=p.object3D.getObjectByName('GripOrigin');const at=o=>o?.matrixWorld.elements.slice(12,15),a=at(m),b=at(h),e=p.object3D.matrixWorld.elements;const d=a&&b?a.map((x,i)=>x-b[i]):null;return{model:!!p.object3D.getObjectByName('S07_Rig'),clip:v.current?.getClip().name,position:p.worldPosition.toArray(),grounded:p.isGrounded,weapon:g.combat.current.def?.id,muzzleForwardDot:d?d.reduce((n,x,i)=>n+x*e[8+i],0)/Math.hypot(...d):null,holds:p.holdsWeapon}});
 const idle=await read();console.log('INITIAL',idle,await page.evaluate(()=>({stats:globalThis.__game.debugStats(),paused:globalThis.__game.game.state.paused})),errors);assert(idle.model);assert.equal(idle.clip,'armed_idle');assert(idle.muzzleForwardDot>.99);
 await page.screenshot({path:'docs/art/s07-playable/gameplay.png'});
 await page.keyboard.down('w');await page.waitForTimeout(380);const walk=await read();await page.keyboard.up('w');assert.equal(walk.clip,'armed_walk');
 await page.keyboard.down('Shift');await page.keyboard.down('w');await page.waitForTimeout(320);const run=await read();await page.keyboard.up('w');await page.keyboard.up('Shift');assert.equal(run.clip,'armed_run');
 await page.keyboard.down('c');await page.waitForTimeout(320);const crouch=await read();await page.keyboard.up('c');assert.equal(crouch.clip,'armed_crouch_idle');
 await page.keyboard.press('Space');await page.waitForTimeout(160);const jump=await read();assert.equal(jump.clip,'armed_jump');
 await page.waitForTimeout(1000);await page.keyboard.press('2');await page.waitForTimeout(300);const shotgun=await read();assert(shotgun.muzzleForwardDot>.99);
 await page.mouse.down();await page.waitForTimeout(160);await page.mouse.up();const fired=await read();
 await page.evaluate(()=>globalThis.__game.game.player.setHeldWeapon(null,null));await page.waitForTimeout(300);const unarmed=await read();assert.equal(unarmed.clip,'unarmed_idle');
 await page.evaluate(()=>globalThis.__game.game.equipHeldWeapon());await page.waitForTimeout(300);
 const perf=await page.evaluate(async()=>{const a=[],start=performance.now();let last=start;await new Promise(resolve=>{function f(now){a.push(now-last);last=now;if(now-start>10000)resolve();else requestAnimationFrame(f)}requestAnimationFrame(f)});a.sort((x,y)=>x-y);return{fps:a.length*1000/(last-start),p95Ms:a[Math.floor(a.length*.95)],stats:globalThis.__game.debugStats()}});
 const result={idle,walk,run,crouch,jump,shotgun,fired,unarmed,perf,errors};await writeFile('docs/art/s07-playable/gameplay-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));assert.equal(errors.length,0);
}finally{await browser.close()}
