/** Matched cameras for the desert refinement. Fixture, not campaign evidence. */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const phase = process.argv[2] ?? 'candidate';
if (!/^[a-z0-9-]+$/.test(phase)) throw new Error('Invalid evidence label');
const out = `test-results/desert-refinement/${phase}`;
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11', '--enable-gpu'] });
const page = await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(`${process.env.MMF_URL ?? 'http://127.0.0.1:5207/'}?nomenu=1&nolock=1&nospawn=1&nosound=1&quality=medium&seed=desert-review`);
  await page.waitForFunction(()=>globalThis.__game?.game,null,{timeout:180000});
  await page.evaluate(()=>{const g=__game.game;g.stop();g.opening.restore({phase:'done'});g.freeCamera=g.renderer.camera;});
  const shots=[
    {name:'roadside',distance:360,eye:[-14,7,10],at:[-42,3,-23]},
    {name:'district',distance:180,eye:[-24,20,19],at:[-85,6,-65]},
    {name:'skyline',distance:800,eye:[0,21,0],at:[15,9,-140]},
    {name:'port-deck',distance:0,eye:[-5.7,16.5,0],at:[-70,7,-25]},
  ];
  const frames=[];
  for(const shot of shots){
    const sample=await page.evaluate(async s=>{
      const g=__game.game;g.world.reset(s.distance);g.freeCamera.position.set(...s.eye);g.freeCamera.lookAt(...s.at);
      for(let i=0;i<45;i++){await new Promise(requestAnimationFrame);g.render(0);}
      const timings=[];let previous=performance.now();
      for(let i=0;i<120;i++){await new Promise(requestAnimationFrame);g.render(0);const now=performance.now();timings.push(now-previous);previous=now;}
      return {name:s.name,timings,render:{...g.renderer.three.info.render},memory:{...g.renderer.three.info.memory},instances:g.world.desert?.batch.instanceCount};
    },shot);
    frames.push(sample);await page.screenshot({path:`${out}/${shot.name}.png`});
  }
  await fs.writeFile(`${out}/report.json`,JSON.stringify({phase,fixture:true,quality:'medium',viewport:[1600,1000],errors,frames},null,2));
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify({out,frames:frames.map(({name,render,memory,instances})=>({name,render,memory,instances})),errors}));
} finally {await browser.close();}
