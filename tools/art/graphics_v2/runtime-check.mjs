/** Authored runtime integration, live quality switching and staged combat stress. */
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {browserLaunchOptions} from '../../browser-options.mjs';
const browser=await chromium.launch(browserLaunchOptions);
const errors=[],checks=[],quality=[];
const check=(name,ok,detail)=>{checks.push({name,ok:!!ok,detail});console.log(`${ok?'PASS':'FAIL'} ${name}`);};
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5194/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=graphics-review');
 await page.waitForFunction(()=>globalThis.__game?.game,null,{timeout:120000});
 const initial=await page.evaluate(()=>{
  const g=globalThis.__game.game;let skinnedTriangles=0;
  g.renderer.scene.traverse(o=>{if(o.isSkinnedMesh)skinnedTriangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
  return {skinnedTriangles,kits:!!g.machine.group.getObjectByName('authored-machine-details'),stations:[...g.build.authoredStations.keys()],stats:globalThis.__game.debugStats()};
 });
 check('new skinned character is live',initial.skinnedTriangles>=33000,initial.skinnedTriangles);
 check('machine GLB is attached',initial.kits);
 check('all five station modules registered',initial.stations.length===5,initial.stations);
 for(let round=0;round<2;round++)for(const tier of ['low','medium','ultra','high']){
  await page.evaluate(tier=>globalThis.__game.game.setQuality(tier),tier);
  await page.waitForTimeout(400);
  quality.push(await page.evaluate(tier=>{
   const g=globalThis.__game.game;return {tier,graphics:g.post.diagnostics,lamps:g.lampLights?.size,memory:{...g.renderer.three.info.memory},distance:g.world.distanceTraveled};
  },tier));
 }
 check('quality toggles real AO and MSAA',quality.every(q=>q.graphics.gtao===(q.tier==='high'||q.tier==='ultra')&&q.graphics.msaaSamples===(q.tier==='low'?0:q.tier==='medium'?2:4)),quality);
 check('quality cycling retains world progress',quality.at(-1).distance>=quality[0].distance);
 check('quality cycling keeps geometry bounded',quality.at(-1).memory.geometries<=quality[3].memory.geometries+5,quality.map(q=>q.memory));
 await page.evaluate(()=>{const g=globalThis.__game.game;g.post.setBypassed(true);});
 await page.waitForTimeout(200);await page.screenshot({path:'docs/art/graphics-v2/after-bypass.png'});
 await page.evaluate(()=>{const g=globalThis.__game.game;g.post.setBypassed(false);g.queueDebugAction('time');});
 await page.waitForTimeout(600);await page.screenshot({path:'docs/art/graphics-v2/after-afternoon.png'});
 await page.evaluate(()=>{
  const g=globalThis.__game.game;g.state.godMode=true;g.player.stats.invulnerable=true;
  for(let i=0;i<12;i++)g.enemies.spawn(i%3===0?'scavenger':'raider',g.player.worldPosition.clone().set((i%4-1.5)*1.4,4.7,-5-Math.floor(i/4)*1.3));
  g.vehicleScene.spawn('port');
 });
 await page.waitForTimeout(1000);
 const combat=await page.evaluate(async()=>{
  const samples=[];let prev=performance.now(),start=prev,peak=0,peakTris=0;
  await new Promise(resolve=>{const tick=now=>{samples.push(now-prev);prev=now;const g=globalThis.__game;peak=Math.max(peak,g.enemies.activeCount);peakTris=Math.max(peakTris,g.debugStats().tris);if(now-start>20000)resolve();else requestAnimationFrame(tick);};requestAnimationFrame(tick);});
  samples.sort((a,b)=>a-b);return {fps:samples.length*1000/(prev-start),p95Ms:samples[Math.floor(samples.length*.95)],p99Ms:samples[Math.floor(samples.length*.99)],peakEnemies:peak,peakSubmittedTriangles:peakTris,stats:globalThis.__game.debugStats()};
 });
 check('staged combat exercised enemies',combat.peakEnemies>=8,combat);
 await page.screenshot({path:'docs/art/graphics-v2/after-combat.png'});
 check('no browser errors',errors.length===0,errors);
 await writeFile('docs/art/graphics-v2/runtime-acceptance.json',JSON.stringify({generatedAt:new Date().toISOString(),initial,quality,combat,checks,errors,method:'Real hardware Chrome 1080p High; explicit staged full eight-enemy pool plus boarding skiff stress, not a naturally played encounter.'},null,2)+'\n');
 if(checks.some(c=>!c.ok))process.exitCode=1;
}finally{await browser.close();}
