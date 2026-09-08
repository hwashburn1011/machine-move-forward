/** In-game screenshots; chapter state is staged only for the docked art view. */
import {chromium} from '@playwright/test';
import {browserLaunchOptions} from '../../browser-options.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch(browserLaunchOptions);
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:5194/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&cam=front&seed=graphics-review');
 await page.waitForFunction(()=>globalThis.__game?.game,null,{timeout:120000});
 await page.waitForTimeout(700);
 await page.screenshot({path:'docs/art/graphics-v2/machine-game.png'});
 await page.evaluate(()=>{
  const g=globalThis.__game.game;
  g.build.setBuildAuthorization(()=>true);
  g.build.setBuildBlocker(()=>null);
  for(const [piece,x,z] of [['refinery',-1,0],['workbench',0,1],['generator',1,1]])g.build.place({piece,cell:{x,y:0,z},rotation:0},true);
  g.renderer.camera.position.set(8,10,10);g.renderer.camera.lookAt(0,4.5,1);
 });
 await page.waitForTimeout(400);await page.screenshot({path:'docs/art/graphics-v2/stations-game.png'});
 await page.evaluate(()=>{
  const g=globalThis.__game.game;g.machine.movement.setThrottle(0);g.machine.movement.setScriptedSpeedLimit(0);
  g.firstRun.restore({completed:['salvage','build-refinery','refine-components','build-workbench','build-defense','survive-boarding','repair'],counters:{}});
  g.progression.earlyRadioDrop.restore({status:'found',armedAtSimTime:0,foundAtSimTime:1,foundAtDistance:42,eligibleChestsOpened:1});
  g.story.restore({chapterId:'wreck-one',phase:'docked',arrivalDistance:g.world.distanceTraveled,journalsRead:[],uniqueCollected:false,nextSignal:false});
  g.destination.setActive(true);g.destination.setDocked(true);g.machine.setExpeditionGangwayOpen(true);
  g.renderer.camera.position.set(24,18,22);g.renderer.camera.lookAt(8,4,0);
 });
 await page.waitForTimeout(600);await page.screenshot({path:'docs/art/graphics-v2/wreck-game.png'});
 await writeFile('docs/art/graphics-v2/view-capture.json',JSON.stringify({errors,method:'Machine, placed stations, explicitly staged docked wreck in the real game renderer.'},null,2)+'\n');
 console.log(JSON.stringify({errors}));if(errors.length)process.exitCode=1;
}finally{await browser.close();}
