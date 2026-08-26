# Phase 4 — Home & Hearth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** A light survival layer — water and food as forgiving pressures —
plus decoration pieces and interior ambience, so calm stretches have purpose
and the machine starts feeling like Raft's raft.

**Architecture:** A pure `Needs` model (two meters, slow drain, effect gates)
lives beside `PlayerStats` and is read by the systems it gates rather than
pushing at them. Production devices (condenser, planter) are build pieces
with a shared pure `Producer` timer model; the stove is a new crafting
station reusing `CraftingSystem` wholesale. Decoration pieces are build
pieces with **no colliders**, which is what lets them be the project's first
model-first pieces without violating the procedural-collider constraint.

**Tech Stack:** TypeScript, Three.js 0.185, Rapier 0.20, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-26-roadmap-to-1.0.md` (Phase 4).

**Status:** READY FOR FINAL PASS — short design confirmation before
execution, per roadmap §7.

**Depends on:** Phase 3 (the condenser draws power). The stove, planter,
needs, and decor have no Phase 3 dependency and can land first if execution
reorders.

## Global Constraints

- Fixed 60Hz sim; typed bus; stats in `src/data/`; every task green
  (`npx tsc --noEmit && npx vitest run && npx eslint src tests`).
- **Never punishing.** Running dry slows sprint or stops passive effects;
  it never deals damage, never kills, never stops the machine. This is a
  spec-level promise (roadmap Act I) — encode it in tests, not comments.
- Keep the economy small: THREE new items (`water`, `greens`, `rations`),
  no more.
- Asset policy: free open-source web assets, MVP-scale, CC0 preferred per
  `ASSETS.md`; procedural fallback; harnesses boot assetless.
- Commit style: narrative lowercase subjects.

---

## Design Decisions

**Two meters, slow, legible.** `hydration` and `nourishment`, 0–100, full
at start, draining at a rate that empties in ~25 minutes of play if
ignored. Effects at zero only: empty hydration disables SPRINT (walk is
untouched); empty nourishment disables passive stamina recovery and repair
kits heal half. Both effects lift instantly on consuming. No health damage
ever — asserted by test.

**Consumption is one keypress from the HUD, not inventory surgery.** Water
and rations are consumables usable from the inventory panel like the
repair kit is today; additionally the HUD meters flash when low. Each item
restores 60 points.

**Production is a shared timer model.** Condenser (powered, produces
`water` every 90s into its own single output slot), planter (unpowered,
produces `greens` every 150s, capacity 3). One pure `Producer` class covers
both: `fixedUpdate(dt, running) → items`, output claimed by E. The stove
is *not* a producer — it is a crafting station (`greens → rations`,
instant, matching every other recipe in the game).

**Decoration is visual-only, and that is what makes models safe.** Decor
pieces (chair, table, rug, shelf, crate-of-oddments) occupy a cell for
placement/refund purposes but build **no colliders** and never block
navigation or bound rooms. The standing constraint says collider-bearing
pieces stay procedural because colliders derive from geometry; a piece with
no collider is exempt, so decor is where CC0 furniture models (Kenney
Furniture Kit) enter the pipeline first, each with a crude procedural
fallback box so `nomodel=1` harness boots still place and save them
identically.

**Ambience: interior quiet + a first music pad.** Inside an enclosed room
(the room detector already knows), wind and engine duck by half — the
machine's inside sounds different from its outside, which is most of what
"home" is. Plus the game's first music: a sparse synthesized pad
(`SoundBank` recipe — the no-sample-files policy stands) that plays only in
the threat director's `calm` phase and fades on `buildup`.

## Open Questions (with recommended defaults)

1. **Do needs drain while the inventory panel is open?** Recommended: yes
   (sim runs; pausing meters invites menu-camping) — but drains pause in
   the title/pause menu from Phase 2.
   **Decision: took the default — meters drain behind an open panel, and
   stop dead behind the title screen, the pause menu and the whole opening.**
2. **Does the planter need water?** Recommended: no for MVP — one loop
   (water → drink, greens → cook → eat) is enough; watering the planter is
   a natural later hook, noted for Phase 15 tuning.
   **Decision: took the default — the planter runs unattended and unpowered;
   only the condenser is gated, and on power rather than on water.**

## Decisions taken during execution

Everything below is a default the plan already recommended or a place where
the plan was written before Phases 1–3 shipped and reality won.

- **Decision: took the default — decoration is `chair`, `table`, `rug`,
  `shelf`,** the four Task 4 names; the "crate-of-oddments" floated in the
  design-decisions prose was dropped to keep the piece table honest.
- **Decision: took the default — exactly three new items** (`water`,
  `greens`, `rations`) and one new recipe, as the global constraint requires.
- **Deviation (plan vs. reality): decor gets its own `BuildGrid` layer**
  rather than sharing the station layer. The codebase's standing rule is that
  two pieces which can coexist in one cell need two layers — a rug under a
  workbench is exactly that case, and sharing would have made placing one
  silently overwrite the other's owner entry.
- **Deviation (plan vs. reality): the build HUD groups by category AND
  pages.** `BUILD_PIECE_ORDER` is eighteen pieces now and `InputManager` only
  binds `slot1`–`slot9`, so a flat order would have left the last nine pieces
  unselectable. The number keys address the active category; `G` cycles it.
- **Decision: needs drain is gated on `opening.phase === 'done'`** as well as
  on the cinematic camera, so neither the title backdrop nor the rooftop chase
  moves a meter.

## Asset Needs

| Need | Candidates | Licence | Fallback |
| --- | --- | --- | --- |
| Furniture (chair, table, rug, shelf) | **Kenney Furniture Kit** (kenney.nl, CC0, glTF) — known-good fit for the pipeline per ASSETS.md | CC0 | procedural placeholder boxes; identical placement/save |
| Condenser / stove / planter models | poly.pizza search "water tank", "stove", "planter box" (Quaternius, Kenney) | CC0 | procedural bevelled boxes, `Materials` palette |
| Sounds (drink, eat, sizzle, condenser drip, calm pad) | synthesised in `SoundBank` | — | is the primary |

## File Structure

**Create:**
- `src/player/Needs.ts` — the pure meters + gates model.
- `src/building/Producer.ts` — the pure production timer.
- `src/data/needs.ts` — drain rates, restore amounts, producer periods.
  Data only.
- `tests/unit/needs.test.ts`, `tests/unit/producer.test.ts`
- additions to `tools/craft.mjs`.

**Modify:**
- `src/data/items.ts` — `water`, `greens`, `rations`.
- `src/data/recipes.ts` — station `'stove'`; `cook-rations` recipe.
- `src/data/build-pieces.ts` — `condenser`, `planter`, `stove`, decor
  pieces; a `category` field (`'structure' | 'station' | 'decor'`) so the
  build UI can group and decor can skip colliders declaratively.
- `src/building/BuildSystem.ts` / `BuildPieceGeometry.ts` — no-collider
  path for decor; producer state on instances (`state` field already
  exists on `BuildPieceInstance`).
- `src/player/Player.ts` — sprint gate consults `Needs`.
- `src/player/PlayerStats.ts` — stamina recovery / heal gates consult
  `Needs`.
- `src/crafting/CraftingSystem.ts` — nothing structural (stove is just a
  new `StationId`).
- `src/audio/GameSounds.ts` / `SoundBank.ts` — interior duck, calm pad.
- `src/ui/HUD.ts` — two small meters; `src/ui/InventoryUI.ts` — consume
  actions.
- `src/save/SaveSchema.ts` — optional `player.needs`; producer state rides
  the existing per-piece `state`.
- `src/core/events/GameEvents.ts` — `'needs:changed'`,
  `'producer:output'`.

---

### Task 1: The needs model

**Files:**
- Create: `src/player/Needs.ts`, `src/data/needs.ts`
- Test: `tests/unit/needs.test.ts`

**Interfaces:**
- Produces: `class Needs { hydration: number; nourishment: number;
  fixedUpdate(dt): void; drink(): void; eat(): void;
  get canSprint(): boolean; get staminaRecoveryScale(): number;
  get healScale(): number; toSave()/restore(saved | undefined) }`.
  All gates return neutral values (true / 1) while meters are above zero.

- [x] **Step 1: Failing tests.** Full at construction; drains at
  `data/needs.ts` rates (empty in ~25 sim minutes — assert against the
  constant, not a magic number); clamps at 0; **never touches health**
  (Needs has no reference to PlayerStats — assert by API absence and by a
  long-run drain test); gates flip only at exactly 0 and restore on
  drink/eat (+60, clamped); absent save ⇒ full meters (old saves).
- [x] **Step 2: Red run, implement, green.** Pure, no bus — `Game` emits
  `'needs:changed'` on meter-integer changes for the HUD.
- [x] **Step 3: Gate wiring with tests** — `Player.fixedUpdate` sprint
  condition gains `&& needs.canSprint`; `PlayerStats.heal` and stamina
  recovery consult scales. Existing tests stay green (full meters are
  neutral).
- [x] **Step 4: Full suite, commit** —
  `feat: thirst slows you down, never kills you`.

---

### Task 2: Items, recipes, and the stove

**Files:**
- Modify: `src/data/items.ts`, `src/data/recipes.ts`,
  `src/data/build-pieces.ts`, `src/ui/InventoryUI.ts`
- Test: existing data test files gain cases; recipe execution already
  covered by `CraftingSystem` tests — add the stove station case.

- [x] **Step 1: Failing tests** — three new items exist with sane stack
  sizes/weights; `cook-rations` (`{ greens: 1, water: 1 } → rations ×1`) at
  station `'stove'`; stove piece is a station (cost `{ scrap: 25,
  components: 2 }`).
- [x] **Step 2: Implement; consume actions in the inventory UI** (same
  path as the repair kit today; refuse-at-full like `useRepairKit`).
- [x] **Step 3: Full suite, commit** —
  `feat: something to cook and a stove to cook it on`.

---

### Task 3: Producers — condenser and planter

**Files:**
- Create: `src/building/Producer.ts`
- Modify: `src/data/build-pieces.ts`, `src/building/BuildSystem.ts`,
  `src/game/Game.ts`, `src/interaction/InteractionSystem.ts`,
  `src/core/events/GameEvents.ts`
- Test: `tests/unit/producer.test.ts`

**Interfaces:**
- Produces: `class Producer { constructor(period: number, capacity:
  number); fixedUpdate(dt, running: boolean): number; stored: number;
  claim(): number; toSave()/restore() }`; interactable kind
  `'producer'`; event `'producer:output': { instanceId, itemId }`.

- [ ] **Step 1: Failing tests** — accumulates only while `running`; stops
  at capacity (no banking beyond it); claim empties; save round-trip
  preserves partial progress; deterministic under fixed dt.
- [ ] **Step 2: Implement + wire** — condenser runs on
  `power.isPowered(id)` (Phase 3), planter always runs; output claimed by
  E into inventory; producer progress rides `BuildPieceInstance.state`.
- [ ] **Step 3: Harness** — `tools/craft.mjs` gains: build planter, warp
  sim time, claim greens, cook at stove, eat; hydration/nourishment
  meters move.
- [ ] **Step 4: Full suite, commit** —
  `feat: the machine makes water while you fight`.

---

### Task 4: Decoration pieces

**Files:**
- Modify: `src/data/build-pieces.ts`, `src/building/BuildSystem.ts`,
  `src/building/BuildPieceGeometry.ts`, `src/building/BuildValidation.ts`,
  `src/ui/BuildUI.ts`
- Test: `tests/unit/buildvalidation.test.ts` additions.

- [ ] **Step 1: Failing tests** — decor pieces (`chair`, `table`, `rug`,
  `shelf`) have `category: 'decor'`, near-zero weight, no room bounding,
  no navigation blocking; placement requires a floor/deck cell; **no
  collider is created** (assert via the physics body count not rising —
  or via the decor path never calling the collider builder).
- [ ] **Step 2: Implement the no-collider path + build UI grouping**
  (structure / stations / decor pages or a second row — smallest change
  that fits the existing `BuildUI`).
- [ ] **Step 3: Models behind the loader** — Kenney Furniture Kit pieces
  via `loadModel` with procedural fallback boxes; record in `ASSETS.md`.
- [ ] **Step 4: Full suite, commit** —
  `feat: a chair you cannot trip over`.

---

### Task 5: Interior quiet and the calm pad

**Files:**
- Modify: `src/audio/GameSounds.ts`, `src/audio/SoundBank.ts`,
  `src/game/Game.ts`
- Test: arithmetic half in the existing audio unit tests (duck factor,
  pad gating by threat phase); audible half via `tools/combat.mjs`'s
  existing audio checks.

- [ ] **Step 1: Failing tests** — wind/engine gain scale is 0.5 when the
  player's cell is inside an enclosed room (room detector already answers
  this), 1.0 outside; pad plays only in `calm` phase and gates off on
  `'threat:phase'` buildup.
- [ ] **Step 2: Implement** — duck as a bus-driven gain node; pad as a
  slow `SoundBank` recipe (two detuned oscillators + filtered noise swell;
  keep it sparse).
- [ ] **Step 3: Full suite, commit** —
  `feat: inside sounds like inside`.

---

## Interfaces Other Phases Rely On

- `Needs` gates (`canSprint`, `staminaRecoveryScale`, `healScale`) — Phase
  11+ difficulty tuning adjusts `src/data/needs.ts` numbers only.
- `Producer` — Phase 8's loot may add rare producer variants; Phase 9's
  destinations can grant unique producers. Same class, new data rows.
- `category` on `BuildPieceDefinition` (`'structure' | 'station' |
  'decor'`) — Phase 5 hardpoints add `'defense'` to this union; the build
  UI grouping is already category-driven by then.
- The no-collider decor path — Phase 9 destination set-dressing reuses it.
- `'producer:output'`, `'needs:changed'` bus events — HUD and audio only,
  but stable names.
