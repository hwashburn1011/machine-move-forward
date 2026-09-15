/**
 * Meridian lifecycle soak. Root-run only: this intentionally uses a real Chrome
 * context and the live Game seams, but is not launched by unit CI.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const port = process.env.MMF_PORT ?? '5201';
const site = process.env.MMF_SITE ?? `http://127.0.0.1:${port}/`;
const outDir = path.resolve(process.env.MMF_QA_OUT ?? 'test-results/meridian-soak');
const slot = 'meridian-soak-single-slot';
const cycles = Number(process.env.MMF_SOAK_CYCLES ?? 100);
const cycleMs = Number(process.env.MMF_SOAK_INTERVAL ?? 6000);
const items = ['water', 'greens', 'scrap', 'components'];
const evidence = {
  site,
  cyclesRequested: cycles,
  samples: [],
  checks: [],
  errors: [],
  complete: false,
};
await fs.mkdir(outDir, { recursive: true });
const persist = () =>
  fs.writeFile(path.join(outDir, 'results.json'), JSON.stringify(evidence, null, 2));
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
page.on('console', (message) => {
  if (message.type() === 'error') evidence.errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => evidence.errors.push(`page: ${error.message}`));
const check = (name, ok, detail) => evidence.checks.push({ name, ok: Boolean(ok), detail });
const counts = () =>
  page.evaluate((ids) => {
    const g = globalThis.__game.game;
    return Object.fromEntries(ids.map((id) => [id, g.resources.count(id)]));
  }, items);

try {
  const url = `${site}?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=medium&seed=meridian-soak`;
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  evidence.url = url;
  await page.waitForFunction(
    () => Boolean(globalThis.__game?.game?.player?.visual?.isAnimated),
    null,
    { timeout: 180000 },
  );
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.loop.stop();
    g.closePanels(false);
    g.state.paused = false;
    g.state.playerDead = false;
    g.player.stats.invulnerable = true;
    g.player.teleport({ x: 5.6, y: 15.8, z: 1.5 });
    g.course.setTier(3);
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
      chapterComplete: true,
      active: null,
    });
    g.ending.restore(
      { format: 1, phase: 'complete', committedAtDistance: 0, arrivalElapsedS: 12 },
      true,
    );
    g.build.clear();
    g.inventory.clear();
    g.progression.grantBlueprint('seed-garden');
    g.firstRun.restore({
      completed: [
        'salvage',
        'build-refinery',
        'refine-components',
        'build-workbench',
        'build-defense',
        'survive-boarding',
        'repair',
      ],
      counters: {},
    });
    g.machine.power.restore({ fuel: 100 });
    const candidates = [];
    for (const cell of g.machine.deckCells) {
      g.build.place({ piece: 'floor', cell, rotation: 0 }, true);
      const garden = g.build.place({ piece: 'seed-garden', cell, rotation: 0 }, true);
      if (garden) candidates.push({ cell, id: garden.instanceId });
      if (candidates.length === 2) break;
    }
    if (candidates.length !== 2) throw Error('Two supported garden cells unavailable');
    globalThis.soakCells = candidates.map((x) => x.cell);
    for (const x of candidates) g.build.demolish(x.id);
    g.inventory.clear();
    g.resources.deposit('water', 1);
    g.start();
  });
  check(
    'live Game fixture initialized',
    await page.evaluate(() =>
      Boolean(globalThis.__game.game.build && globalThis.__game.game.ending.phase === 'complete'),
    ),
  );

  const soakStart = Date.now();
  for (let cycle = 0; cycle < cycles; cycle++) {
    const started = Date.now();
    const result = await page.evaluate(
      async ({ cycle, slot, items }) => {
        const g = globalThis.__game.game;
        g.loop.stop();
        g.state.paused = false;
        const before = Object.fromEntries(items.map((id) => [id, g.resources.count(id)]));
        const cell = globalThis.soakCells[cycle % 2];
        const placed = g.build.place({ piece: 'seed-garden', cell, rotation: 0 }, true);
        if (!placed) return { ok: false, reason: 'garden-placement-failed', before };
        const id = placed.instanceId;
        const mesh = g.build.visual(id);
        const station = g.build
          .stationsNear(g.player.worldPosition, Infinity)
          .find((item) => item.instanceId === id);
        if (station) g.player.teleport(station.position);
        const candidate = g.candidates().find((item) => item.id === id);
        const opened = Boolean(candidate && g.openInteractable(candidate));
        // openInteractable is the real E path and consumes exactly one carried water.
        const watered = opened && g.build.gardenSnapshot(id)?.water === 1;
        const initial = g.build.gardenSnapshot(id);
        g.build.tickGardens(1);
        const grown = g.build.gardenSnapshot(id);
        const movedCell = globalThis.soakCells[(cycle + 1) % 2];
        const moved = g.build.relocate(
          id,
          { piece: 'seed-garden', cell: movedCell, rotation: cycle % 4 },
          g.relocationOptions,
        );
        const sameMesh = mesh === g.build.visual(id);
        const afterMove = g.build.gardenSnapshot(id);
        const saveOk = await g.saveTo(slot, 'manual', true);
        const loadOk = saveOk && (await g.loadFrom(slot));
        g.loop.stop();
        g.state.paused = false;
        const afterLoad = g.build.gardenSnapshot(id);
        const endingStable = g.ending.phase === 'complete';
        const stateRestored = JSON.stringify(afterLoad) === JSON.stringify(afterMove);
        const demolishBefore = Object.fromEntries(
          items.map((item) => [item, g.resources.count(item)]),
        );
        const expectedRefund = g.build.demolitionPreview(id).refund;
        const refund = g.build.demolish(id);
        const after = Object.fromEntries(items.map((item) => [item, g.resources.count(item)]));
        const refundExact = ['scrap', 'components'].every(
          (item) => after[item] === demolishBefore[item] + (expectedRefund[item] ?? 0),
        );
        // Recycle only the fixture's known free-placement refund, after checking it.
        for (const item of ['scrap', 'components'])
          g.inventory.remove(item, expectedRefund[item] ?? 0);
        g.player.teleport({ x: 5.6, y: 15.8, z: 1.5 });
        g.player.stats.invulnerable = true;
        g.start();
        return {
          refundExact,
          expectedRefund,
          ok: Boolean(
            refundExact &&
            opened &&
            watered &&
            moved.ok &&
            sameMesh &&
            saveOk &&
            loadOk &&
            afterLoad &&
            endingStable &&
            stateRestored &&
            refund > 0,
          ),
          id,
          opened,
          watered,
          initial,
          grown,
          moved: moved.ok,
          sameMesh,
          afterMove,
          saveOk,
          loadOk,
          endingStable,
          stateRestored,
          afterLoad,
          refund,
          demolishBefore,
          before,
          after,
          pieces: g.build.pieceCount,
        };
      },
      { cycle, slot, items },
    );
    if (!result.ok) {
      evidence.errors.push(`cycle ${cycle + 1}: ${JSON.stringify(result)}`);
      throw new Error(`Cycle ${cycle + 1} failed`);
    }
    if (result.before && result.after) {
      const waterConserved = result.after.water === result.before.water;
      if (!waterConserved)
        evidence.errors.push(`cycle ${cycle + 1}: water conservation ${JSON.stringify(result)}`);
    }
    if ((cycle + 1) % 5 === 0 || cycle === cycles - 1) {
      const reading = await page.evaluate((cycle) => {
        const g = globalThis.__game.game,
          info = g.renderer.three.info;
        return {
          cycle,
          wallTime: Date.now(),
          simTime: g.state.simTime,
          ending: g.ending.phase,
          pieces: g.build.pieceCount,
          bodies: g.physics.bodyCount,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
          programs: info.programs?.length ?? 0,
          gardenCount: g.build.serialise().filter((piece) => piece.definitionId === 'seed-garden')
            .length,
        };
      }, cycle + 1);
      evidence.samples.push(reading);
      await persist();
      console.log(JSON.stringify(reading));
    }
    const remaining = cycleMs - (Date.now() - started);
    if (remaining > 0) await page.waitForTimeout(remaining);
  }
  const warm = evidence.samples[1] ?? evidence.samples[0];
  const later = evidence.samples.length > 1 ? evidence.samples.slice(1) : evidence.samples;
  const bounded = (field, allowance) =>
    warm &&
    later.length > 0 &&
    Math.max(...later.map((sample) => sample[field])) <= warm[field] + allowance;
  check(
    `${cycles} lifecycle cycles completed`,
    evidence.errors.filter((error) => error.startsWith('cycle ')).length === 0,
  );
  check('Requested wall-clock duration elapsed', Date.now() - soakStart >= cycles * cycleMs);
  evidence.durationMs = Date.now() - soakStart;
  evidence.finalSimTime = await page.evaluate(() => globalThis.__game.game.state.simTime);
  check(
    'Live simulation advanced between save cycles',
    evidence.finalSimTime > ((cycles * cycleMs) / 1000) * 0.75,
  );
  check(
    'garden/build count returned to baseline',
    evidence.samples.every((sample) => sample.gardenCount === 0),
  );
  if (warm) {
    check('geometry count bounded after warmup', bounded('geometries', 3));
    check('texture count bounded after warmup', bounded('textures', 2));
    check('program count bounded after warmup', bounded('programs', 1));
    check('physics body count bounded after warmup', bounded('bodies', 3));
  }
  check(
    'ending completion remains stable',
    await page.evaluate(() => globalThis.__game.game.ending.phase === 'complete'),
  );
  evidence.coverageGaps = [
    'Raid objective plans were not force-selected: no stable public Game helper exists for assault/sabotage/theft fixture selection.',
    'Destination model replacements and far-depot guidance are covered separately by meridian-visual.mjs.',
    'This lifecycle soak disables enemy spawning; recurring raid behaviors are covered separately by chapter/tactics QA.',
  ];
  evidence.complete = true;
  await page.screenshot({ path: path.join(outDir, 'final.png') });
} catch (error) {
  evidence.errors.push(error?.stack ?? String(error));
} finally {
  await persist();
  await context.close();
  await browser.close();
}
for (const item of evidence.checks) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
console.log(`Meridian soak: ${evidence.samples.length} samples; errors=${evidence.errors.length}`);
if (!evidence.complete || evidence.errors.length || evidence.checks.some((item) => !item.ok))
  process.exitCode = 1;
