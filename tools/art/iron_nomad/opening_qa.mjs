import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5193/?nomenu=1&opening=1&nolock=1&nosound=1&quality=medium');
 await page.waitForFunction(()=>globalThis.__game?.game,null,{timeout:120000});
 await page.click('#game');
 await page.evaluate(()=>{__game.game.state.paused=false;__game.player.teleport({x:13.5,y:18.85,z:0});__game.playerCamera.setYaw(Math.PI/2);});
 await page.waitForTimeout(450);
 await page.screenshot({path:'docs/art/iron-nomad-playable/rooftop.png'});
 await page.keyboard.down('Shift');await page.keyboard.down('w');await page.waitForTimeout(300);
 await page.keyboard.down('Space');await page.waitForTimeout(100);await page.keyboard.up('Space');
 await page.waitForTimeout(1350);await page.keyboard.up('w');await page.keyboard.up('Shift');
 await page.waitForTimeout(1200);
 const result=await page.evaluate(()=>({phase:__game.opening.phase,position:__game.player.worldPosition.toArray(),armed:__game.game.playerArmed,speed:__game.machine.speed,grounded:__game.player.isGrounded}));
 const ok=['landed','done'].includes(result.phase)&&result.position[1]>15&&result.position[1]<16.2&&result.armed;
 console.log(JSON.stringify({ok,result,errors}));
 await writeFile('docs/art/iron-nomad-playable/opening-qa.json',JSON.stringify({ok,result,errors},null,2));
 await page.screenshot({path:'docs/art/iron-nomad-playable/opening-landed.png'});
 if(!ok||errors.length)process.exitCode=1;
}finally{await browser.close();}
