# Phase 12 — The Changing Desert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Terrain regions with mechanical teeth — deep sand, rock fields,
ruins, storms — so the route itself becomes a character.

**Architecture:** A pure `RegionMap` derives the region type for any distance
from `worldSeed` alone (like `chunkSeed` does for chunks), so regions are
deterministic, need no storage, and save/restore mid-region for free. Every
consumer — movement, prop spawner, fog/sky, threat director, damage — reads
the region at its own distance and applies its own effect. Transitions blend
over a fixed span so nothing pops.

**Tech Stack:** Existing stack. Region logic pure TypeScript in `src/world/`;
visual changes ride the existing terrain shader, `Fog`, and `Sky` uniforms.

**Spec:** `docs/superpowers/specs/2026-08-26-roadmap-to-1.0.md` (Act IV,
Phase 12); handoff §27 (terrain types and effects).

**Status:** PROVISIONAL — requires redesign pass after Act III ships. The
region *mechanics* lean on Phase 1 (damage) and Phase 3 (power/light) which
exist by then, but storm/telegraph interplay assumes Phase 6+ vehicles.

**Depends on:** Phase 1 (rock-strike damage), Phase 3 (lamps matter in
storms), Phase 6/11 (threat director vehicle encounters for storm masking).
Independent of Phase 13 and can ship before or after it.

## Global Constraints

- Regions must be **derived, never stored**: same seed + same distance ⇒
  same region, on every boot and after every reload. This is the same rule
  `ChunkManager` already enforces for chunk positions.
- The machine never moves; region effects modulate the world and the speed
  model, not the machine's transform.
- Fixed 60Hz sim; region lookups are pure functions callable from tests.
- No punishing chill: region hazards create *texture and choices*, not
  fail states. Deep sand slows; it never strands.
- Every tunable in `src/data/regions.ts`.
- Assets CC0 preferred, CC-BY recorded in `ASSETS.md`; all harnesses keep
  booting assetless.

## Design decisions (made now, revisit at redesign pass)

- **Region spans, not biome map.** The route is 1-D. Regions are spans of
  1,500–3,000 m chosen by seeded weighted draw, with open dunes as the
  connective default (roughly half of all travel). A span's type, length,
  and intensity derive from `hashSeed(worldSeed, 'region', spanIndex)`.
- **Five types at MVP:**
  - **Open dunes** — the current game; baseline.
  - **Deep sand** — speed factor ~0.6 via a terrain term in the existing
    `MachineMovement` model; visibly paler, softer duning; louder footfall
    audio. Makes fuel/time economy felt; pairs with Phase 10's steering
    costs.
  - **Rock field** — scattered boulders (instanced, like props); seeded
    rock *strikes* apply small localized damage to legs/hull subsystems on
    a distance schedule, telegraphed by a lurch and audio, teaching the
    repair loop between fights. Strike rate scales with speed — throttling
    down (Phase 10 control) becomes a real choice.
  - **Ruin field** — dense prop set with cover-height wreckage and raised
    loot density in the salvage field; enemy encounters here get more
    spawn cover. The "swallowed city" read, at prop scale.
  - **Storm belt** — fog distance and sun dimmed via `Fog`/`Sky` uniforms,
    sand FX intensity up, threat telegraph *distance* halved (danger
    arrives with less warning — the director's floors still hold), lamps
    (Phase 3) become genuinely useful outdoors. No damage of its own.
- **Blends.** All region effects interpolate over a 150 m transition span;
  consumers read a `RegionSample { type, intensity, blend }`, never a raw
  enum switch at a boundary.
- **HUD.** A quiet region banner on entry ("DEEP SAND"), same visual
  language as the threat warnings but calmer — the desert talking, not the
  enemy.
- **Chapter routing hook.** `RegionMap` accepts authored *overrides* — a
  span pinned to a type at a distance — so Phase 13 destinations can sit in
  the region that suits their story beat. Overrides come from the story
  schedule, not from randomness, and are part of the same determinism.

## Open questions (recommended defaults in bold)

- Do storms suppress or intensify encounters? **Neither at MVP: same
  budget, shorter telegraph.** Intensity comes later if it reads well.
- Can rock strikes break a leg outright? **No — strikes damage but never
  disable in this phase.** Disabling locomotion needs recovery design.
- Are ruins walkable (machine passes through streets)? **No — prop-scale
  set dressing off the corridor; walkable ruins are Phase 13 destination
  tech.**
- Region length/frequency tuning? Start with the 1,500–3,000 m draw above
  and tune in the act check play session.

## Asset needs

| Need | Candidate source | Licence rule | Fallback |
| --- | --- | --- | --- |
| Boulders/rocks | Kenney nature packs; Quaternius rocks (poly.pizza) | CC0 preferred | Existing procedural scatter rocks |
| Ruin wreckage set | Kenney industrial/city kits; Quaternius Modular Ruins was inspected and rejected for style (see `ASSETS.md`) — revisit only its plain masonry | CC0 preferred | Existing wreck/container/debris packs, denser |
| Storm surface detail | None — shader/fog/particle work | n/a | n/a |
| Deep-sand texture variant | Poly Haven or ambientCG sand scan (second set) | CC0 | Tint/uniform shift on existing sand scan |

No URLs on purpose; locate, verify licence, and record in `ASSETS.md` at
install time.

## File structure (indicative)

- Create: `src/world/RegionMap.ts` — pure span derivation + `sampleAt(m)`
- Create: `src/data/regions.ts` — types, weights, lengths, effect tunables
- Modify: `src/machine/MachineMovement.ts` — terrain speed factor input
- Modify: `src/world/PropSpawner.ts` — region-driven density and prop sets
- Modify: `src/art/Fog.ts`, `src/art/Sky.ts` — storm uniforms
- Modify: `src/fx/SandFX.ts` — storm intensity
- Modify: `src/enemies/ThreatDirector.ts` — telegraph-distance modifier
- Create: `src/machine/RockStrikes.ts` — seeded strike schedule → Phase 1
  damage events
- Modify: `src/ui/` HUD — region banner
- Test: `tests/unit/regionmap.test.ts`, `tests/unit/rockstrikes.test.ts`,
  extensions to movement/director/propspawner suites

## Tasks (feature level — split into stepped tasks at the redesign pass)

- [ ] **Task 1: RegionMap.** Pure span derivation from seed; `sampleAt`
  with blend; authored-override API for Phase 13. Exhaustive unit tests:
  determinism, coverage (no gaps/overlaps), save/reload equivalence at
  arbitrary mid-region distances.
- [ ] **Task 2: Deep sand.** Speed factor into `MachineMovement` (unit
  tests extend the speed model suite), palette/texture shift, footfall
  audio variant. Harness: `drive.mjs` check that speed drops inside a
  forced deep-sand span and recovers after.
- [ ] **Task 3: Rock field.** Instanced boulders via `PropSpawner`; seeded
  `RockStrikes` schedule emitting Phase 1 damage events with lurch + audio
  telegraph. Unit tests for the schedule's determinism and speed scaling.
- [ ] **Task 4: Ruin field.** Dense prop set + salvage-density boost;
  spawn-cover hook for encounters. Harness screenshot check.
- [ ] **Task 5: Storm belt.** Fog/sun/FX modulation, telegraph-distance
  modifier in the director (unit-tested), lamp usefulness check in the
  browser harness.
- [ ] **Task 6: Region banner + audio.** HUD banner, per-region ambient
  audio beds via `SoundBank`.
- [ ] **Task 7: Integration.** Region overrides wired for the story
  schedule (consumed in Phase 13); README, docs, full suite + harnesses.

## Test strategy

Unit: everything about `RegionMap` (pure), strike schedules, speed factors,
telegraph modifiers. Harness: `drive.mjs` gains a forced-region query param
(`?region=deepsand` style, mirroring `?seed=`) so each region's mechanical
effect is provable without driving 3 km; screenshots for each region's look.

## Interfaces other phases rely on

- `RegionMap.sampleAt(distance)` and the override API — Phase 13 pins
  regions around destinations.
- Region-driven encounter cover — Phase 11 templates may weight by region.

## Assumptions about earlier phases (verify at redesign pass)

- Phase 1 damage accepts environmental (non-combat) damage events routed to
  subsystems.
- Phase 3 lamps exist and are cheap enough to run outdoors in storms.
- Phase 10 exposes throttle control (needed for rock-field speed choice) —
  if it does not, Task 3's speed scaling still works, the *choice* just
  arrives later.
