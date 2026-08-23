# Machine Move Forward — Inventory, Storage, and Crafting (Milestone 4)

**Date:** 2026-08-23
**Status:** Approved
**Source design:** `machine-move-forward-game-handoff.md` sections 12, 23, 24, 44
**Builds on:** Milestones 0–3 (foundation, shooter core, grid build system)

---

## 1. Purpose

Give the player somewhere to put things and something to make. Milestone 4's
acceptance criterion:

> The player collects resources and converts them into meaningful upgrades.

"Meaningful" is the operative word: resupply alone does not satisfy it, so
crafting must produce at least one thing that changes the player's power.

---

## 2. Constraints

Inherited and still binding:

- **No asset files.** All geometry and UI is generated in code.
- **The machine never moves.** Stations are build pieces on the origin-locked grid.
- **Machine structures are `fixed` Rapier colliders.**
- **Definition and runtime instance stay separate types.**
- **No React, no Zustand, no audio.**

---

## 3. Items

| id | Name | Category | Stack | kg/unit |
| --- | --- | --- | --- | --- |
| `scrap` | Scrap Metal | resource | 100 | 1.0 |
| `components` | Components | resource | 50 | 2.0 |
| `fuel` | Fuel | resource | 50 | 1.5 |
| `ammo-rifle` | Rifle Rounds | ammo | 300 | 0.02 |
| `ammo-shotgun` | Shotgun Shells | ammo | 120 | 0.05 |
| `repair-kit` | Repair Kit | consumable | 5 | 1.0 |
| `extended-mag` | Extended Magazine | mod | 1 | 0.5 |

`ItemDefinition` carries id, name, category, stackSize, weight, and a short
description for the UI. `ItemStack` is `{ itemId, count }`.

### 3.1 Two deliberate omissions

**`salvage` is not in this milestone.** It appeared in the approved recipe
sketch, but nothing produces salvage until collection arrives in Milestone 5,
so `salvage -> scrap` would be a recipe that can never run. Milestone 5 adds
salvage as the collected raw material together with the recipe that consumes
it. Building it now would ship dead content.

**`fuel` is storable but inert.** Nothing consumes it until the power system.
It is included because the save schema already reserves `machine.fuel` and the
handoff lists it as an MVP resource, and it costs almost nothing to carry. It
must not be given a fabricated sink just to look busy.

---

## 4. Container

One pure class, no Three.js and no Rapier. Fixed slot count; each slot holds a
stack of exactly one item type, capped at that item's `stackSize`.

```ts
class Container {
  constructor(capacity: number);
  readonly capacity: number;
  slots: (ItemStack | null)[];
  /** Adds what fits. Returns the leftover that did not. */
  add(itemId: ItemId, count: number): number;
  /** Removes what is present. Returns how much was actually taken. */
  remove(itemId: ItemId, count: number): number;
  count(itemId: ItemId): number;
  has(itemId: ItemId, count: number): boolean;
  totalWeight(): number;
  isFull(): boolean;
  moveTo(other: Container, slotIndex: number, count?: number): number;
  serialise(): (ItemStack | null)[];
  restore(slots: (ItemStack | null)[]): void;
}
```

`add` fills partial stacks before opening new slots. Partial adds and slot
exhaustion are where inventory code normally breaks, so that is where the tests
concentrate.

Capacities: **player 20 slots**, **storage crate 12 slots**.

---

## 5. Resource Access

The Milestone 3 `Resources` class is **deleted**. In its place:

```ts
class ResourceAccess {
  constructor(inventory: Container, crates: () => CrateRef[], reach: number);
  count(itemId: ItemId): number;
  canAfford(cost: ItemCost): boolean;
  consume(cost: ItemCost): boolean;   // all or nothing
  deposit(itemId: ItemId, count: number): number;  // returns leftover
}
```

`CrateRef` is `{ container: Container; position: THREE.Vector3 }` — enough to
decide reach and to move items, and nothing more, so the build system does not
have to know what a crate is.

It presents one aggregate view over the player's inventory plus every storage
crate whose world position is within `reach` (6m) of the player. Consumption
draws from the inventory first, then from crates in ascending distance.

`consume` is all-or-nothing: a partial spend that leaves a piece unplaced and
the materials gone would be worse than a refusal.

### 5.1 Itemised build costs

`BuildPieceDefinition.cost` changes from `number` to
`ItemCost = Partial<Record<ItemId, number>>`. This is what handoff section 10's
`cost: ResourceCost[]` always described.

| Piece | Cost |
| --- | --- |
| floor | scrap 8 |
| wall | scrap 12 |
| doorway | scrap 20 |
| railing | scrap 5 |
| roof | scrap 10 |
| stairs | scrap 18 |
| storage crate | scrap 15, components 2 |
| workbench | scrap 30, components 4 |
| refinery | scrap 45, components 8 |

Demolition refunds 60% of every item in the cost, floored per item, deposited
through `ResourceAccess`. Anything that does not fit is dropped silently rather
than blocking the demolition.

---

## 6. Stations as Build Pieces

Three new pieces on the existing grid, anchor `cell`:

- **storage crate** — holds a 12-slot `Container`
- **workbench** — crafts ammo, consumables, and the mod
- **refinery** — converts scrap into components

They inherit grid placement, validation, weight, colliders, and persistence
from the Milestone 3 framework.

`BuildPieceInstance` gains an optional `state?: Record<string, unknown>` field
so a crate can carry its contents. Handoff section 10 already reserved exactly
that field.

The machine's existing scenery workbench and crates stay scenery. Making them
functional would mean special-casing non-grid objects into the interaction and
save paths for two props; the player can build real ones beside them.

---

## 7. Interaction

`InteractionSystem` finds the nearest interactable within **3m** of the player
each fixed step and publishes it. The HUD's existing prompt slot — unused since
Milestone 2 — shows `[E] Open Storage Crate` or similar. `E` activates it.

Interactables in this milestone are the three station types. The system takes a
list of candidates with world positions and a label, so later milestones can
register turrets, doors, and loot without touching it.

---

## 8. UI

Three panels, all plain DOM in keeping with the existing HUD:

- **Player inventory** — `Tab`. A 20-slot grid showing icon glyph, name, and count.
- **Transfer view** — opening a crate shows player and crate side by side; clicking a stack moves it across, shift-click moves one.
- **Crafting view** — opening a station lists its recipes with inputs, output, and a craft button, greyed when inputs are short.

**Opening any panel releases pointer lock, and closing it re-acquires.** The
panels are unusable without a cursor, and this is easy to forget.

While a panel is open the game continues to run — the machine keeps moving and
enemies keep acting. Pausing would be a bigger design decision than this
milestone should make on its own.

Icons are single characters drawn from a per-item glyph in the definition; the
project ships no image files.

---

## 9. Crafting

Instant, no timers. Recipes are data in `src/data/recipes.ts`:

```ts
interface Recipe {
  id: string;
  station: 'workbench' | 'refinery';
  inputs: ItemCost;
  output: { itemId: ItemId; count: number };
}
```

| Station | Inputs | Output |
| --- | --- | --- |
| refinery | scrap 4 | components 1 |
| workbench | scrap 2, components 1 | rifle ammo 30 |
| workbench | scrap 3 | shotgun ammo 8 |
| workbench | scrap 2, components 2 | repair kit 1 |
| workbench | components 5, scrap 8 | extended magazine 1 |

Crafting consumes through `ResourceAccess` and deposits the output the same
way. A craft is refused if the output cannot be stored, so materials are never
consumed into nothing.

### 9.1 Consumables and the mod

- **Repair kit** — used from the inventory, heals 40 HP, consumed. Refused at full health so it cannot be wasted by a misclick.
- **Extended magazine** — applied to the currently equipped weapon, raising its magazine size by 50% (rounded down), consumed. One per weapon; a second application on the same weapon is refused. The change appears immediately in the HUD ammo readout.

`Weapon` gains a runtime `magazineBonus` separate from its immutable
definition, so the mod never mutates shared data.

---

## 10. Persistence

`SaveGameV1.player.inventory` is already reserved as an array; it now carries
the serialised slots. Crate contents ride along in each piece's `state`.
Weapon `magazineBonus` joins the existing per-weapon save entry.

**No schema version bump.** Both fields were reserved in the foundation pass.

---

## 11. Testing

Unit-tested, in order of how likely they are to be wrong:

- `Container`: add to empty, fill a partial stack before opening a new slot, overflow returns the correct leftover, add to a full container returns everything, remove across multiple stacks, remove more than present, count, weight, serialise/restore round-trip
- `ResourceAccess`: aggregates inventory and in-reach crates, ignores out-of-reach crates, `consume` is all-or-nothing, draws inventory first, deposit overflow
- Recipes: `canCraft` true and false, craft consumes exactly the inputs, craft refused when output cannot be stored, unknown recipe rejected
- Mod application: raises magazine size, refuses a second application, survives serialise/restore
- Build cost refunds: itemised, floored per item

Browser harness `tools/craft.mjs` drives the running game: build a workbench
and a refinery, refine scrap into components, craft rifle ammo and watch the
reserve rise, craft and apply the extended magazine and watch the HUD magazine
grow, store items in a crate, build using scrap held only in that crate, then
save, reload, and confirm inventory, crate contents, and the mod all survive.

Existing suites must continue to pass: 254 unit, 10 e2e, 42 harness checks.

---

## 12. Success Criteria

1. The player can open an inventory and see what they carry.
2. Crates can be built, opened, and used to move items both ways.
3. Building spends materials from the inventory and from crates within reach.
4. The refinery converts scrap into components.
5. The workbench crafts ammo that reaches the weapon's reserve.
6. The extended magazine raises the equipped weapon's magazine size, visibly.
7. A repair kit heals the player and is refused at full health.
8. Crafting is refused, with materials intact, when inputs are short.
9. Save and reload restores inventory, crate contents, and the applied mod.
10. All existing tests and harnesses still pass.
