/** Staged presentation review. Gameplay acceptance lives in chapter-flow.mjs. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

process.env.MMF_PORT ??= '5194';
const { BASE_URL } = await import('../base-url.mjs');
const directory = 'docs/art/chapter-review';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
const shots = [];
try {
  for (const fallback of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${BASE_URL}/?nomenu=1&nolock=1&nosound=1&nospawn=1&quality=high&cam=side${fallback ? '&nomodel=1&notex=1' : ''}`);
    await page.waitForFunction(() => globalThis.__game?.game, null, { timeout: 60000 });
    const capture = async (name) => {
      const path = `${directory}/${fallback ? 'fallback' : 'authored'}-${name}.png`;
      await page.screenshot({ path });
      shots.push(path);
    };
    await page.evaluate((fallback) => {
      const g = globalThis.__game.game;
      g.stop();
      g.opening.restore({ phase: 'done' });
      g.progression.earlyRadioDrop.restore({ status: 'found', armedAtSimTime: 0, foundAtSimTime: 8, foundAtDistance: 42, eligibleChestsOpened: 1 });
      g.radioModel.visible = true;
      if (Boolean(g.player.object3D.getObjectByName('MMF_Player')) === fallback) throw new Error('Player selected wrong art path');
      if (Boolean(g.radioModel.userData.authored) === fallback) throw new Error('Radio selected wrong art path');
      if (Boolean(g.destination.root.userData.authored) === fallback) throw new Error('Wreck selected wrong art path');
      g.machine.power.registerConsumer({ id: 'fixed-radio', draw: 1, priority: 'station' });
      g.story.restore({ chapterId: 'wreck-one', phase: 'docked', arrivalDistance: g.world.distanceTraveled, journalsRead: [], uniqueCollected: false, nextSignal: false });
      g.destination.setActive(true);
      g.destination.setArrivalDistance(g.world.distanceTraveled);
      g.destination.setDocked(true);
      g.machine.setExpeditionGangwayOpen(true);
      g.destination.fixedUpdate(g.world.distanceTraveled);
      g.machine.movement.setScriptedSpeedLimit(0);
      g.renderer.camera.position.set(28, 23, 26);
      g.renderer.camera.lookAt(6, 3.5, 0);
      g.render(1);
    }, fallback);
    await capture('docked');
    await page.evaluate(() => {
      const g = globalThis.__game.game;
      const at = g.radioModel.position;
      g.renderer.camera.position.set(at.x + 1.5, at.y + 2.1, at.z - 2.5);
      g.renderer.camera.lookAt(at.x, at.y + 1, at.z);
      g.render(1);
    });
    await capture('radio');
    if (process.argv.includes('--radio-only')) {
      await page.close();
      continue;
    }
    await page.evaluate(() => {
      const g = globalThis.__game.game;
      g.renderer.camera.position.set(8, 11, 13);
      g.renderer.camera.lookAt(12, 4.7, -0.5);
      g.render(1);
    });
    await capture('wreck');
    await page.evaluate(() => {
      const g = globalThis.__game.game;
      g.resources.deposit('scrap', 400);
      g.resources.deposit('components', 60);
      for (const id of ['longstride-rams', 'overwound-dynamo', 'heavy-breech']) {
        g.progression.upgrades.research(id, g.resources);
        g.progression.upgrades.activate(id);
      }
      g.refreshUpgradeModifiers();
      g.openResearch();
      g.render(1);
    });
    await capture('research');
    await page.evaluate(() => {
      const g = globalThis.__game.game;
      g.closePanels();
      g.openRadio();
      g.render(1);
    });
    await capture('radio-panel');
    await page.evaluate(() => {
      const g = globalThis.__game.game;
      g.closePanels();
      for (const journal of g.story.chapter.journals) g.story.readJournal(journal.id);
      g.openExpedition();
      g.render(1);
    });
    await capture('journals');
    await page.evaluate(() => {
      const g = globalThis.__game.game;
      g.closePanels();
      g.renderer.camera.position.set(-14, 6.2, 18);
      g.renderer.camera.lookAt(0, 2, 0);
      g.render(1);
    });
    await capture('upgrades');
    await page.close();
  }
  await writeFile(`${directory}/result.json`, `${JSON.stringify({ generatedAt: new Date().toISOString(), purpose: 'Staged authored/fallback presentation only; no gameplay completion claim.', shots, errors }, null, 2)}\n`);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Rendered ${shots.length} authored/fallback chapter views without page errors.`);
} finally {
  await browser.close();
}
