import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5201/';
const out = process.env.MMF_QA_OUT ?? 'test-results/caretaker-stairs';
const checks = [];
const errors = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, detail ?? '');
};
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (error) => errors.push(error.stack ?? String(error)));

try {
  await page.goto(
    `${site}?nomenu=1&nolock=1&nosound=1&nospawn=1&nomodel=1&notex=1&quality=low&seed=caretaker-stairs`,
    { waitUntil: 'domcontentloaded', timeout: 30000 },
  );
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 120000 });
  const result = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.stop();
    g.state.paused = false;
    g.closePanels(false);
    g.opening.restore({ phase: 'done' });
    g.enemies.despawnAll();
    g.vehicleScene.clear();
    g.story.restore({
      format: 2,
      completed: ['wreck-one', 'relay-foundry'],
      recoveredUniques: ['course-gyro'],
      active: null,
      journalArchive: [],
    });
    g.caretaker.reset();
    g.caretaker.recruit();
    let dock = g.build.serialise().find((piece) => piece.definitionId === 'caretaker-dock');
    if (!dock) {
      for (const cell of g.machine.deckCells.filter((entry) => entry.y === 0)) {
        if (!g.build.grid?.getCell?.(cell))
          g.build.place({ piece: 'floor', cell, rotation: 0 }, true);
        dock = g.build.place({ piece: 'caretaker-dock', cell, rotation: 0 }, true);
        if (dock) break;
      }
    }
    if (!dock) throw new Error('Could not place caretaker dock fixture');
    g.machine.power.addFuel(20);
    const dockAt = g.build.caretakerEndpoint(dock.instanceId);
    g.player.teleport(g.machine.group.localToWorld(dockAt.clone()).add({ x: 0, y: 1, z: -0.5 }));
    g.fixedUpdate(1 / 60);
    const actor = g.caretakerActor;
    const nav = g.caretakerNavigation;
    if (!actor || !nav) throw new Error('Game did not create physical caretaker actor/navigation');

    const link = g.machine.fixedLinks[0];
    const lowerCell = link[0].y < link[1].y ? link[0] : link[1];
    const upperCell = link[0].y > link[1].y ? link[0] : link[1];
    const lower = nav.cellWorld(lowerCell);
    const upper = nav.cellWorld(upperCell);
    const routeUp = nav.routeFor(lower, upper);
    actor.spawn(lower);
    let upTravel = 0;
    let upSteps = 0;
    for (; upSteps < (routeUp ? 1200 : 120) && !actor.reached(upper); upSteps++) {
      const before = actor.position.clone();
      actor.fixedUpdate(1 / 60, upper);
      g.physics.step();
      upTravel += actor.position.distanceTo(before);
    }
    const afterUp = actor.position.clone();
    const reachedUp = actor.reached(upper);
    const routeDown = nav.routeFor(upper, lower);
    let downTravel = 0;
    let downSteps = 0;
    for (; routeUp && downSteps < 1200 && !actor.reached(lower); downSteps++) {
      const before = actor.position.clone();
      actor.fixedUpdate(1 / 60, lower);
      g.physics.step();
      downTravel += actor.position.distanceTo(before);
    }
    return {
      link,
      lower,
      upper,
      routeUp,
      routeDown,
      reachedUp,
      reachedDown: actor.reached(lower),
      afterUp,
      afterDown: actor.position.clone(),
      upTravel,
      downTravel,
      upSteps,
      downSteps,
      verticalGain: afterUp.y - lower.y,
      fallbackDrift: afterUp.distanceTo(lower),
    };
  });
  check(
    'caretaker truthfully refuses the physically blocked machine stair link both ways',
    result.routeUp === null && result.routeDown === null,
    result,
  );
  check(
    'cross-deck refusal leaves the physical actor safely at its lower landing',
    !result.reachedUp && result.fallbackDrift < 0.2 && result.verticalGain < 0.2,
    result,
  );
} catch (error) {
  errors.push(error.stack ?? String(error));
} finally {
  await browser.close();
}

const evidence = { generatedAt: new Date().toISOString(), site, checks, errors };
await writeFile(`${out}/qa.json`, JSON.stringify(evidence, null, 2));
console.log(
  JSON.stringify(
    { passed: checks.filter((item) => item.ok).length, total: checks.length, errors },
    null,
    2,
  ),
);
if (checks.some((item) => !item.ok) || errors.length) process.exitCode = 1;
