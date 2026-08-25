/**
 * Inventory, storage, and crafting verification.
 *
 * Drives the real game: builds the three stations, refines scrap into
 * components, crafts ammo and a magazine mod, moves items through a crate,
 * builds out of a crate, and confirms the whole lot survives a save and
 * reload — Milestone 4's acceptance criteria, measured rather than eyeballed.
 */
import { chromium } from '@playwright/test';

const outShot = process.argv[2] ?? null;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

// Arrivals are tested in tools/combat.mjs and nowhere else: everywhere else
// they would wander into a check that was written on a quiet deck.
await page.goto('http://localhost:5173/?nolock=1&quality=low&nospawn=1&notex=1&nomodel=1&nosound=1', { waitUntil: 'load' });

// `load` fires before `main.ts`'s top-level await settles, so the handle the
// checks below reach for is not there yet.
await page.waitForFunction(() => '__game' in globalThis, null, { timeout: 60000 });

const stats = () => page.evaluate(() => globalThis.__game.debugStats());

/** Wait on SIMULATED time — the headless renderer runs at a few FPS. */
async function sim(seconds) {
  const start = (await stats()).simTime;
  const deadline = Date.now() + 90000;
  for (;;) {
    await page.waitForTimeout(100);
    if ((await stats()).simTime - start >= seconds) return;
    if (Date.now() > deadline) throw new Error('sim() timed out');
  }
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

/** Run an expression against the live game and return its value. */
const run = (fn, arg) => page.evaluate(fn, arg);

const count = (itemId) =>
  run((id) => globalThis.__game.game.inventory.count(id), itemId);

const place = (piece, cell) =>
  run(
    ({ piece, cell }) =>
      globalThis.__game.game.build.place({ piece, cell, rotation: 0 })?.instanceId ?? null,
    { piece, cell },
  );

await sim(1.5);

// The rear-left of the envelope, clear of the machine's own equipment.
const FLOORS = [
  { x: -4, y: 0, z: -6 },
  { x: -3, y: 0, z: -6 },
  { x: -2, y: 0, z: -6 },
  { x: -4, y: 0, z: -5 },
];

// --- Starting inventory ---------------------------------------------------
// The order of everything below is the progression itself: scrap buys the
// refinery, the refinery makes components, components buy the workbench.
// Nothing here may be reordered without breaking that chain, which is the
// point of testing it this way round.
const startScrap = await count('scrap');
check('the starting inventory holds scrap', startScrap > 0, `${startScrap} scrap`);
check(
  'the starting inventory holds no components',
  (await count('components')) === 0,
  'the refinery is the only source',
);

// --- The refinery is buildable from scrap alone ---------------------------
for (const cell of FLOORS) await place('floor', cell);

const beforeRefinery = { scrap: await count('scrap'), components: await count('components') };
const refineryId = await place('refinery', FLOORS[2]);
const afterRefinery = { scrap: await count('scrap'), components: await count('components') };
check('a refinery can be built', refineryId !== null);
check(
  'a refinery costs 80 scrap and no components',
  beforeRefinery.scrap - afterRefinery.scrap === 80 && afterRefinery.components === 0,
  `${JSON.stringify(beforeRefinery)} -> ${JSON.stringify(afterRefinery)}`,
);

// Stand at the stations so everything below is within interaction reach.
await run(() => globalThis.__game.player.teleport({ x: -6, y: 3.4, z: -11 }));
await sim(0.6);

// --- The refinery converts scrap into components --------------------------
const beforeRefine = { scrap: await count('scrap'), components: await count('components') };
const refined = await run(() => globalThis.__game.game.crafting.craft('refine-components'));
const afterRefine = { scrap: await count('scrap'), components: await count('components') };
check('the refinery converts scrap into components', refined === true);
check(
  'refining costs 4 scrap and yields 1 component',
  beforeRefine.scrap - afterRefine.scrap === 4 &&
    afterRefine.components - beforeRefine.components === 1,
  `${JSON.stringify(beforeRefine)} -> ${JSON.stringify(afterRefine)}`,
);

// --- The workbench is paid for out of refined components ------------------
const shortBench = await place('workbench', FLOORS[1]);
check(
  'a workbench is refused on one refined component',
  shortBench === null,
  'it wants four',
);

// Three more, to reach the four the workbench needs.
for (let i = 0; i < 3; i++) {
  await run(() => globalThis.__game.game.crafting.craft('refine-components'));
}

const beforeBench = { scrap: await count('scrap'), components: await count('components') };
const benchId = await place('workbench', FLOORS[1]);
const afterBench = { scrap: await count('scrap'), components: await count('components') };
check('a workbench can be built once components exist', benchId !== null);
check(
  'a workbench costs 30 scrap and 4 components',
  beforeBench.scrap - afterBench.scrap === 30 && beforeBench.components - afterBench.components === 4,
  `${JSON.stringify(beforeBench)} -> ${JSON.stringify(afterBench)}`,
);

// --- Crafted ammo reaches the weapon --------------------------------------
// The workbench just spent every component; rifle rounds want one back.
await run(() => globalThis.__game.game.crafting.craft('refine-components'));
const reserveBefore = await run(() => globalThis.__game.game.combat.current.reserveAmmo);
await run(() => globalThis.__game.game.crafting.craft('craft-rifle-ammo'));
const reserveAfter = await run(() => globalThis.__game.game.combat.current.reserveAmmo);
check(
  'crafting rifle ammo raises the weapon reserve by 30',
  reserveAfter - reserveBefore === 30,
  `${reserveBefore} -> ${reserveAfter}`,
);

// --- A refused craft consumes nothing -------------------------------------
const broke = await run(() => {
  const g = globalThis.__game.game;
  g.inventory.clear();
  g.inventory.add('scrap', 1);
  const ok = g.crafting.craft('craft-rifle-ammo');
  return { ok, scrap: g.inventory.count('scrap'), components: g.inventory.count('components') };
});
check('crafting is refused when inputs are short', broke.ok === false);
check(
  'a refused craft consumes nothing',
  broke.scrap === 1 && broke.components === 0,
  JSON.stringify(broke),
);

// --- The extended magazine ------------------------------------------------
const mag = await run(() => {
  const g = globalThis.__game.game;
  g.inventory.clear();
  g.inventory.add('scrap', 8);
  g.inventory.add('components', 5);

  const base = g.combat.current.effectiveMagazineSize;
  const crafted = g.crafting.craft('craft-extended-mag');
  const slot = g.inventory.slots.findIndex((s) => s?.itemId === 'extended-mag');
  const usedFirst = g.useSlot(slot);
  const fitted = g.combat.current.effectiveMagazineSize;

  // A second one, to prove the guard holds rather than the shortage does.
  g.inventory.add('extended-mag', 1);
  const secondSlot = g.inventory.slots.findIndex((s) => s?.itemId === 'extended-mag');
  const usedSecond = g.useSlot(secondSlot);

  return {
    base,
    crafted,
    usedFirst,
    fitted,
    usedSecond,
    stillHeld: g.inventory.count('extended-mag'),
    after: g.combat.current.effectiveMagazineSize,
  };
});
check('the extended magazine can be crafted', mag.crafted === true);
check(
  'the extended magazine raises the magazine size by 50 percent',
  mag.usedFirst === true && mag.fitted === mag.base + Math.floor(mag.base * 0.5),
  `${mag.base} -> ${mag.fitted}`,
);
check(
  'a second magazine application is refused',
  mag.usedSecond === false && mag.after === mag.fitted,
  `still ${mag.after}, and the spare is still held (${mag.stillHeld})`,
);

// --- The repair kit -------------------------------------------------------
const kit = await run(() => {
  const g = globalThis.__game.game;
  g.inventory.clear();
  g.inventory.add('repair-kit', 2);

  const slot = () => g.inventory.slots.findIndex((s) => s?.itemId === 'repair-kit');
  // Exactly one kit's worth of damage, so the second click is genuinely at
  // full health rather than merely near it.
  g.player.stats.damage(40, 'harness');
  const hurt = g.player.stats.health;
  const healed = g.useSlot(slot());
  const afterHeal = g.player.stats.health;

  const wasted = g.useSlot(slot());
  return { hurt, healed, afterHeal, wasted, remaining: g.inventory.count('repair-kit') };
});
check(
  'a repair kit heals a damaged player by 40',
  kit.healed === true && kit.afterHeal - kit.hurt === 40 && kit.afterHeal === 100,
  `${kit.hurt} -> ${kit.afterHeal}`,
);
check('a repair kit is refused at full health', kit.wasted === false);
check(
  'a refused repair kit is not consumed',
  kit.remaining === 1,
  `${kit.remaining} left of 2`,
);

// --- Crates hold items both ways ------------------------------------------
// The tests above spent the starting stock down deliberately; top it back up
// rather than making each assertion depend on the one before it.
await run(() => {
  const g = globalThis.__game.game;
  g.inventory.add('scrap', 200);
  g.inventory.add('components', 20);
});
const crateId = await place('crate', FLOORS[0]);
check('a storage crate can be built', crateId !== null);

const transfer = await run((id) => {
  const g = globalThis.__game.game;
  g.inventory.clear();
  g.inventory.add('scrap', 120);

  const crate = g.build.crateContainer(id);
  g.openInteractable({ id, label: 'Storage Crate', kind: 'crate', position: { x: 0, y: 0, z: 0 } });

  // The same call the panel click makes.
  const firstFilled = g.inventory.slots.findIndex((s) => s !== null);
  g.inventory.moveTo(crate, firstFilled);
  const intoCrate = { inv: g.inventory.count('scrap'), crate: crate.count('scrap') };

  crate.moveTo(g.inventory, crate.slots.findIndex((s) => s !== null));
  const backOut = { inv: g.inventory.count('scrap'), crate: crate.count('scrap') };

  g.closePanels();
  return { intoCrate, backOut };
}, crateId);
check(
  'items move into a crate',
  transfer.intoCrate.crate === 100 && transfer.intoCrate.inv === 20,
  JSON.stringify(transfer.intoCrate),
);
check(
  'items move back out of a crate',
  transfer.backOut.crate === 0 && transfer.backOut.inv === 120,
  JSON.stringify(transfer.backOut),
);

// --- Building out of a crate ----------------------------------------------
const fromCrate = await run((id) => {
  const g = globalThis.__game.game;
  const crate = g.build.crateContainer(id);
  g.inventory.clear();
  crate.clear();
  crate.add('scrap', 40);

  // Nothing in the bag: the only scrap in the world is in the crate.
  const placed = g.build.place({ piece: 'floor', cell: { x: -3, y: 0, z: -5 }, rotation: 0 });
  return { placed: placed !== null, inv: g.inventory.count('scrap'), crate: crate.count('scrap') };
}, crateId);
check(
  'building succeeds on scrap held only in a nearby crate',
  fromCrate.placed === true,
  `crate ${40} -> ${fromCrate.crate}, inventory ${fromCrate.inv}`,
);
check(
  'the crate paid for it',
  fromCrate.crate === 32 && fromCrate.inv === 0,
  JSON.stringify(fromCrate),
);

// --- Demolishing a full crate returns its contents ------------------------
const demolished = await run((id) => {
  const g = globalThis.__game.game;
  const crate = g.build.crateContainer(id);
  g.inventory.clear();
  crate.clear();
  crate.add('scrap', 75);
  crate.add('components', 6);

  const instance = g.build.serialise().find((p) => p.instanceId === id);
  g.build.demolishAt({ piece: 'crate', cell: instance.cell, rotation: 0 });

  return {
    gone: g.build.crateContainer(id) === undefined,
    scrap: g.inventory.count('scrap'),
    components: g.inventory.count('components'),
  };
}, crateId);
check('demolishing removes the crate', demolished.gone === true);
check(
  'demolishing a full crate returns its contents',
  demolished.scrap >= 75 && demolished.components >= 6,
  `${demolished.scrap} scrap, ${demolished.components} components (75 + a 9-scrap refund, 6 + 1)`,
);

// --- Save and reload ------------------------------------------------------
const savedState = await run(() => {
  const g = globalThis.__game.game;
  g.inventory.clear();
  g.inventory.add('scrap', 60);
  g.inventory.add('components', 9);

  const id = g.build.place({ piece: 'crate', cell: { x: -4, y: 0, z: -6 }, rotation: 0 })?.instanceId;
  const crate = g.build.crateContainer(id);
  crate.add('fuel', 12);
  crate.add('repair-kit', 3);

  g.combat.equip('shotgun');
  g.combat.current.applyMagazineMod();

  return {
    crateId: id,
    scrap: g.inventory.count('scrap'),
    components: g.inventory.count('components'),
    crateFuel: crate.count('fuel'),
    crateKits: crate.count('repair-kit'),
    magazine: g.combat.current.effectiveMagazineSize,
    bonus: g.combat.current.magazineBonus,
  };
});

await run(() => globalThis.__game.game.saveTo('craft-harness'));
// Wipe everything the save is supposed to bring back.
await run(() => {
  const g = globalThis.__game.game;
  g.build.clear();
  g.inventory.clear();
  g.combat.current.magazineBonus = 0;
});
const loaded = await run(() => globalThis.__game.game.loadFrom('craft-harness'));
check('the save loads', loaded === true);

const reloaded = await run(() => {
  const g = globalThis.__game.game;
  const crate = g.build.crates()[0]?.container ?? null;
  return {
    scrap: g.inventory.count('scrap'),
    components: g.inventory.count('components'),
    crateFuel: crate?.count('fuel') ?? -1,
    crateKits: crate?.count('repair-kit') ?? -1,
    magazine: g.combat.weapon('shotgun')?.effectiveMagazineSize ?? -1,
    bonus: g.combat.weapon('shotgun')?.magazineBonus ?? -1,
  };
});
check(
  'the inventory survives save and reload',
  reloaded.scrap === savedState.scrap && reloaded.components === savedState.components,
  `${savedState.scrap}/${savedState.components} -> ${reloaded.scrap}/${reloaded.components}`,
);
check(
  'crate contents survive save and reload',
  reloaded.crateFuel === savedState.crateFuel && reloaded.crateKits === savedState.crateKits,
  `${savedState.crateFuel} fuel, ${savedState.crateKits} kits -> ${reloaded.crateFuel}, ${reloaded.crateKits}`,
);
check(
  'the fitted magazine mod survives save and reload',
  reloaded.bonus === savedState.bonus && reloaded.magazine === savedState.magazine,
  `${savedState.magazine} -> ${reloaded.magazine}`,
);

if (outShot) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await run(() => {
    const g = globalThis.__game.game;
    g.inventory.add('scrap', 60);
    g.inventory.add('components', 12);
    globalThis.__game.player.teleport({ x: -6, y: 3.4, z: -11 });
  });
  await sim(1.0);
  await run(() =>
    globalThis.__game.game.openInteractable({
      id: 'shot',
      label: 'Workbench',
      kind: 'workbench',
      position: { x: 0, y: 0, z: 0 },
    }),
  );
  await sim(0.6);
  await page.screenshot({ path: outShot });
}

await browser.close();

const failed = results.filter((r) => !r.ok);
if (errors.length) {
  console.log(`\n${errors.length} CONSOLE ERROR(S):`);
  for (const e of errors.slice(0, 8)) console.log(' -', e);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length || errors.length) process.exitCode = 1;
