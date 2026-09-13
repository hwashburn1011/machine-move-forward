import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const port = Number(process.env.MMF_PORT ?? 5201), out = process.env.MMF_QA_OUT ?? 'docs/gameplay-polish/acceptance';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const checks = [], errors = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` -- ${detail}` : ''}`); };
const wire = (page, tag) => { page.on('pageerror', e => errors.push(`${tag}: ${e.message}`)); page.on('console', m => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); }); };
const url = (extra = '') => `http://127.0.0.1:${port}/?nomenu=1&nospawn=1&nosound=1&notex=1&nomodel=1&quality=low&seed=controls-qa${extra}`;
const boot = async (page, extra = '') => { await page.goto(url(extra), { waitUntil: 'domcontentloaded', timeout: 30000 }); await page.waitForFunction(() => Boolean(globalThis.__game?.game?.titleScreen), null, { timeout: 120000 }); await page.waitForFunction(() => globalThis.__game.game.opening.phase === 'done', null, { timeout: 10000 }); };

// Pointer denial is isolated so its monkeypatch/listeners cannot contaminate success.
const deniedContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const deniedPage = await deniedContext.newPage(); wire(deniedPage, 'denied'); await boot(deniedPage);
await deniedPage.evaluate(() => {
  const g = globalThis.__game.game, canvas = g.options.canvas; globalThis.__qaLockAttempts = 0;
  canvas.requestPointerLock = () => { globalThis.__qaLockAttempts++; return Promise.reject(new Error('expected QA denial')); };
  g.pause();
});
await deniedPage.getByRole('button', { name: 'Resume', exact: true }).click(); await deniedPage.waitForTimeout(30);
const denied = await deniedPage.evaluate(() => { const g = globalThis.__game.game; return { attempts: globalThis.__qaLockAttempts, paused: g.state.paused, menuOpen: g.titleScreen.isOpen, locked: document.pointerLockElement === g.options.canvas }; });
check('denied Resume stays paused with menu open', denied.attempts === 1 && denied.paused && denied.menuOpen && !denied.locked, JSON.stringify(denied));
await deniedContext.close();

// Trusted click, real browser pointer-lock API, no monkeypatch.
const successContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const successPage = await successContext.newPage(); wire(successPage, 'success'); await boot(successPage);
await successPage.evaluate(() => globalThis.__game.game.pause());
await successPage.getByRole('button', { name: 'Resume', exact: true }).click();
await successPage.waitForFunction(() => document.pointerLockElement === document.querySelector('canvas'), null, { timeout: 5000 }).catch(() => {});
const resumed = await successPage.evaluate(() => { const g = globalThis.__game.game; return { paused: g.state.paused, menuOpen: g.titleScreen.isOpen, locked: document.pointerLockElement === g.options.canvas }; });
check('trusted Resume locks pointer before unpausing', resumed.locked && !resumed.paused && !resumed.menuOpen, JSON.stringify(resumed));
await successContext.close();

// Settings persistence uses bypass only after real pointer lock is accepted above.
const settingsContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await settingsContext.newPage(); wire(page, 'settings'); await boot(page, '&nolock=1');
const openSettings = async () => { await page.evaluate(() => globalThis.__game.game.pause()); await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.locator('#title-settings.is-open').waitFor({ state: 'visible' }); };
await openSettings();
await page.locator('#title-fov').evaluate(node => { node.value = '70'; node.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(80);
const remap = async (action, code) => { const button = page.locator(`#title-binding-list [data-binding="play:${action}"]`); await button.click(); await page.keyboard.press(code); return button.locator('b').textContent(); };
const forwardLabel = await remap('forward', 'KeyN'), interactLabel = await remap('interact', 'KeyH');
const live = await page.evaluate(() => ({ stored: JSON.parse(localStorage.getItem('mmf-settings') ?? '{}'), applied: globalThis.__game.game.titleScreen.current.hipFov }));
check('FOV applies to live settings and stores 70', live.applied === 70 && live.stored.hipFov === 70, JSON.stringify(live));
check('movement and use labels follow remaps', forwardLabel === 'N' && interactLabel === 'H', JSON.stringify({ forwardLabel, interactLabel }));
check('movement and use remaps persist immediately', live.stored.bindings?.['play:forward'] === 'KeyN' && live.stored.bindings?.['play:interact'] === 'KeyH', JSON.stringify(live.stored.bindings));

await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => Boolean(globalThis.__game?.game?.titleScreen), null, { timeout: 120000 }); await page.waitForFunction(() => globalThis.__game.game.opening.phase === 'done', null, { timeout: 10000 });
const persisted = await page.evaluate(() => ({ settings: JSON.parse(localStorage.getItem('mmf-settings') ?? '{}'), fov: globalThis.__game.game.playerCamera.camera.fov }));
check('FOV and both remaps survive reload', persisted.fov === 70 && persisted.settings.bindings?.['play:forward'] === 'KeyN' && persisted.settings.bindings?.['play:interact'] === 'KeyH', JSON.stringify(persisted));
const physical = {};
await page.keyboard.down('n'); physical.nForward = await page.evaluate(() => globalThis.__game.game.input.isDown('forward')); await page.keyboard.up('n');
await page.keyboard.down('w'); physical.wForward = await page.evaluate(() => globalThis.__game.game.input.isDown('forward')); await page.keyboard.up('w');
await page.keyboard.down('h'); physical.hInteract = await page.evaluate(() => globalThis.__game.game.input.isDown('interact')); await page.keyboard.up('h');
check('reloaded physical map uses N/H and releases W', physical.nForward && !physical.wForward && physical.hInteract, JSON.stringify(physical));
await openSettings();
const reloadedLabels = { forward: await page.locator('[data-binding="play:forward"] b').textContent(), interact: await page.locator('[data-binding="play:interact"] b').textContent() };
check('reloaded Settings labels show N/H', reloadedLabels.forward === 'N' && reloadedLabels.interact === 'H', JSON.stringify(reloadedLabels));

const evidence = { generatedAt: new Date().toISOString(), port, denied, resumed, live, persisted, physical, reloadedLabels, checks, errors };
await writeFile(`${out}/controls-qa.json`, JSON.stringify(evidence, null, 2));
await settingsContext.close(); await browser.close();
console.log(`\n${checks.filter(x => x.ok).length}/${checks.length} checks passed; ${errors.length} browser errors`);
if (checks.some(x => !x.ok) || errors.length) process.exitCode = 1;
