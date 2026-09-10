import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out='docs/art/iron-nomad-playable'; await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try {
  await page.goto('http://127.0.0.1:5193/?nomenu=1&nolock=1&nospawn=1&nosound=1&quality=medium');
  await page.waitForFunction(()=>globalThis.__game?.game, null, {timeout:120000});
  await page.click('#game');
  await page.evaluate(()=>{__game.game.state.paused=false;});
  await page.waitForTimeout(1500);
  const initial=await page.evaluate(()=>({stats:__game.debugStats(),position:__game.player.worldPosition,authored:!!__game.machine.group.getObjectByName('IronNomad_FourLegWalker'),pieces:__game.build.serialise()}));
  console.log(JSON.stringify(initial));
  await page.screenshot({path:`${out}/deck.png`});
  const result=await page.evaluate(async()=>{
    const g=__game, THREE=await import('/node_modules/.vite/deps/three.js');
    g.game.freeCamera=g.game.renderer.camera;
    g.game.freeCamera.position.set(-28,23,-32);
    g.game.freeCamera.lookAt(new THREE.Vector3(0,12,0));
    return {blocked:g.machine.equipmentCells.length,deck:g.machine.deckCells.length};
  });
  await page.waitForTimeout(500);await page.screenshot({path:`${out}/exterior.png`});
  const traversal=await page.evaluate(async()=>{
    const g=__game, THREE=await import('/node_modules/.vite/deps/three.js');
    g.game.state.paused=true;
    const p=g.physics;
    const routes=[];
    function walk(name, start, delta, frames) {
      const pos=new THREE.Vector3(...start), character=p.addCharacter(.34,.62,pos);
      p.step();
      for(let i=0;i<frames;i++){p.moveCharacter(character,pos,new THREE.Vector3(...delta),{x:0,y:0,z:0});p.step();}
      routes.push({name,position:pos.toArray()});
      p.world.removeRigidBody(character.body);
    }
    walk('top-to-middle',[-2,15.94,3.3],[0,-.04,-.06],112);
    walk('middle-to-bottom',[-2,12.94,3.3],[0,-.04,-.06],112);
    walk('bottom-to-middle',[-2,9.94,-3.3],[0,-.02,.06],240);
    walk('middle-to-top',[-2,12.94,-3.3],[0,-.02,.06],240);
    walk('cabin-wall',[0,15.94,-4],[.04,-.06,0],100);
    g.game.destination.setActive(true);g.game.destination.setDocked(true);g.machine.setExpeditionGangwayOpen(true);p.step();
    walk('dock-crossing',[6,15.94,0],[.05,-.06,0],120);
    g.machine.setExpeditionGangwayOpen(false);p.step();
    walk('gate-closed',[6,15.94,0],[.05,-.06,0],70);
    g.game.state.paused=false;
    return routes;
  });
  const checks=traversal.map(r=>({name:r.name,ok:
    r.name==='top-to-middle' ? Math.abs(r.position[1]-12.80)<.1 && r.position[2]<-3 :
    r.name==='middle-to-bottom' ? Math.abs(r.position[1]-9.80)<.1 && r.position[2]<-3 :
    r.name==='bottom-to-middle' ? Math.abs(r.position[1]-12.80)<.1 && r.position[2]>3 :
    r.name==='middle-to-top' ? Math.abs(r.position[1]-15.80)<.1 && r.position[2]>3 :
    r.name==='cabin-wall' ? r.position[0]>.5 && r.position[0]<1.4 :
    r.name==='dock-crossing' ? r.position[0]>11 && r.position[1]>15.6 :
    r.position[0]>6.2 && r.position[0]<6.7}));
  console.log('TRAVERSAL',JSON.stringify(traversal));
  console.log('CHECKS',JSON.stringify(checks));
  if(checks.some(c=>!c.ok)) process.exitCode=1;
  const frame=await page.evaluate(()=>new Promise(resolve=>{let n=0,start=performance.now();function tick(){if(++n===120)resolve(119000/(performance.now()-start));else requestAnimationFrame(tick);}requestAnimationFrame(tick);}));
  await writeFile(`${out}/initial-qa.json`,JSON.stringify({initial,result,traversal,checks,frame,errors},null,2));
  console.log('QA',JSON.stringify({result,frame,errors}));
  if(errors.length || !initial.authored || initial.pieces.length!==2)process.exitCode=1;
} finally {await browser.close();}
