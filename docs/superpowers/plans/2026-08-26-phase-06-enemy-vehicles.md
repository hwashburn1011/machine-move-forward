# Phase 6: Enemy Vehicles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first crewed enemy — a skiff with visible human raiders aboard
that intercepts the machine, holds a combat lane alongside, shoots at what
the player built, and dies dropping loot.

**Architecture:** Vehicles are choreography, not driving simulation (handoff
§33). A pure `VehicleChoreography` state machine moves a point through
`approach → hold → attack → breakaway | destroyed` in MACHINE space — the
machine is pinned at origin and the world scrolls, so "matching speed" is
simply holding a lane offset while the dunes stream past. The entity layer
renders a hull at that point, seats crew on it, and fires volleys that land
on Phase 1's `Damageable` targets. The threat director gains a vehicle
encounter type; it schedules and telegraphs skiffs exactly as it already
schedules infantry waves.

**Tech Stack:** TypeScript, Three.js 0.185, Rapier 0.20, Vitest, Playwright
harnesses.

**Spec:** `docs/superpowers/specs/2026-08-26-roadmap-to-1.0.md` (Act II,
Phase 6); handoff §30 (Skiff), §33 (vehicle AI), §29 (telegraphing).

**Status:** PROVISIONAL — final design pass required before execution (per
roadmap §7). Re-verify Phase 1 and Phase 5 interfaces before starting.

**Depends on:** Phase 1 (localized damage: `Damageable`,
`BuildSystem.damagePiece`, `MachineDamage`), Phase 5 (turrets get their
first real job). Phase 8 loot rarity NOT required — drops use the existing
`rollDrops` table system.

## Global Constraints

- Every task ends green: `npx tsc --noEmit && npx vitest run && npx eslint
  src tests`.
- Choreography, target selection, and volley damage are pure modules —
  plain numbers, seeded RNG passed in, no Three.js/Rapier imports.
- Vehicles are pooled (`EnemyManager` is the precedent); at most 2 active
  this phase.
- Deck is `x ∈ [-5, 5]`; the combat lane must keep the hull outside the
  legs' reach (hips at x = ±6) — lane offset ≥ 12m.
- The threat director's hard rule stands: nothing arrives during another
  live wave, 650m guaranteed peace, telegraphed before contact.
- Commit style: narrative subjects. Art: CC0 web assets preferred, recorded
  in `ASSETS.md`, procedural fallback mandatory.

## Design Decisions

1. **Machine-frame choreography.** The skiff's state is
   `{ lateral, forward, speed }` in machine space. `approach` closes from
   spawn (ahead, offset far to port or starboard) to the lane; `hold`
   maintains `lateral = ±laneOffset` with a slight weave; `attack` is
   `hold` plus firing windows; `breakaway` peels off when wrecked crew or
   a mercy rule triggers; `destroyed` hands the hull to wreck FX and
   drops loot. Terrain height is sampled per frame (`duneHeightAt`) so the
   hull rides the dunes it appears to drive on.
2. **The skiff is a `Damageable` of a new kind `'vehicle'`.** Phase 1's
   union widens by one member. Hull health is on the vehicle, not per-part
   — per-part vehicle damage is Phase 11 territory (handoff §30 heavier
   classes).
3. **Crew are real enemies, seated.** Riders reuse the existing enemy
   rig/visual with a `seated` flag: no pathing, parented to the hull,
   shootable (existing `Damageable` kind `'enemy'`). Killing the crew
   before the vehicle is killed forces `breakaway` — that is the
   counterplay the handoff promises. Crew this phase FIRE the vehicle's
   weapon (the skiff's gun is its crew's gun); a crewless skiff cannot
   attack.
4. **Volley fire is telegraphed and budgeted.** A pure
   `planVolley(seed, def, targets)` picks a target and a shot count.
   Target priority: exposed player > turret > structure edge cells >
   machine subsystem (engine/legs) — the skiff harasses, it does not
   surgically delete the engine (that is the sniper rig's job in Phase
   11). Tracer + report precede damage application by the flight time so
   the player hears incoming fire.
5. **Threat director extension, not replacement.** `ThreatDecision` gains
   an encounter shape: from wave N onward the director may schedule
   `{ kind: 'vehicle', vehicleId: 'skiff' }` instead of an infantry wave.
   Calm/buildup/contact spacing rules unchanged. Telegraph: dust plume FX
   at the horizon bearing + a new engine-note voice, both driven off the
   existing `threat:phase` events.
6. **Loot lands as a salvage crate.** On `destroyed`, the wreck drops a
   crate prop that scrolls with the world and is reeled in with the
   EXISTING salvage reel — reinforcing the reel and forward motion instead
   of adding a pickup radius.

## Open Questions (with recommended defaults)

- **Can the skiff hit the player directly?** Default: yes, weak splash
  only when the player is on exposed deck — pressure to build walls, per
  the pillar that layout matters. Direct anti-player sniping stays out.
- **Does terrain block the lane?** Default: no — the lane rides over dunes
  visually; canyon/rock lane constraints arrive with Phase 12 terrain.
- **Skiff count per encounter?** Default: 1 until wave 6, then up to 2,
  capped by the director's threat budget.

## Assumptions about other phases (verify at execution)

- Phase 1 landed: `Damageable` union in `src/combat/Damageable.ts` with a
  string `kind`; `BuildSystem.damagePiece(instanceId, amount)`;
  `machine.damage.damage(subsystemId, amount)`; widening the union is
  additive.
- Phase 5 landed: turrets target via `TargetCandidate.kind`, so adding
  `'vehicle'` candidates makes turrets engage skiffs with only a filter
  change.
- Phase 3 power exists but is NOT consumed here.
- Phase 8 will re-skin drops with rarity; this phase uses plain
  `DropEntry` tables.

## Asset Needs

| Asset | Candidate source | Licence rule | Fallback |
| --- | --- | --- | --- |
| Skiff hull (low-poly desert vehicle) | Quaternius vehicle packs, Kenney car/space kits via poly.pizza search | CC0 only; reject bright-plastic palettes (ASSETS.md precedent) | Procedural `bevelledBox` hull + skids from machine materials — acceptable ship state |
| Human raider (rigged, idle/aim clips) | KayKit Adventurers (already vetted in ASSETS.md as the raider candidate — manual itch.io download required, cannot be fetched unattended) | CC0; drop at `public/models/raider.glb` | Existing enemy rig with hostile tint — the two-types-share-a-rig precedent already holds |
| Dust plume | none | — | Existing particle system (`src/fx/`), new emitter preset |
| Skiff engine + cannon sounds | none — synthesis rule | — | `SoundBank`: `skiff-engine` (pitch follows closing speed), `skiff-fire`, `skiff-wreck` |

## File Structure

**Create:**
- `src/data/vehicles.ts` — `VehicleDefinition` (skiff). Data only.
- `src/vehicles/VehicleChoreography.ts` — pure state machine.
- `src/vehicles/VolleyPlanner.ts` — pure target/shot selection.
- `src/vehicles/EnemyVehicle.ts` — entity: hull, crew seats, weapon,
  Damageable hookup.
- `src/vehicles/VehicleManager.ts` — pool, spawn/despawn, tick, loot drop.
- `src/vehicles/VehicleVisual.ts` — model load + procedural fallback.
- Tests: `tests/unit/vehicles.test.ts`,
  `tests/unit/vehiclechoreography.test.ts`,
  `tests/unit/volleyplanner.test.ts`, `tests/unit/threatvehicles.test.ts`.

**Modify:**
- `src/combat/Damageable.ts` — add `'vehicle'` kind.
- `src/enemies/ThreatDirector.ts` — vehicle encounter scheduling.
- `src/enemies/Enemy.ts` / `EnemyVisual.ts` — `seated` mode.
- `src/core/events/GameEvents.ts` — `vehicle:spawned`, `vehicle:attacking`,
  `vehicle:destroyed`, `vehicle:breakaway`.
- `src/audio/SoundBank.ts` + `GameSounds.ts`; `src/fx/` plume preset;
  `src/ui/HUD.ts` contact bearing; `src/game/Game.ts` wiring;
  `src/save/SaveSchema.ts` — active-vehicle state (or the simpler rule:
  saves during a vehicle encounter serialise the director as `recovery`,
  despawning the vehicle — decide at execution, default the simple rule).

## Tasks

### Task 1: Vehicle data and the widened Damageable union

**Files:**
- Create: `src/data/vehicles.ts`
- Modify: `src/combat/Damageable.ts`
- Test: `tests/unit/vehicles.test.ts`

**Interfaces:**
- Produces: `interface VehicleDefinition { id: 'skiff'; name; maxHealth;
  armor; crew: { count: number; enemyId: string }; laneOffset; approachSpeed;
  weave: { amplitude; period }; weapon: { damage; volleyShots; volleyPeriod;
  flightTime }; threat; drops: readonly DropEntry[] }`;
  `const VEHICLES: Record<VehicleId, VehicleDefinition>`;
  `DamageableKind` gains `'vehicle'`.

- [ ] Failing tests: laneOffset ≥ 12 (outside leg hips at ±6 with margin);
      crew count ≥ 1; drops non-empty; `isDamageable` accepts
      `kind: 'vehicle'`.
- [ ] Implement; full suite green (Phase 1's exhaustive-kind test updates
      with the new member); commit.

### Task 2: Choreography

**Files:**
- Create: `src/vehicles/VehicleChoreography.ts`
- Test: `tests/unit/vehiclechoreography.test.ts`

**Interfaces:**
- Produces: `type VehiclePhase = 'approach' | 'hold' | 'attack' |
  'breakaway' | 'destroyed'`;
  `interface VehicleState { phase; lateral; forward; speed; sideSign }`;
  `stepVehicle(state, def, input, dt): VehicleState` with
  `input = { hullHealth; crewAlive; underFireSeconds; rng }`.

- [ ] Failing tests: approach converges to the lane and never crosses
      inside `laneOffset`; hold weaves about the lane deterministically
      for a fixed seed; attack only from `hold` with living crew; zero
      crew → `breakaway`; zero hull → `destroyed` (absorbing); breakaway
      exits the play space within a bounded time.
- [ ] Implement pure; commit.

### Task 3: Volley planning and damage landing

**Files:**
- Create: `src/vehicles/VolleyPlanner.ts`
- Test: `tests/unit/volleyplanner.test.ts`

**Interfaces:**
- Consumes: candidate list `{ id; kind: 'player' | 'structure' |
  'subsystem' | 'turret'; exposed: boolean; position }`.
- Produces: `planVolley(rng, def, candidates): { targetId; kind; shots;
  }`; priority exposed player > turret > exposed structure > subsystem;
  never selects an enclosed target (walls work — that is Phase 1's room
  data earning its keep).

- [ ] Failing tests: priority order; enclosed structures skipped; empty
      candidate list → null; deterministic under a seed.
- [ ] Implement; commit.

### Task 4: The entity, the crew, and the pool

**Files:**
- Create: `src/vehicles/EnemyVehicle.ts`, `src/vehicles/VehicleManager.ts`,
  `src/vehicles/VehicleVisual.ts`
- Modify: `src/enemies/Enemy.ts`, `src/enemies/EnemyVisual.ts`,
  `src/core/events/GameEvents.ts`, `src/game/Game.ts`
- Test: pure seams only (pool reuse, crew-death → breakaway wiring) in
  `tests/unit/vehicles.test.ts`; the rest is harness work.

**Interfaces:**
- Consumes: `stepVehicle`, `planVolley`, `duneHeightAt`, Damageable.
- Produces: `VehicleManager.spawn(vehicleId, sideSign)`,
  `fixedUpdate(dt)`, events listed above; hull collider carries
  `{ kind: 'vehicle', id, armor, takeDamage }`; volley damage routed to
  `BuildSystem.damagePiece` / `machine.damage` / player.

- [ ] Hull + seated crew render and ride the dunes; crew shootable.
- [ ] Volley: tracer FX and `skiff-fire` sound lead damage by
      `flightTime`; damage lands through the Damageable routes.
- [ ] Death: wreck FX, salvage crate drop that the reel can take.
- [ ] Commit.

### Task 5: The director schedules a skiff

**Files:**
- Modify: `src/enemies/ThreatDirector.ts`, `src/data/enemies.ts` (threat
  pricing table entry for the skiff encounter)
- Test: `tests/unit/threatvehicles.test.ts` extending the existing
  director suite.

**Interfaces:**
- Produces: `ThreatDecision` gains
  `encounter: { kind: 'infantry' } | { kind: 'vehicle'; vehicleId }`;
  vehicles first eligible at `wavesSurvived >= 4` (one wave after the
  raider's debut at 3); never while any wave or vehicle is live; the 650m
  guaranteed-peace rule measured and preserved in tests.

- [ ] Failing tests: eligibility threshold; exclusivity; peace-gap
      preservation; save round-trip of the new decision state.
- [ ] Implement + telegraph events; commit.

### Task 6: Telegraph, HUD, audio

**Files:**
- Modify: `src/fx/` (plume preset), `src/ui/HUD.ts`,
  `src/audio/SoundBank.ts`, `src/audio/GameSounds.ts`
- Test: `tests/unit/soundbank.test.ts` additions (arithmetic half, per
  repo convention).

- [ ] Dust plume at the horizon on the contact bearing during buildup;
      HUD contact line (`CONTACT — STARBOARD`); `skiff-engine` audible
      before visual range, positional, pitch follows closing speed.
- [ ] Commit.

### Task 7: Browser-harness proof

**Files:**
- Modify: `tools/combat.mjs`

- [ ] Scripted encounter: force-schedule a skiff; assert approach → hold
      lane bounds; assert structure damage events land on exposed pieces
      only; kill crew, assert breakaway; rerun and kill hull, assert
      wreck + crate + reel pickup; assert a Phase 5 auto turret engages
      the skiff once its filter includes vehicles.
- [ ] All harnesses + full suite green; commit.

## Interfaces other phases rely on

- Phase 7 (boarding): `VehicleChoreography` phases and `VehicleManager`
  are extended, not duplicated — the boarding vehicle is a
  `VehicleDefinition` with extra phases (`alongside`, `hooked`).
- Phase 8 (loot): `VehicleDefinition.drops` is where rarity tables plug
  in; the salvage-crate drop path is the machine-component delivery
  mechanism.
- Phase 11: additional `VehicleDefinition`s reuse choreography +
  `VolleyPlanner` with different priorities.
- HUD bearing line and plume preset are reused for every later vehicle.
