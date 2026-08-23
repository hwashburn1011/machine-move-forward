import { chromium } from '@playwright/test';
const out = process.argv[2];
const url = process.argv[3] ?? '?nolock=1';
const keys = (process.argv[4] ?? '').split(',').filter(Boolean);
const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5173/' + url, { waitUntil: 'load' });
await page.waitForTimeout(6000);
for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(900); }
await page.waitForTimeout(3000);
await page.screenshot({ path: out });
console.log('wrote', out, errors.length ? `ERRORS: ${errors.slice(0,4).join(' | ')}` : 'no errors');
await browser.close();
