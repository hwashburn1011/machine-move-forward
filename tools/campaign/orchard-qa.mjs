import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5201/';
const out = process.env.MMF_QA_OUT ?? 'test-results/orchard';
await mkdir(out, {recursive:true});
const checks=[], errors=[];
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu']});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(site+'?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=medium&seed=orchard-qa');
  await page.waitForFunction(()=>globalThis.__game?.game?.player?.visual?.isAnimated,null,{timeout:180000});
  checks.push(...await page.evaluate(()=>{
    const g=globalThis.__game.game, rows=[];
    const check=(name,ok,detail)=>rows.push({name,ok:!!ok,detail});
    g.loop.stop();g.firstRun.restore({completed:['salvage','build-refinery','refine-components','build-workbench','build-defense','survive-boarding','repair'],counters:{}});g.closePanels(false);g.state.paused=false;g.state.playerDead=false;g.enemies.despawnAll();
    g.vehicleScene.clear();g.gunboatScene.clear();g.player.stats.invulnerable=true;
    g.player.teleport({x:6,y:15.96,z:4});g.machine.power.restore({fuel:100});
    g.progression.earlyRadioDrop.restore({status:'found',armedAtSimTime:0,foundAtSimTime:1,foundAtDistance:1,eligibleChestsOpened:1});
    for(const id of [g.radioPowerConsumerId,g.helmPowerConsumerId]){
      g.machine.power.unregisterConsumer(id);g.machine.power.registerConsumer({id,draw:1,priority:'station'});
    }
    g.tickPower(.01);
    globalThis.orchardBase={format:2,completed:['wreck-one','relay-foundry','quiet-array'],
      recoveredUniques:['course-gyro','salvage-controller','tracking-servo','course-actuator','annika-archive-shard'],active:null,chapterComplete:true};
    g.story.restore({format:2,completed:['wreck-one'],recoveredUniques:['course-gyro'],active:null,chapterComplete:false});
    const foundry=g.expeditionView().routeCards;
    check('Existing Wreck departure still offers both Foundry routes',foundry.length===2&&foundry.every(x=>x.id.startsWith('foundry-')),foundry);
    g.story.restore(globalThis.orchardBase);g.course.setTier(1);g.routeChart.reset();g.destination.setActive(false);
    g.world.reset(250);g.director.reset(250);
    g.updateOpportunities();
    check('Passive Orchard offer coexists with detected discovery',g.story.snapshot(g.world.distanceTraveled).nextExpedition?.id==='glass-orchard' && g.routeChart.contact?.state==='detected' && !g.chartContext.storyPriority,g.routeChart.contact);
    g.openRadio();
    const button=document.querySelector('[data-radio-trace-button]');
    check('Radio offers Orchard',button?.textContent?.includes('Orchard')&&!button.disabled,button?.textContent);
    button.click();
    check('Tracing opens Orchard route choice without replacing a committed site',g.story.currentPhase==='route-selection' && g.expeditionUI.isOpen,g.story.snapshot(g.world.distanceTraveled));
    const cards=[...document.querySelectorAll('[data-route-card]')].map(e=>e.dataset.routeCard);
    check('Route panel contains only two Orchard routes',cards.length===2&&cards.every(x=>x.startsWith('orchard-')),cards);
    check('Seed garden remains locked before recovery',!g.build.canBuildPiece('seed-garden'));
    return rows;
  }));
  await page.screenshot({path:out+'/route-choice.png'});
  for(const route of ['orchard-caretaker','orchard-cold-vault']) {
    checks.push(...await page.evaluate(async route=>{
      const g=globalThis.__game.game,rows=[];
      const check=(name,ok,detail)=>rows.push({name:route+': '+name,ok:!!ok,detail});
      g.closePanels(false);g.state.paused=false;g.destination.setActive(false);g.optionalModelId=null;g.routeChart.reset();
      g.enemies.despawnAll();g.vehicleScene.clear();g.gunboatScene.clear();g.pendingBoardingOutcome=null;
      g.scriptedGunboatPending=false;g.scriptedGunboatActive=false;g.scriptedSkiffPending=false;g.scriptedSkiffActive=false;
      g.player.teleport({x:6,y:15.96,z:4});g.world.reset(4000);g.director.reset(4000);
      g.story.restore(globalThis.orchardBase);
      const begin=g.story.beginNextExpedition({currentDistance:4000,stable:true,playerOnMachine:true,encounterActive:false});
      g.applyStoryEffects(begin.effects);g.selectStoryRoute(route);
      check('Route accepted and authored model loaded',g.story.currentPhase==='approach' && g.destination.root.userData.authored,g.story.snapshot(4000));
      let arrival=g.story.toSave().active.arrivalDistance;
      g.world.reset(arrival-(route==='orchard-caretaker'?420:500));g.updateStory();
      check('Correct patrol actually spawned',route==='orchard-caretaker'?g.vehicleManager.active&&g.scriptedSkiffActive:g.gunboatScene.active&&g.scriptedGunboatActive,{skiff:g.vehicleManager.active,gunboat:g.gunboatScene.active});
      // Exercise actual damage and scene callbacks; no direct Story resolution.
      if(route==='orchard-caretaker'){
        g.vehicleManager.damageHull(100000);g.updateVehicles(1/60);
      } else {g.gunboatScene.damage('weapon',100000);g.gunboatScene.damage('engine',100000);g.updateVehicles(1/60);}
      for(let i=0;i<1200 && (g.vehicleManager.active||g.gunboatScene.active||g.pendingBoardingOutcome);i++)g.updateVehicles(1/60);
      check('Patrol outcome resolves story exactly once',g.story.toSave().active.scriptedEncounter==='resolved',g.story.toSave().active);
      const resources=g.resources.count('scrap');
      for(let i=0;i<60;i++)g.updateVehicles(1/60);
      check('No duplicate patrol reward',g.resources.count('scrap')===resources);
      g.world.reset(arrival);g.machine.movement.speed=0;
      for(let i=0;i<3;i++)g.updateStory();
      check('Story braking deploys gangway',g.story.currentPhase==='docked' && g.destination.docked,g.story.snapshot(arrival));
      const intact=route==='orchard-caretaker'?'orchard-port-isolator':'orchard-starboard-isolator';
      check('Intact route isolator already complete and hidden from interactions',g.story.snapshot(arrival).completedObjectives.includes(intact)&&!g.destination.interactables.some(x=>x.id===intact));
      g.player.teleport({x:6,y:15.96,z:4});g.openRadio();
      check('Departure disabled before required recovery',!g.story.canDepart(true));g.closePanels(false);
      const far=g.destination.interactables.find(x=>x.id==='orchard-vector-governor');
      check('Cannot collect distant governor',!g.collectStoryUnique(far.id));
      g.player.teleport(far.position);check('Governor gated before records and isolators',!g.collectStoryUnique(far.id));
      const broken=g.destination.interactables.find(x=>x.kind==='objective');
      g.player.teleport(broken.position);check('Physical isolator interaction completes objective',g.openInteractable(broken));
      const testimony=route==='orchard-caretaker'?'orchard-caretaker-record':'orchard-evacuation-record';
      const unavailable=route==='orchard-caretaker'?'orchard-evacuation-record':'orchard-caretaker-record';
      const blocked=g.destination.interactables.find(x=>x.id===unavailable);
      g.player.teleport(blocked.position);
      check('Alternate testimony not offered as a usable interaction',!g.candidates().some(x=>x.id===unavailable));
      for(const id of [testimony,'orchard-memory-record']){
        const t=g.destination.interactables.find(x=>x.id===id);g.player.teleport(t.position);g.openInteractable(t);g.closePanels(false);
      }
      for(const id of ['orchard-human-seed-bank','orchard-memory-core','orchard-vector-governor']){
        const t=g.destination.interactables.find(x=>x.id===id);g.player.teleport(t.position);
        check('Recover '+id,g.openInteractable(t));
      }
      check('Recoveries unlock tier two and seed garden',g.course.snapshot.tier===2&&g.build.canBuildPiece('seed-garden'),g.course.snapshot);
      g.player.teleport({x:6,y:15.96,z:4});
      check('All required records and parts permit departure',g.story.canDepart(true));
      const saved=await g.saveTo('orchard-'+route,'manual',true);
      const loaded=saved && await g.loadFrom('orchard-'+route);g.loop.stop();g.closePanels(false);g.state.paused=false;
      check('Actual docked save/load preserves route, objectives, authority',loaded&&g.story.toSave().active.routeId===route&&g.story.snapshot(arrival).completedObjectives.length===2&&g.course.snapshot.tier===2&&g.destination.docked,g.story.toSave());
      g.titleCamera=g.renderer.camera;g.titleCamera.position.set(0,29,-27);g.titleCamera.lookAt(17,16,0);g.render(0);
      return rows;
    },route));
    await page.screenshot({path:out+'/'+route+'.png'});
    checks.push(...await page.evaluate(()=>{
      const g=globalThis.__game.game;g.titleCamera=null;g.player.teleport({x:6,y:15.96,z:4});
      g.requestExpeditionDeparture();const arrival=g.story.toSave().active.arrivalDistance;
      g.world.reset(arrival+90);g.machine.movement.speed=5;g.updateStory();
      return [{name:'Orchard departure resumes open travel',ok:g.story.currentPhase==='complete'&&!g.destination.active,detail:g.story.snapshot(g.world.distanceTraveled)}];
    }));
  }
  checks.push(...await page.evaluate(async()=>{
    const g=globalThis.__game.game,rows=[];const check=(name,ok,detail)=>rows.push({name,ok:!!ok,detail});
    g.player.teleport({x:0,y:15.96,z:0});g.inventory.clear();g.resources.deposit('water',2);
    const cells=g.machine.deckCells;let placed=null;
    for(const cell of cells){g.build.place({piece:'floor',cell,rotation:0},true);const p=g.build.place({piece:'seed-garden',cell,rotation:0},true);if(p){placed=p;break;}}
    check('Seed garden can be placed on a real available deck cell',!!placed,placed);
    if(placed){
      const id=placed.instanceId??placed.id??g.build.serialise().find(x=>x.definitionId==='seed-garden').instanceId;
      const station=g.build.stationsNear(g.player.worldPosition,Infinity).find(x=>x.instanceId===id);
      g.player.teleport(station.position);
      const target=g.candidates().find(x=>x.id===id);
      check('Real E interaction loads two water and renders plants',g.openInteractable(target)&&g.build.gardenSnapshot(id).water===2&&g.build.visual(id).getObjectByName('Growing').visible,g.build.gardenSnapshot(id));
      for(let i=0;i<180*60;i++)g.tickProducers(1/60);
      check('Three greens grow in 180 simulation seconds',g.build.gardenSnapshot(id).greens===3&&g.build.visual(id).getObjectByName('Ready').visible,g.build.gardenSnapshot(id));
      check('E harvest deposits only actual output',g.openInteractable(target)&&g.resources.count('greens')===3&&g.build.gardenSnapshot(id).greens===0);
      for(let i=0;i<75*60;i++)g.tickProducers(1/60);
      const before=g.build.gardenSnapshot(id);await g.saveTo('orchard-garden','manual',true);await g.loadFrom('orchard-garden');g.loop.stop();g.state.paused=false;
      check('Garden mid-growth survives real save/load',JSON.stringify(g.build.gardenSnapshot(id))===JSON.stringify(before),g.build.gardenSnapshot(id));
    }
    // Loading a queued patrol rebuilds the pending request, never skips it.
    const payload=g.buildSave();payload.world.story={...globalThis.orchardBase,active:{expeditionId:'glass-orchard',routeId:'orchard-caretaker',phase:'braking',arrivalDistance:payload.distanceTraveled+220,scriptedEncounter:'queued',journalsRead:[],objectivesCompleted:['orchard-port-isolator']}};
    await g.saves.save('orchard-queued',payload);await g.loadFrom('orchard-queued');g.loop.stop();g.state.paused=false;
    check('Queued skiff save re-arms pending encounter',g.scriptedSkiffPending&&!g.scriptedSkiffActive&&g.story.toSave().active.scriptedEncounter==='queued');
    g.enemySpawnsEnabled=true;
    // Advance the existing 300m sanctuary recovery window in this save fixture.
    g.world.reset(g.world.distanceTraveled+301);
    for(let i=0;i<300&&!g.scriptedSkiffActive;i++){g.player.needs.restore({hydration:100,nourishment:100});g.fixedUpdate(1/60);}
    check('Restored queued skiff eventually spawns without softlock',g.scriptedSkiffActive&&g.vehicleManager.active,{pending:g.scriptedSkiffPending,phase:g.director.currentPhase,story:g.story.toSave()});
    g.vehicleManager.damageHull(100000);for(let i=0;i<1200;i++)g.updateVehicles(1/60);
    check('Restored patrol can resolve normally',g.story.toSave().active.scriptedEncounter==='resolved');
    return rows;
  }));
} catch(e){errors.push(e.stack??String(e));}
finally{await browser.close();}
const result={site,checks,errors,passed:checks.filter(x=>x.ok).length,total:checks.length};
await writeFile(out+'/qa.json',JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,total:result.total,failed:checks.filter(x=>!x.ok),errors},null,2));
if(errors.length||checks.some(x=>!x.ok))process.exitCode=1;
