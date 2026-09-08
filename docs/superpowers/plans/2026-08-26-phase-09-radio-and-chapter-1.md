# Phase 9 — The Radio & Chapter 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** The radio device, a signal that strengthens as its source nears,
and the first hand-authored story destination — a dead mega-walker directly
on the path — with journals, a unique reward, and the lead to the next
signal.

**Architecture:** A `StoryDirector` (sibling of `ThreatDirector`) advances
data-driven chapters keyed to `distanceTraveled`. Destinations are scrolling
world set-pieces, spawned exactly the way `SalvageField` crates are — placed
ahead at an absolute distance, carried astern by the world scroll. Arrival
uses the one mechanism the engine gives us for free: `setThrottle(0)` stops
the machine, and because the world scrolls at machine speed, a stopped
machine means a frozen world — the destination becomes a stable, walkable
platform with ordinary physics.

**Tech Stack:** TypeScript, Three.js, Rapier (static colliders for the
destination), existing EventBus/save/interaction systems. No new deps.

**Spec:** `docs/superpowers/specs/2026-08-26-roadmap-to-1.0.md` (Act III,
Phase 9 — this phase also "fixes the story premise for real"); handoff §35.

**Status:** PROVISIONAL — final design pass required before execution (per
roadmap §7). The narrative section below is additionally **DRAFT — subject
to the Phase 9 design pass**, which is where premise and script are locked.

**Depends on:** Phase 2 (the rooftop opening this must connect to), Phase 3
(power — the radio is a powered device), Phase 8 (`Unlocks`,
`'progression:unlocked'`, gear/reward plumbing).

## Global Constraints

- The machine never moves; destinations scroll to it and stop with it.
- Deterministic: chapter trigger distances derive from story data, not RNG.
- Loot pacing stays intentional; the destination's reward list is authored,
  not rolled.
- All story state saves and restores mid-chapter (v3 migration).
- Every phase ships playable: skipping all journals must not soft-lock.
- Assets free/open-source, CC0 preferred, recorded in `ASSETS.md`.

## Narrative design — DRAFT, subject to the Phase 9 design pass

**Premise (candidate).** The machines are caravan walkers of a dead trade
line. Sixty years ago the desert's rim cities put their water underground
and their freight on walkers; then the aquifer war killed the cities and
left the walkers pacing routes nobody lives on, tended by scavenger robots
that never got the news. You grew up in a rooftop settlement above one dead
city. The opening (Phase 2) is the day the robots finally cleared your
block: chased to a ledge, you drop onto walker "MMF-7" as it passes — the
machine your grandparent drove, still walking its loop.

**Chapter 1 — "The Wake" (candidate script).** The radio you repair aboard
picks up a repeating voice loop — a woman's voice, calm, pre-war: a caravan
mistress's final broadcast from walker "ANNIKA", six hundred metres of dead
mega-walker lying across the route ahead. The signal strengthens over ~2 km
of travel (HUD + audio crackle resolving into words). MMF-7 walks into
ANNIKA's shadow and stops. Aboard the wreck: four journals sketching the
route's death and naming a live relay tower far off-path (Chapter 2's
hook), one authored reward — the **course actuator**, the mechanism that
lets a walker leave its line — and the loot that teaches the loop:
destinations are where the good salvage is. Returning to the deck and
pulling the departure lever grants `'chapter-1-complete'`, and the next
signal starts, too weak to read: off-path, unreachable until Phase 10.

Why this premise earns its place: it explains robots-as-default-enemy
(maintenance drones "salvaging" intruders), why the machine only walks
forward (a route it was built to pace), why steering is the story's spine
(the course actuator is literally the plot coupon), and it leaves humans —
Act II's raiders — morally messy rather than cartoonish: other crews
surviving the same dead economy.

## Design decisions

1. **Stop-the-world arrival.** On destination abeam, `StoryDirector` takes
   throttle to 0 over ~4 s (a scripted override flag on
   `MachineMovement`); departure is an explicit lever interaction, so the
   player explores at their own pace. Threat director is forced to CALM
   while docked — destinations are sanctuaries in 1.0.
2. **The destination is a static set-piece, not chunks.** One authored
   `THREE.Group` + static Rapier colliders, position driven by the same
   distance arithmetic as `SalvageField` (spawn ~500 m ahead, carried
   astern; while docked, world speed is 0 so it holds station). Player
   crosses on a boarding plank the set-piece owns.
3. **Radio is a buildable powered station.** New build piece `radio`
   (workbench-crafted, 1 cell, wall- or floor-mounted like stations
   today), registered with Phase 3 power via
   `MachinePower.registerConsumer({ id, draw, priority: 'station' })`
   and polled with `isPowered(id)`.
   Unpowered, it shows static and the chapter clock pauses: story never
   advances past a dead radio.
4. **Chapters are data.** `src/data/story.ts`: per chapter — id, signal
   text lines, trigger unlock, lead-in distance, destination blueprint id,
   journal texts, reward list, completion unlock id. `StoryDirector` is a
   small machine: `dormant → signal → approaching → docked → complete`.
5. **Journals are interactables** using the existing `InteractionSystem`;
   reading is a DOM panel (HUD framework), text only, with a synthesized
   radio-crackle voice bed — no voice acting in 1.0.
6. **Mega-walker geometry is recycled, not modeled.** ANNIKA is the
   existing procedural machine geometry (`MachineGeometry`,
   `bevelledBox`) scaled ~4×, listing 15°, half-buried via the dune-height
   function, plus existing wreck/container props for clutter. No new
   character-scale asset needed.

## Open questions (recommended defaults in bold)

- Can enemies board while docked? **No in 1.0 (sanctuary rule);** revisit
  if docked time proves too safe/chill-less.
- Does the signal require the radio to be aimed/tuned (minigame)? **No —
  strength is distance-driven; tuning is post-1.0 flavor.**
- Is the course actuator auto-installed? **No — it is a machine-component
  item (Phase 8) the player installs at the helm, which is the Phase 10
  bridge moment.**

## Asset needs

| Need | Plan | Source |
| --- | --- | --- |
| Mega-walker destination | Scaled/recolored arrangement of existing procedural machine geometry + existing wreck (Kenney) and container (Quaternius) props — explicitly no new model | already in repo |
| Radio set model | Small CC0 prop if one reads well; else procedural `bevelledBox` + whip antenna, matching stations | Quaternius / Kenney via poly.pizza |
| Journal prop | Procedural clipboard-sized slab + emissive marker (MVP) | — |
| Voice bed | Synthesized crackle/tones via existing `SoundBank` recipes; no samples | — |

## File structure

- Create: `src/story/StoryDirector.ts` — chapter state machine.
- Create: `src/story/Destination.ts` — set-piece spawn/scroll/dock/colliders.
- Create: `src/story/destinations/annika.ts` — Chapter 1 blueprint (layout,
  journal placements, reward crate, plank, lever).
- Create: `src/data/story.ts` — chapters, journal texts, rewards (data).
- Modify: `src/data/build-pieces.ts` + `src/data/recipes.ts` — radio piece
  and recipe.
- Modify: `src/machine/MachineMovement.ts` — scripted throttle override.
- Modify: `src/enemies/ThreatDirector.ts` — forced-CALM while docked.
- Modify: `src/core/events/GameEvents.ts` — `'story:signal'`,
  `'story:docked'`, `'story:departed'`, `'story:journal-read'`.
- Modify: `src/ui/HUD.ts` (+ new `src/ui/StoryUI.ts`) — signal meter,
  journal reader panel.
- Modify: `src/save/SaveSchema.ts` + migration — v3 `story` block:
  `{ chapter: string; state: string; journalsRead: string[] }`.
- Test: `tests/unit/storydirector.test.ts`,
  `tests/unit/destination.test.ts`, save extensions.

## Tasks

- [ ] **Task 1: Story data + StoryDirector.** Chapter state machine, pure
  and event-driven; signal strength = authored curve of remaining
  distance. Unit tests: full dormant→complete walk on simulated distance;
  radio-unpowered pauses; save/restore mid-state. Commit.
- [ ] **Task 2: Radio build piece.** Piece, recipe, power registration
  (behind recorded Phase 3 assumption), static-vs-signal audio states.
  Unit tests extend build/craft suites. Commit.
- [ ] **Task 3: Destination scaffolding.** `Destination` spawn at absolute
  distance, scroll with world, dock (throttle override to 0, forced CALM),
  plank collider on, depart lever restores. Unit-test the distance
  arithmetic and dock state; harness-test walk-aboard. Commit.
- [ ] **Task 4: ANNIKA blueprint.** Scaled machine geometry, buried pose,
  clutter props, 4 journals, reward crate (course actuator + authored
  loot), next-signal trigger on departure granting
  `'chapter-1-complete'` via Phase 8 `Unlocks.grant`. Commit.
- [ ] **Task 5: Story UI + save-schema bump.** Signal meter, journal
  reader, migration, HUD chapter toast. Unit tests: the prior version
  loads clean; the new version round-trips mid-dock. Commit.
- [ ] **Task 6: Harness.** New `tools/story.mjs`: boot with high distance
  near trigger, assert signal event, dock, board via plank, read journal,
  take reward, depart, `'chapter-1-complete'` granted, world scroll
  resumes. Screenshot at dock for the visual record. Commit.

## Test strategy

Unit (Vitest): StoryDirector transitions, signal curve, destination
distance arithmetic, dock/depart flags, save round-trips — all pure.
Browser: `tools/story.mjs` drives the whole chapter; `tools/combat.mjs`
gains one check that the threat director is CALM-locked while docked.
Determinism: story triggers are distance-keyed, never wall-clock.

## Interfaces other phases rely on

- `'chapter-1-complete'` unlock (Phase 10 gates nav tier 1 on it).
- `Destination` spawn/dock machinery (Phase 13 reuses it for Chapters 2–3,
  adding off-path placement).
- `StoryDirector` chapter data format (Phase 13 authors two more entries).
- Scripted throttle override on `MachineMovement` (Phase 14's finale).
