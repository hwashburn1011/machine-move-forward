import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out='test-results/nomad-foundations';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try {
  await page.goto(`http://127.0.0.1:${process.env.MMF_PORT ?? 5201}/?nomenu=1&nolock=1&nospawn=1&nosound=1&quality=medium`);
  await page.waitForFunction(()=>globalThis.__game?.game,null,{timeout:120000});
  await page.waitForTimeout(1600);
  const initial=await page.evaluate(()=>({stats:__game.debugStats(),at:__game.player.worldPosition,pieces:__game.build.serialise(),scanner:__game.game.scanner.snapshot(),paused:__game.game.state.paused}));
  console.log('INITIAL',JSON.stringify(initial));
  await page.screenshot({path:`${out}/upper-deck.png`});
  await page.keyboard.press('Tab');
  await page.locator('.terminal-ui').waitFor({state:'visible'});
  const opened=await page.evaluate(()=>__game.game.terminal.isOpen);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(350);
  if(!await page.evaluate(()=>__game.game.terminal.isOpen)) throw Error('Terminal Tab navigation closed the menu');
  await page.screenshot({path:`${out}/terminal-inventory.png`});
  if(!opened || !(await page.locator('.terminal-ui').isVisible()))throw Error('Terminal did not open');
  const before=await page.evaluate(()=>({time:__game.game.state.simTime,distance:__game.game.world.distanceTraveled,fuel:__game.machine.power.fuel}));
  await page.waitForTimeout(700);
  const after=await page.evaluate(()=>({time:__game.game.state.simTime,distance:__game.game.world.distanceTraveled,fuel:__game.machine.power.fuel}));
  if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Terminal failed to pause simulation');
  for(const tab of ['machine','workshop','signal','build']){
    await page.locator(`[data-tab="${tab}"]`).click();
    await page.screenshot({path:`${out}/terminal-${tab}.png`});
  }
  await page.keyboard.press('Escape');
  await page.locator('.terminal-ui').waitFor({state:'hidden'});
  if(await page.evaluate(()=>__game.game.state.paused))throw Error('Terminal did not release pause');
  await page.evaluate(()=>{
    const g=__game.game;g.state.paused=true;g.freeCamera=g.renderer.camera;
    g.freeCamera.position.set(-27,25,-32);g.freeCamera.lookAt(0,12,0);
  });
  await page.waitForTimeout(500);await page.screenshot({path:`${out}/exterior-v2.png`});
  for(const [name,eye,target] of [
    ['lower-deck',[-5,10.45,-5],[2,10.1,2]],
    ['middle-deck',[-4.2,14.0,-3.8],[2,13.7,2]],
    ['stairs',[-4.2,14,-4.4],[-2,13.2,0]],
    ['generator',[1.7,17.9,5.8],[4,16.5,8]],
  ]){
    await page.evaluate(({eye,target})=>{const c=__game.game.freeCamera;c.position.set(...eye);c.lookAt(...target);},{eye,target});
    await page.waitForTimeout(250);await page.screenshot({path:`${out}/${name}.png`});
  }
  const routes=await page.evaluate(()=>{
    const g=__game.game,p=g.physics;const routes=[];
    const walk=(name,start,delta,steps)=>{
      const c=p.addCharacter(.34,.65,{x:start[0],y:start[1],z:start[2]});const pos=g.player.worldPosition.clone().set(...start);
      for(let i=0;i<steps;i++){p.moveCharacter(c,pos,{x:delta[0],y:delta[1],z:delta[2]},{x:0,y:0,z:0});p.step();}
      routes.push({name,position:{...pos}});p.removeCollider(c.collider);p.removeBody(c.body);
    };
    walk('lower-to-middle',[-2,9.9,-3.5],[0,-.03,.05],150);
    walk('middle-to-upper',[-2,13.5,-3.5],[0,-.03,.05],150);
    walk('upper-to-middle',[-2,17.1,3.5],[0,-.03,-.05],150);
    return routes;
  });
  const expected=[13.42,17.02,13.42];
  routes.forEach((route,i)=>{
    if(Math.abs(route.position.y-expected[i])>.2 || (i<2 ? route.position.z<3 : route.position.z>-3)) throw Error('Stair traversal failed '+JSON.stringify(route));
  });
  const recovery=await page.evaluate(()=>{
    const g=__game.game;
    g.updateGroundBoundary();
    const prior=g.groundBoundary.lastSafeAnchor;
    const hp=g.player.stats.health;
    g.player.teleport({x:30,y:-20,z:30});
    g.updateGroundBoundary();
    return {anchor:prior,at:{...g.player.worldPosition},beforeHealth:hp,health:g.player.stats.health};
  });
  if(!recovery.anchor || recovery.at.y<8 || recovery.health!==recovery.beforeHealth) throw Error('Ground exclusion failed '+JSON.stringify(recovery));
  const report={initial,opened,pause:{before,after},routes,recovery,errors};
  await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
  console.log('REPORT',JSON.stringify(report));
  if(errors.length)process.exitCode=1;
}finally{await browser.close();}
