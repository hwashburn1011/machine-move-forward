# Phase 8 — Loot & Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rarity-tiered loot — weapon drops, behavior-changing weapon mods,
and machine-component drops — plus the minimal unlock system that Phases 9,
10, and 13 hang story and navigation progression on.

**Architecture:** Three additive layers over what exists. (1) A pure, seeded
loot generator extending `rollDrops` with rarity tables and gear rolls.
(2) A gear-instance registry so a rolled weapon (rarity + traits) can live in
the slot inventory without breaking `ItemStack` stacking. (3) An `Unlocks`
class in `src/progression/` — an event-emitting set with prerequisites —
persisted through the already-reserved `progression.unlocks` save field.

**Tech Stack:** TypeScript, Vitest, existing seeded `Rng`, typed `EventBus`,
IndexedDB save manager. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-26-roadmap-to-1.0.md` (Act III,
Phase 8); handoff §19 (rarity), §20 (mods), §33.4 (machine loot).

**Status:** PROVISIONAL — final design pass required before execution (per
roadmap §7). Written before Phases 3–7 exist; assumptions about their APIs
are recorded below and must be reconciled when this phase is picked up.

**Depends on:** Phase 1 (damage), Phase 3 (power), Phase 5 (hardpoints and
turrets), Phase 6 (enemy vehicles — the richest loot source), Phase 7
(boarding).

## Global Constraints

- Deterministic: every roll takes a seeded `Rng`; same seed, same loot.
- Data lives in `src/data/`; definition vs runtime instance stays separated.
- Loot is intentional, not a loot-splosion (handoff §19): a destroyed
  vehicle drops roughly 1 weapon, 1–3 components, ammo, scrap.
- Mods change behavior, not stat soup (handoff §20): 5 traits maximum at
  launch, each with a visible effect.
- Save schema versioned; new state must load from any prior-version save
  with no data. (Version numbers below are relative — phases 2–7 may bump
  the schema first; take the next number at execution time.)
- Every harness stays deterministic: gear rolls in harnesses replay seeds.
- Free/open-source assets only, CC0 preferred, recorded in `ASSETS.md`.

## Design decisions

1. **Gear instances, not item stacks.** Rolled weapons cannot be
   `ItemStack`s — two "rare rifles" with different traits must not stack.
   New `GearInstance` (unique `gearId`, `definitionId`, `rarity`,
   `traits[]`) held in a `GearRegistry`; the inventory slot stores a stack
   of the new `'gear-token'` item whose `count` is always 1 and which
   carries the `gearId` in a new optional `ItemStack.gearId` field. Slot
   UI, container logic, and aggregation keep working; only stacking logic
   needs a one-line "never merge stacks with gearId" rule.
2. **Rarity affects rolls, not arithmetic elsewhere.** Rarity picks the
   trait count (common 0, uncommon 1, rare 1–2, epic 2, legendary 3) and
   biases the trait pool. Weapon base stats stay the definition's; traits
   do the differentiating. This keeps `WeaponDefinition` untouched.
3. **Traits are behavior flags read at fire/reload time.** The five launch
   traits: `armor-piercing` (ignores half of armor — vehicles and armored
   raiders), `incendiary` (3s burn DoT), `high-velocity` (falloffStart
   +60%), `quick-hands` (reload time −35%), `heavy-payload` (damage +25%,
   recoil +40% — the one numeric trait, kept because the tradeoff is
   felt). `extended-mag` remains a craftable, not a trait.
4. **Machine components are items with an install target.** New item
   category `'machine-component'`: better generator, better engine, turret
   upgrade. Installing consumes the item and calls the owning system
   (power / movement / turrets). Install UX rides the existing
   interaction system (stand at device, press E, choose Install).
5. **Unlocks are a flat prerequisite DAG, granted never revoked.** No tech
   tree UI this phase — Phase 9/10 grant unlocks from story beats; the UI
   is a list in the inventory panel.
6. **Loot sources this phase:** destroyed enemy vehicles (Phase 6 wrecks),
   boarder corpses (existing infantry drops get a small gear chance), and
   salvage crates (existing `SalvageField`, small gear chance at higher
   distances). Rarity weights scale with `distanceTraveled` — distance is
   the difficulty axis this game already has.

## Open questions (recommended defaults in bold)

- Does gear drop as a world pickup or straight to inventory? **World
  pickup beam-marked like Raft's barrels, auto-collected by walking over
  it on deck; vehicle drops arrive via the salvage reel** — reuses the
  reel loop and keeps loot physical.
- Are machine components rarity-tiered too? **Yes, same tiers, but no
  traits — a rare generator is just a better generator.** Trait-rolled
  machine components are post-1.0.
- Weapon model per rarity? **No. Rarity shows in HUD/inventory color and
  name prefix only (MVP).**

## Asset needs

| Need | Plan | Source |
| --- | --- | --- |
| Rarity colors/glyphs | Code — palette tokens, no assets | — |
| New weapon drop models (pistol, SMG, marksman) | Quaternius weapon packs on poly.pizza, CC0, same pipeline as rifle/shotgun (`HeldItem` measures and scales any model) | Quaternius via poly.pizza |
| Machine component icons | Single-character glyphs like every other item | — |
| Loot pickup visual | Procedural — reuse `bevelledBox` crate + emissive beam | — |

No fabricated URLs: source names only; exact picks happen at implementation
with licenses recorded in `ASSETS.md`.

## File structure

- Create: `src/data/rarity.ts` — tiers, colors, weights-by-distance (data).
- Create: `src/data/traits.ts` — trait definitions (data).
- Create: `src/data/machine-components.ts` — component definitions (data).
- Create: `src/data/unlocks.ts` — unlock definitions (data).
- Create: `src/loot/GearRegistry.ts` — gear instances, serialisation.
- Create: `src/loot/LootGenerator.ts` — pure seeded rolls.
- Create: `src/progression/Unlocks.ts` — the unlock system.
- Modify: `src/data/items.ts` — add `'gear-token'` and component ItemIds;
  `ItemStack` gains optional `gearId`.
- Modify: `src/items/Container.ts` — never merge stacks carrying `gearId`.
- Modify: `src/enemies/Loot.ts` — gear-chance hook on infantry tables.
- Modify: `src/salvage/SalvageField.ts` — distance-scaled gear chance.
- Modify: `src/player/PlayerCombat.ts` (or the weapon state owner) — read
  traits at fire/reload.
- Modify: `src/save/SaveSchema.ts` + new migration — v2 adds
  `player.gear`, `machine.installedComponents`; `progression.unlocks`
  already exists in v1.
- Modify: `src/ui/InventoryUI.ts`, `src/ui/HUD.ts` — rarity colors, trait
  lines, unlock list.
- Test: `tests/unit/lootgenerator.test.ts`, `tests/unit/gearregistry.test.ts`,
  `tests/unit/unlocks.test.ts`, extensions to `container.test.ts`,
  `save.test.ts`.

## Tasks

### Task 1: Rarity and trait data

**Files:** Create `src/data/rarity.ts`, `src/data/traits.ts`.
Test: `tests/unit/lootgenerator.test.ts` (shared suite).

**Interfaces — Produces:**
`type Rarity = 'common'|'uncommon'|'rare'|'epic'|'legendary'`;
`RARITY_ORDER: Rarity[]`; `rarityColor(r): string`;
`rarityWeightsAt(distanceM: number): Record<Rarity, number>`;
`type TraitId = 'armor-piercing'|'incendiary'|'high-velocity'|'quick-hands'|'heavy-payload'`;
`TRAITS: Record<TraitId, TraitDefinition>` where `TraitDefinition` carries
`id, name, description` and the numeric knobs named above.

- [ ] Write failing tests: weights sum to 1, legendary weight rises with
      distance, every trait has a definition.
- [ ] Implement both data files.
- [ ] Tests pass; commit.

### Task 2: Gear registry

**Files:** Create `src/loot/GearRegistry.ts`. Modify `src/data/items.ts`
(add `'gear-token'` ItemId; `ItemStack.gearId?: string`),
`src/items/Container.ts` (no-merge rule).
Test: `tests/unit/gearregistry.test.ts`, `tests/unit/container.test.ts`.

**Interfaces — Produces:**
`interface GearInstance { gearId: string; definitionId: string; rarity:
Rarity; traits: TraitId[] }`;
`class GearRegistry { mint(def, rarity, traits): GearInstance; get(gearId):
GearInstance | undefined; remove(gearId): void; serialize():
GearInstance[]; restore(list): void }`.
**Consumes:** Task 1 types.

- [ ] Failing tests: mint/get/remove round-trip; serialize/restore
      identity; container refuses to merge two gear-token stacks.
- [ ] Implement; tests pass; commit.

### Task 3: Loot generator

**Files:** Create `src/loot/LootGenerator.ts`. Modify
`src/enemies/Loot.ts`, `src/salvage/SalvageField.ts`.
Test: `tests/unit/lootgenerator.test.ts`.

**Interfaces — Produces:**
`generateGearDrop(rng, distanceM): { definitionId: string; rarity: Rarity;
traits: TraitId[] } | null`;
`vehicleLootTable(vehicleClass: string): readonly DropEntry[]` (assumption:
Phase 6 emits `vehicle:destroyed` with `vehicleClass` and a wreck position —
reconcile at design pass).
**Consumes:** Tasks 1–2; existing `rollDrops`, `Rng`.

- [ ] Failing tests: same seed same drop; trait count matches rarity;
      vehicle table stays inside the intentional-loot budget (1 gear max).
- [ ] Implement; wire the two drop sites behind a chance gate; tests pass;
      commit.

### Task 4: Traits change fire/reload behavior

**Files:** Modify the weapon runtime state owner (today
`src/player/PlayerCombat.ts` and `src/combat/`); locate exactly at
execution. Test: extend `tests/unit/weapons` suite.

**Interfaces — Consumes:** `GearInstance.traits` on the equipped weapon.
**Produces:** armor interaction hook `effectiveDamage(base, armor,
traits)` used later by Phase 6 vehicle armor.

- [ ] Failing tests per trait: quick-hands shortens reload; high-velocity
      moves falloffStart; heavy-payload raises damage and recoil;
      armor-piercing halves armor term; incendiary schedules a 3s DoT.
- [ ] Implement; tests pass; commit.

### Task 5: Machine components

**Files:** Create `src/data/machine-components.ts`. Modify
`src/data/items.ts` (component ItemIds, category `'machine-component'`),
interaction flow for Install. Test: `tests/unit/machinecomponents.test.ts`.

**Interfaces — Produces:** `MACHINE_COMPONENTS: Record<string,
MachineComponentDefinition>` with `installTarget: 'generator' | 'engine' |
'turret'` and a tier number. Install calls, **recorded as assumptions**:
Phase 3 `MachinePower` — a generator upgrade re-registers the producer at
the higher tier's capacity (`unregisterProducer(id)` +
`registerProducer(id, capacity)`); existing
`MachineMovement.enginePower = tier value`; Phase 5
`TurretSystem.upgrade(hardpointId, tier)`.

- [ ] Failing tests: install consumes the item, raises the target's tier,
      is refused when no valid target exists.
- [ ] Implement engine path for real (enginePower exists today); leave
      generator/turret behind the recorded interfaces; tests pass; commit.

### Task 6: Unlock system

**Files:** Create `src/progression/Unlocks.ts`, `src/data/unlocks.ts`.
Modify `src/core/events/GameEvents.ts` (add `'progression:unlocked'`).
Test: `tests/unit/unlocks.test.ts`.

**Interfaces — Produces (exact — Phases 9/10/13 consume this):**

```ts
// src/data/unlocks.ts
export interface UnlockDefinition {
  id: string;            // e.g. 'nav-tier-1'
  name: string;
  description: string;
  requires: string[];    // unlock ids that must already be held
}
export const UNLOCKS: Record<string, UnlockDefinition>;
// seed ids: 'radio', 'nav-tier-1', 'nav-tier-2',
//           'chapter-1-complete', 'chapter-2-complete', 'chapter-3-complete'

// src/progression/Unlocks.ts
export class Unlocks {
  constructor(bus: EventBus, initial?: string[]);
  has(id: string): boolean;
  canGrant(id: string): boolean;   // definition exists, not held, requires met
  grant(id: string): boolean;      // emits 'progression:unlocked' {id}; false if !canGrant
  all(): string[];                 // stable order, for save
  restore(ids: string[]): void;    // ignores unknown ids (forward compat)
}
```

- [ ] Failing tests: grant respects prerequisites; double-grant is false;
      restore ignores unknown ids; event fires once per grant.
- [ ] Implement; tests pass; commit.

### Task 7: Save-schema bump and UI

**Files:** Modify `src/save/SaveSchema.ts`, add the next migration under
`src/save/migrations/`, `src/ui/InventoryUI.ts`,
`src/ui/HUD.ts`. Test: `tests/unit/save.test.ts` extensions.

**Interfaces — Consumes:** `GearRegistry.serialize/restore`,
`Unlocks.all/restore`. The bump adds `player.gear: GearInstance[]` and
`machine.installedComponents: { target: string; tier: number }[]`;
`progression.unlocks` was already reserved in v1 so it needs no migration.

- [ ] Failing tests: v1 save loads into v2 defaults; v2 round-trips gear
      and installs.
- [ ] Implement migration + rarity-colored inventory rows, trait lines,
      unlock list panel; tests pass.
- [ ] Extend `tools/combat.mjs`: destroy a vehicle (Phase 6 debug key),
      assert a wreck drop lands and a seeded gear roll is stable.
- [ ] Commit.

## Test strategy

Unit (Vitest): all rolls, registry, unlocks, migration — pure and seeded.
Browser: `tools/combat.mjs` grows a loot section (seeded drop replay,
pickup reaches inventory); `tools/craft.mjs` asserts gear tokens never
merge. No wall-clock assertions.

## Interfaces other phases rely on

- `Unlocks` API and `'progression:unlocked'` event (Phases 9, 10, 13).
- `rarityColor`, `Rarity` (any UI that shows loot).
- `generateGearDrop(rng, distanceM)` (Phase 11's new vehicle classes).
- `MachineComponentDefinition.installTarget` (Phases 3/5 reconciliation).
