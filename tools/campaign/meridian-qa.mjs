import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const site=process.env.MMF_SITE??'http://127.0.0.1:5201/';
const out=process.env.MMF_QA_OUT??'test-results/meridian';
await mkdir(out,{recursive:true});
const checks=[],errors=[];
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu']});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(site+'?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=medium&seed=meridian-qa');
 await page.waitForFunction(()=>globalThis.__game?.game?.player?.visual?.isAnimated,null,{timeout:180000});
 checks.push(...await page.evaluate(()=>{
  const g=globalThis.__game.game,rows=[];const check=(name,ok,detail)=>rows.push({name,ok:!!ok,detail});
  g.loop.stop();g.closePanels(false);g.state.paused=false;g.state.playerDead=false;g.player.stats.invulnerable=true;
  g.firstRun.restore({completed:['salvage','build-refinery','refine-components','build-workbench','build-defense','survive-boarding','repair'],counters:{}});
  g.player.teleport({x:6,y:15.96,z:4});g.machine.power.restore({fuel:100});g.enemies.despawnAll();g.vehicleScene.clear();g.gunboatScene.clear();
  g.progression.earlyRadioDrop.restore({status:'found',armedAtSimTime:0,foundAtSimTime:1,foundAtDistance:1,eligibleChestsOpened:1});
  for(const id of [g.radioPowerConsumerId,g.helmPowerConsumerId]){g.machine.power.unregisterConsumer(id);g.machine.power.registerConsumer({id,draw:1,priority:'station'});}g.tickPower(.01);
  globalThis.meridianBase={format:2,completed:['wreck-one','relay-foundry','quiet-array','glass-orchard'],recoveredUniques:['course-gyro','salvage-controller','tracking-servo','course-actuator','annika-archive-shard','human-seed-bank','vector-governor','orchard-memory-core'],active:null,chapterComplete:true};
  g.story.restore(globalThis.meridianBase);g.course.setTier(2);g.routeChart.reset();g.world.reset(250);g.director.reset(250);
  g.destination.setActive(false);g.updateOpportunities();
  check('Meridian passive offer coexists with optional contact',g.story.snapshot(250).nextExpedition?.id==='last-garden-meridian'&&g.routeChart.contact?.state==='detected'&&!g.chartContext.storyPriority);
  g.openRadio();const trace=document.querySelector('[data-radio-trace-button]');
  check('Powered radio offers Meridian',trace?.textContent?.includes('Meridian')&&!trace.disabled,trace?.textContent);trace.click();
  check('Meridian route choice contains exactly two matching cards',g.expeditionUI.isOpen&&[...document.querySelectorAll('[data-route-card]')].every(x=>x.dataset.routeCard.startsWith('meridian-'))&&document.querySelectorAll('[data-route-card]').length===2);
  check('No ending before Meridian completion',!g.endingEligible&&!g.helmView().ending.available);
  return rows;
 }));
 await page.screenshot({path:out+'/routes.png'});
 for(const route of ['meridian-quiet-line','meridian-cordon-gap']) {
  checks.push(...await page.evaluate(async route=>{
   const g=globalThis.__game.game,rows=[];const check=(name,ok,detail)=>rows.push({name:route+': '+name,ok:!!ok,detail});
   g.closePanels(false);g.state.paused=false;g.destination.setActive(false);g.optionalModelId=null;g.routeChart.reset();g.enemies.despawnAll();g.vehicleScene.clear();g.gunboatScene.clear();g.pendingBoardingOutcome=null;
   g.scriptedGunboatPending=false;g.scriptedGunboatActive=false;g.scriptedSkiffPending=false;g.scriptedSkiffActive=false;
   g.player.teleport({x:6,y:15.96,z:4});g.world.reset(4000);g.director.reset(4000);g.story.restore(globalThis.meridianBase);
   const begin=g.story.beginNextExpedition({currentDistance:4000,stable:true,playerOnMachine:true,encounterActive:false});g.applyStoryEffects(begin.effects);g.selectStoryRoute(route);
   check('Authored model and route begin',g.story.currentPhase==='approach'&&g.destination.root.userData.authored,g.story.toSave());
   const arrival=g.story.toSave().active.arrivalDistance;
   g.world.reset(arrival-(route==='meridian-quiet-line'?520:620));g.updateStory();
   check('Correct actual existing patrol appears',route==='meridian-quiet-line'?g.vehicleManager.active&&g.scriptedSkiffActive:g.gunboatScene.active&&g.scriptedGunboatActive);
   g.world.reset(arrival-100);g.updateStory();
   check('Unresolved patrol holds destination at 220m',g.story.snapshot(g.world.distanceTraveled).remainingM>=220,g.story.snapshot(g.world.distanceTraveled));
   if(route==='meridian-quiet-line')g.vehicleManager.damageHull(100000);
   else {g.gunboatScene.damage('weapon',100000);g.gunboatScene.damage('engine',100000);}
   for(let i=0;i<1500;i++)g.updateVehicles(1/60);
   check('Actual patrol callback resolves story encounter',g.story.toSave().active.scriptedEncounter==='resolved');
   const target=g.story.toSave().active.arrivalDistance;g.world.reset(target);g.machine.movement.speed=0;
   for(let i=0;i<3;i++)g.updateStory();
   check('Docked with both required objectives incomplete',g.destination.docked&&g.story.snapshot(target).completedObjectives.length===0,g.story.snapshot(target));
   const solution=g.destination.interactables.find(x=>x.kind==='unique');g.player.teleport(solution.position);
   check('Solution gated before objectives and journals',!g.openInteractable(solution)&&!g.story.canDepart(true));
   for(const id of ['meridian-transmitter-online','meridian-archive-installed']){
    const t=g.destination.interactables.find(x=>x.id===id);g.player.teleport(t.position);check('Physical objective '+id,g.openInteractable(t));
   }
   const selected=route==='meridian-quiet-line'?'meridian-civilian-record':'meridian-defense-record';
   const blocked=route==='meridian-quiet-line'?'meridian-defense-record':'meridian-civilian-record';
   const blockedTarget=g.destination.interactables.find(x=>x.id===blocked);g.player.teleport(blockedTarget.position);
   check('Alternate testimony unavailable',!g.candidates().some(x=>x.id===blocked));
   for(const id of [selected,'meridian-common-record']){
    const t=g.destination.interactables.find(x=>x.id===id);g.player.teleport(t.position);g.openInteractable(t);g.closePanels(false);
   }
   g.player.teleport(solution.position);check('Recovered solution grants tier3',g.openInteractable(solution)&&g.course.snapshot.tier===3);
   check('Memory-core installation preserves prior recovered fact',g.story.snapshot(target).recoveredUniques.includes('orchard-memory-core'));
   check('Both records archived, alternate not fabricated',g.story.journalArchive.includes(selected)&&g.story.journalArchive.includes('meridian-common-record')&&!g.story.journalArchive.includes(blocked),g.story.journalArchive);
   g.player.teleport({x:6,y:15.96,z:4});check('Completed objectives permit departure',g.story.canDepart(true));
   const saved=await g.saveTo('meridian-'+route,'manual',true);const loaded=saved&&await g.loadFrom('meridian-'+route);g.loop.stop();g.state.paused=false;
   check('Real docked save/load preserves route/objectives/tier',loaded&&g.destination.docked&&g.course.snapshot.tier===3&&g.story.snapshot(target).completedObjectives.length===2&&g.story.toSave().active.routeId===route);
   g.titleCamera=g.renderer.camera;g.titleCamera.position.set(-1,32,-28);g.titleCamera.lookAt(17,20,0);g.render(0);
   return rows;
  },route));
  await page.screenshot({path:out+'/'+route+'.png'});
  checks.push(...await page.evaluate(()=>{
   const g=globalThis.__game.game;g.titleCamera=null;g.player.teleport({x:6,y:15.96,z:4});g.requestExpeditionDeparture();const target=g.story.toSave().active.arrivalDistance;
   g.world.reset(target+90);g.machine.movement.speed=5;g.updateStory();
   return [{name:'Meridian departure enables deliberate final course',ok:g.endingEligible&&g.ending.phase==='available'&&!g.destination.active,detail:g.story.snapshot(g.world.distanceTraveled)}];
  }));
 }
 checks.push(...await page.evaluate(async()=>{
  const g=globalThis.__game.game,rows=[];const check=(name,ok,detail)=>rows.push({name,ok:!!ok,detail});
  g.destination.setActive(false);g.optionalModelId=null;g.routeChart.reset();g.director.reset(g.world.distanceTraveled);g.course.holdCourse();g.machine.power.restore({fuel:100});g.tickPower(.01);g.openHelm();
  const before=JSON.stringify({course:g.course.toSave(),resources:g.inventory.toSave?.()??g.inventory.slots,story:g.story.toSave()});
  const save=g.saves.save.bind(g.saves);g.saves.save=async()=>{throw Error('Injected checkpoint failure');};
  check('Failed checkpoint does not commit',!await g.commitMeridianEnding()&&g.ending.phase==='available');
  check('Failed checkpoint keeps world and resources unchanged',before===JSON.stringify({course:g.course.toSave(),resources:g.inventory.toSave?.()??g.inventory.slots,story:g.story.toSave()}));g.saves.save=save;
  check('Retry remains enabled',!document.querySelector('[data-testid="helm-commit-ending"]').disabled);
  // A queued threat must not be erased by sanctuary even before enemy spawn.
  const threat=g.director.toSave();g.director.restore({...threat,phase:'buildup'});
  check('Incoming unspawned threat refuses commitment',!await g.commitMeridianEnding()&&g.director.currentPhase==='buildup');g.director.reset(g.world.distanceTraveled);
  g.helmUI.render(g.helmView());
  check('Clearing a temporary threat re-enables confirmation',!document.querySelector('[data-testid="helm-commit-ending"]').disabled);
  g.saves.save=async(slot,payload)=>{await save(slot,payload);g.director.restore({...g.director.toSave(),phase:'buildup'});};
  check('Post-checkpoint threat revalidation refuses takeover',!await g.commitMeridianEnding()&&g.ending.phase==='available'&&g.director.currentPhase==='buildup');g.saves.save=save;g.director.reset(g.world.distanceTraveled);
  check('Successful checkpoint commits exactly once',await g.commitMeridianEnding()&&g.ending.phase==='committed',g.ending.snapshot);
  const checkpoint=await g.saves.load('meridian-checkpoint');check('Checkpoint contains available ending before control takeover',checkpoint.world.story.ending.phase==='available');
  await save('quicksave',{...checkpoint,savedAt:1});
  check('Continue chooses recent Meridian checkpoint over stale quicksave',await g.newestSave()==='meridian-checkpoint');
  check('Ending owns course and sanctuary',g.courseContext().locked&&g.director.toSave().sanctuaryActive&&!g.helmUI.isOpen);
  const saved=await g.saveTo('meridian-committed');check('Committed save written',saved);await g.loadFrom('meridian-committed');g.loop.stop();g.state.paused=false;
  check('Committed load resumes phase and earned authority',g.ending.phase==='committed'&&g.course.snapshot.tier===3&&g.director.toSave().sanctuaryActive);
  const start=g.world.distanceTraveled,lat=g.course.snapshot.lateralM,fuel=g.machine.power.fuel;
  let steps=0;while(g.ending.phase==='committed'&&steps++<20000)g.fixedUpdate(1/60);
  check('Natural 400m journey reaches arrival',g.ending.phase==='arrival'&&g.world.distanceTraveled>=start+400&&g.world.distanceTraveled<start+401,{steps,distance:g.world.distanceTraveled-start});
  check('Journey consumes normal fuel and steers',g.machine.power.fuel<fuel&&g.course.snapshot.lateralM>lat+100,{fuelUsed:fuel-g.machine.power.fuel,lateral:g.course.snapshot.lateralM-lat});
  check('Arrival owns camera and presents original refuge',g.arrivalScene?.active&&g.arrivalScene.root.visible&&g.isFreeCamera);
  for(let i=0;i<240;i++)g.fixedUpdate(1/60);
  const pauseTime=g.ending.snapshot.arrivalElapsedS,pauseDistance=g.world.distanceTraveled;g.state.paused=true;
  for(let i=0;i<600;i++)g.fixedUpdate(1/60);
  check('Pause stops arrival and world clocks',g.ending.snapshot.arrivalElapsedS===pauseTime&&g.world.distanceTraveled===pauseDistance);g.state.paused=false;
  await g.saveTo('meridian-arrival');await g.loadFrom('meridian-arrival');g.loop.stop();g.state.paused=false;
  check('Arrival save restores elapsed time and camera',Math.abs(g.ending.snapshot.arrivalElapsedS-pauseTime)<1e-6&&g.arrivalScene.active&&g.options.hudRoot.classList.contains('is-hidden'));
  const arrivalLat=g.course.snapshot.lateralM;
  while(g.ending.phase==='arrival')g.fixedUpdate(1/60);
  check('Natural 12s arrival reaches credits and advances lateral projection',g.ending.phase==='credits'&&g.course.snapshot.lateralM>arrivalLat&&g.ending.snapshot.arrivalElapsedS===12);
  g.render(0);
  return rows;
 }));
 await page.screenshot({path:out+'/credits.png'});
 checks.push(...await page.evaluate(async()=>{
  const g=globalThis.__game.game,rows=[];const check=(name,ok,detail)=>rows.push({name,ok:!!ok,detail});
  await g.saveTo('meridian-credits');await g.loadFrom('meridian-credits');g.loop.stop();g.state.paused=false;
  check('Credits restore without replaying journey',g.ending.phase==='credits'&&g.arrivalScene.active);
  const state=()=>JSON.stringify({distance:g.world.distanceTraveled,course:g.course.toSave(),player:g.buildSave().player,machine:g.buildSave().machine,build:g.build.serialise(),facts:g.story.toSave(),chart:g.routeChart.toSave()});
  const before=state();g.finishMeridianEnding(false);check('Keep Walking releases camera and sanctuary',g.ending.phase==='complete'&&!g.arrivalScene.active&&g.director.currentPhase==='recovery'&&Number.isFinite(g.director.toSave().sanctuaryReleaseAt));
  check('Completion does not alter resources/builds/gardens/world/course',before===state());
  g.finishMeridianEnding(false);g.finishMeridianEnding(true);check('Repeated completion input is idempotent',before===state());
  await g.saveTo('meridian-complete');await g.loadFrom('meridian-complete');g.loop.stop();g.state.paused=false;
  check('Completion remains complete after actual load',g.ending.phase==='complete'&&!g.arrivalScene.active&&g.course.snapshot.tier===3);
  g.openHelm();check('Full control restored with Meridian authority',!g.courseContext().locked&&!g.helmView().ending.available);g.openExpedition();
  check('Readable journal archive survives chapter departure and load',document.querySelectorAll('[data-archive-id]').length>=g.story.journalArchive.length&&document.querySelector('[data-expedition-archive]')?.textContent?.includes('Meridian'),g.story.journalArchive);
  const resources=JSON.stringify(g.buildSave().player);g.openExpedition();g.openExpedition();check('Archive rereads never grant rewards',JSON.stringify(g.buildSave().player)===resources);
  g.closePanels(false);g.world.reset(Math.ceil((g.world.distanceTraveled+450)/700)*700-450);g.updateOpportunities();check('Optional discoveries and raids remain available',!!g.routeChart.contact&&g.story.permitsRadioRaids&&!g.chartContext.storyPriority);
  // Reloading a pre-ending checkpoint exposes the deliberate choice again.
  await g.loadFrom('meridian-checkpoint');g.loop.stop();g.state.paused=false;g.director.reset(g.world.distanceTraveled);g.openHelm();await g.commitMeridianEnding();
  check('Skip committed journey enters same-save continuation',g.ending.phase==='committed'&&(g.finishMeridianEnding(true),g.ending.phase==='complete')&&!g.arrivalScene?.active);
  await g.loadFrom('meridian-committed');g.loop.stop();g.state.paused=false;
  g.world.reset(g.ending.snapshot.committedAtDistance+400);
  g.player.stats.invulnerable=false;g.player.stats.damage(g.player.stats.health,'QA boundary damage',g.player.worldPosition);
  g.updateEnding(1/60);
  check('A lethal arrival-boundary hit defers camera takeover',g.state.playerDead&&g.ending.phase==='committed'&&!g.arrivalScene?.active);
  let respawnSteps=0;while(g.ending.phase==='committed'&&respawnSteps++<600)g.fixedUpdate(1/60);
  check('Normal respawn completes before arrival begins',!g.state.playerDead&&g.player.stats.alive&&g.ending.phase==='arrival',{respawnSteps,phase:g.ending.phase,dead:g.state.playerDead});
  g.finishMeridianEnding(true);
  check('Skipping restored arrival releases ownership once',g.ending.phase==='complete'&&!g.arrivalScene.active);
  return rows;
 }));
}catch(error){errors.push(error.stack??String(error));}
finally{await browser.close();}
await writeFile(out+'/qa.json',JSON.stringify({site,checks,errors},null,2));
console.log(JSON.stringify({passed:checks.filter(x=>x.ok).length,total:checks.length,failed:checks.filter(x=>!x.ok),errors},null,2));
if(checks.some(x=>!x.ok)||errors.length)process.exitCode=1;
