import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=d3d11','--enable-gpu']});
try {
 const page=await browser.newPage({viewport:{width:1100,height:1000}});
 page.on('pageerror',e=>console.log('ERROR',e.message));
 for(const kind of ['s07','bastion','warden','revenant','sovereign']) {
  await page.goto('http://127.0.0.1:5201/tools/polish/animation-review.html?kind='+kind);
  await page.waitForFunction(()=>window.review,{timeout:60000});
  const poses=kind==='s07'?[['idle',.2],['walk_left',.25],['reload',.3],['reload',.6]]:[['idle',.2],['attack',.10],['hit',.12],['death',1.4]];
  for(const [motion,time] of poses) {
   await page.evaluate(p=>window.review.show(p),{motion,time,angle:.65});
   await page.screenshot({path:'assets/animation-polish/review/'+kind+'-'+motion+'-'+time+'.png'});
  }
 }
}finally{await browser.close();}
