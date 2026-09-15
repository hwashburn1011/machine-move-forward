import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out='test-results/meridian-visual';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),checks=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
const check=(name,ok,detail)=>checks.push({name,ok:!!ok,detail});
try{
 await page.goto('http://127.0.0.1:5201/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=medium&seed=meridian-visual');
 await page.waitForFunction(()=>globalThis.__game?.game?.player?.visual?.isAnimated,null,{timeout:180000});
 await page.evaluate(async()=>{
  const g=globalThis.__game.game;g.loop.stop();g.state.paused=false;g.player.stats.invulnerable=true;
  g.closePanels(false);g.vehicleScene.clear();g.gunboatScene.clear();g.enemies.despawnAll();
  g.firstRun.restore({completed:['salvage','build-refinery','refine-components','build-workbench','build-defense','survive-boarding','repair'],counters:{}});
  globalThis.orchardBase={format:2,completed:['wreck-one','relay-foundry','quiet-array','glass-orchard'],recoveredUniques:['course-gyro','salvage-controller','tracking-servo','course-actuator','annika-archive-shard','human-seed-bank','vector-governor','orchard-memory-core'],chapterComplete:true};
  g.story.restore({...globalThis.orchardBase,active:{expeditionId:'last-garden-meridian',routeId:'meridian-quiet-line',phase:'docked',arrivalDistance:1000,scriptedEncounter:'resolved',journalsRead:[],objectivesCompleted:[]}});
  g.destination.setActive(false);g.configureDestination();g.destination.setArrivalDistance(1000);g.destination.setActive(true);g.destination.setDocked(true);
  g.machine.setExpeditionGangwayOpen(true);g.world.reset(1000);g.machine.movement.speed=0;g.machine.movement.setScriptedSpeedLimit(0);g.course.setTier(1);
  const [{opportunityDefinition},{buildOpportunityModel},{buildMeridianModel},story]=await Promise.all([import('/src/data/opportunities.ts'),import('/src/art/OpportunityModels.ts'),import('/src/art/ExpeditionModels.ts'),import('/src/data/story.ts')]);
  globalThis.opDef=opportunityDefinition;globalThis.opModel=buildOpportunityModel;globalThis.orchardModel=buildMeridianModel;globalThis.orchardDef=story.LAST_GARDEN_MERIDIAN;
 });
 const walk=async (at,key,ticks)=>{
  await page.evaluate(at=>{const g=globalThis.__game.game;g.titleCamera=null;g.playerCamera.setYaw(0);g.player.teleport(at);g.input.clearAll();},at);
  await page.keyboard.down(key);
  await page.evaluate(ticks=>{const g=globalThis.__game.game;for(let i=0;i<ticks;i++){g.player.needs.restore({hydration:100,nourishment:100});g.fixedUpdate(1/60);}},ticks);
  await page.keyboard.up(key);
  return await page.evaluate(()=>({...globalThis.__game.game.player.worldPosition}));
 };
 const gangway=await walk({x:5.4,y:15.96,z:0},'d',150);
 check('Capsule crosses Meridian gangway',gangway.x>9&&gangway.y>14,gangway);
 const blocked=await walk({x:8.85,y:15.96,z:-5},'d',90);
 check('Greenhouse glass blocks sideways walking',blocked.x<9.3&&blocked.x>=8.8,blocked);
 const entry=await walk({x:12,y:15.96,z:-1},'w',90);
 check('Greenhouse entrance admits player along aisle',entry.z<-3&&entry.y>14,entry);
 // Walk the actual Rapier capsule from the gangway to every mandatory console.
 await page.evaluate(()=>{const g=globalThis.__game.game;g.player.teleport({x:9.5,y:15.96,z:0});g.input.clearAll();g.closePanels(false);});
 await page.keyboard.down('w');
 const access=await page.evaluate(()=>{
  const g=globalThis.__game.game,rows=[];
  const walkTo=(x,z)=>{let n=0;while(n++<360){const p=g.player.worldPosition;if(Math.hypot(x-p.x,z-p.z)<.16)break;g.playerCamera.setYaw(Math.atan2(p.x-x,p.z-z));g.fixedUpdate(1/60);}return {...g.player.worldPosition};};
  for(const [id,x,z] of [['meridian-civilian-record',13,-1.3],['meridian-transmitter-online',19.4,-2],['meridian-common-record',17,-5.7],['meridian-defense-record',21.7,.8],['meridian-archive-installed',13,3.4],['meridian-solution',21,3.4]]){
   walkTo(17,0);const at=walkTo(x,z),target=g.destination.interactables.find(t=>t.id===id);
   rows.push({id,at,distance:target?Math.hypot(at.x-target.position.x,at.z-target.position.z):999});
  }return rows;
 });
 await page.keyboard.up('w');
 check('Every mandatory interaction reached by walking from gangway',access.every(x=>x.distance<1.6&&x.at.y>14),access);
 await page.evaluate(()=>{const g=globalThis.__game.game;g.titleCamera=g.renderer.camera;g.titleCamera.position.set(0,29,-27);g.titleCamera.lookAt(17,16,0);g.updateStory();g.render(0);});
 await page.screenshot({path:out+'/meridian-overview.png'});
 check('HUD names current chapter after dock event',await page.locator('#hud-story-phase').textContent()==='Last Garden Meridian');
 const perf=await page.evaluate(async()=>{
   const g=globalThis.__game.game,work=[],intervals=[];let prior=performance.now(),start=prior;
   while(performance.now()-start<20000){await new Promise(requestAnimationFrame);const now=performance.now();intervals.push(now-prior);prior=now;const t=(now-start)/1000;
     g.titleCamera.position.set(17+Math.sin(t*.3)*30,27,-24+Math.cos(t*.3)*8);g.titleCamera.lookAt(12,15,0);
     const a=performance.now();g.render(0);work.push(performance.now()-a);}
   const q=(arr,p)=>[...arr].sort((a,b)=>a-b)[Math.floor(arr.length*p)];
   return {durationMs:performance.now()-start,frames:work.length,fps:work.length/((performance.now()-start)/1000),renderP95:q(work,.95),intervalP95:q(intervals,.95),over33:intervals.filter(x=>x>33).length,memory:{...g.renderer.three.info.memory},calls:g.renderer.three.info.render.calls,triangles:g.renderer.three.info.render.triangles};
 });check('20-second 1080p medium Meridian camera sample',perf.frames>100,perf);
 const reuse=await page.evaluate(()=>{
   const g=globalThis.__game.game;const install=kind=>{g.destination.setActive(false);g.destination.configure(kind==='orchard'?globalThis.orchardDef:globalThis.opDef('repair-depot'),kind==='orchard'?globalThis.orchardModel(g.materials):globalThis.opModel('repair-depot',g.materials));g.destination.setActive(true);g.destination.setDocked(true);g.render(0);};
   install('depot');install('orchard');const before={...g.renderer.three.info.memory};
   for(let i=0;i<100;i++){install('depot');install('orchard');}
   return {before,after:{...g.renderer.three.info.memory}};
 });check('100 Meridian/depot replacements keep GPU resource counts stable',reuse.before.geometries===reuse.after.geometries&&reuse.before.textures===reuse.after.textures,reuse);
 const depot=await page.evaluate(()=>{
   const g=globalThis.__game.game;g.titleCamera=null;g.destination.setActive(false);g.optionalModelId=null;g.routeChart.reset();
   g.story.restore({...globalThis.orchardBase,completed:[...globalThis.orchardBase.completed,'last-garden-meridian'],recoveredUniques:[...globalThis.orchardBase.recoveredUniques,'human-seed-bank','vector-governor','orchard-memory-core','meridian-solution'],active:null});
   g.machine.power.restore({fuel:100});for(const id of [g.radioPowerConsumerId,g.helmPowerConsumerId]){g.machine.power.unregisterConsumer(id);g.machine.power.registerConsumer({id,draw:1,priority:'station'});}g.tickPower(.01);
   g.player.teleport({x:6,y:15.96,z:4});g.world.reset(1650);g.director.reset(1650);g.course.restore({tier:3,bearingDeg:0,desiredDeg:0,throttle:1,lateralM:0});g.updateOpportunities();
   const c=g.routeChart.contact;const wider=g.routeChart.preview(c.id,g.chartContext);g.course.setTier(2);const limited=g.routeChart.preview(c.id,g.chartContext);g.course.setTier(3);
   g.openHelm();g.plotOpportunity(c.id);g.machine.movement.setScriptedSpeedLimit(null);
   let steps=0;while(steps<18000&&g.routeChart.contact?.state!=='docked'){g.player.needs.restore({hydration:100,nourishment:100});g.fixedUpdate(1/60);steps++;}
   return {contact:c,limited,wider,steps,docked:g.destination.docked,state:g.routeChart.contact?.state,course:g.course.snapshot};
 });check('Far repair depot needs earned wider authority',depot.contact.kind==='repair-depot'&&!depot.limited.reachable&&depot.wider.reachable,depot);
 check('Wider automatic guidance physically docks depot',depot.docked&&depot.state==='docked',depot);
 const reward=await page.evaluate(async()=>{
   const g=globalThis.__game.game;g.inventory.clear();const t=g.destination.interactables.find(x=>x.id==='opportunity-reward');g.player.teleport(t.position);const accepted=g.openInteractable(t);
   const record=g.progression.has('depot-linekeeper-record'),kit=g.resources.count('repair-kit');g.closePanels(false);
   g.player.teleport({x:6,y:15.96,z:4});const saved=await g.saveTo('orchard-depot','manual',true);await g.loadFrom('orchard-depot');g.loop.stop();g.state.paused=false;
   return {accepted,record,kit,saved,restoredRecord:g.progression.has('depot-linekeeper-record'),restoredState:g.routeChart.contact?.state};
 });check('Depot repair kit and readable record persist once through save',reward.accepted&&reward.record&&reward.kit===1&&reward.saved&&reward.restoredRecord&&reward.restoredState==='visited',reward);
 await page.evaluate(()=>{const g=globalThis.__game.game;g.titleCamera=g.renderer.camera;g.titleCamera.position.set(0,26,-20);g.titleCamera.lookAt(14,16,0);g.updateStory();g.render(0);});
 await page.screenshot({path:out+'/depot.png'});
}catch(e){errors.push(e.stack??String(e));}finally{await browser.close();}
const result={checks,errors,passed:checks.filter(x=>x.ok).length,total:checks.length};await writeFile(out+'/qa.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(errors.length||checks.some(x=>!x.ok))process.exitCode=1;
