import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out='test-results/nomad-v3-layout';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(`http://127.0.0.1:${process.env.MMF_PORT??5206}/?nomenu=1&nolock=1&nospawn=1&nosound=1&quality=medium`);
  await page.waitForFunction(()=>globalThis.__game?.game,null,{timeout:120000});
  await page.waitForTimeout(1000);
  await page.evaluate(()=>{const g=__game.game;g.state.paused=true;g.freeCamera=g.renderer.camera;});
  for(const [name,eye,target] of [
    ['exterior',[-36,29,-40],[0,12,0]],['lower-prow',[0,10.6,-13.6],[0,10.6,-32]],
    ['lower-interior',[0,10.6,-12],[0,10.5,8]],['middle',[-6,14.1,-9],[4,13.8,5]],
    ['port-stairs',[-24,18,-9],[-12,12.4,0]],['upper',[10,19,10],[-2,16.5,-7]],
  ]){
    await page.evaluate(({eye,target})=>{const c=__game.game.freeCamera;c.position.set(...eye);c.lookAt(...target);},{eye,target});
    await page.waitForTimeout(180);await page.screenshot({path:`${out}/${name}.png`});
  }
  const report=await page.evaluate(()=>{
    const g=__game.game,p=g.physics,routes=[];
    function walk(name,start,delta,steps){
      const at=g.player.worldPosition.clone().set(...start),h=p.addCharacter(.34,.65,at);
      for(let i=0;i<steps;i++){p.moveCharacter(h,at,{x:delta[0],y:delta[1],z:delta[2]},{x:0,y:0,z:0});p.step();}
      routes.push({name,at:{...at},aboard:g.destination.playerOnMachine(at)});p.removeCollider(h.collider);p.removeBody(h.body);
    }
    walk('side-lower-up',[-12,9.87,-4.2],[0,-.035,.05],200);
    walk('side-lower-down',[-12,13.47,4.2],[0,-.035,-.05],170);
    walk('side-upper-up',[-12,13.47,-4.2],[0,-.035,.05],200);
    walk('side-upper-down',[-12,17.07,3.8],[0,-.035,-.05],160);
    walk('lower-bypass',[-14,9.87,-3.8],[0,-.035,.05],150);
    walk('middle-bypass',[-14,13.47,-3.8],[0,-.035,.05],150);
    walk('open-lower-prow',[0,9.87,-10.5],[0,-.035,-.05],70);
    walk('internal-up',[-2,9.87,-3.5],[0,-.035,.05],150);
    g.destination.setActive(true);g.destination.setDocked(true);g.machine.setExpeditionGangwayOpen(true);p.step();
    walk('dock-crossing',[10.7,17.07,0],[.05,-.035,0],95);
    g.machine.setExpeditionGangwayOpen(false);g.destination.setDocked(false);g.destination.setActive(false);
    return {routes,pieces:g.build.serialise(),bounds:g.machine.deckBounds,stats:__game.debugStats()};
  });
  const expected=[13.42,9.82,17.02,13.42,9.82,13.42,9.82,13.42,17.02];
  for(let i=0;i<report.routes.length;i++){
    const row=report.routes[i];
    if(Math.abs(row.at.y-expected[i])>.24)errors.push(`${row.name}: bad height ${JSON.stringify(row)}`);
    if(i<4 && Math.abs(row.at.z)<3.35)errors.push(`${row.name}: stair blocked ${JSON.stringify(row)}`);
    if((i===4||i===5)&&(!row.aboard||row.at.z<3.2))errors.push(`${row.name}: bypass blocked ${JSON.stringify(row)}`);
    if(i===6&&row.at.z>-13.5)errors.push(`${row.name}: prow wall remains ${JSON.stringify(row)}`);
    if(i===8&&row.at.x<14.5)errors.push(`${row.name}: dock blocked ${JSON.stringify(row)}`);
  }
  await writeFile(`${out}/report.json`,JSON.stringify({...report,errors},null,2));console.log(JSON.stringify({...report,errors}));
  if(errors.length)process.exitCode=1;
}finally{await browser.close();}
