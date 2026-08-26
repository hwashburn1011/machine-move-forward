# Phase 7: Boarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** The signature encounter — a boarding vehicle pulls alongside,
matches speed, fires a hook, and raiders cross onto the deck to fight
through the structure the player built, with counterplay at every stage.

**Architecture:** The boarding vehicle is a Phase 6 `VehicleDefinition`
whose choreography extends `hold` with `alongside → hooked`. The hook is
the crossing: when it attaches, it injects a `FixedLink` into the nav graph
— exactly the mechanism stairs already use — from a virtual cell on the
vehicle to the deck edge cell it struck, so boarders enter the EXISTING A*
world with no new pathing code. Every counterplay is the removal of one
link in that chain: dead crew never cross, a destroyed vehicle takes the
hook with it, a cut hook strands boarders aboard their own skiff, and a
held doorway is Phase 1's `blockedBy` doing what it already does.

**Tech Stack:** TypeScript, Three.js 0.185, Rapier 0.20, Vitest, Playwright
harnesses.

**Spec:** `docs/superpowers/specs/2026-08-26-roadmap-to-1.0.md` (Act II,
Phase 7); handoff §31 (boarding), §32 (infantry AI), §30 (Boarding
Vehicle).

**Status:** PROVISIONAL — final design pass required before execution (per
roadmap §7). Re-verify Phase 1/5/6 interfaces first.

**Depends on:** Phase 6 (vehicle choreography, manager, telegraphing),
Phase 1 (damage, `blockedBy` door-holding), Phase 5 (turrets as
counterplay). Closes the stairs scripted-proof gap if Phase 1 did not.

## Global Constraints

- Every task ends green: `npx tsc --noEmit && npx vitest run && npx eslint
  src tests`.
- Hook attach point selection, crossing scheduling, and link injection are
  pure and node-tested; only rendering and colliders live in entities.
- Boarders count against `MAX_ACTIVE_ENEMIES = 4` — boarding does not
  stack on top of an infantry wave (director exclusivity from Phase 6
  already guarantees one live encounter).
- Deck edge cells: `x = ±4` (machine-space, 2m tiles on a 10m-wide deck).
  The hook lands on a railing-free edge cell at deck level.
- The cue copy uses ship language the subsystems already use:
  `BOARDING HOOK ATTACHED — PORT DECK` / `— STARBOARD DECK`.
- Commit style: narrative subjects. Art: CC0 preferred per ASSETS.md,
  procedural fallback mandatory.

## Design Decisions

1. **The hook is a FixedLink.** `BuildSystem` already owns `fixedLinks` as
   the one way vertical/special connectivity enters the nav graph (that is
   how the staircase fix landed). The boarding system contributes one link
   `[vehicleCell, deckEdgeCell]` while hooked and withdraws it on
   cut/detach/destroy. Rebuilding the graph on attach/detach reuses the
   structures-changed path.
2. **Attach point prefers the player's weak edge.** Pure
   `pickAttachCell(gridState, sideSign, rng)`: an edge cell NOT protected
   by a railing or wall outranks a protected one; a protected-everywhere
   deck gets a railing smashed first (`damagePiece` on the railing — the
   player hears their fortification working). Railings finally matter.
3. **Crossing is choreographed, not simulated.** Boarders traverse the
   hook cable on a fixed-duration lerp (exposed and shootable mid-cross —
   the classic counterplay window), then land on the deck cell and become
   ordinary enemies in the existing AI. No physics on the cable.
4. **The hook is a `Damageable` (`kind: 'structure'`-adjacent, its own id
   space)** with modest health; cutting it also works as an `Interactable`
   (`kind: 'repair'`-style hold-`E` at the anchor, reusing the Phase 1
   hold mechanic as `cut`). Two ways to remove it: shoot it or hold E.
5. **Vehicle states extend Phase 6.** `alongside` (matches speed at a
   tighter lane, ~9m — inside turret arcs but outside the legs), `hooked`
   (holds while the cable is up; wobble suppressed so the cable reads
   taut). Breakaway from `hooked` retracts a surviving hook.
6. **Boarders' goal is the player, falling back to loot.** Handoff §32's
   `steal` state is deferred to Phase 11's salvager; this phase boarders
   use the existing navigate/attack/pursue brain with Phase 1 target
   priorities. The encounter ends when boarders are dead and the vehicle
   dead or broken away.

## Open Questions (with recommended defaults)

- **Can boarders cross back?** Default: no — they fight to the death;
  retreat AI is Phase 11 polish.
- **Does a destroyed vehicle kill mid-cross boarders?** Default: yes —
  they fall with the cable (cheap, readable, rewarding).
- **How many boarders?** Default: crew 3, crossing one at a time with a
  1.5s stagger; total live enemies still capped at 4.
- **Can the player cross TO the vehicle?** Default: no. Explicitly
  post-1.0 (roadmap §5). The cable is one-way by fiat; a collider blocks
  player entry to the cable cell.

## Assumptions about other phases (verify at execution)

- Phase 6 landed: `VehicleChoreography` (`stepVehicle`), `VehicleManager`
  pool, director exclusivity, telegraph FX/audio.
- Phase 1 landed: `blockedBy` AI input (door-holding works),
  `damagePiece`, hold-E interaction driver (`RepairSystem` pattern to
  copy for `cut`).
- Phase 5 landed: turrets engage vehicles; `alongside` at ~9m sits inside
  the default turret arc.
- NavGraph `fixedLinks` remains the sanctioned injection point for
  non-grid connectivity and rebuilds on change.

## Asset Needs

| Asset | Candidate source | Licence rule | Fallback |
| --- | --- | --- | --- |
| Boarding vehicle hull | Same search as the skiff (Quaternius/Kenney via poly.pizza); a barge-like hull preferred | CC0 only, ASSETS.md table | Procedural: widened skiff hull variant — acceptable ship state |
| Hook + cable | none needed | — | Reuse `HookModel` (`buildHook`) — the salvage hook IS the aesthetic; cable is a `Line2`/cylinder segment like the reel's |
| Boarder model | KayKit Adventurers (vetted in ASSETS.md; manual download) at `public/models/raider.glb` | CC0 | Existing shared enemy rig, tint-differentiated |
| Klaxon/attach clang | none — synthesis rule | — | `SoundBank`: `boarding-warning` (the director warning voice, lower), `hook-attach` (metal clang), `cable-cut` |

## File Structure

**Create:**
- `src/vehicles/BoardingPlan.ts` — pure: attach cell choice, crossing
  schedule, link lifecycle rules.
- `src/vehicles/BoardingHook.ts` — entity: cable visual, Damageable,
  cuttable Interactable, FixedLink contribution.
- `src/vehicles/BoardingController.ts` — orchestrates vehicle state ×
  hook × crossings × enemy spawns.
- Tests: `tests/unit/boardingplan.test.ts`,
  `tests/unit/boardinghook.test.ts` (pure lifecycle),
  `tests/unit/threatboarding.test.ts`.
- `tests/e2e/` addition if the stairs proof lands here (see Task 7).

**Modify:**
- `src/data/vehicles.ts` — `boarder` vehicle definition (crew, hook
  stats, alongside lane).
- `src/vehicles/VehicleChoreography.ts` — `alongside`, `hooked` phases.
- `src/enemies/EnemySpawner.ts` — spawn-at-cell entry point for landed
  boarders.
- `src/building/BuildSystem.ts` — external FixedLink registration API
  (`addExternalLink`/`removeExternalLink`) if Phase 1 has not already
  generalised it.
- `src/enemies/ThreatDirector.ts` — boarding eligible from
  `wavesSurvived >= 6`.
- `src/core/events/GameEvents.ts` — `boarding:hook-attached { side }`,
  `boarding:hook-cut`, `boarding:crossed { enemyId }`, `boarding:ended`.
- `src/ui/HUD.ts` — the banner; `src/audio/` voices; `src/game/Game.ts`
  wiring.

## Tasks

### Task 1: Boarding data and choreography phases

**Files:**
- Modify: `src/data/vehicles.ts`, `src/vehicles/VehicleChoreography.ts`
- Test: `tests/unit/vehiclechoreography.test.ts` (extend),
  `tests/unit/vehicles.test.ts` (extend)

**Interfaces:**
- Produces: `VehiclePhase` gains `'alongside' | 'hooked'`;
  `VehicleDefinition` gains optional
  `boarding: { alongsideOffset; hookRange; crewCrossing: number;
  crossSeconds; staggerSeconds; hookHealth }`; `VEHICLES.boarder`.

- [ ] Failing tests: boarder reaches `alongside` only from `hold`;
      `hooked` only from `alongside` and only within `hookRange`;
      breakaway from `hooked` allowed; `alongsideOffset` ≥ 8 and <
      skiff `laneOffset`; destroyed absorbing from every phase.
- [ ] Implement; commit (`feat: a vehicle that wants to come alongside`).

### Task 2: The attach plan

**Files:**
- Create: `src/vehicles/BoardingPlan.ts`
- Test: `tests/unit/boardingplan.test.ts`

**Interfaces:**
- Consumes: build grid occupancy snapshot (same shape `BuildValidation`
  reads), `sideSign`.
- Produces: `pickAttachCell(grid, sideSign, rng): { cell; mustBreach:
  { instanceId } | null }` — unprotected edge cell preferred; else the
  weakest railing/wall on that side is named as the breach target;
  `crossingSchedule(def, crewAlive): { at: number }[]` (stagger times);
  link pair `linkFor(cell, sideSign): FixedLink`.

- [ ] Failing tests: prefers unprotected edge; deterministic under seed;
      fully-walled side yields a breach target, never null; schedule
      lengths match living crew; stagger spacing exact.
- [ ] Implement; commit.

### Task 3: The hook — attach, damage, cut

**Files:**
- Create: `src/vehicles/BoardingHook.ts`
- Modify: `src/building/BuildSystem.ts` (external link API),
  `src/core/events/GameEvents.ts`
- Test: `tests/unit/boardinghook.test.ts`

**Interfaces:**
- Consumes: `linkFor` (Task 2), `buildHook` visual, Damageable, the
  hold-E driver pattern from Phase 1's `RepairSystem`.
- Produces: `BuildSystem.addExternalLink(id, link)` /
  `removeExternalLink(id)` triggering the same graph rebuild as
  structural change; hook states `flying → attached → cut | retracted`;
  events `boarding:hook-attached { side: 'port' | 'starboard' }`,
  `boarding:hook-cut`.

- [ ] Failing tests (pure lifecycle): attach registers exactly one link;
      cut/destroy/retract each remove it exactly once; double-removal
      safe; hook Damageable dies at `hookHealth`; hold-E cut takes
      `CUT_SECONDS` (copy the `REPAIR_SECONDS` discipline: charge nothing,
      abandon on release/turn-away).
- [ ] Implement entity: `buildHook` flown on a lerp, cable drawn taut,
      clang on attach.
- [ ] Commit (`feat: the hook bites the deck and the deck knows it`).

### Task 4: Crossing and landing

**Files:**
- Create: `src/vehicles/BoardingController.ts`
- Modify: `src/enemies/EnemySpawner.ts`, `src/game/Game.ts`
- Test: pure scheduling seams in `tests/unit/boardingplan.test.ts`;
  crossing feel is harness work.

**Interfaces:**
- Consumes: `crossingSchedule`, `EnemyManager`/`EnemySpawner`,
  `MAX_ACTIVE_ENEMIES`.
- Produces: boarders spawn seated on the vehicle, traverse the cable on a
  `crossSeconds` lerp (shootable in transit), land at the attach cell and
  enter the normal AI; event `boarding:crossed { enemyId }`; mid-cross
  boarders die with a destroyed vehicle or cut cable; `boarding:ended`
  when crew dead and vehicle gone.

- [ ] Implement; respect the enemy cap; breach case first applies
      `damagePiece` volleys to the named railing until it falls, then
      hooks.
- [ ] Commit.

### Task 5: Director, HUD, audio

**Files:**
- Modify: `src/enemies/ThreatDirector.ts`, `src/ui/HUD.ts`,
  `src/audio/SoundBank.ts`, `src/audio/GameSounds.ts`
- Test: `tests/unit/threatboarding.test.ts`

**Interfaces:**
- Produces: encounter kind `{ kind: 'vehicle', vehicleId: 'boarder' }`
  eligible from `wavesSurvived >= 6`; still exclusive with everything
  else; HUD banner `BOARDING HOOK ATTACHED — PORT DECK` on
  `boarding:hook-attached`; `boarding-warning` voice during its buildup.

- [ ] Failing tests: eligibility, exclusivity, peace-gap preserved, save
      round-trip (default rule from Phase 6: saving mid-encounter
      serialises as recovery).
- [ ] Implement; commit.

### Task 6: Browser-harness proof — the signature moment

**Files:**
- Modify: `tools/combat.mjs`

- [ ] Scripted full sequence: build a walled room with a doorway on the
      deck; force-schedule the boarder; assert alongside lane, hook
      attach on the unprotected edge, banner event, boarders crossing
      (count them), a boarder pathing through the doorway to the player;
      assert Phase 1 `blockedBy` chews the wall when sealed.
- [ ] Counterplay runs: (a) cut the hook mid-cross — crosser dies,
      remainder strand, vehicle breaks away; (b) destroy the vehicle
      first — no boarding; (c) turret filter engages the boarder vehicle.
- [ ] All harnesses + full suite green; commit.

### Task 7 (contingent): The stairs scripted proof

Skip if Phase 1 closed it (check `README.md` known gaps / `combat.mjs`).

**Files:**
- Modify: `tools/combat.mjs` or `tests/e2e/`

- [ ] Script the walk the README describes as missing: approach surface,
      camera yaw and entry edge agreed; assert a driven player climbs a
      flight 4.67 → 7.43 end to end; assert an enemy pathing over the
      same flight reaches an upper-storey player (boarders make this
      matter — an upstairs redoubt must be reachable, not a safe room).
- [ ] Commit (`test: the staircase is climbed on the record now`).

## Interfaces other phases rely on

- Phase 8 (loot): boarding encounters are the premium drop table hook —
  `VEHICLES.boarder.drops` and the survived-boarding event
  (`boarding:ended`) are where rarity rolls attach.
- Phase 11: salvager reuses hook + crossing to STEAL (crossing inverted);
  retreat AI slots into the boarder brain.
- Phase 9/13 (story): `boarding:ended` is a beat the radio can react to.
- `BuildSystem.addExternalLink` becomes the sanctioned door for ANY
  future non-grid connectivity (gangways, story set pieces).
