import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out='test-results/meridian-lifecycle';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),checks=[],errors=[];
const check=(name,ok,detail)=>checks.push({name,ok:!!ok,detail});
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto('http://127.0.0.1:5201/?nomenu=1&nosound=1&nospawn=1&quality=medium&seed=meridian-lifecycle');
 await page.waitForFunction(()=>globalThis.__game?.game?.player?.visual?.isAnimated,null,{timeout:180000});
 await page.evaluate(()=>{
  const g=globalThis.__game.game;g.loop.stop();g.closePanels(false);g.state.paused=false;g.titleScreen.hide();g.titleCamera=null;
  g.story.restore({format:2,completed:['last-garden-meridian'],recoveredUniques:['meridian-solution'],active:null,chapterComplete:true});
  g.course.setTier(3);g.world.reset(500);g.player.teleport({x:6,y:15.96,z:4});
  g.ending.restore({format:1,phase:'credits',committedAtDistance:0,arrivalElapsedS:12},g.endingEligible);
  g.restoreEndingPresentation();g.render(0);
 });
 check('Credits own a visible cursor without pointer-lock bypass',await page.evaluate(()=>!globalThis.__game.game.options.bypassPointerLock&&!document.pointerLockElement&&!document.querySelector('.ending-overlay').hidden));
 await page.screenshot({path:out+'/credits.png'});
 await page.locator('[data-ending-keep]').click();
 await page.waitForFunction(()=>document.pointerLockElement&&globalThis.__game.game.ending.phase==='complete'&&!globalThis.__game.game.state.paused,null,{timeout:5000});
 check('Trusted Keep Walking click acquires real pointer lock',await page.evaluate(()=>document.pointerLockElement===globalThis.__game.game.options.canvas));
 check('Completion click does not fire the weapon',await page.evaluate(()=>{const g=globalThis.__game.game;for(let i=0;i<3;i++)g.fixedUpdate(1/60);return g.combat.current.ammoInMag===30;}));
 await page.evaluate(()=>{
  const g=globalThis.__game.game;g.ending.restore({format:1,phase:'arrival',committedAtDistance:100,arrivalElapsedS:4},true);g.restoreEndingPresentation();g.render(0);
 });
 await page.waitForFunction(()=>!document.pointerLockElement);
 await page.evaluate(()=>{globalThis.__game.game.start();window.dispatchEvent(new Event('blur'));});
 await page.waitForFunction(()=>globalThis.__game.game.state.paused);
 const elapsed=await page.evaluate(()=>globalThis.__game.game.ending.snapshot.arrivalElapsedS);
 await page.waitForTimeout(350);
 check('Focus loss pauses arrival and hides its overlay',await page.evaluate(elapsed=>{const g=globalThis.__game.game;return g.ending.snapshot.arrivalElapsedS===elapsed&&document.querySelector('.ending-overlay').hidden;},elapsed));
 await page.locator('[data-id="resume"]').click();
 check('Resume returns the arrival cursor without locking it',await page.evaluate(()=>!globalThis.__game.game.state.paused&&!document.pointerLockElement));
 await page.waitForTimeout(250);await page.evaluate(()=>globalThis.__game.game.loop.stop());
 check('Resumed arrival clock advances normally',await page.evaluate(elapsed=>globalThis.__game.game.ending.snapshot.arrivalElapsedS>elapsed,elapsed));
 await page.locator('[data-ending-skip]').click();
 await page.waitForFunction(()=>document.pointerLockElement&&!globalThis.__game.game.state.paused,null,{timeout:5000});
 check('Trusted arrival Skip restores real pointer lock',await page.evaluate(()=>globalThis.__game.game.ending.phase==='complete'&&!globalThis.__game.game.arrivalScene.active));
 await page.evaluate(()=>{const g=globalThis.__game.game;g.enterTitle();g.render(0);});
 check('Title hides ending presentation',await page.evaluate(()=>document.querySelector('.ending-overlay').hidden));
 await page.evaluate(()=>{const g=globalThis.__game.game;g.startNewGame();g.loop.stop();g.render(0);});
 check('New Game clears ending eligibility and camera',await page.evaluate(()=>{const g=globalThis.__game.game;return g.ending.phase==='available'&&!g.endingEligible&&!g.arrivalScene.active;}));
}catch(error){errors.push(error.stack??String(error));}finally{await browser.close();}
await writeFile(out+'/qa.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.filter(x=>x.ok).length,total:checks.length,checks:checks.filter(x=>!x.ok),errors},null,2));if(errors.length||checks.some(x=>!x.ok))process.exitCode=1;
