import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5201/';
const out = process.env.MMF_QA_OUT ?? 'test-results/readiness-record';
const authored = process.env.MMF_AUTHORED === '1';
const checks = [];
const errors = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const knownUniques = [
  'course-gyro',
  'salvage-controller',
  'tracking-servo',
  'course-actuator',
  'annika-archive-shard',
  'human-seed-bank',
  'vector-governor',
  'orchard-memory-core',
  'meridian-solution',
];
const completeStory = [
  'wreck-one',
  'relay-foundry',
  'quiet-array',
  'glass-orchard',
  'last-garden-meridian',
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
try {
  await page.goto(
    `${site}?nomenu=1&nolock=1${authored ? '' : '&nomodel=1&notex=1'}&nosound=1&nospawn=1&quality=${authored ? 'medium' : 'low'}&seed=readiness-record`,
  );
  await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 180_000 });

  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.loop.stop();
    g.state.paused = false;
    g.closePanels(false);
    g.player.teleport({ x: 6, y: 15.96, z: 4 });
    g.render(0);
    g.firstRun.restore({ completed: ['salvage'], counters: {} });
    g.progression.earlyRadioDrop.restore({
      status: 'found',
      armedAtSimTime: 0,
      foundAtSimTime: 1,
      foundAtDistance: 1,
      eligibleChestsOpened: 1,
    });
  });

  // Fresh state is reached by clearing the story after the tutorial fixture.
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.story.restore({ format: 2, completed: [], recoveredUniques: [], active: null });
    g.routeChart.restore({ format: 1, nextSlot: 0, discovered: [], visited: [], missed: [] });
    g.ending.restore(
      { format: 1, phase: 'available', committedAtDistance: null, arrivalElapsedS: 0 },
      false,
    );
    g.openCampaignLog();
  });
  check('Fresh Campaign Record opens', await page.locator('.campaign-log').isVisible());
  check(
    'Fresh record marks Meridian incomplete',
    await page
      .locator('[data-chapter-id="last-garden-meridian"]')
      .textContent()
      .then((t) => t.includes('not yet completed')),
  );
  check(
    'Fresh record has no fabricated archive',
    !(await page.locator('[data-archive-id]').count()),
  );
  await page.locator('[data-campaign-log-close]').click();
  check(
    'Campaign Record real close button works',
    !(await page.locator('.campaign-log').isVisible()),
  );

  // A partial known save exercises archive filtering and distinct chart counts.
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.story.restore({
      format: 2,
      completed: ['wreck-one'],
      recoveredUniques: ['course-gyro'],
      journalArchive: ['wreck-one-journal-cargo', 'future-unknown-record'],
      active: null,
    });
    g.routeChart.restore({
      format: 1,
      nextSlot: 3,
      discovered: ['route-contact-1', 'route-contact-2'],
      visited: ['route-contact-1'],
      missed: ['route-contact-2'],
      active: null,
    });
    g.openRadio();
    document.querySelector('[data-radio-log]')?.click();
  });
  check(
    'Radio Campaign Record button opens real log',
    await page.locator('.campaign-log').isVisible(),
  );
  check(
    'Partial record keeps known archive only',
    (await page.locator('[data-archive-id]').count()) === 1 &&
      !(await page.locator('.campaign-log').textContent()).includes('future-unknown-record'),
  );
  check(
    'Visited and missed counts remain distinct',
    (await page.locator('.campaign-log').textContent()).includes('1 visited · 1 missed'),
  );
  check(
    'Partial record keeps later chapter incomplete',
    (await page.locator('[data-chapter-id="last-garden-meridian"]').textContent()).includes(
      'not yet completed',
    ),
  );
  await page.locator('[data-campaign-log-close]').click();

  // Complete fixture uses real story/route restore and a real placed garden.
  const fixture = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.story.restore({
      format: 2,
      completed: [
        'wreck-one',
        'relay-foundry',
        'quiet-array',
        'glass-orchard',
        'last-garden-meridian',
      ],
      recoveredUniques: [
        'course-gyro',
        'salvage-controller',
        'tracking-servo',
        'course-actuator',
        'annika-archive-shard',
        'human-seed-bank',
        'vector-governor',
        'orchard-memory-core',
        'meridian-solution',
      ],
      journalArchive: [
        'wreck-one-journal-cargo',
        'relay-foundry-journal-log',
        'quiet-array-journal-archive',
        'orchard-memory-record',
        'meridian-common-record',
        'future-unknown-record',
      ],
      active: null,
      chapterComplete: true,
    });
    g.routeChart.restore({
      format: 1,
      nextSlot: 3,
      discovered: ['route-contact-1', 'route-contact-2'],
      visited: ['route-contact-1'],
      missed: ['route-contact-2'],
      active: null,
    });
    g.course.setTier(3);
    let garden = null;
    for (const cell of g.machine.deckCells ?? []) {
      const floor = g.build.place({ piece: 'floor', cell, rotation: 0 }, true);
      if (!floor) continue;
      garden = g.build.place({ piece: 'seed-garden', cell, rotation: 0 }, true);
      if (garden) break;
    }
    return garden?.instanceId ?? null;
  });
  check('Full fixture places a real Seed Garden', !!fixture);
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.ending.restore(
      { format: 1, phase: 'complete', committedAtDistance: 0, arrivalElapsedS: 12 },
      true,
    );
    g.openHelm();
    document.querySelector('[data-helm-log]')?.click();
  });
  check(
    'Helm Campaign Record button opens real log',
    await page.locator('.campaign-log').isVisible(),
  );
  check(
    'Completed Meridian record is visible',
    (await page.locator('[data-chapter-id="last-garden-meridian"]').textContent()).includes(
      ' · complete',
    ),
  );
  check(
    'Garden guidance reflects real placed garden',
    (await page.locator('[data-guidance-id="tend-garden"]').textContent()).includes('ready'),
  );
  check(
    'Unknown archive is never fabricated',
    !(await page.locator('.campaign-log').textContent()).includes('future-unknown-record'),
  );
  const logBox = await page.locator('.campaign-log').boundingBox();
  check(
    'Campaign Record panel stays within 1280x720',
    !!logBox && logBox.y >= 0 && logBox.y + logBox.height <= 720,
    logBox,
  );
  const closeBox = await page.locator('[data-campaign-log-close]').boundingBox();
  check(
    'Campaign Record close control fits 1280x720',
    !!closeBox && closeBox.y >= 0 && closeBox.y + closeBox.height <= 720,
  );
  await page.screenshot({ path: `${out}/campaign-record.png`, fullPage: true });
  const reachable = await page.locator('.campaign-log').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    const last = el.querySelector('[data-guidance-id="read-archive"]')?.getBoundingClientRect();
    return {
      height: el.clientHeight,
      scrollTop: el.scrollTop,
      bottom: last?.bottom,
      inside: !!last && last.top >= 0 && last.bottom <= innerHeight,
    };
  });
  check(
    'Campaign Record last row is reachable by scrolling',
    !!logBox && reachable.inside && reachable.scrollTop > 0,
    reachable,
  );
  await page.screenshot({ path: `${out}/campaign-record-scrolled.png` });
  await page.locator('[data-campaign-log-close]').scrollIntoViewIfNeeded();

  const before = await page.evaluate(() => {
    const g = globalThis.__game.game;
    return JSON.stringify({
      player: g.buildSave().player,
      resources: ['water', 'greens', 'rations', 'scrap', 'components', 'fuel'].map((id) => [
        id,
        g.resources.count(id),
      ]),
    });
  });
  await page.locator('[data-campaign-log-close]').click();
  check(
    'Reading and closing record preserves resources',
    before ===
      (await page.evaluate(() => {
        const g = globalThis.__game.game;
        return JSON.stringify({
          player: g.buildSave().player,
          resources: ['water', 'greens', 'rations', 'scrap', 'components', 'fuel'].map((id) => [
            id,
            g.resources.count(id),
          ]),
        });
      })),
  );

  // Credits recognition is fed through the real ending presentation seam.
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.titleCamera = null;
    g.ending.restore(
      { format: 1, phase: 'credits', committedAtDistance: 0, arrivalElapsedS: 12 },
      true,
    );
    g.refreshEndingView();
  });
  check(
    'Credits overlay appears from completed ending save',
    await page.locator('.ending-overlay[data-phase="credits"]').isVisible(),
  );
  check(
    'Credits show conditional campaign recognition',
    (await page.locator('.ending-recognition p').count()) >= 2,
  );
  await page.screenshot({ path: `${out}/ending-recognition.png` });
  const endingBefore = await page.evaluate(() =>
    JSON.stringify(globalThis.__game.game.buildSave().player),
  );
  const creditsSaved = await page.evaluate(
    async () => await globalThis.__game.game.saveTo('readiness-record-credits', 'manual', true),
  );
  const creditsLoaded = await page.evaluate(
    async () => await globalThis.__game.game.loadFrom('readiness-record-credits'),
  );
  check(
    'Credits survive real save/load',
    creditsSaved &&
      creditsLoaded &&
      (await page.evaluate(() => globalThis.__game.game.ending.phase === 'credits')),
  );
  await page.locator('[data-ending-keep]').click();
  check(
    'Keep Walking real button completes ending',
    await page.evaluate(() => globalThis.__game.game.ending.phase === 'complete'),
  );
  const completeSaved = await page.evaluate(
    async () => await globalThis.__game.game.saveTo('readiness-record-complete', 'manual', true),
  );
  const completeLoaded = await page.evaluate(
    async () => await globalThis.__game.game.loadFrom('readiness-record-complete'),
  );
  check(
    'Complete phase survives real save/load',
    completeSaved &&
      completeLoaded &&
      (await page.evaluate(() => globalThis.__game.game.ending.phase === 'complete')),
  );
  check(
    'Ending controls preserve inventory',
    endingBefore ===
      (await page.evaluate(() => JSON.stringify(globalThis.__game.game.buildSave().player))),
  );
} catch (error) {
  errors.push(error.stack ?? String(error));
} finally {
  await browser.close();
}
await writeFile(`${out}/qa.json`, JSON.stringify({ site, checks, errors }, null, 2));
console.log(
  JSON.stringify(
    {
      passed: checks.filter((item) => item.ok).length,
      total: checks.length,
      failed: checks.filter((item) => !item.ok),
      errors,
    },
    null,
    2,
  ),
);
if (checks.some((item) => !item.ok) || errors.length) process.exitCode = 1;
