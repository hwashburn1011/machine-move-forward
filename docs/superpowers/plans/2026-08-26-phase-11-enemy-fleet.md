# Phase 11 — The Enemy Fleet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two to three new enemy vehicle classes with distinct jobs, and a
threat director that composes mixed encounters scaled to the machine's power.

**Architecture:** Each class is a data definition plus a behaviour module
riding the Phase 6 vehicle choreography framework (spawn ahead → approach →
hold combat lane → act → break away/die). The threat director gains a vehicle
budget alongside its infantry budget and a machine-power score that scales
encounter composition. No new engines: vehicles are choreographed relative
motion, not driving simulation (handoff §33).

**Tech Stack:** Existing Three.js/Rapier/TypeScript stack; vehicle definitions
in `src/data/`; pure-logic director changes unit-tested in node.

**Spec:** `docs/superpowers/specs/2026-08-26-roadmap-to-1.0.md` (Act IV,
Phase 11); handoff §30 (vehicle classes), §33 (vehicle AI), §36 (difficulty
philosophy).

**Status:** PROVISIONAL — requires redesign pass after Act III ships. Written
before Phases 5–10 exist; every reference to the vehicle framework is an
assumption recorded below. The value now is scoping, dependencies, asset
shopping, and open questions.

**Depends on:** Phase 1 (localized damage), Phase 5 (turrets — targets for
sniper counterplay), Phase 6 (vehicle choreography framework, crew visuals,
vehicle loot), Phase 7 (boarding — the salvager's escape pressure), Phase 8
(loot rarity for vehicle drops).

## Global Constraints

- PvE only; vehicles never board in this phase (boarding stays Phase 7 tech).
- The machine never moves; vehicles are positioned in the scrolling frame.
- Fixed 60Hz sim; director logic stays PURE (numbers in, decisions out).
- Threat director hard rule stands: quiet is scheduled first; `RECOVERY_M`
  and `CALM_MIN` floors are never spent by the new budget.
- Every new stat lives in `src/data/`, not in logic.
- Save schema versioned; migration for any new persistent state.
- Assets CC0 preferred, CC-BY recorded in `ASSETS.md`; procedural fallback
  (`?nomodel=1`) must keep working for every harness.

## Design decisions (made now, revisit at redesign pass)

- **Three classes, three jobs.** Each class must create a different player
  problem, not a different HP number:
  - **Light crawler** — flanker. Holds a lane on the machine's quarter,
    fires a slow autocannon at *structure* (walls, hardpoints), forcing the
    player to man a turret or repair under fire. Medium HP, medium speed.
  - **Salvager** — thief. Approaches an *exposed* storage crate (on deck or
    in a breached room — reuses room detection's enclosed/exposed verdict),
    extends a magnet claw, and siphons item stacks out of that crate into
    its own hold at a fixed rate with a visible beam and alarm. It flees
    when full or at low HP. Destroying it drops everything it stole plus
    its own loot; letting it escape loses the items for good. Counterplay:
    shoot the claw (breaks the siphon, cheap), kill the vehicle (expensive,
    best reward), or store valuables in enclosed rooms (layout matters).
  - **Sniper rig** — ranger. Sits far outside turret range, telegraphs with
    a glint and a report delay, and puts heavy single shots into exposed
    structure and deck equipment. Counterplay is the player's own marksman
    weapon, cover the player has built, or waiting out its ammo. It never
    closes. It exists to punish an all-exterior machine and to make roofed
    firing positions worth building.
- **Mixed encounters.** The director gains encounter *templates* (e.g.
  "crawler + skiff screen", "salvager under crawler cover", "sniper alone")
  chosen by budget and power score, replacing single-class waves.
- **Machine power score.** Pure function over: installed turret count and
  tier (Phase 5), total structure HP (Phase 1), generator capacity in use
  (Phase 3), and player weapon tier (Phase 8). Encounter budget scales with
  it *sub-linearly*, and the director keeps the handoff §36 rule: some
  encounters are simply above or below the player, by design.
- **Crew.** Every vehicle visibly carries 1–3 human raiders (Phase 6's crew
  rig). Killing crew degrades the vehicle (slower fire, no siphon) without
  destroying it — the two damage routes give both weapon styles a job.

## Open questions (recommended defaults in bold)

- Does the salvager path onto the deck itself? **No — claw and beam only;
  boarding stays the boarding vehicle's job.** Simpler, reads clearly.
- Can the sniper rig hit the player directly? **Rarely and telegraphed —
  its job is structure; direct hits feel unfair at that range.**
- Do mixed encounters share one telegraph or per-vehicle telegraphs?
  **One combined telegraph sized to the whole encounter, with per-class
  audio signatures** so a learned player can read the composition.
- Does crew loss persist if a vehicle escapes and "returns"? **Vehicles
  never return; every spawn is fresh.** No cross-encounter state.

## Asset needs

| Need | Candidate source | Licence rule | Fallback |
| --- | --- | --- | --- |
| Light crawler hull | Kenney vehicle/tank packs; Quaternius vehicle packs (poly.pizza) | CC0 preferred | Procedural bevelled-box hull like the machine |
| Salvager hull + claw arm | Quaternius industrial/vehicle packs; Kenney | CC0 preferred | Procedural, claw from `HookModel`-style code |
| Sniper rig | Kenney/Quaternius; may be a static platform + long gun | CC0 preferred | Procedural mast + barrel |
| Crew raiders | KayKit character packs (already identified in `ASSETS.md`) | CC0 | Existing rigged enemy model, tinted |
| Autocannon/siphon/sniper audio | Synthesised (`SoundBank` recipes) | n/a | n/a |

No URLs here on purpose: source pages are located and licences verified at
install time, and every install is recorded in `ASSETS.md` per its policy.

## File structure (indicative — reconcile with what Phase 6 actually built)

- Create: `src/data/vehicles.ts` — class definitions (extend Phase 6's file
  if it exists)
- Create: `src/vehicles/LightCrawler.ts`, `src/vehicles/Salvager.ts`,
  `src/vehicles/SniperRig.ts` — per-class behaviour on the choreography API
- Create: `src/vehicles/SiphonBeam.ts` — salvager's steal mechanic
- Modify: `src/enemies/ThreatDirector.ts` — encounter templates, vehicle
  budget, power score input
- Create: `src/enemies/PowerScore.ts` — pure machine/player power function
- Modify: `src/save/SaveSchema.ts` + new migration — mid-encounter vehicle
  state if Phase 6 persists it
- Test: `tests/unit/powerscore.test.ts`, `tests/unit/threatdirector.test.ts`
  (extend), `tests/unit/salvager.test.ts` (siphon arithmetic)

## Tasks (feature level — split into stepped tasks at the redesign pass)

- [ ] **Task 1: Power score.** Pure `PowerScore` module: inputs (turrets,
  structure HP, generator load, weapon tier) → scalar; unit tests pin the
  curve and its sub-linearity. *Interfaces: consumes Phase 5 turret registry
  and Phase 3 power state as read-only snapshots (assumed getters).*
- [ ] **Task 2: Encounter templates.** Director composes waves from a
  template table costed against budget × power score; calm/recovery floors
  untouched; unit tests extend the existing director suite.
- [ ] **Task 3: Light crawler.** Definition + behaviour (flank lane,
  structure-targeting autocannon using Phase 1 damage); crew seats; loot.
  Harness: `combat.mjs` check that a crawler holds its lane and a wall
  takes damage.
- [ ] **Task 4: Salvager.** Exposed-crate selection (room detection),
  siphon beam with per-second item transfer, flee threshold, claw as a
  damageable sub-part, stolen-goods loot drop. Unit tests for siphon
  arithmetic and target selection; harness check for steal-then-recover.
- [ ] **Task 5: Sniper rig.** Long-range lane, glint/report telegraph,
  exposed-structure targeting, no-close behaviour. Harness check that
  cover the player builds actually blocks its line of fire.
- [ ] **Task 6: Mixed-encounter telegraphs and audio.** Combined warning
  with per-class audio signatures via `SoundBank`; HUD wording.
- [ ] **Task 7: Save migration + docs.** Persist/restore any new state;
  README and `ASSETS.md` updates; full suite + harness pass.

## Test strategy

Unit: power score curve, template costing, siphon arithmetic, per-class
state machines — all pure, all in node. Harness (`combat.mjs`): one scripted
encounter per class proving the job (crawler damages a wall; salvager steals
and drops loot when killed; sniper is blocked by built cover). No wall-clock
assertions; simulated distance drives everything.

## Interfaces other phases rely on

- `PowerScore` snapshot — Phase 12 storms and Phase 13 destination
  encounters read it to cost their own spawns.
- Encounter template table — Phase 13's arrival set-pieces add entries
  rather than new spawn paths.

## Assumptions about earlier phases (verify at redesign pass)

- Phase 6 ships a vehicle choreography API roughly:
  `spawnVehicle(def, lane)`, per-frame `holdLane/approach/breakaway`
  states, crewed visuals, per-vehicle loot on destruction.
- Phase 1's damage routes projectile hits to individual build pieces and
  machine subsystems by collider.
- Room detection exposes an enclosed/exposed verdict per crate (exists
  today via flood-fill rooms).
- Phase 8 provides a weapon-tier scalar readable without UI coupling.
