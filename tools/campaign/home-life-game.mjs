import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5201/',
  out = process.env.MMF_QA_OUT ?? 'test-results/home-weather',
  models = process.env.MMF_QA_MODELS === '1';
const checks = [],
  errors = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
try {
  await page.goto(
    `${site}?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=medium&staged=1&seed=home-weather${models ? '' : '&nomodel=1&notex=1'}`,
  );
  await page.waitForFunction(() => !!globalThis.__game?.game, null, { timeout: 120000 });
  const fixture = await page.evaluate(() => {
    const g = globalThis.__game.game,
      edge = globalThis.__game.canonicalEdge;
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
    g.enemies.despawnAll();
    g.vehicleScene.clear();
    g.director.reset(g.world.distanceTraveled);
    g.threatPhase = 'calm';
    g.story.restore({
      format: 2,
      completed: ['wreck-one', 'relay-foundry'],
      recoveredUniques: ['course-gyro'],
      active: null,
      journalArchive: [],
    });
    g.course.setTier(1);
    const supports = g.machine.deckCells.filter((c) => c.y === 0),
      supported = new Set(supports.map((c) => `${c.x},${c.z}`));
    let result = null;
    for (const center of supports) {
      const cells = [center, { ...center, x: center.x + 1 }, { ...center, x: center.x + 2 }];
      if (!cells.every((c) => supported.has(`${c.x},${c.z}`))) continue;
      g.build.clear();
      if (!cells.every((cell) => g.build.place({ piece: 'floor', cell, rotation: 0 }, true)))
        continue;
      const perimeter = cells.flatMap((cell, i) => [
        ['north', cell],
        ['south', cell],
        ...(i === 0 ? [['west', cell]] : []),
        ...(i === 2 ? [['east', cell]] : []),
      ]);
      if (
        !perimeter.every(([side, cell], i) =>
          g.build.place(
            { piece: i === 0 ? 'doorway' : 'wall', cell, edge: edge(cell, side), rotation: 0 },
            true,
          ),
        )
      )
        continue;
      if (!cells.every((cell) => g.build.place({ piece: 'roof', cell, rotation: 0 }, true)))
        continue;
      const chair = g.build.place({ piece: 'chair', cell: cells[0], rotation: 0 }, true),
        table = g.build.place({ piece: 'table', cell: cells[1], rotation: 0 }, true),
        shelf = g.build.place({ piece: 'shelf', cell: cells[2], rotation: 0 }, true);
      if (chair && table && shelf && g.build.rooms.rooms.some((r) => r.enclosed)) {
        result = { cells, chair: chair.instanceId, shelf: shelf.instanceId };
        break;
      }
    }
    if (!result) throw Error('No valid three-cell enclosed room fixture');
    globalThis.__homeFixture = result;
    const v = g.build.visual(result.chair).position;
    g.player.teleport({ x: v.x, y: v.y + 1.06, z: v.z - 0.55 });
    g.player.stats.restoreHealth(60);
    g.player.needs.reset();
    g.player.stats.invulnerable = false;
    g.playerCamera.resetHistory();
    g.fixedUpdate(1 / 60);
    g.render(0);
    return {
      ...result,
      indoors: g.playerIsIndoors,
      firstRun: g.firstRun.current,
      context: g.homeRestContext(result.chair),
    };
  });
  check(
    'real enclosed room and furniture',
    fixture.indoors && fixture.firstRun === 'complete',
    fixture,
  );
  await page.keyboard.down('KeyE');
  await page.evaluate(() => globalThis.__game.game.fixedUpdate(1 / 60));
  await page.keyboard.up('KeyE');
  const rest = await page.evaluate(() => {
    const g = globalThis.__game.game,
      before = g.player.stats.health,
      active = g.homeRest.active;
    g.tickHomeRest(5);
    return { active, before, after: g.player.stats.health };
  });
  check(
    'E starts maintenance; Game heals exactly 10 HP in five seconds',
    rest.active && Math.abs(rest.after - rest.before - 10) < 1e-5,
    rest,
  );
  await page.keyboard.down('KeyW');
  await page.evaluate(() => globalThis.__game.game.tickHomeRest(1));
  await page.keyboard.up('KeyW');
  check(
    'movement cancels immediately',
    await page.evaluate(() => !globalThis.__game.game.homeRest.active),
  );
  const hungry = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.player.needs.restore({ hydration: 100, nourishment: 0 });
    g.player.stats.restoreHealth(99.5);
    const started = g.startHomeRest(globalThis.__homeFixture.chair);
    g.tickHomeRest(1);
    g.tickHomeRest(1);
    return { started, hp: g.player.stats.health, active: g.homeRest.active };
  });
  check(
    'hungry repair reaches full health and ends',
    hungry.started && hungry.hp === 100 && !hungry.active,
    hungry,
  );
  const damage = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.player.stats.restoreHealth(70);
    g.player.needs.reset();
    g.startHomeRest(globalThis.__homeFixture.chair);
    g.player.stats.damage(1, 'qa');
    g.tickHomeRest(1);
    return { hp: g.player.stats.health, active: g.homeRest.active };
  });
  check('damage interrupts without another heal', damage.hp === 69 && !damage.active, damage);
  await page.evaluate(() => {
    const g = globalThis.__game.game,
      id = globalThis.__homeFixture.shelf,
      v = g.build.visual(id).position;
    g.player.teleport({ x: v.x, y: v.y + 1.06, z: v.z - 0.5 });
    g.openHomeShelf(id);
    g.render(0);
  });
  await page.locator('[data-keepsake-id="course-gyro"]').click();
  const shelf = await page.evaluate(() => {
    const g = globalThis.__game.game,
      id = globalThis.__homeFixture.shelf,
      r = document.querySelector('.home-life-content').getBoundingClientRect();
    return {
      selected: g.build.instance(id).state?.factId,
      saved: g.buildSave().machine.structures.find((p) => p.instanceId === id).state?.factId,
      text: document.querySelector('[data-panel="home-life"]').textContent,
      bounds: { x: r.x, y: r.y, w: r.width, h: r.height },
      lit: g.build.visual(id).getObjectByName('KeepsakeLit')?.visible,
    };
  });
  check(
    'known record persists on shelf',
    shelf.selected === 'course-gyro' && shelf.saved === 'course-gyro',
    shelf,
  );
  check(
    'record visible; panel fits 1280x720',
    shelf.text.includes('recovered at') &&
      shelf.bounds.x >= 0 &&
      shelf.bounds.y >= 0 &&
      shelf.bounds.y + shelf.bounds.h <= 721,
    shelf.bounds,
  );
  if (models) check('authored shelf display illuminates', shelf.lit === true);
  await page.screenshot({ path: `${out}/keepsake.png` });
  const reload = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    g.closePanels(false);
    const id = globalThis.__homeFixture.shelf,
      old = g.build.instance(id),
      rot = (old.rotation + 1) % 4;
    const moved = g.build.relocate(
      id,
      { piece: 'shelf', cell: old.cell, rotation: rot },
      g.relocationOptions,
    );
    const saved = await g.saveTo('home-life-qa'),
      loaded = saved && (await g.loadFrom('home-life-qa'));
    g.stop();
    return {
      moved: moved.ok,
      saved,
      loaded,
      state: g.build.instance(id)?.state,
      rotation: g.build.instance(id)?.rotation,
      rot,
    };
  });
  check(
    'rotation and record survive real save/load',
    reload.moved &&
      reload.saved &&
      reload.loaded &&
      reload.state?.factId === 'course-gyro' &&
      reload.rotation === reload.rot,
    reload,
  );
  const weather = await page.evaluate(() => {
    const g = globalThis.__game.game,
      v = g.build.visual(globalThis.__homeFixture.chair).position;
    g.player.teleport({ x: v.x, y: v.y + 1.06, z: v.z - 0.4 });
    g.dustFront.restore(
      { format: 1, phase: 'front', elapsedS: 20, nextAtM: g.world.distanceTraveled, sequence: 0 },
      g.world.distanceTraveled,
    );
    g.player.needs.reset();
    const indoor = g.playerIsIndoors;
    g.tickNeeds(30);
    const inside = g.player.needs.hydration;
    g.player.teleport({ x: 0, y: 15.8, z: 0 });
    g.player.needs.reset();
    const outsideFlag = g.playerIsIndoors;
    g.tickNeeds(30);
    const outside = g.player.needs.hydration;
    const before = g.dustFront.toSave();
    g.state.paused = true;
    g.fixedUpdate(5);
    const after = g.dustFront.toSave();
    g.state.paused = false;
    return { indoor, outsideFlag, inside, outside, before, after, eligible: g.weatherEligible };
  });
  check(
    'actual enclosure prevents extra water loss',
    weather.eligible &&
      weather.indoor &&
      !weather.outsideFlag &&
      Math.abs(weather.inside - 98) < 1e-5 &&
      Math.abs(weather.outside - 97) < 1e-5,
    weather,
  );
  check('pause freezes weather', JSON.stringify(weather.before) === JSON.stringify(weather.after));
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.nextStatusUpdateAt = 0;
    g.updateMachineStatus();
    g.render(0);
  });
  await page.screenshot({ path: `${out}/dust-front.png` });
  const legacy = await page.evaluate(async () => {
    const g = globalThis.__game.game,
      save = g.buildSave();
    delete save.world.dustFront;
    const shelf = save.machine.structures.find((p) => p.definitionId === 'shelf');
    shelf.state = { factId: 'unearned-unknown-record' };
    await g.saves.save('home-legacy-qa', save);
    await g.loadFrom('home-legacy-qa');
    g.stop();
    return {
      weather: g.dustFront.toSave(),
      distance: g.world.distanceTraveled,
      fact: g.build.instance(shelf.instanceId)?.state?.factId ?? null,
    };
  });
  check(
    'old save clear runway and unknown facts rejected',
    legacy.weather.phase === 'clear' &&
      legacy.weather.nextAtM === legacy.distance + 600 &&
      legacy.fact === null,
    legacy,
  );
  const roofLoss = await page.evaluate(() => {
    const g = globalThis.__game.game,
      v = g.build.visual(globalThis.__homeFixture.chair).position;
    g.player.teleport({ x: v.x, y: v.y + 1.06, z: v.z - 0.4 });
    g.player.stats.restoreHealth(50);
    g.player.needs.reset();
    const started = g.startHomeRest(globalThis.__homeFixture.chair),
      roof = g.build.serialise().find((p) => p.definitionId === 'roof');
    g.build.demolish(roof.instanceId);
    g.tickHomeRest(5);
    return {
      started,
      active: g.homeRest.active,
      hp: g.player.stats.health,
      indoors: g.playerIsIndoors,
    };
  });
  check(
    'roof loss interrupts without stale-room healing',
    roofLoss.started && !roofLoss.active && roofLoss.hp === 50 && !roofLoss.indoors,
    roofLoss,
  );
} catch (e) {
  errors.push(e.stack ?? String(e));
} finally {
  await browser.close();
}
await fs.writeFile(`${out}/qa.json`, JSON.stringify({ site, models, checks, errors }, null, 2));
console.log(
  JSON.stringify(
    {
      passed: checks.filter((c) => c.ok).length,
      total: checks.length,
      failed: checks.filter((c) => !c.ok),
      errors,
    },
    null,
    2,
  ),
);
if (checks.some((c) => !c.ok) || errors.length) process.exitCode = 1;
