/** Physical acceptance for the two authored Iron Nomad ramps. */
import { chromium } from '@playwright/test';
import { browserLaunchOptions } from '../browser-options.mjs';
import fs from 'node:fs/promises';
const port = process.env.MMF_PORT ?? '5201';
const out = process.env.MMF_QA_OUT ?? 'docs/gameplay-polish/acceptance/authored-stairs';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch(browserLaunchOptions); const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const checks = []; const errors = []; page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
try {
await page.goto(`http://127.0.0.1:${port}/?nolock=1&nomenu=1&quality=high&nospawn=1&seed=authored-stairs-qa`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 180000 });
const sim = async (seconds) => { const start = await page.evaluate(() => globalThis.__game.debugStats().simTime), end=Date.now()+30000; while ((await page.evaluate(() => globalThis.__game.debugStats().simTime)) - start < seconds) {if(Date.now()>end)throw Error('Simulation stopped');await page.waitForTimeout(100)} };
const result = await page.evaluate(() => { const g = globalThis.__game.game; return { deckY: g.machine.deckBounds.min.y, x: -2, z: 2.2, levels: [-2, -1, 0] }; });
const check = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} -- ${detail}`); };
for (const [from, to] of [[-2, -1], [-1, 0]]) {
  await page.evaluate(({ deckY, from }) => { const r = globalThis.__game; r.player.teleport({ x: -2, y: deckY + from * 3 + 1.11, z: -2.7 }); r.playerCamera.yaw = 0; }, { deckY: result.deckY, from }); await sim(0.5);
  await page.keyboard.down('s'); const deadline = Date.now() + 30000;
  while (Date.now() < deadline) { const p = await page.evaluate(() => globalThis.__game.player.worldPosition); if (p.z >= 2.6) break; await page.waitForTimeout(120); }
  await page.keyboard.up('s'); await sim(0.5);
  const up = await page.evaluate(({ deckY, to }) => { const r = globalThis.__game; const p = r.player.worldPosition; return { level: Math.round((p.y - (deckY + 1.11)) / 3), grounded: r.player.isGrounded, z: p.z, expected: to }; }, { deckY: result.deckY, to });
  check(`authored ramp ${from} to ${to} ascent`, up.level === to && up.grounded && up.z > 1.2, JSON.stringify(up));
  await page.keyboard.down('w'); const downDeadline = Date.now() + 30000;
  while (Date.now() < downDeadline) { const p = await page.evaluate(() => globalThis.__game.player.worldPosition); if (p.z <= -2.6) break; await page.waitForTimeout(120); }
  await page.keyboard.up('w'); await sim(0.5);
  const down = await page.evaluate(({ deckY, from }) => { const r = globalThis.__game; const p = r.player.worldPosition; return { level: Math.round((p.y - (deckY + 1.11)) / 3), grounded: r.player.isGrounded, z: p.z, expected: from }; }, { deckY: result.deckY, from });
  check(`authored ramp ${to} to ${from} descent`, down.level === from && down.grounded && down.z < -1.2, JSON.stringify(down));
}
await page.screenshot({ path: `${out}/authored-stairs-final.png` }); await fs.writeFile(`${out}/results.json`, JSON.stringify({ result, checks, errors }, null, 2));
} catch(error) {errors.push(String(error));await fs.writeFile(`${out}/results.json`,JSON.stringify({checks,errors},null,2))} finally { await browser.close() }
if (checks.length!==4 || checks.some((c) => !c.ok) || errors.length) process.exitCode = 1;
