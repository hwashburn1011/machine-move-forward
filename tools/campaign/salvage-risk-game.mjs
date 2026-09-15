import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5201/',
  out = process.env.MMF_QA_OUT ?? 'test-results/salvage-risk';
await fs.mkdir(out, { recursive: true });
const checks = [],
  errors = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
const fixture = () =>
  page.evaluate(() => {
    const g = globalThis.__game.game;
    g.stop();
    g.state.paused = false;
    g.closePanels(false);
    g.opening.restore({ phase: 'done' });
    g.tutorialReadyAt = null;
    g.optionalSalvageEncounterId = null;
    g.optionalSalvageFailed = false;
    g.vehicleScene.clear();
    g.gunboatScene.clear();
    g.pendingBoardingOutcome = null;
    g.boardingEnemyIds.clear();
    g.enemies.despawnAll();
    g.director.reset(g.world.distanceTraveled);
    g.threatPhase = 'calm';
    g.build.clear();
    g.inventory.restore([]);
    g.player.stats.restoreHealth(100);
    g.player.stats.invulnerable = true;
    g.state.playerDead = false;
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
      completed: ['wreck-one', 'relay-foundry', 'quiet-array'],
      recoveredUniques: [],
      active: null,
    });
    g.course.setTier(1);
    g.routeChart.restore({
      format: 1,
      nextSlot: 1,
      discovered: [],
      visited: [],
      missed: [],
      active: {
        id: 'route-contact-1',
        slot: 1,
        kind: 'salvage-wreck',
        atDistanceM: 700,
        worldX: 0,
        confidence: 1,
        hazard: 'hostile',
        detectedAtM: 250,
        expiresAtM: 880,
        state: 'docked',
        rewards: [
          { type: 'item', itemId: 'scrap', remaining: 24 },
          { type: 'item', itemId: 'components', remaining: 2 },
        ],
      },
    });
    g.optionalModelId = null;
    g.updateOpportunities();
    g.player.teleport(g.machine.deckSpawn);
    g.render(0);
    return {
      contact: g.routeChart.contact,
      docked: g.destination.docked,
      aboard: g.destination.playerOnMachine(g.player.worldPosition),
    };
  });
try {
  await page.goto(`${site}?nomenu=1&nolock=1&nosound=1&nospawn=1&nomodel=1&notex=1&quality=low`);
  await page.waitForFunction(() => !!globalThis.__game?.game, null, { timeout: 120000 });
  const initial = await fixture();
  check('real docked optional wreck configured', initial.docked && initial.aboard, initial);
  await page.evaluate(() => {
    const g = globalThis.__game.game,
      t = g.destination.interactables.find((x) => x.id === 'opportunity-reward');
    g.player.teleport(t.position);
    g.openInteractable(t);
  });
  check(
    'broadcast disabled while player is on wreck',
    await page.getByRole('button', { name: 'Broadcast for patrol', exact: true }).isDisabled(),
  );
  await page.getByRole('button', { name: 'Secure salvage', exact: true }).click();
  const safe = await page.evaluate(() => {
    const g = globalThis.__game.game;
    return {
      scrap: g.inventory.count('scrap'),
      components: g.inventory.count('components'),
      mode: g.routeChart.contact.salvageMode,
      vehicle: g.vehicleManager.active,
    };
  });
  check(
    'safe choice pays exactly 24 scrap and 2 components without patrol',
    safe.scrap === 24 && safe.components === 2 && safe.mode === 'secure' && !safe.vehicle,
    safe,
  );
  await fixture();
  await page.evaluate(() => globalThis.__game.game.openSalvageChoice());
  await page.getByRole('button', { name: 'Broadcast for patrol', exact: true }).click();
  check(
    'broadcast requires confirmation',
    await page.evaluate(() => !globalThis.__game.game.vehicleManager.active),
  );
  await page.getByRole('button', { name: 'Confirm broadcast patrol', exact: true }).click();
  const begun = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    g.departOpportunity();
    return {
      active: g.vehicleManager.active,
      mode: g.routeChart.contact?.salvageMode,
      docked: g.destination.docked,
      safe: g.isSafeToSave(),
      saved: await g.saveTo('unsafe-risk-qa'),
      ticket: g.optionalSalvageEncounterId,
      rewards: g.routeChart.requestReward('route-contact-1'),
      radio: g.radioRaids.toSave().wave,
    };
  });
  check(
    'patrol owns encounter; gangway, claims, save and departure blocked',
    begun.active &&
      begun.mode === 'broadcast' &&
      !begun.docked &&
      !begun.safe &&
      !begun.saved &&
      begun.ticket === 'route-contact-1' &&
      begun.rewards === null,
    begun,
  );
  const resolved = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.vehicleScene.damageHull(10000);
    for (let i = 0; i < 600 && g.optionalSalvageEncounterId; i++) g.updateVehicles(1 / 60);
    return {
      ticket: g.optionalSalvageEncounterId,
      mode: g.routeChart.contact?.salvageMode,
      rewards: g.routeChart.contact?.rewards,
      scrap: g.inventory.count('scrap'),
      components: g.inventory.count('components'),
      radio: g.radioRaids.toSave().wave,
      docked: g.destination.docked,
      snapshot: g.vehicleManager.snapshot,
    };
  });
  check(
    'destroyed hull resolves through actual vehicle callbacks',
    resolved.ticket === null &&
      resolved.mode === 'defended' &&
      resolved.docked &&
      resolved.snapshot === null,
    resolved,
  );
  check(
    'no generic skiff payout or radio progression from optional fight',
    resolved.scrap === 0 && resolved.components === 0 && resolved.radio === begun.radio,
    resolved,
  );
  await fixture();
  await page.evaluate(() => globalThis.__game.game.openSalvageChoice());
  await page.getByRole('button', { name: 'Broadcast for patrol', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm broadcast patrol', exact: true }).click();
  const boarding = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.departOpportunity();
    let spawned = false;
    let phaseAtSpawn = null;
    let earlyReward = null;
    for (let i = 0; i < 1800; i++) {
      g.fixedUpdate(1 / 60);
      const phase = g.vehicleManager.snapshot?.phase ?? null;
      if (phase === 'boarding') phaseAtSpawn = phase;
      if (g.enemies.activeCount >= 2) {
        spawned = true;
        earlyReward = g.routeChart.requestReward('route-contact-1');
        break;
      }
    }
    const boarderIds = g.enemies.active.map((enemy) => enemy.id);
    for (const enemy of g.enemies.active) enemy.takeDamage(enemy.currentHealth + 1000);
    const killScrap = g.inventory.count('scrap');
    for (let i = 0; i < 900 && g.optionalSalvageEncounterId; i++) g.fixedUpdate(1 / 60);
    return {
      spawned,
      phaseAtSpawn,
      boarderCount: boarderIds.length,
      earlyReward,
      ticket: g.optionalSalvageEncounterId,
      mode: g.routeChart.contact?.salvageMode,
      docked: g.destination.docked,
      rewards: g.routeChart.contact?.rewards.map((reward) => reward.remaining),
      scrap: g.inventory.count('scrap'),
      components: g.inventory.count('components'),
      killScrap,
      radio: g.radioRaids.toSave().wave,
      snapshot: g.vehicleManager.snapshot,
    };
  });
  check(
    'confirmed broadcast reaches boarding with real boarders before reward resolution',
    boarding.spawned &&
      boarding.phaseAtSpawn === 'boarding' &&
      boarding.boarderCount > 0 &&
      boarding.earlyReward === null,
    boarding,
  );
  check(
    'defeated boarders finish optional defense and redock for the deep reward',
    boarding.ticket === null &&
      boarding.mode === 'defended' &&
      boarding.docked &&
      boarding.snapshot === null &&
      JSON.stringify(boarding.rewards) === '[48,6]',
    boarding,
  );
  check(
    'boarding resolution does not award generic skiff loot or radio progress',
    boarding.radio === begun.radio &&
      boarding.scrap === boarding.killScrap &&
      boarding.components === 0,
    boarding,
  );
  const claim = await page.evaluate(async () => {
    const g = globalThis.__game.game;
    g.inventory.restore(
      Array.from({ length: g.inventory.slots.length }, (_, i) => ({
        itemId: 'scrap',
        count: i === 0 ? 52 : 100,
      })),
    );
    const target = g.destination.interactables.find((t) => t.id === 'opportunity-reward');
    g.player.teleport(target.position);
    g.claimOpportunityReward();
    const remaining = g.routeChart.contact.rewards.map((r) => r.remaining);
    g.player.teleport(g.machine.deckSpawn);
    const saved = await g.saveTo('partial-risk-qa');
    const loaded = saved && (await g.loadFrom('partial-risk-qa'));
    g.stop();
    const after = g.routeChart.contact?.rewards.map((r) => r.remaining);
    g.inventory.restore([]);
    const t = g.destination.interactables.find((t) => t.id === 'opportunity-reward');
    g.player.teleport(t.position);
    g.claimOpportunityReward();
    g.claimOpportunityReward();
    return {
      remaining,
      saved,
      loaded,
      after,
      scrap: g.inventory.count('scrap'),
      components: g.inventory.count('components'),
      mode: g.routeChart.contact?.salvageMode,
    };
  });
  check(
    'partial upgraded reward survives full inventory and save/load',
    claim.saved &&
      claim.loaded &&
      JSON.stringify(claim.remaining) === JSON.stringify(claim.after) &&
      claim.after[1] === 6,
    claim,
  );
  check(
    'remaining reward claimed once after making room',
    claim.components === 6 && claim.scrap === claim.after[0],
    claim,
  );
  await fixture();
  await page.evaluate(() => globalThis.__game.game.openSalvageChoice());
  await page.getByRole('button', { name: 'Broadcast for patrol', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm broadcast patrol', exact: true }).click();
  const failed = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.player.stats.invulnerable = false;
    g.player.stats.damage(g.player.stats.health, 'qa-failed-patrol');
    g.vehicleScene.damageHull(10000);
    for (let i = 0; i < 600 && g.optionalSalvageEncounterId; i++) g.updateVehicles(1 / 60);
    return {
      mode: g.routeChart.contact?.salvageMode,
      rewards: g.routeChart.contact?.rewards.map((r) => r.remaining),
      ticket: g.optionalSalvageEncounterId,
    };
  });
  check(
    'death cannot unlock bonus; original cache retained',
    failed.mode === 'secure' &&
      failed.ticket === null &&
      JSON.stringify(failed.rewards) === '[24,2]',
    failed,
  );
  await page.screenshot({ path: `${out}/salvage.png` });
} catch (e) {
  errors.push(e.stack ?? String(e));
} finally {
  await browser.close();
}
await fs.writeFile(`${out}/qa.json`, JSON.stringify({ site, checks, errors }, null, 2));
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
