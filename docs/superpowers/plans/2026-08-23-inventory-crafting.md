# Inventory, Storage, and Crafting Implementation Plan (Milestone 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the player a slot-based inventory, buildable storage crates and crafting stations, and recipes that turn scrap into ammo, consumables, and a weapon mod that measurably changes their power.

**Architecture:** A pure `Container` class holds slotted stacks and is used identically by the player and by crates. `ResourceAccess` presents one aggregate view over the inventory plus in-reach crates and replaces the Milestone 3 scrap counter, so building and crafting both spend from the same place. Stations are new pieces on the existing build grid.

**Tech Stack:** TypeScript, Three.js 0.185.1, @dimforge/rapier3d-compat 0.20.0, Vite 8.2.2, Vitest, Playwright.

## Global Constraints

- **No asset files.** Geometry and UI glyphs are generated in code.
- **The machine never moves.** Stations are grid pieces at the origin.
- **Machine structures are `fixed` Rapier colliders.**
- **Definition and runtime instance stay separate types.** Items in `src/data/items.ts`, recipes in `src/data/recipes.ts`.
- **No React, no Zustand, no audio.**
- **No save schema version bump.** `player.inventory` and piece `state` were both reserved.
- **Materials that inject shader code must pass a distinct `cacheTag` to `applyHeightFog`** — Three's default `customProgramCacheKey()` returns `onBeforeCompile.toString()`, identical across fog-wrapped materials.
- Player container 20 slots, crate container 12 slots, resource reach 6m, interaction reach 3m.
- Existing suites must keep passing: 254 unit, 10 e2e, 42 harness checks (9 drive, 12 combat, 21 build).

## Plan Format Note

Executed inline by the session that wrote it. Tasks give exact files,
interfaces, verification commands, and observable criteria; inline code is
reserved for non-obvious approaches. Test intent is given in full for TDD
tasks because the test defines the contract.

---

## File Structure

```
src/items/
  Container.ts          Slotted stack storage. Pure.
  ResourceAccess.ts     Aggregate view over inventory + in-reach crates. Pure.

src/crafting/
  CraftingSystem.ts     Recipe evaluation and execution. Pure apart from the bus.

src/interaction/
  InteractionSystem.ts  Nearest interactable within reach.

src/data/items.ts       Item definitions. Data only.
src/data/recipes.ts     Recipe definitions. Data only.

src/ui/InventoryUI.ts   Inventory, transfer, and crafting panels.

Modified:
  src/data/build-pieces.ts     Itemised costs; crate/workbench/refinery
  src/building/BuildValidation.ts  Cost check against ResourceAccess
  src/building/BuildSystem.ts  Station state, itemised refunds, crate registry
  src/building/BuildPieceGeometry.ts  Three new piece geometries
  src/player/Player.ts         Owns the inventory Container
  src/combat/Weapon.ts         magazineBonus
  src/player/PlayerCombat.ts   applyMod, ammo deposits from crafting
  src/core/events/GameEvents.ts  inventory/craft events
  src/game/Game.ts             Wire it all together
  src/save/SaveSchema.ts       Type inventory and piece state
  src/ui/hud.css               Panel styles

Deleted:
  src/progression/Resources.ts   Replaced by ResourceAccess

tests/unit/container.test.ts
tests/unit/resourceaccess.test.ts
tests/unit/crafting.test.ts
tools/craft.mjs
```

---

## Task 1: Items and Container

`Container` is where inventory bugs live. Partial stacking and slot exhaustion
get the most test attention because they are the cases that silently eat items.

**Files:**
- Create: `src/data/items.ts`, `src/items/Container.ts`
- Test: `tests/unit/container.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type ItemId = 'scrap' | 'components' | 'fuel' | 'ammo-rifle' | 'ammo-shotgun' | 'repair-kit' | 'extended-mag'`
  - `type ItemCategory = 'resource' | 'ammo' | 'consumable' | 'mod'`
  - `interface ItemDefinition { id: ItemId; name: string; category: ItemCategory; stackSize: number; weight: number; glyph: string; description: string }`
  - `ITEMS: Record<ItemId, ItemDefinition>`
  - `type ItemCost = Partial<Record<ItemId, number>>`
  - `interface ItemStack { itemId: ItemId; count: number }`
  - `class Container` with the spec section 4 surface

Exact item values from spec section 3. Glyphs are single characters: scrap `▪`,
components `⬡`, fuel `◆`, rifle ammo `▮`, shotgun ammo `▰`, repair kit `✚`,
extended magazine `⌸`.

- [x] **Step 1: Write the failing test**

`tests/unit/container.test.ts` covering:

- A new container has `capacity` empty slots, all null
- `add` to an empty container fills one slot and returns 0 leftover
- `add` beyond one stack opens a second slot
- **`add` fills an existing partial stack before opening a new slot** — add 60 scrap, then 60 more; expect 2 slots, not 3, with counts 100 and 20
- `add` past total capacity returns the exact leftover
- `add` to a full container returns the full amount and changes nothing
- `add` of 0 is a no-op returning 0; a negative count is rejected returning 0
- `remove` takes from a single stack; `remove` spanning stacks drains the smaller first and empties slots to null
- `remove` more than present returns only what was there
- `count` sums across stacks; `has` is inclusive at exactly the amount
- `totalWeight` sums count × unit weight across stacks
- `isFull` is true only when every slot is occupied AND every stack is at its cap
- `moveTo` transfers a slot to another container, returns leftover, and leaves the source slot correct on a partial move
- `moveTo` into a full target leaves the source unchanged
- `serialise`/`restore` round-trips exactly, and `restore` replaces rather than merges
- `serialise` returns a copy: mutating it does not affect the container

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/container.test.ts`
Expected: FAIL — cannot resolve `@/items/Container`.

- [x] **Step 3: Implement**

`add` runs two passes: fill partial stacks of the same item first, then claim
empty slots. Doing it in one pass is the classic way to end up with three
half-full stacks of the same thing.

- [x] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/container.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/data/items.ts src/items/Container.ts tests/unit/container.test.ts
git commit -m "feat: add item definitions and slotted container"
```

---

## Task 2: ResourceAccess, Replacing the Scrap Counter

**Files:**
- Create: `src/items/ResourceAccess.ts`
- Delete: `src/progression/Resources.ts`, `tests/unit/resources.test.ts`
- Modify: `src/core/events/GameEvents.ts`
- Test: `tests/unit/resourceaccess.test.ts`

**Interfaces:**
- Consumes: `Container`, `ItemCost`, `ItemId`
- Produces:
  - `interface CrateRef { container: Container; position: { x: number; y: number; z: number } }`
  - `class ResourceAccess { constructor(inventory: Container, crates: () => CrateRef[], playerPos: () => {x,y,z}, reach?: number); count(itemId): number; canAfford(cost: ItemCost): boolean; consume(cost: ItemCost): boolean; deposit(itemId, count): number; describe(cost: ItemCost): string }`
- Events replaced: drop `resources:changed`, add `inventory:changed` with `{ scrap: number }` plus `craft:completed` with `{ recipeId: string }`

`describe` renders a cost as `"8 scrap"` or `"30 scrap, 4 components"` for the
build HUD, which previously showed a bare number.

- [x] **Step 1: Write the failing test**

`tests/unit/resourceaccess.test.ts` covering: counts inventory alone; counts
inventory plus a crate at 2m; ignores a crate at 20m; `canAfford` handles
multi-item costs and fails when only one component is short; `consume` is
all-or-nothing — a two-item cost with one item short leaves BOTH untouched;
`consume` draws from the inventory before crates; `consume` spans inventory and
crate when neither alone suffices; `deposit` fills the inventory first and
returns overflow; `describe` renders single and multi-item costs; an empty cost
is affordable and consumes nothing.

The all-or-nothing case is the important one: a partial spend that takes the
scrap, finds no components, and leaves the piece unplaced is strictly worse
than a refusal.

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/resourceaccess.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

`consume` checks affordability across all items first, then performs the
removals. Crates are sorted by distance so the nearest is drained first.

- [x] **Step 4: Run to verify it passes and delete the old counter**

Run: `npx vitest run tests/unit/resourceaccess.test.ts`
Expected: PASS.

Remove `src/progression/Resources.ts` and its test. The `src/progression/`
directory stays — later milestones put the tech tree there.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: replace scrap counter with inventory-backed resource access"
```

---

## Task 3: Itemised Build Costs

**Files:**
- Modify: `src/data/build-pieces.ts`, `src/building/BuildValidation.ts`, `src/building/BuildSystem.ts`
- Test: update `tests/unit/buildvalidation.test.ts`

**Interfaces:**
- Consumes: `ItemCost`, `ResourceAccess`
- Produces: `BuildPieceDefinition.cost: ItemCost`; `validatePlacement(grid, placement, canAfford: (cost: ItemCost) => boolean)` — the third parameter changes from a scrap number to a predicate

Passing a predicate rather than a number keeps `BuildValidation` pure and
ignorant of where materials live, which is what lets crates count toward
building without the validator knowing crates exist.

- [x] **Step 1: Update the validation tests**

Replace the `RICH = 9999` scrap number with `() => true` and add a
`() => false` case asserting `cannot-afford`. Keep the ordering test: a
placement that is both unaffordable and out of bounds must still report
`out-of-bounds`.

- [x] **Step 2: Change the cost type and update all six existing pieces**

floor `{ scrap: 8 }`, wall `{ scrap: 12 }`, doorway `{ scrap: 20 }`,
railing `{ scrap: 5 }`, roof `{ scrap: 10 }`, stairs `{ scrap: 18 }`.

- [x] **Step 3: Update BuildSystem to spend and refund itemised costs**

`place` calls `resources.consume(def.cost)`. `removeOne` refunds
`Math.floor(count * 0.6)` per item through `resources.deposit`, and returns the
total units refunded. Overflow that does not fit is dropped rather than
blocking the demolition — a player who cannot carry the refund should still be
able to tear the wall down.

- [x] **Step 4: Verify**

Run: `npx vitest run` — all existing tests pass.
Run: `npm run build` — clean.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: make build costs itemised against the inventory"
```

---

## Task 4: Station Pieces

**Files:**
- Modify: `src/data/build-pieces.ts`, `src/building/BuildPieceGeometry.ts`, `src/building/BuildSystem.ts`, `src/art/Materials.ts`

**Interfaces:**
- Produces:
  - `PieceId` gains `'crate' | 'workbench' | 'refinery'`
  - `BUILD_PIECE_ORDER` grows to 9
  - `BuildPieceInstance.state?: Record<string, unknown>`
  - `BuildSystem.crates(): CrateRef[]`
  - `BuildSystem.stationsNear(pos, reach): { instanceId: string; piece: PieceId; position: THREE.Vector3 }[]`
  - `BuildSystem.crateContainer(instanceId): Container | undefined`

Costs: crate `{ scrap: 15, components: 2 }`, workbench `{ scrap: 30, components: 4 }`, refinery `{ scrap: 80 }` (amended during execution — see below; it was `{ scrap: 45, components: 8 }`, which no fresh save could ever afford). Weights 140/220/380 kg. All `anchor: 'cell'`, `boundsRoom: false`, and they require a floor in their own cell — the same rule roofs already use.

- [x] **Step 1: Add the definitions and the floor-required validation branch**

Stations validate exactly like a roof except they occupy the cell rather than
the roof layer: in-envelope, cell free, not blocked, floor present beneath.

- [x] **Step 2: Build the geometry**

All from `bevelledBox`, matching the machine's manufactured look:

- **crate** — a 1.4m ribbed box with a lid seam and one accent stripe
- **workbench** — a waist-high bench with a tool rack panel at the back
- **refinery** — a taller tank with two pipes and an emissive indicator, so it reads as machinery rather than furniture

Each gets one collider sized to its footprint. Add a `stationMetal` material
with cache tag `mmf-station-metal`.

- [x] **Step 3: Give crates a Container**

`BuildSystem` keeps `Map<instanceId, Container>` for crate instances, created
on place and destroyed on demolish. **Demolishing a crate deposits its contents
through `ResourceAccess` first**; anything that will not fit is dropped. Losing
a full crate of materials to a misclick would be the worst bug in the
milestone.

`serialise` writes `state.slots` for crates; `restore` rebuilds the container
from it.

- [x] **Step 4: Visual verification**

Place one of each and screenshot.

Run: `node tools/shoot.mjs <out>.png 6000 "?nolock=1&cam=far"`
Expected: three distinguishable stations that read as equipment, not as more floor.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add storage crate, workbench, and refinery build pieces"
```

---

## Task 5: Crafting

**Files:**
- Create: `src/data/recipes.ts`, `src/crafting/CraftingSystem.ts`
- Modify: `src/combat/Weapon.ts`, `src/player/PlayerCombat.ts`, `src/player/PlayerStats.ts`
- Test: `tests/unit/crafting.test.ts`

**Interfaces:**
- Produces:
  - `interface Recipe { id: string; station: 'workbench' | 'refinery'; inputs: ItemCost; output: { itemId: ItemId; count: number } }`
  - `RECIPES: Recipe[]`, `recipesFor(station): Recipe[]`
  - `class CraftingSystem { constructor(resources, bus); canCraft(recipe): boolean; craft(recipeId): boolean }`
  - `Weapon.magazineBonus: number` and `Weapon.effectiveMagazineSize: number`
  - `PlayerCombat.applyMod(itemId): boolean`, `PlayerCombat.addAmmoFor(itemId, count): void`
  - `PlayerStats.useRepairKit(): boolean`

Recipes exactly as spec section 9.

- [x] **Step 1: Write the failing test**

`tests/unit/crafting.test.ts` covering: `canCraft` true with exact inputs and
false one short; `craft` consumes exactly the inputs and deposits the output;
`craft` with insufficient inputs consumes nothing and returns false; **`craft`
is refused when the output cannot be stored, leaving inputs intact** — the
worst possible failure is eating materials and producing nothing; an unknown
recipe id returns false; `recipesFor('refinery')` returns only refinery
recipes; a successful craft emits `craft:completed`; a refused craft emits
nothing.

Also cover the mod: `effectiveMagazineSize` is the base size when no bonus is
applied; applying `extended-mag` raises it by 50% floored; a second application
is refused; `magazineBonus` survives serialise/restore.

And the repair kit: heals 40, refused at full health, refused when dead.

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/crafting.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

`craft` order matters: check affordability, check the output fits, then
consume, then deposit. Consuming before confirming the output fits is how
materials get eaten into nothing.

Ammo recipes deposit into the inventory as items; `PlayerCombat.addAmmoFor`
moves them into the weapon's reserve when the player uses them. Keep it simple:
crafting ammo puts it straight into the weapon reserve AND records it, so the
HUD reserve rises immediately — which is what makes the craft feel real.

- [x] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/crafting.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add crafting recipes, weapon mod, and repair kit"
```

---

## Task 6: Interaction and UI

**Files:**
- Create: `src/interaction/InteractionSystem.ts`, `src/ui/InventoryUI.ts`
- Modify: `src/ui/hud.css`, `src/core/input/InputManager.ts`, `src/game/Game.ts`

**Interfaces:**
- Produces:
  - `interface Interactable { id: string; label: string; position: THREE.Vector3; kind: 'crate' | 'workbench' | 'refinery' }`
  - `class InteractionSystem { update(playerPos, candidates): Interactable | null; get current(): Interactable | null }`
  - `class InventoryUI { setMode(mode: 'closed' | 'inventory' | 'transfer' | 'crafting', context?): void; get isOpen(): boolean; update(state): void }`

- [x] **Step 1: Implement the interaction system**

Nearest candidate within 3m, ties broken by id so the prompt does not flicker
between two equidistant crates.

- [x] **Step 2: Implement the panels**

One class, three modes. Slot grid renders glyph, name, and count. Transfer mode
shows two grids; click moves a whole stack, shift-click moves one. Crafting
mode lists recipes for the station with inputs, output, and a button disabled
when inputs are short.

**Pointer lock releases on open and re-acquires on close.** Without it the
panels cannot be clicked at all.

- [x] **Step 3: Wire into Game**

`Tab` toggles inventory. `E` opens the current interactable — crate to transfer
mode, workbench or refinery to crafting mode. `Escape` and the same key close.
While a panel is open, suppress firing, building, and weapon switching, but let
the simulation keep running.

- [x] **Step 4: Verification**

Run: `npm run dev`
Expected: walking near a built crate shows `[E] Open Storage Crate`; `E` opens
a two-pane transfer view with a visible cursor; clicking moves stacks; closing
restores pointer lock and mouse look.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add interaction prompts and inventory, transfer, and crafting panels"
```

---

## Task 7: Persistence, Harness, and Acceptance

**Files:**
- Create: `tools/craft.mjs`
- Modify: `src/game/Game.ts`, `src/save/SaveSchema.ts`, `tests/e2e/smoke.spec.ts`, `README.md`

- [x] **Step 1: Wire persistence**

`buildSave` writes `player.inventory` from the container and each weapon's
`magazineBonus`. `loadFrom` restores the inventory, then structures (crate
state rides along), then the mod. Order matters: crate containers must exist
before anything reads them.

- [x] **Step 2: Write the harness**

`tools/craft.mjs`, waiting on **simulated** time as the other harnesses do,
asserting:
- Starting inventory holds scrap, and no components
- The refinery is buildable from scrap alone
- The refinery converts scrap to components
- A workbench is refused until four components have been refined, then costs
  scrap and components
- Crafting rifle ammo raises the weapon reserve
- Crafting is refused when inputs are short, and consumes nothing
- The extended magazine raises the effective magazine size by 50%
- A second mod application is refused
- A repair kit heals a damaged player and is refused at full health
- Items move into a crate and back out
- Building succeeds using scrap held only in a nearby crate
- Demolishing a full crate returns its contents rather than destroying them
- Save, reload: inventory, crate contents, and the mod all survive

- [x] **Step 3: Extend the e2e suite**

One case: craft ammo, save, reload, assert the reserve survived.

- [x] **Step 4: Full verification**

```bash
npm run lint && npm run build && npm test && npm run test:e2e
node tools/drive.mjs && node tools/combat.mjs && node tools/build.mjs && node tools/craft.mjs
```

`drive` must stay 9/9, `combat` 12/12, `build` 21/21.

- [x] **Step 5: Manual acceptance against spec section 12**

Walk all ten success criteria and confirm each, with a screenshot of the
crafting panel.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: persist inventory and mods, add crafting harness"
```

---

## Self-Review Notes

**Spec coverage.** Section 3 items → Task 1; section 4 Container → Task 1;
section 5 ResourceAccess → Task 2; 5.1 itemised costs → Task 3; section 6
stations → Task 4; section 7 interaction → Task 6; section 8 UI → Task 6;
section 9 crafting, consumables, mod → Task 5; section 10 persistence → Task 7;
section 11 testing → Tasks 1, 2, 5 unit and Task 7 harness; section 12 criteria
→ Task 7 step 5.

**Deferred-scope check.** No task implements salvage, resource collection,
storage filters, linked crafting, auto-sorting, logistics, or fuel consumption.
Confirmed against spec sections 3.1 and 6.

**Type consistency.** `ItemId`, `ItemCost`, and `ItemStack` are defined once in
`src/data/items.ts`. `Container` is used unchanged by the player, crates, and
`ResourceAccess`. `CrateRef` is defined in `ResourceAccess` and produced by
`BuildSystem.crates()`. `validatePlacement`'s third parameter is a predicate
everywhere after Task 3.

**Known risk.** Task 3 changes a signature used by existing passing tests, so
that task is where the previous milestone's suite is most likely to break. Its
step 4 runs the whole suite for exactly that reason.

---

## Amendments During Execution

Five places where the shipped code departs from the plan above. Recorded here
rather than silently absorbed, so the plan stays readable as what actually
happened.

**The refinery is priced in scrap alone.** Planned at 45 scrap and 8
components, but the refinery is the only source of components — the recipe for
the machine that makes them required them, so no fresh save could build one.
Now `{ scrap: 80 }`: the original 45 plus the 8 components at their own
refining cost, rounded. The progression this creates is the intended one and is
better than the plan's: scrap buys the refinery, the refinery makes components,
components buy the workbench. `STARTING_INVENTORY` is scrap alone. Spec section
5.1 carries the same note.

**The refinery's pipes are boxes, not cylinders.** The geometry inherited from
the partial branch used `CylinderGeometry`, which threw on the very first
placement: `bevelledBox` is extruded and therefore non-indexed, and
`mergeGeometries` refuses to mix indexed and non-indexed inputs. That code had
never been run. Boxes also match Task 4's own instruction that stations be
built "all from `bevelledBox`".

**Crafted ammo is routed by the game, not by the crafting system.** Task 5 step
3 asked for ammo to be deposited as an item AND added to the weapon reserve,
which would count the same 30 rounds twice. `CraftingSystem` stays pure and
deposits into the inventory; `Game` subscribes to `craft:completed` and moves
ammo outputs into the correct weapon's reserve. The HUD still rises on the
click that spent the materials, with nothing duplicated.

**The build harness's scrap grants shrank.** `tools/build.mjs` granted 3000 and
5000 scrap against the old integer counter. Twenty slots at 100 scrap is a hard
ceiling of 2000, so those grants silently lost a third of themselves. Both are
1200 now, which is far more than the structures they pay for.

**Station geometry gained material groups**, which the plan did not call for
but its own art brief did — the crate's accent stripe and the refinery's
emissive indicator need a second material, and a piece is one mesh. Each
station's parts are merged per material and then merged again with groups, so
`pieceMaterial` can return an array.
