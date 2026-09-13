/** Actual gameplay screenshots/video for the animation, camera and build review. */
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const out='docs/gameplay-polish/acceptance/visual';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu']});
const context=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:out,size:{width:1280,height:720}}});
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const shot=async name=>page.screenshot({path:`${out}/${name}.png`});
try{
 await page.goto('http://127.0.0.1:5201/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=desert-review');
 await page.waitForFunction(()=>window.__game?.game?.player?.visual?.isAnimated,null,{timeout:180000});
 await page.evaluate(()=>{const g=window.__game.game;g.player.stats.invulnerable=true;g.world.reset(800);g.player.teleport({x:5.6,y:15.8,z:1.5})});
 await page.waitForTimeout(2000);await shot('deck-status');
 await page.keyboard.down('a');await page.waitForTimeout(350);await shot('strafe');await page.keyboard.up('a');
 await page.keyboard.down('s');await page.waitForTimeout(250);await shot('backward');await page.keyboard.up('s');
 await page.evaluate(()=>{const g=window.__game.game;g.combat.current.ammoInMag=5;g.playerCamera.setYaw(Math.PI);g.playerCamera.resetHistory()});
 await page.waitForTimeout(700);await page.keyboard.press('r');await page.waitForTimeout(700);await shot('rifle-reload');await page.waitForTimeout(1800);
 await page.keyboard.press('2');await page.evaluate(()=>window.__game.game.combat.current.ammoInMag=1);
 await page.keyboard.press('r');await page.waitForTimeout(950);await shot('shotgun-reload');await page.waitForTimeout(2200);
 for(const [level,y]of [['middle',12.8],['lower',9.8]]){
  await page.evaluate(y=>{const g=window.__game.game;g.player.teleport({x:5.6,y,z:1.5});g.playerCamera.setYaw(0);g.playerCamera.resetHistory()},y);
  await page.waitForTimeout(1000);await shot(level+'-camera');await page.keyboard.press('v');await page.waitForTimeout(500);await shot(level+'-shoulder');
 }
 await page.keyboard.press('b');await page.locator('.build-catalog').waitFor({state:'visible'});await shot('catalog');
 for(const [width,height]of [[1280,720],[1920,1080]]){
  await page.setViewportSize({width,height});
  await page.locator('[data-category="automation"]').click();await page.waitForTimeout(300);await shot(`catalog-locked-${width}`);
  checks.push({name:`locked automation reasons visible at ${width}`,ok:await page.locator('.build-catalog-card.is-locked .build-card-reason').first().isVisible()});
  await page.locator('[data-category="structure"]').click();await page.waitForTimeout(250);await shot(`catalog-${width}`);
 }
 await page.locator('.build-catalog-card[data-piece="floor"]').click();await page.waitForTimeout(500);await shot('lower-placement-1920');
 await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(250);await shot('lower-placement');
 const bounds=await page.locator('#build-panel').boundingBox();checks.push({name:'placement panel stays inside 720p view',ok:!!bounds&&bounds.x>=0&&bounds.x+bounds.width<=1280,detail:bounds});
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!window.__game.game.buildMode,null,{timeout:3000});
 await page.keyboard.press('Tab');await page.waitForTimeout(500);await page.locator('.machine-status-view summary').click();await shot('maintenance-details');await page.keyboard.press('Tab');
 await page.evaluate(()=>{const g=window.__game.game;g.player.teleport({x:5.6,y:15.8,z:1.5});for(const[i,id]of ['bastion','warden','revenant','sovereign'].entries()){const at=g.player.worldPosition.clone();at.x=-4+i*2;at.z=-3;g.enemies.spawn(id,at)}});
 await page.waitForTimeout(5000);await shot('mech-combat');
 await fs.writeFile(`${out}/results.json`,JSON.stringify({generatedAt:new Date().toISOString(),viewports:[[1280,720],[1920,1080]],checks,errors,stats:await page.evaluate(()=>window.__game.debugStats())},null,2));
}catch(error){errors.push(String(error));await shot('failure');await fs.writeFile(`${out}/failure.json`,JSON.stringify({errors,checks,state:await page.evaluate(()=>{const g=window.__game.game;return {build:g.buildMode,session:g.buildSession.state,paused:g.state.paused,panels:g.panelsOpen,context:g.input.context,active:document.activeElement?.outerHTML,statusHidden:g.machineStatus.root.hidden}})},null,2));throw error;
}finally{await context.close();await page.video().saveAs(`${out}/gameplay-polish-review.webm`);await page.video().delete();await browser.close();}
if(errors.length||checks.some(c=>!c.ok))throw Error(JSON.stringify({errors,checks}));
