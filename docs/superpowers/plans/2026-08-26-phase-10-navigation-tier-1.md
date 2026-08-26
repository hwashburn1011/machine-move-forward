# Phase 10 — Navigation Tier 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limited course adjustment — a few degrees, at fuel cost, on
cooldown — unlocked by Chapter 1's course actuator, plus off-path points of
interest that can pass out of reach by design.

**Architecture:** The machine stays pinned at origin, so steering is a
lateral world offset, not a rotation. A `Heading` model holds
`lateralOffset` (metres east of the original line) and eases it toward a
committed target at the rate a real few-degree course change would produce
(`tan(θ) × speed`). Everything already placed in world space — terrain X
sampling, props, salvage, destinations, POIs — is shifted by the offset in
exactly one place, the same way `WORLD_Z_PER_METRE` centralised direction.
POIs are distance-and-lateral-keyed spawns; a POI at lateral 120 m is
reachable only if the player commits course changes early enough.

**Tech Stack:** TypeScript, existing world/scroll machinery, Vitest. No new
dependencies.

**Spec:** `docs/superpowers/specs/2026-08-26-roadmap-to-1.0.md` (Act III,
Phase 10); handoff §34 (tier 1), §35 (world opportunities).

**Status:** PROVISIONAL — final design pass required before execution (per
roadmap §7). The lateral-offset mechanism below is the recommended design;
the design pass must confirm dune-field world-space X sampling makes the
shift seamless (it samples `worldX`, so it should be a single subtraction).

**Depends on:** Phase 3 (fuel becomes spendable), Phase 8 (`Unlocks`),
Phase 9 (`'chapter-1-complete'`, course actuator item, helm install
moment).

## Global Constraints

- The machine never moves or rotates; the world shifts.
- Steering is a *choice*: it costs fuel, has a cooldown, and cannot be
  spammed into free omnidirectional travel (handoff §34: ~5°).
- Some POIs must pass out of reach by design — the frustration sells later
  tiers (roadmap Phase 10).
- Deterministic POI placement from `worldSeed` + distance.
- All heading/POI state saves (v4 migration).
- Every phase ships playable; with zero steering input the game is exactly
  the game before this phase.

## Design decisions

1. **Helm is a fixed station on the prow deck** (procedural geometry —
   machine stays procedural per roadmap §6). Inert until the course
   actuator (Phase 9 reward) is installed at it; installing grants
   `'nav-tier-1'` through Phase 8 `Unlocks`.
2. **Course changes are discrete commitments.** At the helm the player
   picks LEFT/RIGHT; each commit is a 5° change held for 60 s of travel
   then decaying back to straight (tier 1 cannot hold a heading — that is
   tier 2/3's upgrade). Cost: 8 fuel per commit, 45 s cooldown. At 7.5
   m/s, one commit ≈ 39 m of lateral displacement — enough to catch a POI
   at ±40 m, two early commits for ±80 m, and lateral > ~150 m is
   deliberately out of tier-1 reach.
3. **One authority for the offset.** `Heading.lateralOffset` is applied
   where slots and scroll-objects get their positions (`WorldManager`,
   `SalvageField`, `Destination`, POISpawner) as a single `x -= offset`
   term, mirroring how `WORLD_Z_PER_METRE` keeps direction un-forkable.
   Terrain chunks pass `offset` into the dune shader/height sampling so
   the ground itself slides — the design-pass verification item.
4. **POIs: two types at MVP.** `wreck-field` (dense rich salvage cluster,
   3–5 reel targets) and `beacon-crate` (single authored crate with a
   Phase 8 gear roll at +1 rarity bias). Spawned by schedule: roughly one
   POI per 600–900 m at lateral −140..140 m, seeded. Announced by a HUD
   bearing marker + audio ping when abeam of detection range (500 m out).
5. **Missing a POI is silent by design** — the marker slides past and
   greys out. No failure state, no penalty; the message is "you could not
   turn, yet."

## Open questions (recommended defaults in bold)

- Does steering tilt/animate the machine? **Cosmetic body yaw of 2–3° via
  the existing body-pose system while a change is active; legs unchanged
  (MVP).**
- Do committed changes stack? **Yes, capped at ±10° total** — two commits
  can run concurrently, then cooldown gates the third.
- Does the compass/deck-bearing UI exist already? **`DeckBearing` exists;
  extend it with heading and POI markers rather than adding a new
  widget.**

## Asset needs

| Need | Plan | Source |
| --- | --- | --- |
| Helm console | Procedural (`bevelledBox` + wheel/lever), matches machine | — |
| POI wreck-field props | Existing wreck/container/debris packs, denser arrangement | already in repo (Kenney/Quaternius, CC0) |
| Beacon crate | Existing salvage crate mesh + emissive beacon light | — |
| Audio pings | Synthesized via `SoundBank` | — |

## File structure

- Create: `src/machine/Heading.ts` — offset model, commits, cost, cooldown.
- Create: `src/world/POISpawner.ts` — seeded schedule, spawn/recycle,
  detection events.
- Create: `src/data/pois.ts` — POI type definitions (data).
- Modify: `src/world/WorldManager.ts`, `src/world/TerrainChunk.ts`,
  `src/world/PropSpawner.ts`, `src/salvage/SalvageField.ts`,
  `src/story/Destination.ts` — apply the lateral offset term.
- Modify: `src/machine/MachineGeometry.ts` — helm console on the prow.
- Modify: `src/interaction/InteractionSystem.ts` — helm interaction +
  actuator install.
- Modify: `src/ui/DeckBearing.ts`, `src/ui/HUD.ts` — heading, cooldown,
  fuel cost, POI markers.
- Modify: `src/core/events/GameEvents.ts` — `'nav:course-committed'`,
  `'nav:poi-detected'`, `'nav:poi-missed'`, `'nav:poi-reached'`.
- Modify: `src/save/SaveSchema.ts` + migration — v4
  `machine.heading: { lateralOffset, activeCommits, cooldownRemaining }`;
  bump `machine.navigationTier` (field already exists in v1) to 1 on
  unlock.
- Test: `tests/unit/heading.test.ts`, `tests/unit/poispawner.test.ts`,
  offset-application extensions in `tests/unit/navgraph`-adjacent world
  suites.

## Tasks

- [ ] **Task 1: Heading model.** Pure `Heading` class: commit
  (checks unlock, fuel, cooldown), offset easing at `tan(5°) × speed`,
  decay, stacking cap. Unit tests: cost/cooldown refusals, displacement
  after N metres matches the tangent arithmetic, decay returns to
  straight. Commit.
- [ ] **Task 2: Apply the offset.** Thread `lateralOffset` through
  WorldManager slots, terrain sampling, props, salvage, destinations —
  one term, tested by asserting a prop's world X shifts by exactly the
  offset while its dune height matches the shifted sample. Commit.
- [ ] **Task 3: Helm + unlock.** Prow console, actuator install grants
  `'nav-tier-1'` and sets save `navigationTier = 1`; helm UI (commit
  buttons, cooldown, fuel). Unit + `tools/build.mjs`/interaction harness
  checks. Commit.
- [ ] **Task 4: POISpawner.** Seeded schedule, two POI types, detection/
  missed/reached events, `DeckBearing` markers. Unit tests: determinism,
  reachability math (a POI at 40 m is catchable with one commit made at
  detection; one at 200 m is not with two). Commit.
- [ ] **Task 5: Save-schema bump + harness.** Migration, mid-commit
  round-trip.
  New checks in `tools/drive.mjs`: commit a course change via debug key,
  assert world X displacement and fuel spend; extend `tools/story.mjs` or
  new `tools/nav.mjs` for POI catch and miss paths. Commit.

## Test strategy

Unit (Vitest): heading arithmetic, refusal rules, POI determinism and
reachability, offset application, migrations — all pure. Browser:
drive-harness course change (visual displacement, no physics jitter while
the world slides laterally — watch the planted-feet rule), POI catch/miss
flow. The planted-foot/lateral-slide interaction is the highest-risk item:
the harness must assert feet do not skate sideways during a commit
(same technique as the existing footfall checks).

## Interfaces other phases rely on

- `Heading.lateralOffset` and the single offset-application term (Phase 12
  terrain regions and Phase 13 off-path destinations build on it).
- `'nav:poi-*'` events (Phase 11's salvager AI may target POIs; Phase 13
  reuses detection for destinations).
- `POISpawner` schedule format (Phase 12 biome-specific POI tables).
- `navigationTier` save field semantics: 0 none, 1 this phase, 2 at
  Phase 13.
