/**
 * Inventory, storage, and crafting verification.
 *
 * Drives the real game: builds the three stations, refines scrap into
 * components, crafts ammo and a magazine mod, moves items through a crate,
 * builds out of a crate, and confirms the whole lot survives a save and
 * reload — Milestone 4's acceptance criteria, measured rather than eyeballed.
 */
import { chromium } from '@playwright/test';
import { BASE_URL } from './base-url.mjs';

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
// `nomenu=1` boots past the title screen and the opening, straight into
// gameplay — which is the boot every check below was written against.
await page.goto(`${BASE_URL}/?nolock=1&nomenu=1&quality=low&nospawn=1&notex=1&nomodel=1&nosound=1`, { waitUntil: 'load' });

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

// --- The hearth: grow it, collect it, cook it, eat it ---------------------
// Phase 4's whole loop, driven end to end through the real game rather than
// asserted piecemeal in node. The point is the JOINS: a producer that fills,
// an E press that collects, a recipe that consumes both halves, and a meter
// that actually moves when the player swallows something.
// Back to the stations. Everything above has been driving the game for a
// while and collecting from a producer is a REACH test, so the harness has to
// be standing where a player would be rather than wherever it drifted to.
await run(() => globalThis.__game.player.teleport({ x: -6, y: 3.9, z: -11 }));
await sim(0.6);
const standingAt = await run(() => ({ ...globalThis.__game.player.worldPosition }));

await run(() => {
  const g = globalThis.__game.game;
  g.inventory.clear();
  g.inventory.add('scrap', 300);
  g.inventory.add('components', 20);
  g.build.place({ piece: 'floor', cell: { x: -2, y: 0, z: -5 }, rotation: 0 });
});

const planterId = await place('planter', { x: -4, y: 0, z: -5 });
const stoveId = await place('stove', { x: -2, y: 0, z: -5 });
// Not on FLOORS[0]: the save-and-reload section below builds its crate there,
// and a station already standing in the cell would refuse it.
const condenserId = await place('condenser', { x: -3, y: 0, z: -5 });
check('a planter box can be built', planterId !== null);
check('a stove can be built', stoveId !== null);
check('a condenser can be built', condenserId !== null);

const powered = await run(
  (id) => globalThis.__game.game.machine.power.isPowered(id),
  condenserId,
);
check(
  'the condenser draws off the starting generator',
  powered === true,
  'a line in powerRoleOf and no new call site',
);

// Warp: the same call the fixed step makes, with a step the size of a
// crossing. Waiting 400 simulated seconds in a headless browser would test
// the software renderer rather than the game.
const grown = await run(
  ({ planterId, condenserId }) => {
    const g = globalThis.__game.game;
    const made = g.build.tickProducers(400, (deviceId) =>
      g.machine.power.isPowered(deviceId),
    );
    const refs = g.build.producersNear(globalThis.__game.player.worldPosition, 3);
    const find = (id) => refs.find((p) => p.instanceId === id) ?? null;
    return {
      total: made.reduce((n, o) => n + o.count, 0),
      greens: find(planterId)?.stored ?? -1,
      water: find(condenserId)?.stored ?? -1,
    };
  },
  { planterId, condenserId },
);
check(
  'the planter grows greens while the player is elsewhere',
  grown.greens > 0,
  `${grown.greens} stored after 400s, standing at ${JSON.stringify(standingAt)}`,
);
check(
  'the condenser stops at its single output slot rather than banking',
  grown.water === 1,
  `${grown.water} stored after 400s of a 90s cycle`,
);

const collected = await run(
  ({ planterId, condenserId }) => {
    const g = globalThis.__game.game;
    const at = (id, label) =>
      g.openInteractable({ id, label, kind: 'producer', position: { x: 0, y: 0, z: 0 } });
    const okGreens = at(planterId, 'Planter Box');
    const okWater = at(condenserId, 'Water Condenser');
    return {
      okGreens,
      okWater,
      greens: g.inventory.count('greens'),
      water: g.inventory.count('water'),
      // A second press on an emptied box must do nothing at all.
      again: at(planterId, 'Planter Box'),
    };
  },
  { planterId, condenserId },
);
check(
  'E collects what a producer has made',
  collected.okGreens === true && collected.okWater === true,
);
check(
  'the collected output reaches the inventory',
  collected.greens > 0 && collected.water > 0,
  `${collected.greens} greens, ${collected.water} water`,
);
check('an emptied producer gives nothing on a second press', collected.again === false);

const cooked = await run(() => {
  const g = globalThis.__game.game;
  const before = {
    greens: g.inventory.count('greens'),
    water: g.inventory.count('water'),
  };
  const ok = g.crafting.craft('cook-rations');
  return {
    ok,
    before,
    greens: g.inventory.count('greens'),
    water: g.inventory.count('water'),
    rations: g.inventory.count('rations'),
  };
});
check('the stove cooks greens and water into rations', cooked.ok === true);
check(
  'cooking spends one of each and yields one meal',
  cooked.before.greens - cooked.greens === 1 &&
    cooked.before.water - cooked.water === 1 &&
    cooked.rations === 1,
  JSON.stringify(cooked),
);

const meal = await run(() => {
  const g = globalThis.__game.game;
  const needs = g.player.needs;
  // Ten minutes of thirst and hunger, so there is room for a drink and a meal.
  needs.fixedUpdate(600);
  const before = { hyd: needs.hydration, nou: needs.nourishment };
  const health = g.player.stats.health;

  const slot = (id) => g.inventory.slots.findIndex((s) => s?.itemId === id);
  g.inventory.add('water', 1);
  const drank = g.useSlot(slot('water'));
  const ate = g.useSlot(slot('rations'));

  return {
    before,
    drank,
    ate,
    hyd: needs.hydration,
    nou: needs.nourishment,
    health,
    healthAfter: g.player.stats.health,
  };
});
check('a drink moves the hydration meter', meal.drank === true && meal.hyd > meal.before.hyd);
check('a meal moves the nourishment meter', meal.ate === true && meal.nou > meal.before.nou);
check(
  'eating and drinking never touch health',
  meal.healthAfter === meal.health,
  `${meal.health} -> ${meal.healthAfter}`,
);

const empty = await run(() => {
  const g = globalThis.__game.game;
  const needs = g.player.needs;
  // An hour with nothing to drink: far past empty, on both meters.
  needs.fixedUpdate(3600);
  return {
    hyd: needs.hydration,
    nou: needs.nourishment,
    canSprint: needs.canSprint,
    health: g.player.stats.health,
    alive: g.player.stats.alive,
  };
});
check(
  'running completely dry costs the sprint and nothing else',
  empty.hyd === 0 && empty.nou === 0 && empty.canSprint === false,
  JSON.stringify(empty),
);
check(
  'running dry never costs health -- the Act I promise, in the real game',
  empty.health === 100 && empty.alive === true,
  `${empty.health} hp, alive ${empty.alive}`,
);

await run(() => globalThis.__game.game.player.needs.reset());

// --- Decoration is visual only -------------------------------------------
// The claim that makes furniture safe: a decor piece builds NO COLLIDER. A
// unit test can only check the collider TABLE; this checks the real physics
// world, which is the thing that would actually put a chair in the player's
// shins.
const decor = await run(() => {
  const g = globalThis.__game.game;
  g.inventory.add('scrap', 100);

  const bodiesBefore = globalThis.__game.physics.bodyCount;
  const weightBefore = g.machine.movement.totalWeight;
  const piecesBefore = g.build.pieceCount;

  // The last two go in cells that ALREADY hold a station: a rug under the
  // refinery and a table beside the bench are the placements the separate
  // grid layer exists for.
  const placed = [
    g.build.place({ piece: 'chair', cell: { x: -4, y: 0, z: -6 }, rotation: 0 }),
    g.build.place({ piece: 'shelf', cell: { x: -4, y: 0, z: -5 }, rotation: 1 }),
    g.build.place({ piece: 'table', cell: { x: -3, y: 0, z: -6 }, rotation: 0 }),
    g.build.place({ piece: 'rug', cell: { x: -2, y: 0, z: -6 }, rotation: 0 }),
  ];

  return {
    placedAll: placed.every((p) => p !== null),
    bodiesBefore,
    bodiesAfter: globalThis.__game.physics.bodyCount,
    weightAdded: g.machine.movement.totalWeight - weightBefore,
    piecesAdded: g.build.pieceCount - piecesBefore,
    // And the station underneath is still there and still openable.
    benchStillThere: g.build
      .stationsNear(globalThis.__game.player.worldPosition, 99)
      .some((s) => s.piece === 'workbench'),
  };
});
check(
  'all four comforts place, two of them over standing stations',
  decor.placedAll === true && decor.piecesAdded === 4,
  `${decor.piecesAdded} pieces added`,
);
check(
  'decoration adds not one physics body',
  decor.bodiesAfter === decor.bodiesBefore,
  `${decor.bodiesBefore} -> ${decor.bodiesAfter}`,
);
check(
  'a table over the workbench does not delete the workbench',
  decor.benchStillThere === true,
  'its own grid layer',
);
check(
  'decoration is too light for the machine to feel',
  decor.weightAdded > 0 && decor.weightAdded < 50,
  `${decor.weightAdded} kg for four pieces`,
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
