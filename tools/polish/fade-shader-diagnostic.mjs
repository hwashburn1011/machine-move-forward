import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu']});
try{const page=await browser.newPage({viewport:{width:1920,height:1080}});await page.goto('http://127.0.0.1:5201/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high');await page.waitForFunction(()=>window.__game?.game,{timeout:180000});await page.waitForTimeout(1000);
const result=await page.evaluate(()=>{
 const g=window.__game.game;g.stop();
 const root=g.player.object3D,render=()=>{g.renderer.three.info.reset();g.post.render(0,g.renderer.scene,g.activeCamera);return g.renderer.three.info.render.calls};
 const before=g.renderer.three.info.programs.length;
 g.playerFade.apply(root,1.35,1);
 const start=performance.now(),partialDraws=render(),firstFadeCpuMs=performance.now()-start;
 const after=g.renderer.three.info.programs.length;
 g.playerFade.apply(root,.8,1);const hidden=!root.visible,hiddenDraws=render();
 g.playerFade.restore();const restored=root.visible,restoredDraws=render();
 for(let i=0;i<100;i++){g.playerFade.apply(root,.8,1);g.playerFade.restore()}
 return {before,after,firstFadeCpuMs,partialDraws,hiddenDraws,restoredDraws,hidden,restored,visibleAfter100Cycles:root.visible,programsAfter100Cycles:g.renderer.three.info.programs.length};
});console.log(JSON.stringify(result,null,2));await fs.writeFile('docs/gameplay-polish/fade-shader-diagnostic.json',JSON.stringify(result,null,2));
if(result.before!==result.after||!result.hidden||!result.restored||!result.visibleAfter100Cycles||result.hiddenDraws>=result.restoredDraws)throw Error('Fade warmup/visibility regression');
}finally{await browser.close()}
