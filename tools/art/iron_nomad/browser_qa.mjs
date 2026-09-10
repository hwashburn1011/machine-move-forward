import { chromium } from 'playwright';
import fs from 'node:fs';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors=[]; page.on('pageerror',e=>errors.push(String(e))); page.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
const reports=[];
await page.goto('http://127.0.0.1:5197/viewer/',{ waitUntil:'networkidle' });
for (const quality of ['full','game']) {
  if (quality==='game') await page.selectOption('#quality',quality);
  await page.waitForFunction(q=>window.__NOMAD_READY__?.quality===q,quality,{ timeout:90000 });
  const check = await page.evaluate(() => {
    const v=window.__NOMAD_VIEWER__,ids=['FrontLeft','FrontRight','RearLeft','RearRight'];
    v.action.paused=false;
    const samples=[];
    for(const t of [0,.5,1,1.5,2,2.5,3,3.5,4]) {
      v.mixer.setTime(t);v.model.updateMatrixWorld(true);
      samples.push(ids.map(id=>{const o=v.model.getObjectByName('Leg_'+id+'_Foot');return o.matrixWorld.elements.slice(12,15)}));
    }
    v.mixer.setTime(0);v.action.paused=true;
    const phases=new Set(ids.map((_,i)=>JSON.stringify(samples.map(s=>Math.round(s[i][1]*1000))))).size;
    const gl=v.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
    return { ...window.__NOMAD_READY__, gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER), phases, footSamples:samples, finite:samples.flat(2).every(Number.isFinite), loopCloses:ids.every((_,i)=>samples[0][i].every((c,j)=>Math.abs(c-samples.at(-1)[i][j])<.002)) };
  });
  if(check.phases!==4||!check.finite||!check.loopCloses)throw new Error('Walker animation integrity failed.');
  await page.screenshot({path:`assets/iron-nomad/preview/viewer-${quality}.png`});
  await page.click('#walk');
  await page.waitForFunction(()=>window.__NOMAD_VIEWER__.action.time>.3);
  check.performance=await page.evaluate(async()=>{
    const intervals=[];let previous=performance.now();
    for(let i=0;i<121;i++){await new Promise(requestAnimationFrame);const now=performance.now();if(i>0)intervals.push(now-previous);previous=now;}
    const sorted=[...intervals].sort((a,b)=>a-b),v=window.__NOMAD_VIEWER__;
    return {fps:1000/(intervals.reduce((s,n)=>s+n,0)/intervals.length),p95Ms:sorted[Math.floor(sorted.length*.95)],renderCalls:v.renderer.info.render.calls,trianglesIncludingShadowsAndPost:v.renderer.info.render.triangles,canvas:[v.renderer.domElement.width,v.renderer.domElement.height]};
  });
  await page.click('#walk');
  await page.selectOption('#view','legs');
  await page.screenshot({path:`assets/iron-nomad/preview/viewer-${quality}-legs.png`});
  await page.selectOption('#view','hero');
  await page.locator('#crane').fill('20');await page.locator('#crane').dispatchEvent('input');
  check.craneTurns=await page.evaluate(()=>{const c=window.__NOMAD_VIEWER__.model.getObjectByName('CargoCrane_Yaw');return c.quaternion.toArray();});
  await page.locator('#crane').fill('0');await page.locator('#crane').dispatchEvent('input');
  await page.click('#night');await page.screenshot({path:`assets/iron-nomad/preview/viewer-${quality}-night.png`});await page.click('#night');
  await page.click('#ref');if(!await page.locator('#reference-panel').isVisible())throw new Error('Reference comparison did not open.');await page.click('#ref');
  reports.push(check);
}
fs.writeFileSync('assets/iron-nomad/source/browser-validation.json',JSON.stringify({reports,errors},null,2));
console.log(JSON.stringify({reports:reports.map(({footSamples,...r})=>r),errors},null,2));
await browser.close();if(errors.length)process.exitCode=1;
