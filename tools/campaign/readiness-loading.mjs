/**
 * Campaign readiness loading acceptance harness.
 *
 * This intentionally uses isolated browser contexts and real production boot
 * paths. It is a measurement script, not a gameplay fixture or a GPU bench.
 * Run one or more cases with MMF_LOADING_CASES=default,critical-404,late-404,
 * stalled (or omit it for all cases). Results and early boot captures are
 * written under MMF_QA_OUT.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.MMF_SITE ?? `http://127.0.0.1:${process.env.MMF_PORT ?? 5201}`;
const out = process.env.MMF_QA_OUT ?? 'test-results/campaign-readiness/loading';
const requested = (process.env.MMF_LOADING_CASES ?? 'default,critical-404,late-404,stalled')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const results = [];

await mkdir(out, { recursive: true });

async function runCase(name) {
  const browser = await chromium.launch({
    executablePath: chromePath,
    args: ['--use-angle=d3d11', '--enable-gpu'],
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  const consoleErrors = [];
  const responses = [];
  const started = Date.now();
  page.on('pageerror', (error) =>
    errors.push({ kind: 'pageerror', message: error.message, url: null }),
  );
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const entry = {
        kind: 'console',
        message: message.text(),
        url: message.location().url || null,
      };
      consoleErrors.push(entry);
      errors.push(entry);
    }
  });
  page.on('response', (response) =>
    responses.push({ url: response.url(), status: response.status() }),
  );
  try {
    if (name === 'critical-404') {
      await page.route('**/models/authored/manual-turret.glb', (route) =>
        route.fulfill({ status: 404, body: '' }),
      );
    }
    if (name === 'late-404') {
      await page.route('**/models/authored/quiet-array.glb', (route) =>
        route.fulfill({ status: 404, body: '' }),
      );
    }
    if (name === 'late-stalled') {
      await page.route('**/models/authored/quiet-array.glb', () => new Promise(() => {}));
    }
    if (name === 'stalled' || name === 'stalled-simpler') {
      await page.route('**/models/authored/manual-turret.glb', () => new Promise(() => {}));
    }
    const query = 'staged=1&quality=low&nospawn=1&nosound=1&seed=readiness-loading';
    const url = new URL(`?${query}`, `${base.replace(/\/$/, '')}/`).href;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(150);
    const bootVisible = await page
      .locator('#boot')
      .isVisible()
      .catch(() => false);
    if (bootVisible) await page.screenshot({ path: `${out}/${name}-boot.png`, fullPage: true });
    const bootText = await page
      .locator('#boot')
      .textContent()
      .catch(() => '');
    let ready = false;
    let simpler = false;
    if (name === 'stalled' || name === 'stalled-simpler') {
      await page.waitForTimeout(16_000);
      simpler = await page
        .locator('[data-loading-simpler]')
        .isVisible()
        .catch(() => false);
      if (simpler) await page.screenshot({ path: `${out}/${name}-slow.png` });
      if (simpler && name === 'stalled-simpler')
        await page.locator('[data-loading-simpler]').click();
    }
    try {
      await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, {
        timeout: name === 'stalled' ? 75_000 : 180_000,
      });
      ready = true;
    } catch {
      // The stalled case records the fallback surface before failing.
    }
    if (name !== 'stalled' && name !== 'stalled-simpler')
      simpler = await page
        .locator('[data-loading-simpler]')
        .isVisible()
        .catch(() => false);
    const retry = await page
      .locator('[data-loading-retry]')
      .isVisible()
      .catch(() => false);
    const titleText = await page
      .locator('#title')
      .textContent()
      .catch(() => '');
    const criticalReadyState =
      ready && (name === 'critical-404' || name === 'default')
        ? await page.evaluate(() => {
            const game = globalThis.__game?.game;
            return typeof game?.campaignArtReady === 'function'
              ? game.campaignArtReady(['quiet-array'])
              : null;
          })
        : null;
    const glbResponsesAtReady = responses.filter((response) =>
      /\.glb(?:\?|$)/i.test(response.url),
    ).length;
    await page.waitForTimeout(1000);
    const deferredGlbResponses =
      responses.filter((response) => /\.glb(?:\?|$)/i.test(response.url)).length -
      glbResponsesAtReady;
    let offlineRecovery = null;
    if (name === 'offline-recovery') {
      const inventory = await page.evaluate(async () => {
        const game = globalThis.__game.game;
        const save = game.buildSave();
        await game.saves.save('offline-recovery', save);
        return JSON.stringify(save.player.inventory);
      });
      await context.setOffline(true);
      let reloadError = null;
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
      } catch (error) {
        reloadError = error.message;
      }
      await context.setOffline(false);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 180000 });
      const restored = await page.evaluate(async () => {
        const save = await globalThis.__game.game.saves.load('offline-recovery');
        return JSON.stringify(save?.player.inventory);
      });
      offlineRecovery = { reloadError, savePreserved: inventory === restored };
      if (!offlineRecovery.savePreserved)
        throw new Error('Network loss changed the saved inventory');
    }
    let continuation = null;
    if (
      ready &&
      (name === 'continue-meridian' || name === 'continue-arrival' || name === 'corrupt-save')
    ) {
      const slot = `readiness-${name}`;
      const fixture = await page.evaluate(
        async ({ slot, name }) => {
          const g = globalThis.__game.game;
          g.loop.stop();
          g.state.paused = true;
          if (name !== 'corrupt-save') {
            if (
              typeof g.prepareCampaignArt !== 'function' ||
              !(await g.prepareCampaignArt(['seed-garden']))
            ) {
              throw new Error('seed-garden campaign art did not prepare');
            }
            g.progression.grantBlueprint('seed-garden');
            const cell = { x: 2, y: 0, z: 2 };
            g.build.place({ piece: 'floor', cell, rotation: 0 }, true);
            const placed = g.build.place({ piece: 'seed-garden', cell, rotation: 0 }, true);
            if (!placed) throw new Error('seed-garden placement failed');
            const gardenPiece = g.build
              .serialise()
              .find((piece) => piece.definitionId === 'seed-garden');
            if (!gardenPiece) throw new Error('seed-garden save piece missing');
            g.resources.deposit('water', 1);
            if (g.build.waterGarden(gardenPiece.instanceId) !== 1)
              throw new Error('garden fixture did not accept its water');
            g.build.tickGardens(181);
          }
          const save = g.buildSave();
          if (name !== 'corrupt-save') {
            save.world.story = {
              format: 2,
              completed: ['wreck-one', 'relay-foundry', 'quiet-array', 'glass-orchard'],
              recoveredUniques: [
                'course-gyro',
                'salvage-controller',
                'tracking-servo',
                'course-actuator',
                'annika-archive-shard',
                'human-seed-bank',
                'vector-governor',
                'orchard-memory-core',
              ],
              journalArchive: ['orchard-memory-record'],
              active: {
                expeditionId: 'last-garden-meridian',
                routeId: 'meridian-quiet-line',
                phase: 'docked',
                arrivalDistance: save.distanceTraveled,
                journalsRead: ['meridian-common-record'],
                scriptedEncounter: 'resolved',
                objectivesCompleted: [],
              },
              ending:
                name === 'continue-arrival'
                  ? {
                      format: 1,
                      phase: 'arrival',
                      committedAtDistance: save.distanceTraveled,
                      arrivalElapsedS: 0,
                    }
                  : {
                      format: 1,
                      phase: 'available',
                      committedAtDistance: null,
                      arrivalElapsedS: 0,
                    },
            };
            if (name === 'continue-arrival') {
              save.world.story.completed = [
                'wreck-one',
                'relay-foundry',
                'quiet-array',
                'glass-orchard',
                'last-garden-meridian',
              ];
              save.world.story.recoveredUniques.push('meridian-solution');
              save.world.story.active = null;
            }
          } else {
            save.world.story = {
              format: 2,
              completed: 'bad',
              recoveredUniques: null,
              active: null,
            };
            save.world.routeChart = {
              ...save.world.routeChart,
              active: { ...save.world.routeChart?.active, kind: 'unknown-kind' },
            };
          }
          await g.saves.save(slot, save);
          return {
            hasGarden: save.machine.structures.some(
              (piece) => piece.definitionId === 'seed-garden',
            ),
            story: save.world.story,
          };
        },
        { slot, name },
      );
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, {
        timeout: 180_000,
      });
      await page
        .locator('#title [data-id="continue"]')
        .waitFor({ state: 'visible', timeout: 60_000 });
      await page.locator('#title [data-id="continue"]').click();
      await page.waitForFunction(
        () => {
          const g = globalThis.__game?.game;
          return Boolean(g && g.opening?.phase === 'done' && !g.artTransition && !g.continuing);
        },
        null,
        { timeout: 60_000 },
      );
      const loaded = await page.evaluate(() => {
        const g = globalThis.__game.game;
        const gardenPiece = g.build
          .serialise()
          .find((piece) => piece.definitionId === 'seed-garden');
        const gardenVisual = gardenPiece
          ? g.build.gardenVisuals?.get(gardenPiece.instanceId)
          : null;
        return {
          story: g.story.toSave(),
          destinationAuthored: Boolean(g.destination?.root?.userData?.authored),
          destinationDocked: Boolean(g.destination?.docked),
          authoredGarden: Boolean(
            gardenVisual && !gardenVisual.root?.getObjectByName?.('GardenTray'),
          ),
          garden: gardenPiece ? g.build.gardenSnapshot(gardenPiece.instanceId) : null,
          ending: g.ending?.phase ?? null,
          arrivalActive: Boolean(g.arrivalScene?.active),
          horizonVisible: Boolean(g.arrivalScene?.root?.visible),
          authoredHorizon:
            g.arrivalScene?.root?.children.length === 1 &&
            g.arrivalScene?.ownedGeometry?.length === 0,
          arrivalOwnedGeometry: g.arrivalScene?.ownedGeometry?.length ?? null,
          courseTier: g.course?.snapshot?.tier ?? null,
          titleOpen: Boolean(g.titleScreen?.isOpen),
        };
      });
      continuation = { slot, fixture, loaded };
      await writeFile(`${out}/${name}-state.json`, JSON.stringify(continuation, null, 2));
      if (
        name === 'continue-meridian' &&
        (!fixture.hasGarden ||
          loaded.story.active?.expeditionId !== 'last-garden-meridian' ||
          !loaded.destinationAuthored ||
          !loaded.destinationDocked ||
          loaded.courseTier !== 2 ||
          !loaded.authoredGarden ||
          !loaded.garden ||
          loaded.garden.water !== 0 ||
          loaded.garden.greens !== 3)
      )
        throw new Error('Meridian Continue did not restore the authored dock and seed garden');
      if (
        name === 'continue-arrival' &&
        (loaded.ending !== 'arrival' ||
          !loaded.arrivalActive ||
          !loaded.horizonVisible ||
          !loaded.authoredHorizon ||
          loaded.arrivalOwnedGeometry !== 0 ||
          loaded.courseTier !== 3)
      )
        throw new Error('arrival Continue did not restore the Meridian arrival phase');
      if (
        name === 'corrupt-save' &&
        (loaded.story.active !== null ||
          loaded.story.completed?.length !== 0 ||
          loaded.story.recoveredUniques?.length !== 0 ||
          loaded.courseTier !== 0 ||
          loaded.titleOpen)
      )
        throw new Error('corrupt save did not recover to a conservative inactive story');
      await page.screenshot({ path: `${out}/${name}-continued.png`, fullPage: true });
    }
    let latePreparation = null;
    if (ready && (name === 'late-404' || name === 'late-stalled')) {
      latePreparation = await page.evaluate(async () => {
        const game = globalThis.__game.game;
        const beforeBodies = game.physics?.bodyCount ?? null;
        const beforeColliders = game.physics?.colliderCount ?? null;
        const inputBefore = game.input.inputContext;
        const prepare = game.prepareCampaignArt;
        const result =
          typeof prepare === 'function' ? await prepare.call(game, ['quiet-array']) : null;
        return {
          result,
          inputBefore,
          bodiesBefore: beforeBodies,
          bodiesAfter: game.physics?.bodyCount ?? null,
          collidersBefore: beforeColliders,
          collidersAfter: game.physics?.colliderCount ?? null,
          artTransition: Boolean(game.artTransition),
          inputContext: game.input?.inputContext ?? null,
          ready:
            typeof game.campaignArtReady === 'function' && game.campaignArtReady(['quiet-array']),
        };
      });
    }
    const report = {
      name,
      ready,
      bootVisible,
      bootText,
      simplerVisibleAfterDeadline: simpler,
      retryVisible: retry,
      titleText,
      responses: responses.filter((response) => /\.glb(?:\?|$)/i.test(response.url)),
      expectedFallbacks: responses
        .filter((response) => response.status === 404)
        .map((response) => response.url),
      latePreparation,
      offlineRecovery,
      criticalReadyState,
      glbResponsesAtReady,
      deferredGlbResponses,
      continuation,
      errors,
      elapsedMs: Date.now() - started,
    };
    if (!ready) throw new Error('production game did not publish __game');
    const expectedAsset =
      name === 'critical-404'
        ? new URL('models/authored/manual-turret.glb', `${base.replace(/\/$/, '')}/`).pathname
        : name === 'late-404'
          ? new URL('models/authored/quiet-array.glb', `${base.replace(/\/$/, '')}/`).pathname
          : null;
    const unexpected404s = responses.filter(
      (response) =>
        response.status === 404 &&
        (!expectedAsset || new URL(response.url).pathname !== expectedAsset),
    );
    if (unexpected404s.length)
      throw new Error(
        `unexpected 404 responses: ${unexpected404s.map((response) => response.url).join(' | ')}`,
      );
    const unexpectedErrors = errors.filter((entry) => {
      if (entry.kind !== 'console' || !expectedAsset) return true;
      const locationMatches = entry.url
        ? (() => {
            try {
              return new URL(entry.url).pathname === expectedAsset;
            } catch {
              return false;
            }
          })()
        : false;
      return !(
        (entry.message.includes(expectedAsset) || locationMatches) &&
        /\b404\b/.test(entry.message)
      );
    });
    if (unexpectedErrors.length)
      throw new Error(
        `browser errors: ${unexpectedErrors.map((entry) => `${entry.kind}:${entry.message}${entry.url ? ` @ ${entry.url}` : ''}`).join(' | ')}`,
      );
    if ((name === 'stalled' || name === 'stalled-simpler') && !simpler)
      throw new Error('stalled critical load did not expose simpler visuals');
    if (name !== 'stalled' && !bootVisible)
      throw new Error('early #boot progress surface was not visible');
    if (
      name === 'critical-404' &&
      !report.expectedFallbacks.some((url) => url.includes('manual-turret.glb'))
    )
      throw new Error('critical 404 fixture did not receive manual-turret.glb');
    if (
      name === 'late-404' &&
      !report.expectedFallbacks.some((url) => url.includes('quiet-array.glb'))
    )
      throw new Error('late 404 fixture did not receive quiet-array.glb');
    if ((name === 'default' || name === 'critical-404') && report.criticalReadyState !== false)
      throw new Error('quiet-array was already marked ready during critical boot');
    if (
      (name === 'late-404' || name === 'late-stalled') &&
      (!report.latePreparation?.result ||
        report.latePreparation.bodiesBefore !== report.latePreparation.bodiesAfter ||
        report.latePreparation.collidersBefore !== report.latePreparation.collidersAfter ||
        report.latePreparation.artTransition ||
        !Number.isFinite(report.latePreparation.bodiesBefore) ||
        !Number.isFinite(report.latePreparation.collidersBefore) ||
        report.latePreparation.inputContext !== report.latePreparation.inputBefore ||
        !report.latePreparation.ready)
    )
      throw new Error('late campaign art preparation did not complete safely');
    results.push({ ...report, passed: true });
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      errors,
    });
  } finally {
    await context.close();
    await browser.close();
  }
}

for (const name of requested) await runCase(name);
await writeFile(`${out}/loading.json`, JSON.stringify({ base, cases: results }, null, 2));
if (results.some((result) => !result.passed)) process.exitCode = 1;
console.log(JSON.stringify({ output: `${out}/loading.json`, cases: results }, null, 2));
