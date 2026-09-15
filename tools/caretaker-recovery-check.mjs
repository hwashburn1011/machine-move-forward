import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5201/';
const out = process.env.MMF_QA_OUT ?? 'test-results/caretaker-recovery';
const checks = [];
const errors = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
try {
  await page.goto(
    `${site}?nomenu=1&nolock=1&nosound=1&nospawn=1&nomodel=1&notex=1&quality=low&staged=1&seed=caretaker-recovery-check`,
    { waitUntil: 'domcontentloaded', timeout: 30000 },
  );
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 120000 });
  const fixture = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.stop();
    g.state.paused = false;
    g.closePanels(false);
    g.opening.restore({ phase: 'done' });
    g.story.restore({
      format: 2,
      completed: ['wreck-one', 'relay-foundry', 'quiet-array'],
      recoveredUniques: [],
      active: null,
      journalArchive: [],
    });
    g.caretaker.restore(undefined);
    g.course.setTier(2);
    g.inventory.clear();
    g.routeChart.restore({
      format: 1,
      nextSlot: 4,
      discovered: [],
      visited: [],
      missed: [],
      active: {
        id: 'route-contact-3',
        slot: 3,
        kind: 'repair-depot',
        atDistanceM: 700,
        worldX: 0,
        confidence: 1,
        hazard: 'calm',
        detectedAtM: 250,
        expiresAtM: 880,
        state: 'docked',
        rewards: [
          { type: 'item', itemId: 'repair-kit', remaining: 1 },
          { type: 'journal', factId: 'depot-linekeeper-record', remaining: 1 },
        ],
      },
    });
    g.inventory.add('components', 5);
    g.updateOpportunities();
    const recovery = g.candidates().find((item) => item.kind === 'caretaker-recovery');
    if (!recovery) throw new Error('repair depot did not expose caretaker recovery candidate');
    g.player.teleport(recovery.position);
    g.fixedUpdate(1 / 60);
    return {
      recovery: { id: recovery.id, kind: recovery.kind },
      components: g.resources.count('components'),
      docked: g.destination.docked,
      candidateCount: g.candidates().length,
    };
  });
  check(
    'docked repair depot exposes real caretaker recovery candidate',
    fixture.recovery.kind === 'caretaker-recovery' && fixture.docked,
    fixture,
  );
  await page.evaluate(
    (id) =>
      globalThis.__game.game.openInteractable(
        globalThis.__game.game.candidates().find((item) => item.id === id) ?? null,
      ),
    fixture.recovery.id,
  );
  await page.locator('[data-panel="caretaker"]').waitFor({ state: 'visible' });
  const initial = await page.locator('[data-panel="caretaker"]').textContent();
  check(
    'recovery panel shows six-component cost',
    initial?.includes('6') && initial?.includes('components'),
    initial,
  );
  const insufficient = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const before = g.resources.count('components');
    const button = document.querySelector('[data-panel="caretaker"] button:not(:last-child)');
    return {
      before,
      disabled: button instanceof HTMLButtonElement && button.disabled,
      after: g.resources.count('components'),
    };
  });
  check(
    'insufficient components disables recovery without charge',
    insufficient.disabled && insufficient.before === insufficient.after,
    insufficient,
  );
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.resources.deposit('components', 1);
    g.refreshCaretakerPanel();
  });
  const beforeRepair = await page.evaluate(() =>
    globalThis.__game.game.resources.count('components'),
  );
  await page
    .locator('[data-panel="caretaker"] button')
    .filter({ hasText: 'Repair and recover caretaker' })
    .click();
  const recruited = await page.evaluate(() => ({
    recruited: globalThis.__game.game.caretaker.snapshot().recruited,
    components: globalThis.__game.game.resources.count('components'),
  }));
  check(
    'real recovery consumes exactly six components once',
    recruited.recruited && recruited.components === beforeRepair - 6,
    recruited,
  );
  const repeated = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.openInteractable(g.candidates().find((item) => item.kind === 'caretaker-recovery') ?? null);
    return {
      recruited: g.caretaker.snapshot().recruited,
      components: g.resources.count('components'),
    };
  });
  check(
    'repeat recovery cannot charge or re-recruit',
    repeated.recruited && repeated.components === recruited.components,
    repeated,
  );
  const saved = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    const save = g.buildSave();
    await g.saves.save('caretaker-recovery-qa', save);
    return { caretaker: save.progression?.caretaker ?? null };
  });
  check(
    'recruitment save contains only durable caretaker state',
    saved.caretaker?.recruited === true && !Object.hasOwn(saved.caretaker ?? {}, 'job'),
    saved,
  );
  await page.screenshot({ path: `${out}/caretaker-recovery.png`, fullPage: true });
} catch (error) {
  errors.push(error?.stack ?? String(error));
} finally {
  await browser.close();
}
await fs.writeFile(`${out}/qa.json`, JSON.stringify({ site, checks, errors }, null, 2));
console.log(
  JSON.stringify(
    { passed: checks.filter((item) => item.ok).length, total: checks.length, errors },
    null,
    2,
  ),
);
if (checks.some((item) => !item.ok) || errors.length) process.exitCode = 1;
