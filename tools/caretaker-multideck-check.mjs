import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5201/';
const out = process.env.MMF_QA_OUT ?? 'test-results/caretaker-multideck';
const authored = process.env.MMF_AUTHORED === '1';
const checks = [];
const errors = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (error) => errors.push(error.stack ?? String(error)));
let result = null;
try {
  const query = authored
    ? 'nomenu=1&nolock=1&nosound=1&nospawn=1&quality=medium&staged=1&seed=caretaker-multideck-authored'
    : 'nomenu=1&nolock=1&nosound=1&nospawn=1&nomodel=1&notex=1&quality=low&staged=1&seed=caretaker-multideck';
  await page.goto(`${site}?${query}`);
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 120000 });
  if (authored) {
    await page.waitForFunction(
      () =>
        Boolean(
          globalThis.__game?.game?.machine?.group?.getObjectByName('authored-machine-details'),
        ),
      null,
      { timeout: 120000 },
    );
  }
  result = await page.evaluate(async (authoredMode) => {
    const g = globalThis.__game.game;
    const fail = (message) => {
      throw new Error(message);
    };
    g.stop();
    g.state.paused = false;
    g.closePanels(false);
    g.opening.restore({ phase: 'done' });
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
    g.story.restore({
      format: 2,
      completed: ['wreck-one', 'relay-foundry', 'quiet-array', 'glass-orchard'],
      recoveredUniques: ['course-gyro', 'human-seed-bank'],
      active: null,
      journalArchive: [],
    });
    g.progression.grantBlueprint('seed-garden');
    g.caretaker.recruit();
    if (!g.caretaker.snapshot().recruited) fail('caretaker fixture recruitment failed');

    const top = { x: 2, y: 0, z: 0 };
    const bottom = { x: 0, y: -2, z: -2 };
    const bottomDock = { x: 0, y: -2, z: 0 };
    const topCrate = { x: 2, y: 0, z: 2 };
    const topGenerator = { x: 2, y: 0, z: 1 };
    const placed = [];
    for (const cell of [top, bottom, bottomDock, topCrate, topGenerator]) {
      const piece = g.build.place({ piece: 'floor', cell, rotation: 0 }, true);
      if (!piece) fail(`floor placement failed at ${JSON.stringify(cell)}`);
      placed.push(piece);
    }
    const dock = g.build.place({ piece: 'caretaker-dock', cell: top, rotation: 0 }, true);
    const crate = g.build.place({ piece: 'crate', cell: topCrate, rotation: 0 }, true);
    const garden = g.build.place({ piece: 'seed-garden', cell: bottom, rotation: 0 }, true);
    const generator = g.build.place({ piece: 'generator', cell: topGenerator, rotation: 0 }, true);
    if (!dock || !crate || !garden || !generator) fail('station placement failed');
    g.build
      .crateContainer(crate.instanceId)
      .restore([{ itemId: 'water', count: 1 }, ...new Array(11).fill(null)]);
    g.caretaker.setMode('steward');
    g.machine.power.addFuel(100);
    g.machine.fixedUpdate(1 / 60);
    const start = g.build.caretakerEndpoint(dock.instanceId);
    if (!start) fail('dock endpoint missing');
    g.player.teleport({ x: start.x, y: start.y + 1.05, z: start.z - 0.5 });
    let minActorY = Infinity;
    let maxActorY = -Infinity;
    let maxTransferStep = 0;
    const serviceDistances = {};
    for (let i = 0; i < 5000; i++) {
      const before = g.caretakerActor?.position.clone() ?? null;
      g.fixedUpdate(1 / 60);
      if (g.caretakerActor) {
        if (before)
          maxTransferStep = Math.max(maxTransferStep, before.distanceTo(g.caretakerActor.position));
        minActorY = Math.min(minActorY, g.caretakerActor.position.y);
        maxActorY = Math.max(maxActorY, g.caretakerActor.position.y);
        const state = g.caretaker.snapshot();
        if (state.job && (state.phase === 'service-source' || state.phase === 'service-target')) {
          const id = state.phase === 'service-source' ? state.job.sourceId : state.job.targetId;
          const endpoint = g.build.caretakerEndpoint(id);
          const approach =
            endpoint &&
            g.caretakerNavigation?.approach(
              g.machine.group.localToWorld(endpoint.clone()),
              g.caretakerActor.position,
            );
          if (approach)
            serviceDistances[state.phase] = Math.min(
              serviceDistances[state.phase] ?? Infinity,
              g.caretakerActor.position.distanceTo(approach),
            );
        }
      }
    }
    const afterJob = {
      caretaker: g.caretaker.snapshot(),
      crate: g.build.crateContainer(crate.instanceId).serialise(),
      garden: g.build.gardenSnapshot(garden.instanceId),
      actorExists: !!g.caretakerActor,
      actorPosition: g.caretakerActor?.position.clone() ?? null,
      minActorY,
      maxActorY,
      serviceDistances,
    };
    const beforeBodies = g.physics.bodyCount;
    const beforeColliders = g.physics.colliderCount;
    const actorAfterJob = g.caretakerActor;
    const actorStartY = actorAfterJob?.position.y ?? NaN;
    const crateWater = afterJob.crate.find((item) => item?.itemId === 'water')?.count ?? 0;
    if (crateWater !== 0 || afterJob.garden?.water !== 1)
      fail(`cross-deck water job did not commit: ${JSON.stringify(afterJob)}`);

    g.caretaker.setMode('companion');
    g.player.teleport({ x: -2, y: 8.9, z: -2 });
    let followed = false;
    let maxFollowStep = 0;
    for (let i = 0; i < 1800; i++) {
      const before = actorAfterJob?.position.clone();
      g.fixedUpdate(1 / 60);
      if (before && actorAfterJob) {
        const step = before.distanceTo(actorAfterJob.position);
        maxFollowStep = Math.max(maxFollowStep, step);
        if (step > 0.01) followed = true;
      }
    }
    const playerFollowed =
      !!actorAfterJob &&
      actorAfterJob.position.y < 9.1 &&
      actorAfterJob.position.distanceTo(g.player.worldPosition) < 3;
    g.build
      .crateContainer(crate.instanceId)
      .restore([{ itemId: 'water', count: 1 }, ...new Array(11).fill(null)]);
    g.caretaker.setMode('steward');
    for (let i = 0; i < 120 && !g.caretaker.snapshot().job; i++) g.fixedUpdate(1 / 60);
    const hadJobBeforeMove = !!g.caretaker.snapshot().job;
    const dockMoved = g.build.relocate(dock.instanceId, {
      piece: 'caretaker-dock',
      cell: bottomDock,
      rotation: 0,
    });
    if (!dockMoved.ok) fail(`dock relocation failed: ${dockMoved.reason}`);
    const relocationDeltas = [];
    // Game observes a dock relocation during fixedUpdate. Include that first
    // real tick in the movement bound before checking the cancellation.
    for (let i = 0; i < 120; i++) {
      const before = actorAfterJob?.position.clone() ?? null;
      g.fixedUpdate(1 / 60);
      const after = actorAfterJob?.position ?? null;
      if (before && after) relocationDeltas.push(before.distanceTo(after));
      if (i === 0 && hadJobBeforeMove) {
        // The cancellation is a Game-side response to the relocation, so
        // checking before this tick would only test an implementation detail.
        var cancelledOnMove = !g.caretaker.snapshot().job;
      }
    }
    const actorAfterMove = actorAfterJob?.position.clone() ?? null;
    const postMoveCrate = g.build.crateContainer(crate.instanceId).serialise();
    const postMoveGarden = g.build.gardenSnapshot(garden.instanceId);
    const final = {
      afterJob,
      authoredGeometry: authoredMode,
      followed: followed && playerFollowed,
      maxTransferStep,
      maxFollowStep,
      hadJobBeforeMove,
      cancelledOnMove,
      actorIdentity: actorAfterJob === g.caretakerActor,
      actorStartY,
      actorAfterMove,
      relocationDeltas,
      dock: g.build.serialise().find((piece) => piece.instanceId === dock.instanceId) ?? null,
      staleTokenDidNotCommit:
        postMoveCrate.find((item) => item?.itemId === 'water')?.count === 1 &&
        postMoveGarden?.water === 1,
      bodies: g.physics.bodyCount,
      colliders: g.physics.colliderCount,
      beforeBodies,
      beforeColliders,
    };
    return final;
  }, authored);
  check(
    'Cross-deck transfer commits one water without resource duplication',
    result.afterJob.garden?.water === 1 &&
      result.afterJob.crate.every((item) => item?.itemId !== 'water'),
    result.afterJob,
  );
  check('Caretaker transfer movement remains continuously bounded', result.maxTransferStep < 0.15, {
    authored: result.authoredGeometry,
    maxTransferStep: result.maxTransferStep,
  });
  check(
    'Caretaker physically crosses onto the lower deck',
    result.afterJob.minActorY < 9.1,
    result.afterJob,
  );
  check(
    'Caretaker reaches both real service positions',
    ['service-source', 'service-target'].every(
      (phase) =>
        Number.isFinite(result.afterJob.serviceDistances[phase]) &&
        result.afterJob.serviceDistances[phase] <= 0.7,
    ),
    result.afterJob.serviceDistances,
  );
  check(
    'Companion follows player across deck levels with same actor',
    result.followed && result.actorIdentity,
    result,
  );
  check('Companion movement remains continuously bounded', result.maxFollowStep < 0.15, {
    authored: result.authoredGeometry,
    maxFollowStep: result.maxFollowStep,
  });
  check(
    'Dock relocation preserves actor and physics body/collider counts',
    result.dock &&
      result.actorIdentity &&
      result.bodies === result.beforeBodies &&
      result.colliders === result.beforeColliders &&
      result.relocationDeltas.length > 0 &&
      Math.max(...result.relocationDeltas) < 0.15,
    result,
  );
  check(
    'Dock relocation cancels an active caretaker job',
    result.hadJobBeforeMove && result.cancelledOnMove,
    result,
  );
  check(
    'Cancelled caretaker job cannot commit its stale transfer token',
    result.cancelledOnMove && result.staleTokenDidNotCommit,
    {
      cancelledOnMove: result.cancelledOnMove,
      staleTokenDidNotCommit: result.staleTokenDidNotCommit,
    },
  );
} catch (error) {
  errors.push(error.stack ?? String(error));
} finally {
  await browser.close();
}
await writeFile(
  `${out}/qa.json`,
  JSON.stringify({ site, generatedAt: new Date().toISOString(), checks, result, errors }, null, 2),
);
console.log(JSON.stringify({ checks, result, errors }, null, 2));
if (checks.some((entry) => !entry.ok) || errors.length) process.exitCode = 1;
