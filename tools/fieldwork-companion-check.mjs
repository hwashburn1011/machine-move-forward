/**
 * Focused browser acceptance for campaign profile and field weapon loadouts.
 *
 * Requires the integration seams documented by the owning Game task:
 *   openFieldwork(workbenchInstanceId)
 *   fieldworkAction('research' | 'equip', weaponId, attachmentId | null)
 *
 * Fixture-owned setup is recorded in the evidence. Profile selection and all
 * fieldwork actions use the real DOM/Game flows; this script never writes a
 * user save or mutates Weapon attachment state directly.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const site = process.env.MMF_SITE ?? 'http://127.0.0.1:5201/';
const out = path.resolve(process.env.MMF_QA_OUT ?? 'test-results/fieldwork-companion');
const checks = [];
const errors = [];
const setup = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` -- ${JSON.stringify(detail)}` : ''}`);
};
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu'],
});

const wire = (page, tag) => {
  page.on('pageerror', (error) => errors.push(`${tag}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${tag}: ${message.text()}`);
  });
};
const base = (menu) =>
  `${site}?${menu ? '' : 'nomenu=1&'}nolock=1&nosound=1&nospawn=1&nomodel=1&notex=1&quality=low&seed=fieldwork-${menu ? 'profile' : 'workbench'}`;
const boot = async (page, menu) => {
  await page.goto(base(menu), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => Boolean(globalThis.__game?.game), null, { timeout: 120000 });
};

try {
  for (const profile of ['story', 'survival']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    wire(page, profile);
    await boot(page, true);
    await page.getByRole('button', { name: 'New Game', exact: true }).click();
    const chooser = page.locator('#title-profile');
    await chooser.waitFor({ state: 'visible' });
    check(
      `${profile} is offered by the real New Game chooser`,
      await chooser
        .getByRole('button', {
          name: profile === 'story' ? 'Story' : 'Survival',
          exact: true,
        })
        .isVisible(),
    );
    await chooser
      .getByRole('button', {
        name: profile === 'story' ? 'Story' : 'Survival',
        exact: true,
      })
      .click();
    await page.waitForFunction(
      (expected) => globalThis.__game.game.campaignProfile === expected,
      profile,
      { timeout: 10000 },
    );
    const selected = await page.evaluate(() => {
      const g = globalThis.__game.game;
      return {
        profile: g.campaignProfile,
        reservesInfinite: g.combat.all.map((weapon) => weapon.infiniteReserve),
      };
    });
    check(
      `${profile} selection applies its ammunition rule`,
      selected.profile === profile &&
        selected.reservesInfinite.every((value) => value === (profile === 'story')),
      selected,
    );
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  wire(page, 'fieldwork');
  await boot(page, false);
  await page.waitForFunction(
    () =>
      typeof globalThis.__game.game.openFieldwork === 'function' &&
      typeof globalThis.__game.game.fieldworkAction === 'function',
    null,
    { timeout: 120000 },
  );

  const fixture = await page.evaluate(() => {
    const g = globalThis.__game.game;
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
      completed: ['wreck-one', 'relay-foundry'],
      recoveredUniques: ['course-gyro'],
      active: null,
      journalArchive: [],
    });
    g.campaignProfile = 'survival';
    g.combat.setInfiniteAmmo(false);
    g.inventory.clear();
    g.inventory.add('scrap', 30);
    g.inventory.add('components', 20);

    let workbench = g.build.serialise().find((piece) => piece.definitionId === 'workbench');
    let generator = g.build.serialise().find((piece) => piece.definitionId === 'generator');
    for (const cell of g.machine.deckCells) {
      if (!generator) {
        g.build.place({ piece: 'floor', cell, rotation: 0 }, true);
        const placed = g.build.place({ piece: 'generator', cell, rotation: 0 }, true);
        if (placed) generator = placed;
      } else if (!workbench) {
        g.build.place({ piece: 'floor', cell, rotation: 0 }, true);
        const placed = g.build.place({ piece: 'workbench', cell, rotation: 0 }, true);
        if (placed) workbench = placed;
      }
      if (generator && workbench) break;
    }
    if (!generator || !workbench)
      throw new Error('Could not create a real generator/workbench fixture');
    g.machine.power.addFuel(20);
    const point = g.build.visual(workbench.instanceId)?.position;
    if (!point) throw new Error('Workbench visual/position unavailable');
    g.player.teleport({ x: point.x, y: point.y + 1.05, z: point.z - 0.55 });
    g.fixedUpdate(1 / 60);
    return {
      workbenchId: workbench.instanceId,
      generatorId: generator.instanceId,
      powerCapacity: g.machine.power.capacity,
      before: { scrap: g.resources.count('scrap'), components: g.resources.count('components') },
    };
  });
  setup.push(
    'fixture: tutorial and Foundry facts; real built generator/workbench; 30 scrap/20 components',
  );
  check('real generator supplies the workbench fixture', fixture.powerCapacity > 0, fixture);

  const opened = await page.evaluate(
    (id) => globalThis.__game.game.openFieldwork(id),
    fixture.workbenchId,
  );
  await page.locator('[data-panel="fieldwork"]').waitFor({ state: 'visible' });
  check('Game opens Fieldwork at the live powered workbench', opened !== false, {
    opened,
    text: await page.locator('[data-panel="fieldwork"]').textContent(),
  });
  check(
    'Survival Fieldwork reports finite ammunition',
    (await page.locator('[data-panel="fieldwork"]').textContent())?.includes('Survival') &&
      !(await page.locator('[data-panel="fieldwork"]').textContent())?.includes('Ammo 30/∞'),
  );

  await page.locator('[data-panel="fieldwork"] [data-attachment="rifle-stabilizer"]').click();
  const research = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const rifle = g.combat.weapon('rifle');
    return {
      scrap: g.resources.count('scrap'),
      components: g.resources.count('components'),
      researched: rifle.researchedAttachments,
      active: rifle.installedAttachment,
    };
  });
  check(
    'research charges 12 scrap and 8 components exactly once',
    research.scrap === fixture.before.scrap - 12 &&
      research.components === fixture.before.components - 8 &&
      research.researched.includes('rifle-stabilizer'),
    research,
  );

  await page.locator('[data-panel="fieldwork"] [data-attachment="rifle-stabilizer"]').click();
  const equipped = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const rifle = g.combat.weapon('rifle');
    return {
      active: rifle.installedAttachment,
      spread: rifle.effectiveDef.spread,
      aimSpread: rifle.effectiveDef.aimSpread,
      recoil: rifle.effectiveDef.recoil,
      reload: rifle.effectiveDef.reloadTime,
      scrap: g.resources.count('scrap'),
      components: g.resources.count('components'),
    };
  });
  check(
    'free equip applies the stabilizer tradeoff without another charge',
    equipped.active === 'rifle-stabilizer' &&
      Math.abs(equipped.spread - 0.9 * 0.55) < 1e-6 &&
      Math.abs(equipped.aimSpread - 0.25 * 0.55) < 1e-6 &&
      Math.abs(equipped.recoil - 0.35 * 0.65) < 1e-6 &&
      Math.abs(equipped.reload - 2.1 * 1.15) < 1e-6 &&
      equipped.scrap === research.scrap &&
      equipped.components === research.components,
    equipped,
  );

  const repeat = await page.evaluate(() => {
    const g = globalThis.__game.game;
    const result = g.fieldworkAction('research', 'rifle', 'rifle-stabilizer');
    return {
      result,
      scrap: g.resources.count('scrap'),
      components: g.resources.count('components'),
      count: g.combat
        .weapon('rifle')
        .researchedAttachments.filter((id) => id === 'rifle-stabilizer').length,
    };
  });
  check(
    'repeat research is refused without payment or duplicate ownership',
    repeat.scrap === research.scrap &&
      repeat.components === research.components &&
      repeat.count === 1,
    repeat,
  );
  await page.locator('[data-panel="fieldwork"] [data-weapon="shotgun"]').click();
  const shotgunAttachments = await page
    .locator('[data-panel="fieldwork"] [data-attachment]')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-attachment')));
  check(
    'shotgun exposes both registry attachments with exact runtime IDs',
    JSON.stringify(shotgunAttachments) ===
      JSON.stringify(['shotgun-choke', 'shotgun-scatter-brake']),
    shotgunAttachments,
  );
  await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.inventory.clear();
    g.inventory.add('scrap', 48);
    g.inventory.add('components', 32);
  });
  const shotgunResearch = [];
  for (const id of ['shotgun-choke', 'shotgun-scatter-brake']) {
    const button = page.locator(`[data-panel="fieldwork"] [data-attachment="${id}"]`);
    await button.click();
    shotgunResearch.push(
      await page.evaluate((attachmentId) => {
        const weapon = globalThis.__game.game.combat.weapon('shotgun');
        return weapon.researchedAttachments.includes(attachmentId);
      }, id),
    );
  }
  check(
    'DOM research purchases both shotgun attachments at their registry cost',
    shotgunResearch.every(Boolean),
    shotgunResearch,
  );
  await page.locator('[data-panel="fieldwork"] [data-attachment="shotgun-choke"]').click();
  const shotgunEquipped = await page.evaluate(() => {
    const g = globalThis.__game.game;
    return { active: g.combat.weapon('shotgun').installedAttachment, save: g.buildSave() };
  });
  check(
    'DOM equip applies a researched shotgun attachment',
    shotgunEquipped.active === 'shotgun-choke',
    shotgunEquipped.active,
  );
  await page.locator('[data-panel="fieldwork"] [data-equip="none"]').click();
  const shotgunRemoved = await page.evaluate(
    () => globalThis.__game.game.combat.weapon('shotgun').installedAttachment,
  );
  check('DOM remove clears the active shotgun attachment', shotgunRemoved === null, shotgunRemoved);

  await page.locator('[data-panel="fieldwork"] [data-weapon="rifle"]').click();
  const burstButton = page.locator(
    '[data-panel="fieldwork"] [data-attachment="rifle-burst-cam"]',
  );
  await burstButton.click();
  await burstButton.click();
  const burstEquipped = await page.evaluate(() => {
    const rifle = globalThis.__game.game.combat.weapon('rifle');
    return {
      researched: rifle.researchedAttachments,
      active: rifle.installedAttachment,
    };
  });
  check(
    'DOM buys and equips the rifle burst cam',
    burstEquipped.researched.includes('rifle-burst-cam') &&
      burstEquipped.active === 'rifle-burst-cam',
    burstEquipped,
  );

  await page.screenshot({ path: path.join(out, 'fieldwork-loadouts.png'), fullPage: true });

  const cancellation = await page.evaluate((workbenchId) => {
    const g = globalThis.__game.game;
    const rifle = g.combat.weapon('rifle');
    g.combat.equip('rifle');
    rifle.ammoInMag = rifle.effectiveMagazineSize;
    rifle.tryFire(10, true);
    const began = rifle.hasPendingBurst;
    g.openFieldwork(workbenchId);
    const panel = !rifle.hasPendingBurst;
    g.closePanels(false);
    rifle.tryFire(11, true);
    g.combat.equip('shotgun');
    const swap = !rifle.hasPendingBurst;
    g.combat.equip('rifle');
    rifle.tryFire(12, true);
    rifle.startReload(12.01);
    const reload = !rifle.hasPendingBurst;
    rifle.cancelReload();
    rifle.tryFire(13, true);
    g.buildGuard.update(3, { sources: [] });
    g.toggleBuildMode();
    g.fixedUpdate(1 / 60);
    const build = !rifle.hasPendingBurst;
    g.exitBuildMode('user');
    return { began, panel, swap, reload, build };
  }, fixture.workbenchId);
  check(
    'panel, weapon swap, manual reload and build entry cancel pending burst rounds',
    Object.values(cancellation).every(Boolean),
    cancellation,
  );

  const ammo = await page.evaluate(() => {
    const g = globalThis.__game.game;
    g.closePanels(false);
    g.campaignProfile = 'survival';
    g.combat.setInfiniteAmmo(false);
    const rifle = g.combat.weapon('rifle');
    const shotgun = g.combat.weapon('shotgun');
    rifle.setAttachment(null);
    rifle.ammoInMag = 2;
    rifle.reserveAmmo = 0;
    rifle.tryFire(30, true);
    rifle.tryFire(31, true);
    const depleted = rifle.ammoInMag === 0;
    shotgun.reserveAmmo = 3;
    g.inventory.clear();
    g.inventory.add('scrap', 10);
    g.inventory.add('components', 4);
    const beforeShotgun = shotgun.reserveAmmo;
    const crafted = g.crafting.craft('craft-rifle-ammo');
    const routed = rifle.reserveAmmo === 30 && shotgun.reserveAmmo === beforeShotgun;
    const started = rifle.startReload(20);
    rifle.fixedUpdate(20 + rifle.effectiveDef.reloadTime);
    return {
      crafted,
      depleted,
      routed,
      started,
      rifleMag: rifle.ammoInMag,
      rifleReserve: rifle.reserveAmmo,
      shotgunReserve: shotgun.reserveAmmo,
      conserved: rifle.ammoInMag + rifle.reserveAmmo === 30,
    };
  });
  check(
    'Survival crafting routes matching rounds and finite reload conserves them',
    ammo.depleted &&
      ammo.crafted &&
      ammo.routed &&
      ammo.started &&
      ammo.conserved &&
      ammo.shotgunReserve === 3,
    ammo,
  );

  const saveSlots = {
    current: `fieldwork-current-${Date.now()}`,
    story: `fieldwork-story-${Date.now()}`,
    legacy: `fieldwork-legacy-${Date.now()}`,
  };
  const roundTrip = await page.evaluate(async ({ current, story, legacy }) => {
    const g = globalThis.__game.game;
    g.closePanels(false);
    g.campaignProfile = 'survival';
    g.combat.setInfiniteAmmo(false);
    g.caretaker.reset();
    g.caretaker.recruit();
    g.caretaker.setMode('steward');
    g.caretaker.plan({
      crates: [{ id: 'save-target', reachable: true, items: [], spaceByItem: { water: 1 } }],
      producers: [
        { id: 'save-source', reachable: true, output: { itemId: 'water', count: 1 } },
      ],
      gardens: [],
    });
    const currentSave = g.buildSave();
    await g.saves.save(current, currentSave);
    g.campaignProfile = 'story';
    g.combat.reset();
    g.caretaker.reset();
    const currentLoaded = await g.loadFrom(current);
    const afterCurrent = {
      profile: g.campaignProfile,
      infinite: g.combat.all.map((weapon) => weapon.infiniteReserve),
      burst: g.combat.all.some((weapon) => weapon.hasPendingBurst),
      caretaker: g.caretaker.snapshot(),
      burstCam: g.combat.weapon('rifle').researchedAttachments.includes('rifle-burst-cam'),
    };

    const storySave = structuredClone(currentSave);
    storySave.profile = 'story';
    await g.saves.save(story, storySave);
    const storyLoaded = await g.loadFrom(story);
    const afterStory = {
      profile: g.campaignProfile,
      infinite: g.combat.all.map((weapon) => weapon.infiniteReserve),
      burstCam: g.combat.weapon('rifle').researchedAttachments.includes('rifle-burst-cam'),
    };

    const old = structuredClone(currentSave);
    delete old.profile;
    delete old.progression.caretaker;
    for (const weapon of old.player.equipment.weapons) delete weapon.attachments;
    await g.saves.save(legacy, old);
    g.caretaker.recruit();
    g.campaignProfile = 'survival';
    g.combat.setInfiniteAmmo(false);
    const legacyLoaded = await g.loadFrom(legacy);
    const afterLegacy = {
      profile: g.campaignProfile,
      infinite: g.combat.all.map((weapon) => weapon.infiniteReserve),
      recruited: g.caretaker.snapshot().recruited,
      researched: g.combat.all.flatMap((weapon) => weapon.researchedAttachments),
    };
    await g.saves.delete(current);
    await g.saves.delete(story);
    await g.saves.delete(legacy);
    return { currentLoaded, afterCurrent, storyLoaded, afterStory, legacyLoaded, afterLegacy };
  }, saveSlots);
  check(
    'full Game save/load restores Survival loadouts and recruitment without transient work',
    roundTrip.currentLoaded &&
      roundTrip.afterCurrent.profile === 'survival' &&
      roundTrip.afterCurrent.infinite.every((value) => value === false) &&
      roundTrip.afterCurrent.burst === false &&
      roundTrip.afterCurrent.caretaker.recruited === true &&
      roundTrip.afterCurrent.caretaker.mode === 'steward' &&
      roundTrip.afterCurrent.caretaker.job === null &&
      roundTrip.afterCurrent.burstCam,
    roundTrip.afterCurrent,
  );
  check(
    'explicit Story Game save restores infinite reserve without losing its loadout',
    roundTrip.storyLoaded &&
      roundTrip.afterStory.profile === 'story' &&
      roundTrip.afterStory.infinite.every(Boolean) &&
      roundTrip.afterStory.burstCam,
    roundTrip.afterStory,
  );
  check(
    'legacy Game save defaults to Story and grants no caretaker or attachments',
    roundTrip.legacyLoaded &&
      roundTrip.afterLegacy.profile === 'story' &&
      roundTrip.afterLegacy.infinite.every(Boolean) &&
      roundTrip.afterLegacy.recruited === false &&
      roundTrip.afterLegacy.researched.length === 0,
    roundTrip.afterLegacy,
  );
  check(
    'build save preserves survival profile and researched shotgun attachments',
    shotgunEquipped.save.profile === 'survival' &&
      shotgunEquipped.save.player.equipment.weapons.some(
        (weapon) =>
          weapon.id === 'shotgun' &&
          weapon.attachments?.researched.includes('shotgun-choke') &&
          weapon.attachments?.researched.includes('shotgun-scatter-brake'),
      ),
    shotgunEquipped.save.profile,
  );
  const powerless = await page.evaluate((id) => {
    const g = globalThis.__game.game;
    const before = g.machine.power.fuel;
    g.machine.power.restore({ fuel: 0 });
    g.openFieldwork(id);
    const panel = document.querySelector('[data-panel="fieldwork"]');
    const refused = panel?.textContent?.includes('need 1 power') ?? false;
    const disabled = panel?.querySelector('[data-attachment]')?.disabled ?? false;
    g.machine.power.restore({ fuel: before });
    return { refused, disabled, before, after: g.machine.power.fuel };
  }, fixture.workbenchId);
  check(
    'fieldwork refuses an unpowered workbench',
    powerless.refused && powerless.disabled,
    powerless,
  );
  await context.close();
} catch (error) {
  errors.push(error?.stack ?? String(error));
} finally {
  const evidence = { generatedAt: new Date().toISOString(), site, setup, checks, errors };
  await fs.writeFile(
    path.join(out, 'fieldwork-companion-check.json'),
    JSON.stringify(evidence, null, 2),
  );
  await browser.close();
}

console.log(
  `\n${checks.filter((entry) => entry.ok).length}/${checks.length} checks passed; ${errors.length} errors`,
);
if (checks.some((entry) => !entry.ok) || errors.length) process.exitCode = 1;
