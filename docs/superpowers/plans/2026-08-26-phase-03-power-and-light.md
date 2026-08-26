# Phase 3 — Power & Light Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** The generator burns the fuel that has been inert since Milestone 4,
producing power that devices draw by priority — and lamps exist, fixing the
dark-interiors gap.

**Architecture:** `MachinePower` is a pure model (registry of producers and
consumers, fuel burn, capacity, priority shedding) ticked from the fixed
step; nothing in it knows Three or Rapier, matching `MachineDamage`'s idiom
from Phase 1. The generator and lamp are new build pieces so placement,
save, demolition, and (Phase 1) damage all come for free from `BuildSystem`.
Lighting is the one renderer-facing part: a small pool of point lights
assigned to the nearest lit lamps, with emissive materials on all of them.

**Tech Stack:** TypeScript, Three.js 0.185, Rapier 0.20, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-26-roadmap-to-1.0.md` (Phase 3);
handoff §13 (machine power).

**Status:** READY FOR FINAL PASS — short design confirmation before
execution, per roadmap §7.

**Depends on:** Phase 1 (subsystem idiom; damaged generator = powered-down
devices uses `BuildSystem.damagePiece`). Independent of Phase 2.

## Global Constraints

- Fixed 60Hz sim; typed event bus; stats in `src/data/`; machine pinned at
  origin; every task ends green (`npx tsc --noEmit && npx vitest run &&
  npx eslint src tests`).
- Asset policy: free open-source web assets, MVP-scale, CC0 preferred per
  `ASSETS.md`; procedural fallback; harnesses boot assetless.
- **The refinery bootstrap must survive.** The refinery is the only source
  of components and is priced in scrap alone for that reason. Gating it on
  power must not brick a fresh start: the starting machine ships with a
  placed generator and starting fuel (see Design decisions).
- Commit style: narrative lowercase subjects.

---

## Design Decisions

**Power is machine-wide, not per-room.** One pool: total generation vs
total draw. Wiring, conduits and room isolation are explicitly future
possibilities (handoff §11) and are not built. This is the smallest model
that makes fuel matter and turrets (Phase 5) meterable.

**The generator is a build piece, pre-placed on a new game.** Handoff §49
puts a small generator in the starting equipment. Rather than new bespoke
machine geometry, `generator` joins `BUILD_PIECES` as a station piece
(placement, cost, weight, save, demolition, Phase-1 damage all inherited),
and a fresh game starts with one already placed near the engine — the same
way `STARTING_INVENTORY` already seeds scrap. Demolishing it refunds it;
a player who scraps their generator has lights-out until they rebuild one,
which is a legible consequence, not a bug.

**Fuel burns from the machine's tank, fed by hand.** `machine.fuel` already
exists in the save schema. The generator holds no private buffer: the
player deposits fuel items at the generator (E — the existing station
interaction) into the machine tank, HUD shows the tank, the generator
draws from it at `FUEL_BURN_PER_S` only while at least one consumer is
powered. Fuel already spawns in the salvage field as an item; no new
sources needed this phase.

**Priority sheds automatically, lowest first.** Consumers register with a
priority class (`'light' < 'station' < 'defense'` — defense exists now so
Phase 5 does not reshape the model). When capacity drops below draw
(generator damaged, fuel dry), lowest classes cut first, whole classes at a
time — a flickering subset of lamps is worse to read than a deck going
dark. Events announce it; the HUD shows produced/drawn.

**The refinery becomes a powered device; the workbench stays manual.** One
powered station proves the dependency chain (fuel → power → components →
everything) without gating basic crafting. A refinery without power shows
"NO POWER" in its existing crafting UI and refuses to run.

**Lamps light interiors within the quality budget.** `lamp` is an
edge-anchored build piece (wall-mounted). Every lit lamp gets an emissive
head; only the N nearest to the camera get real `THREE.PointLight`s
(shadowless), N by quality tier (low 2 / medium 4 / high 6 / ultra 8),
reassigned at most once a second. This fixes the README's dark-interiors
gap at MVP cost. Light does not leak through walls at N≤8 point lights
without shadows — accepted MVP artefact, noted for the polish phase.

## Open Questions (with recommended defaults)

1. **Does an empty tank stop the MACHINE?** Recommended: no — propulsion
   stays fuel-free this phase; fuel feeds the generator only. Making travel
   itself consume fuel changes the whole game's economy and belongs with
   navigation (Phase 10) where course changes spend fuel, per the handoff.

   **Decision: took the default — an empty tank kills the lights and the
   refinery, never the legs; propulsion stays fuel-free until Phase 10.**
2. **Generator noise?** Recommended: yes, a synthesized under-drone near the
   generator that stops when it sheds — free telegraphing.

   **Decision: took the default — a breaker clunk on every shed and restore,
   played through the existing `SoundBank`, so a deck going dark is heard as
   well as seen.**

## Asset Needs

| Need | Candidates | Licence | Fallback |
| --- | --- | --- | --- |
| Generator model | poly.pizza search "generator", "engine block" (Quaternius, Kenney) | CC0 | procedural bevelled box + pipes, `Materials.hull` |
| Wall lamp model | poly.pizza search "lamp", "work light", "spotlight" | CC0 | procedural: bracket + emissive quad |
| Sounds (generator drone, breaker clunk on shed/restore, deposit glug) | synthesised in `SoundBank` | — | is the primary |

## File Structure

**Create:**
- `src/machine/MachinePower.ts` — pure power model: producers, consumers,
  fuel, priorities, shedding. The API Phase 5 turrets consume.
- `src/data/power.ts` — priority classes, draws, burn rate. Data only.
- `src/building/LampLights.ts` — the point-light pool and assignment.
- `tests/unit/machinepower.test.ts`, `tests/unit/power-data.test.ts`
- additions to `tools/build.mjs` and a night screenshot via
  `tools/shoot.mjs`.

**Modify:**
- `src/data/build-pieces.ts` — `generator`, `lamp` pieces (+ order, station
  list).
- `src/data/items.ts` — fuel description loses its "eventually" caveat.
- `src/building/BuildSystem.ts` / `BuildValidation.ts` — lamp edge
  placement (wall-mounted), generator as station.
- `src/interaction/InteractionSystem.ts` — `'generator'` kind.
- `src/crafting/CraftingSystem.ts` — station-powered gate for the refinery.
- `src/machine/Machine.ts`, `src/game/Game.ts` — own/tick `MachinePower`,
  wire deposits, HUD numbers.
- `src/save/SaveSchema.ts` — `machine.fuel` finally written/read for real;
  optional `machine.power` state (shed overrides).
- `src/ui/HUD.ts` — fuel tank and power produced/drawn readout.
- `src/core/events/GameEvents.ts` — power events.

---

### Task 1: The power model

**Files:**
- Create: `src/machine/MachinePower.ts`, `src/data/power.ts`
- Test: `tests/unit/machinepower.test.ts`, `tests/unit/power-data.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (the load-bearing API — Phase 5 registers turrets through
  exactly this):

```ts
export type PowerPriority = 'light' | 'station' | 'defense';
export interface PowerConsumer { id: string; draw: number; priority: PowerPriority }
export class MachinePower {
  fuel: number;                       // units in the tank
  addFuel(units: number): number;     // returns amount accepted (tank cap)
  registerProducer(id: string, capacity: number): void;
  unregisterProducer(id: string): void;
  registerConsumer(c: PowerConsumer): void;
  unregisterConsumer(id: string): void;
  setProducerHealth(id: string, fraction: number): void; // Phase 1 hook
  isPowered(id: string): boolean;     // after shedding
  get capacity(): number;             // sum of producers × health
  get draw(): number;                 // sum of POWERED consumers
  fixedUpdate(dt: number): PowerEvent[];  // burns fuel, re-sheds, returns edges
  toSave()/restore(saved | undefined)
}
```

- [x] **Step 1: Failing tests.** Burn only while something is powered; no
  consumers ⇒ no burn. Shedding drops whole priority classes lowest-first
  until draw ≤ capacity; restore is the exact reverse and only on the edge.
  Empty tank ⇒ capacity 0 ⇒ everything sheds; refuel restores. Generator at
  half health (via `setProducerHealth(0.5)`) halves capacity. `isPowered`
  false for unknown ids. Save round-trip. Events are edges, not levels
  (emitted once per change — the HUD/audio depend on that).
- [x] **Step 2: Red run.** — cannot resolve modules.
- [x] **Step 3: Implement.** `src/data/power.ts`: `PRIORITY_ORDER =
  ['light','station','defense']`, `FUEL_BURN_PER_S`, `FUEL_TANK_CAP`,
  `GENERATOR_CAPACITY`, `DRAWS = { lamp: 1, refinery: 10 }` (handoff §13's
  example numbers). `MachinePower` pure, deterministic, no Date.
- [x] **Step 4: Green, full suite, commit** —
  `feat: fuel burns at last, and the lights know it`.

**Decision: took the default — `fuel` is a getter over a private tank rather
than the sketch's public field, so nothing can write past `FUEL_TANK_CAP`
without going through `addFuel`; reads are unchanged.** `machine.fuel` has
been in the save schema since v1, so `MachinePowerSave` rides on it and no
`machine.power` block, version bump or migration was needed.

---

### Task 2: Generator and lamp as build pieces

**Files:**
- Modify: `src/data/build-pieces.ts`, `src/building/BuildValidation.ts`,
  `src/building/BuildPieceGeometry.ts`, `src/building/BuildSystem.ts`
- Test: additions to `tests/unit/buildvalidation.test.ts`

- [x] **Step 1: Failing validation tests** — lamp is edge-anchored and
  requires a wall or doorway on its edge (a lamp needs something to hang
  on); generator is cell-anchored, station-like, needs a floor/deck cell
  like other stations. Costs: generator `{ scrap: 60, components: 6 }`,
  lamp `{ scrap: 6, components: 1 }`; weights 320 / 8.
- [x] **Step 2: Implement data + validation + geometry** (procedural
  geometry first — model dressing arrives behind `loadModel` later, per
  asset policy). Lamp head material emissive when powered, dark when shed —
  driven in Task 4.
- [x] **Step 3: Pre-placed starting generator** — new game seeds one
  generator instance near the engine (same code path as loading a save with
  one placed; no special-case geometry). Assert in a unit test that a fresh
  `BuildSystem` start includes it and that its cell collides with nothing.
- [x] **Step 4: Green, full suite, commit** —
  `feat: a generator to feed and a lamp to hang`.

---

### Task 3: Registration, deposits, and the powered refinery

**Files:**
- Modify: `src/game/Game.ts`, `src/machine/Machine.ts`,
  `src/interaction/InteractionSystem.ts`, `src/crafting/CraftingSystem.ts`,
  `src/core/events/GameEvents.ts`, `src/save/SaveSchema.ts`,
  `src/ui/HUD.ts`
- Test: `tests/unit/craftingsystem.test.ts` additions (refinery refuses
  unpowered), save round-trip additions.

**Interfaces:**
- Produces: bus events `'power:changed': { capacity, draw, fuel }` (edges),
  `'power:shed': { priority }` , `'power:restored': { priority }`;
  interactable kind `'generator'` (E deposits all carried fuel, prompt
  shows tank); `CraftingSystem` gains a `stationPowered(station):
  boolean` gate consulted for `refinery` only.

- [ ] **Step 1: Failing tests** — crafting at an unpowered refinery is
  refused with reason `'no-power'`; powered works; workbench never gated.
  Save round-trips fuel and shed state.
- [ ] **Step 2: Wire it** — every placed lamp/refinery registers on
  `build:placed`, unregisters on `build:removed`/destroyed (Phase 1's
  `build:damaged` cascade already fires removal); generator piece registers
  as producer, its Phase-1 damage health feeding `setProducerHealth`.
  Deposit-at-generator via the existing station interaction path. HUD row:
  `⚡ 12/16  ◆ 41`.
- [ ] **Step 3: Green, full suite, commit** —
  `feat: the refinery goes quiet when the tank runs dry`.

---

### Task 4: Lamplight

**Files:**
- Create: `src/building/LampLights.ts`
- Modify: `src/game/Game.ts` (render hook), `src/ui/HUD.ts` (nothing new —
  verify)
- Test: pure assignment logic in `tests/unit/lamplights.test.ts`; visual
  proof via `tools/shoot.mjs` night screenshots.

- [ ] **Step 1: Failing test for the pool assignment** — given lamp
  positions, camera position, and quality N: nearest N lit lamps get
  lights; unpowered lamps never; assignment stable under small camera
  movement (hysteresis — no per-frame swapping); pure function of inputs.
- [ ] **Step 2: Implement pool + emissive toggling** — pool of N
  shadowless `PointLight`s parented once, repositioned on assignment;
  emissive intensity per lamp from `isPowered`.
- [ ] **Step 3: Prove it in the browser** — `tools/shoot.mjs` at F10 night
  with a sealed room + lamp: screenshot pixel-samples the interior brighter
  lit than unlit; `tools/build.mjs` gains checks: place lamp on wall OK,
  on empty edge refused; shed event darkens.
- [ ] **Step 4: Green, full suite, commit** —
  `feat: sealed rooms are dark no longer`.

---

## Interfaces Other Phases Rely On

- **Phase 5 (turrets):** `MachinePower.registerConsumer({ id, draw,
  priority: 'defense' })` + `isPowered(id)` per fixed step. Defense class
  already exists and sheds last — no model change needed.
- **Phase 4 (home):** the condenser registers as a `'station'` consumer;
  same API.
- **Phase 1 interplay:** generator piece damage → `setProducerHealth` →
  brown-out; already wired in Task 3.
- Bus events `'power:changed' | 'power:shed' | 'power:restored'` — HUD,
  audio, and Phase 11's threat director (raiders targeting the generator)
  read these.
- `src/data/power.ts` is the single home of draws/priorities; later devices
  add a line, not a system.
