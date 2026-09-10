import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
function check(name,ok,detail){checks.push({name,ok,detail});console.log(JSON.stringify(checks.at(-1)));if(!ok)process.exitCode=1;}
try{
 await page.goto('http://127.0.0.1:5193/?nomenu=1&nolock=1&nospawn=1&nosound=1&quality=medium');
 await page.waitForFunction(()=>globalThis.__game?.game,null,{timeout:120000});
 await page.click('#game');await page.evaluate(()=>{__game.game.state.paused=false;__game.game.world.reset(90);});
 await page.waitForFunction(()=>__game.game.salvage.targets.some(t=>Math.hypot(t.x-__game.player.worldPosition.x,t.y-__game.player.worldPosition.y,t.z-__game.player.worldPosition.z)<24),null,{timeout:35000});
 const reel=await page.evaluate(async()=>{
  const g=__game.game, THREE=await import('/node_modules/.vite/deps/three.js');
  const target=g.salvage.targets.find(t=>Math.hypot(t.x-g.player.worldPosition.x,t.y-g.player.worldPosition.y,t.z-g.player.worldPosition.z)<24);
  if(!target)return {target:false};
  g.freeCamera=g.renderer.camera;g.freeCamera.position.copy(g.player.worldPosition).add(new THREE.Vector3(0,.5,0));
  g.freeCamera.lookAt(new THREE.Vector3(target.x,target.y,target.z+1.3));g.freeCamera.updateMatrixWorld(true);
  g.fireReel();g.freeCamera=null;return {target:true,id:target.id,from:g.player.worldPosition.toArray(),to:[target.x,target.y,target.z]};
 });
 await page.waitForTimeout(6000);
 const salvage=await page.evaluate(()=>({step:__game.game.firstRun.current,blueprint:__game.game.progression.turretBlueprintReady}));
 check('salvage reel reaches the lower ground from the raised deck',reel.target&&salvage.blueprint,{reel,salvage});
 const save=await page.evaluate(async()=>{
  const g=__game.game;g.freeCamera=null;
  const snapshot=g.buildSave();await g.saves.save('nomad-qa',snapshot);
  const loaded=await g.loadFrom('nomad-qa');
  const current={loaded,layout:snapshot.machine.layout,y:g.player.worldPosition.y,pieces:g.build.pieceCount};
  delete snapshot.machine.layout;snapshot.player.position.y=4.8;
  snapshot.machine.structures.push({instanceId:'bp-80',definitionId:'crate',cell:{x:2,y:0,z:-2},rotation:0,health:43,state:{slots:[{itemId:'components',count:3}]}});
  await g.saves.save('nomad-legacy-qa',snapshot);const migrated=await g.loadFrom('nomad-legacy-qa');
  return {current,migrated,y:g.player.worldPosition.y,crate:g.build.serialise().find(p=>p.instanceId==='bp-80'),stored:g.build.recoveryPieces};
 });
 check('current saves restore on the elevated deck',save.current.loaded&&save.current.layout==='iron-nomad-v1'&&save.current.y>15&&save.current.pieces===2,save.current);
 check('legacy saves relocate conflicting cargo without losing its contents',save.migrated&&save.y>15&&save.crate?.health===43&&save.crate?.state?.slots?.[0]?.count===3,save);
 await page.evaluate(()=>{const g=__game.game;g.vehicleScene.clear();g.enemies.despawnAll();g.vehicleScene.spawn('port');});
 await page.waitForFunction(()=>__game.game.enemies.active.some(e=>e.def.id==='raider'&&e.gridCell.y===0),null,{timeout:55000});
 const boarders=await page.evaluate(()=>__game.game.enemies.active.map(e=>({id:e.def.id,cell:e.gridCell,y:e.position?.y,path:e.pathLength})));
 check('skiff boarders reach the new top deck',boarders.some(e=>e.id==='raider'&&e.cell.y===0),boarders);
 await page.screenshot({path:'docs/art/iron-nomad-playable/boarding.png'});
 check('no runtime exceptions',errors.length===0,errors);
}catch(e){check('runtime systems complete',false,String(e));}
finally{await writeFile('docs/art/iron-nomad-playable/systems-qa.json',JSON.stringify({checks,errors},null,2));await browser.close();}
