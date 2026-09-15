import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { checkCaretakerInterruptions } from './campaign/caretaker-interruption-check.mjs';

const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5201/';
const out = process.env.MMF_QA_OUT ?? 'test-results/caretaker-game-check';
const checks = [],
  errors = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (error) => errors.push(error.stack ?? String(error)));
try {
  await page.goto(
    `${site}?nomenu=1&nolock=1&nosound=1&nospawn=1&nomodel=1&notex=1&quality=low&staged=1&seed=caretaker-game-check`,
  );
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 120000 });
  const fixture = await page.evaluate(() => {
    const shell = globalThis.__game,
      g = shell.game;
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
    g.tutorialReadyAt = null;
    g.threatPhase = 'calm';
    g.enemies.despawnAll();
    g.vehicleScene.clear();
    g.story.restore({
      format: 2,
      completed: ['wreck-one', 'relay-foundry', 'quiet-array', 'glass-orchard'],
      recoveredUniques: ['course-gyro', 'human-seed-bank'],
      active: null,
      journalArchive: [],
    });
    g.caretaker.recruit();
    g.progression.grantBlueprint('seed-garden');
    let dock, crate, garden;
    for (const cell of (g.machine.deckCells ?? []).filter((entry) => entry.y === 0)) {
      const other = { ...cell, x: cell.x + 1 },
        third = { ...cell, x: cell.x + 2 },
        fourth = { ...cell, x: cell.x + 3 };
      g.build.clear();
      if (
        !g.build.place({ piece: 'floor', cell, rotation: 0 }, true) ||
        !g.build.place({ piece: 'floor', cell: other, rotation: 0 }, true) ||
        !g.build.place({ piece: 'floor', cell: third, rotation: 0 }, true) ||
        !g.build.place({ piece: 'floor', cell: fourth, rotation: 0 }, true)
      )
        continue;
      dock = g.build.place({ piece: 'caretaker-dock', cell, rotation: 0 }, true);
      crate = g.build.place({ piece: 'crate', cell: other, rotation: 0 }, true);
      garden = g.build.place({ piece: 'seed-garden', cell: third, rotation: 0 }, true);
      g.build.place({ piece: 'generator', cell: fourth, rotation: 0 }, true);
      if (dock && crate && garden) break;
    }
    if (!dock || !crate || !garden) return null;
    g.build
      .crateContainer(crate.instanceId)
      .restore([{ itemId: 'water', count: 1 }, ...new Array(11).fill(null)]);
    g.caretaker.setMode('companion');
    const p = g.build.caretakerEndpoint(dock.instanceId);
    g.player.teleport({ x: p.x, y: p.y + 1.05, z: p.z - 0.5 });
    g.machine.power.addFuel(20);
    g.fixedUpdate(1 / 60);
    return { dock: dock.instanceId, crate: crate.instanceId, garden: garden.instanceId };
  });
  check('Real recruited caretaker fixture placed', !!fixture, fixture);
  if (!fixture) throw new Error('Unable to create dock/crate/garden fixture');
  await page.evaluate((id) => globalThis.__game.game.openCaretaker(id), fixture.dock);
  check(
    'Caretaker panel opens at real dock',
    await page.locator('[data-panel="caretaker"]').isVisible(),
  );
  await page.locator('[data-panel="caretaker"] [data-mode="steward"]').click();
  await page.evaluate(() => globalThis.__game.game.closePanels(false));
  const before = await page.evaluate(
    (ids) => ({
      crate: globalThis.__game.game.build.crateContainer(ids.crate).serialise(),
      garden: globalThis.__game.game.build.gardenSnapshot(ids.garden),
    }),
    fixture,
  );
  const run = await page.evaluate((ids) => {
    const g = globalThis.__game.game;
    g.fixedUpdate(1 / 60);
    const initialState = g.caretaker.snapshot();
    const source = initialState.job && g.build.caretakerEndpoint(initialState.job.sourceId);
    const target = initialState.job && g.build.caretakerEndpoint(initialState.job.targetId);
    const initialActor = g.caretakerActor?.position
      ? {
          x: g.caretakerActor.position.x,
          y: g.caretakerActor.position.y,
          z: g.caretakerActor.position.z,
        }
      : null;
    let traveled = 0;
    const serviceDistances = {};
    for (let i = 1; i < 1200; i++) {
      const previous = g.caretakerActor?.position.clone();
      g.fixedUpdate(1 / 60);
      const actor = g.caretakerActor;
      if (previous && actor) traveled += actor.position.distanceTo(previous);
      const phase = g.caretaker.snapshot().phase;
      if (actor?.target && (phase === 'service-source' || phase === 'service-target'))
        serviceDistances[phase] = Math.max(
          serviceDistances[phase] ?? 0,
          actor.position.distanceTo(actor.target),
        );
    }
    const finalActor = g.caretakerActor?.position
      ? {
          x: g.caretakerActor.position.x,
          y: g.caretakerActor.position.y,
          z: g.caretakerActor.position.z,
        }
      : null;
    return {
      traveled,
      serviceDistances,
      initialState,
      state: g.caretaker.snapshot(),
      crate: g.build.crateContainer(ids.crate).serialise(),
      garden: g.build.gardenSnapshot(ids.garden),
      actor: g.caretakerActor?.position
        ? {
            x: g.caretakerActor.position.x,
            y: g.caretakerActor.position.y,
            z: g.caretakerActor.position.z,
          }
        : null,
      initialActor,
      finalActor,
      source,
      target,
      approachSource:
        source &&
        g.caretakerNavigation?.approach(
          g.machine.group.localToWorld(source.clone()),
          g.caretakerActor?.position,
        ),
      approachTarget:
        target &&
        g.caretakerNavigation?.approach(
          g.machine.group.localToWorld(target.clone()),
          g.caretakerActor?.position,
        ),
      actorTarget: g.caretakerActor?.target ?? null,
      actorRoute: g.caretakerActor?.route ?? null,
      actorWaypoint: g.caretakerActor?.waypoint,
      actorLastTurn: g.caretakerActor?.lastTurn,
      probeHits: g.caretakerActor
        ? [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2].map((offset) => {
            const a = g.caretakerActor,
              pos = a.position.clone();
            pos.y += 0.38;
            const angle = Math.atan2(a.target.x - pos.x, a.target.z - pos.z) + offset;
            const dir = pos.clone().set(Math.sin(angle), 0, Math.cos(angle));
            const hit = g.physics.raycast(pos, dir, 1.6, a.handle.collider);
            const data = hit ? g.physics.getUserData(hit.collider) : null;
            return {
              offset,
              distance: hit?.distance,
              point: hit?.point,
              collider: hit?.collider?.translation(),
              shape: hit?.collider?.shape,
              data: data ? { kind: data.kind, id: data.id, instanceId: data.instanceId } : null,
            };
          })
        : [],
    };
  }, fixture);
  check('Caretaker performs a real steward job', run.garden?.water === 1 && run.crate[0] === null, {
    before,
    run,
  });
  check(
    'Caretaker physically visits both service points',
    run.traveled > 3 &&
      ['service-source', 'service-target'].every(
        (phase) =>
          Number.isFinite(run.serviceDistances[phase]) && run.serviceDistances[phase] <= 0.6,
      ),
    {
      traveled: run.traveled,
      serviceDistances: run.serviceDistances,
      initialState: run.initialState,
      state: run.state,
      actor: run.actor,
      source: run.source,
      target: run.target,
    },
  );
  const relocation = await page.evaluate((ids) => {
    const g = globalThis.__game.game;
    const dock = g.build.serialise().find((piece) => piece.instanceId === ids.dock);
    const oldActor = g.caretakerActor;
    if (!dock || !oldActor) return { ok: false, reason: 'dock or actor unavailable' };
    const originalCell = { ...dock.cell };
    let moved = null;
    for (const cell of (g.machine.deckCells ?? []).filter((entry) => entry.y !== dock.cell.y)) {
      g.build.place({ piece: 'floor', cell, rotation: 0 }, true);
      const candidate = { piece: 'caretaker-dock', cell, rotation: dock.rotation };
      if (!g.build.canRelocate(ids.dock, candidate).ok) continue;
      moved = g.build.relocate(ids.dock, candidate);
      if (moved.ok) break;
    }
    g.fixedUpdate(1 / 60);
    const sameActorAfterMove = g.caretakerActor === oldActor;
    const movedEndpoint = g.build.caretakerEndpoint(ids.dock);
    if (movedEndpoint)
      g.player.teleport({
        x: movedEndpoint.x,
        y: movedEndpoint.y + 1.05,
        z: movedEndpoint.z - 0.5,
      });
    return {
      ok: !!moved?.ok && sameActorAfterMove && g.caretakerActor === oldActor,
      moved: !!moved?.ok,
      sameActor: sameActorAfterMove && g.caretakerActor === oldActor,
      bodies: g.physics.bodyCount,
      actor: !!g.caretakerActor,
    };
  }, fixture);
  check('Cross-deck dock relocation preserves the live caretaker actor', relocation.ok, relocation);
  for (const result of await checkCaretakerInterruptions(page, fixture))
    check(result.name, result.ok, result.detail);
  const transient = await page.evaluate(() => globalThis.__game.game.caretaker.toSave());
  check(
    'Caretaker save excludes transient state',
    !Object.hasOwn(transient, 'job') && !Object.hasOwn(transient, 'cargo'),
    transient,
  );
  await page.evaluate(
    (save) =>
      globalThis.__game.game.caretaker.restore({
        ...save,
        job: { sourceId: 'fake' },
        cargo: { itemId: 'water', count: 1 },
      }),
    transient,
  );
  check(
    'Restore clears injected transient fields',
    await page.evaluate(() => !globalThis.__game.game.caretaker.snapshot().job),
  );
  const removed = await page.evaluate((ids) => {
    const g = globalThis.__game.game;
    g.build.demolish(ids.garden);
    const before = g.build.crateContainer(ids.crate).serialise();
    const result = g.build.commitCaretakerJob({
      kind: 'water-garden',
      sourceId: ids.crate,
      targetId: ids.garden,
      itemId: 'water',
      count: 1,
    });
    return {
      result,
      unchanged:
        JSON.stringify(before) === JSON.stringify(g.build.crateContainer(ids.crate).serialise()),
    };
  }, fixture);
  check(
    'Removed garden endpoint refuses without loss',
    removed.result === false && removed.unchanged,
    removed,
  );
  const roundTrip = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    const slot = 'caretaker-lifecycle-fixture';
    const oldActor = g.caretakerActor;
    const save = g.buildSave();
    const before = g.build.serialise().sort((a, b) => a.instanceId.localeCompare(b.instanceId));
    await g.saves.save(slot, save);
    g.caretaker.reset();
    const loaded = await g.loadFrom(slot);
    const after = g.build.serialise().sort((a, b) => a.instanceId.localeCompare(b.instanceId));
    const restored = g.caretaker.snapshot();
    g.state.paused = false;
    g.fixedUpdate(1 / 60);
    await g.saves.delete(slot);
    return {
      loaded,
      recruited: restored.recruited,
      mode: restored.mode,
      job: restored.job,
      preserved: JSON.stringify(before) === JSON.stringify(after),
      docks: after.filter((p) => p.definitionId === 'caretaker-dock').length,
      oldRemoved: oldActor?.root.parent === null,
      actor: !!g.caretakerActor,
    };
  });
  check(
    'real dock and built contents survive Game save/load with one fresh actor',
    roundTrip.loaded &&
      roundTrip.recruited &&
      roundTrip.mode === 'steward' &&
      !roundTrip.job &&
      roundTrip.preserved &&
      roundTrip.docks === 1 &&
      roundTrip.oldRemoved &&
      roundTrip.actor,
    roundTrip,
  );
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    const actor = g.caretakerActor;
    if (actor) {
      const camera = g.playerCamera.camera.clone();
      camera.position.set(actor.position.x + 5, actor.position.y + 4, actor.position.z + 5);
      camera.lookAt(actor.position.x, actor.position.y, actor.position.z);
      g.freeCamera = camera;
      g.render(0);
    }
  });
  await page.screenshot({ path: `${out}/caretaker.png`, fullPage: true });
} catch (error) {
  errors.push(error.stack ?? String(error));
} finally {
  await browser.close();
}
await writeFile(`${out}/qa.json`, JSON.stringify({ site, checks, errors }, null, 2));
console.log(
  JSON.stringify(
    { passed: checks.filter((item) => item.ok).length, total: checks.length, errors },
    null,
    2,
  ),
);
if (checks.some((item) => !item.ok) || errors.length) process.exitCode = 1;
