/** High-quality late-sun and lower-room views in the real game renderer. */
import {chromium} from '@playwright/test';
import {browserLaunchOptions} from '../../browser-options.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch(browserLaunchOptions),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5194/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&seed=graphics-review');
 await page.waitForFunction(()=>globalThis.__game?.game,null,{timeout:120000});
 await page.evaluate(()=>{const g=globalThis.__game.game;g.sky.setTimeOfDay(.98);});
 await page.waitForTimeout(1200);
 await page.screenshot({path:'docs/art/graphics-v3/late-sun-game.png'});
 await page.evaluate(()=>{const g=globalThis.__game.game;g.player.teleport({x:0,y:1.6,z:-3.5});});
 await page.waitForTimeout(800);
 await page.screenshot({path:'docs/art/graphics-v3/lower-room-high.png'});
 await writeFile('docs/art/graphics-v3/lighting-review.json',JSON.stringify({errors,method:'1080p High; live sky at .98 and lower-room player placement. The game has no night cycle.'},null,2)+'\n');
 if(errors.length)process.exitCode=1;
}finally{await browser.close();}
