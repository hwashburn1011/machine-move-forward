/** Same-browser diagnostic ablations. Disabled features exist only in this test page. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const seconds = Number(process.env.MMF_SECONDS ?? 15);
const output = process.argv[2] ?? 'docs/gameplay-polish/performance-isolation.json';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11','--enable-gpu'] });
const results = [], errors = [];
try {
 const page = await browser.newPage({viewport:{width:1920,height:1080}});
 page.on('pageerror', e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${process.env.MMF_PORT ?? 5201}/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=desert-review`);
 await page.waitForFunction(()=>globalThis.__game?.game?.player.visual.isAnimated,null,{timeout:180000});
 for(const mode of ['all','no-fade','no-camera-volume','no-foot-ik','no-enemy-presentation','all-repeat']) {
  const result = await page.evaluate(async({mode,seconds})=>{
   const g=globalThis.__game.game;g.stop();g.loop.accumulator=0;g.state.paused=false;
   g.enemies.despawnAll();g.world.reset(800);g.machine.damage.reset();g.player.stats.invulnerable=true;
   g.player.teleport(g.player.worldPosition.clone().set(5.6,15.8,1.5));
   g.playerCamera.setYaw(0);g.playerCamera.resetHistory();
   for(let i=0;i<8;i++)g.enemies.spawn(['bastion','warden','revenant','sovereign'][i%4],g.player.worldPosition.clone().set(i<4?-6:6,15.94,-6+(i%4)*4));
   const undo=[];
   function replace(object,key,value){const old=object[key];object[key]=value;undo.push(()=>object[key]=old)}
   if(mode==='no-fade'){g.playerFade.restore();replace(g.playerFade,'apply',()=>{})}
   if(mode==='no-camera-volume'){
    replace(g.playerCamera,'restrictToVisibleSegment',()=>false);
    replace(g.playerCamera,'overlaps',()=>false);
   }
   if(mode==='no-foot-ik'){g.player.visual.footPlacement?.resetApplied();replace(g.player.visual,'footPlacement',null)}
   if(mode==='no-enemy-presentation')for(const enemy of g.enemies.active)replace(enemy.visual,'update',()=>{});
   const work={};
   for(const [object,key,label]of [[g.playerCamera,'fixedUpdate','cameraFixed'],[g.playerCamera,'update','cameraRender'],[g.physics,'sweepSphere','sweep'],[g.physics,'overlapsSphere','overlap'],[g.player.visual,'update','playerVisual'],[g.enemies,'update','enemyVisuals'],[g.playerFade,'apply','fade'],[g,'updateMachineStatus','machineStatus']]){
    const original=object[key].bind(object);work[label]={calls:0,ms:0,max:0};
    replace(object,key,(...args)=>{const t=performance.now();const result=original(...args);const ms=performance.now()-t;work[label].calls++;work[label].ms+=ms;work[label].max=Math.max(work[label].max,ms);return result});
   }
   // Equal warm-up simulated time; counts are cleared before measurement.
   for(let i=0;i<120;i++)g.loop.advance(1/60);
   for(const item of Object.values(work)){item.calls=0;item.ms=0;item.max=0}
   const frames=[],renders=[];const oldRender=g.render.bind(g);
   replace(g,'render',(...args)=>{const t=performance.now();oldRender(...args);renders.push(performance.now()-t)});
   let started=null, previous=null;
   await new Promise(resolve=>{
    const tick=now=>{
     if(started===null){started=now;previous=now;requestAnimationFrame(tick);return}
     const dt=now-previous;previous=now;frames.push(dt);
     window.dispatchEvent(new MouseEvent('mousemove',{movementX:1800*dt/1000}));
     g.loop.advance(Math.min(dt/1000,.25));
     if(now-started>=seconds*1000)resolve();else requestAnimationFrame(tick);
    };requestAnimationFrame(tick);
   });
   const stats=arr=>{const sorted=[...arr].sort((a,b)=>a-b);return {mean:arr.reduce((a,b)=>a+b,0)/arr.length,p95:sorted[Math.floor(arr.length*.95)],p99:sorted[Math.floor(arr.length*.99)],max:sorted.at(-1)}};
   for(const restore of undo.reverse())restore();g.start();
   return {mode,seconds,frames:frames.length,fps:1000/stats(frames).mean,frameMs:stats(frames),renderMs:stats(renders),work,programs:g.renderer.three.info.programs.length};
  },{mode,seconds});
  results.push(result);console.log(JSON.stringify(result));
 }
}finally{await browser.close();await fs.writeFile(output,JSON.stringify({diagnosticOnly:true,results,errors},null,2))}
if(errors.length)throw Error(errors.join('\n'));
