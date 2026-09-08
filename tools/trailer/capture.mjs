/** Capture staged scenes inside the real game; no rendered mockups or fake gameplay. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const raw = resolve(root, 'assets/trailer/raw');
await mkdir(raw, {recursive:true});
const selected = process.argv[2];
const browser = await chromium.launch({
  executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--use-angle=d3d11','--enable-gpu'],
});
const evidence=[];
const delay = (page, ms) => page.waitForTimeout(ms);
async function aim(page, part) {
  await page.evaluate(part => {
    const g=globalThis.__game.game, c=g.playerCamera;
    const p=part==='salvage' ? g.salvage.targets[0] : g.gunboatScene.getTargetPosition(part);
    if(!p) return;
    const target=p;
    const dx=target.x-c.camera.position.x,dy=target.y-c.camera.position.y,dz=target.z-c.camera.position.z;
    c.setYaw(Math.atan2(-dx,-dz)-c.recoilYaw);
    c.pitch=Math.atan2(dy,Math.hypot(dx,dz))-c.recoilPitch;
  },part);
}
async function capture(name, duration, stage, action) {
  if(selected && selected!==name) return;
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,
    recordVideo:{dir:raw,size:{width:1280,height:720}}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${process.env.MMF_PORT??5193}/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=trailer-${name}`);
  await page.waitForFunction(()=>globalThis.__game?.game,null,{timeout:60000});
  await page.evaluate(()=>{
    const g=globalThis.__game.game;
    g.player.stats.invulnerable=true;
    g.machine.power.restore({fuel:100});
    g.opening.restore({phase:'done'});
    g.firstRun.restore({completed:['salvage','build-refinery','refine-components','build-workbench','build-defense','survive-boarding','repair'],counters:{}});
    g.closePanels();
    // Presentation-only capture. The actual simulation and gameplay inputs
    // continue; text is added in the video edit rather than obstructing play.
    document.querySelector('#hud').style.opacity='0';
  });
  await delay(page,1500);
  await stage(page);
  await delay(page,500);
  const before=await page.evaluate(()=>globalThis.__game.debugStats());
  if(action) await action(page,duration);
  else await delay(page,duration*1000);
  const after=await page.evaluate(()=>globalThis.__game.debugStats());
  await page.screenshot({path:resolve(raw,`${name}.png`)});
  const video=page.video();
  await context.close();
  await video.saveAs(resolve(raw,`${name}.webm`));
  evidence.push({name,duration,before,after,errors});
  console.log(JSON.stringify(evidence.at(-1)));
  if(errors.length) throw new Error(`${name}: ${errors.join('; ')}`);
}
try {
  await capture('walker',6,async page=>{
    await page.evaluate(()=>{
      const g=globalThis.__game.game;
      g.freeCamera=g.renderer.camera;
      g.freeCamera.position.set(16,10,21);
      g.freeCamera.lookAt(0,2.7,0);
      const start=performance.now();
      globalThis.__trailerOrbit=setInterval(()=>{
        const angle=.6+(performance.now()-start)*.000019;
        g.freeCamera.position.set(Math.sin(angle)*26,10,Math.cos(angle)*26);
        g.freeCamera.lookAt(0,2.5,0);
      },16);
    });
  });
  await capture('salvage',7,async page=>{
    await page.evaluate(()=>{
      const g=globalThis.__game.game;
      g.salvage.armAfterOpening(g.world.distanceTraveled);
    });
    await page.waitForFunction(()=>{
      const g=globalThis.__game.game,p=g.salvage.targets[0];
      return p&&g.player.worldPosition.distanceTo(p)<31;
    },null,{timeout:20000});
    for(let i=0;i<20;i++){await aim(page,'salvage');await delay(page,35);}
  },async(page,duration)=>{
    await page.keyboard.press('f');
    await delay(page,duration*1000);
  });
  await capture('combat',9,async page=>{
    await page.evaluate(()=>{
      const g=globalThis.__game.game;
      g.player.teleport(g.player.worldPosition.clone().set(-3.8,4.8,0));
      g.director.reset(g.world.distanceTraveled);
      g.director.queueExternal('gunboat');
      if(!g.spawnGunboatEncounter('port'))throw new Error('Gunboat staging failed');
    });
    await page.waitForFunction(()=>globalThis.__game.game.gunboatScene.snapshot?.phase==='broadside',null,{timeout:15000});
    await page.mouse.down({button:'right'});
    for(let i=0;i<20;i++){await aim(page,'engine');await delay(page,35);}
  },async(page,duration)=>{
    const start=Date.now();
    while(Date.now()-start<duration*1000){
      const state=await page.evaluate(()=>globalThis.__game.game.gunboatScene.snapshot);
      if(!state){await delay(page,100);continue;}
      // Fire through the real camera ray at the exposed drive and gun units.
      await aim(page,state.engineHealth>0?'engine':'weapon');
      await page.mouse.down();await delay(page,105);await page.mouse.up();
      await delay(page,150);
    }
    await page.mouse.up({button:'right'});
  });
  await capture('foundry',7,async page=>{
    await page.evaluate(()=>{
      const g=globalThis.__game.game;
      g.story.restore({format:2,completed:['wreck-one'],recoveredUniques:['course-gyro'],active:{
        expeditionId:'relay-foundry',routeId:'foundry-detour',phase:'docked',
        arrivalDistance:g.world.distanceTraveled,journalsRead:[],scriptedEncounter:'not-due'}});
      g.destination.setActive(false);g.destination.configure(g.story.chapter);
      g.destination.setArrivalDistance(g.world.distanceTraveled);g.destination.setActive(true);g.destination.setDocked(true);
      g.machine.setExpeditionGangwayOpen(true);g.machine.movement.setScriptedSpeedLimit(0);
      g.player.teleport(g.player.worldPosition.clone().set(7.3,4.8,0));
      g.playerCamera.setYaw(-Math.PI/2);g.playerCamera.pitch=-.08;
    });
  },async(page,duration)=>{
    await page.keyboard.down('w');await delay(page,1300);await page.keyboard.up('w');
    await page.evaluate(()=>{const g=globalThis.__game.game;g.playerCamera.setYaw(-2.5);g.playerCamera.pitch=-.12;});
    await delay(page,(duration*1000)-1300);
  });
  await capture('automation',7,async page=>{
    await page.evaluate(()=>{
      const g=globalThis.__game.game;
      g.progression.grantBlueprint('automatic-salvage-collector');
      g.progression.grantBlueprint('automatic-defense-turret');
      const devices=[['collector-auto',-3,-2],['turret-auto',-3,0]];
      for(const[piece,x,z]of devices){
        const cell={x,y:0,z};g.build.place({piece:'floor',cell,rotation:0},true);
        if(!g.build.place({piece,cell,rotation:0},true))throw new Error(`Could not stage ${piece}`);
      }
      g.salvage.armAfterOpening(g.world.distanceTraveled);
      g.gunboatScene.spawn('port');
      g.player.teleport(g.player.worldPosition.clone().set(-2.9,4.8,-3));
      g.freeCamera=g.renderer.camera;
      g.freeCamera.position.set(-11,8,7);
      g.freeCamera.lookAt(-5,4,-1);
    });
    await delay(page,6000);
  });
} finally {
  await browser.close();
  await writeFile(resolve(raw,'capture-report.json'),JSON.stringify(evidence,null,2));
}
