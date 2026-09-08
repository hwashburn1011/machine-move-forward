# Phase 14 — The Final Destination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** The last signal, a climactic arrival encounter that composes every
system in the game, an ending with credits, and a post-game "keep driving"
mode so the sandbox survives the credits.

**Architecture:** A `FinaleDirector` orchestrates the last chapter as a staged
state machine layered over the existing story/chapter system: it schedules the
worst terrain, hands the threat director a scripted encounter instead of its
budget pacing, autosaves a checkpoint at the point of no return, and hands off
to an `EndingSequence` (scripted arrival, ending scene, credits) that ends by
flipping the story-complete flag and resuming the sandbox under a post-game
threat profile.

**Tech Stack:** TypeScript, Three.js, Rapier, existing event bus, DOM UI.

**Spec:** `docs/superpowers/specs/2026-08-26-roadmap-to-1.0.md` (Act V,
Phase 14)

**Status:** PROVISIONAL — requires redesign pass after Act IV ships. Every
narrative specific below is DRAFT and subject to that phase's design pass.
Tasks are feature-level; file paths are indicative; interfaces to Act III/IV
systems are recorded as assumptions, not contracts.

**Depends on:** Phase 9 (radio/chapters/destinations), Phase 10 & 13
(navigation tiers), Phase 11 (enemy fleet), Phase 12 (terrain regions),
Phase 5 (turrets), Phase 1 (damage/repair).

## Global Constraints

- The machine never moves; the world scrolls past it.
- Fixed 60Hz simulation, typed event bus, stats live in `src/data/`.
- Art sourcing leans on free open-source web assets, MVP-scale, CC0 preferred,
  CC-BY recorded in `ASSETS.md`; procedural remains the fallback and loaders
  never reject.
- Every phase ships playable, with unit tests for deterministic logic and
  browser-harness proof for feel.
- Save schema stays versioned; any new fields arrive via migration.

## Assumptions about earlier phases (verify at redesign pass)

- **Story (Phase 9/13):** a `StoryDirector` exists with a chapter state
  machine, a radio device that surfaces signals, hand-authored destination
  content that can be scheduled into the chunk stream ahead of the machine,
  and journal/reward pickup plumbing. Chapter state persists in
  `progression` in the save.
- **Navigation (Phase 10/13):** a course-change API at tier 2 (15–30°) with
  fuel cost and cooldown, and a POI system that can mark a destination on
  the HUD/radar.
- **Threat director (Phase 11):** accepts a scripted encounter description
  (composition + timing) that overrides budget pacing for the duration, then
  returns control.
- **Terrain (Phase 12):** terrain regions are schedulable — the story can
  request a named region ahead instead of the procedural rotation.
- **Save (ongoing):** `progression.unlocks` and story fields exist. Story
  completion should ride Phase 8's unlock system as a `'story-complete'`
  unlock id rather than a parallel boolean — `Unlocks.has('story-complete')`
  wherever this plan says `progression.storyComplete` — so this phase likely
  needs no schema addition at all. Confirm at the redesign pass.

## Design decisions (DRAFT)

- The finale is **one continuous approach**, not a level change: the final
  destination appears on the horizon far out, the terrain worsens, and the
  assault happens while the machine is still walking. The game never cuts
  away until the arrival itself.
- **Point of no return is explicit and autosaved.** Entering the final
  approach writes a checkpoint save. Player death or core destruction during
  the finale reloads that checkpoint (handoff §37), never an older save.
- **The ending is short and in-engine.** Scripted arrival, a final journal
  beat, then DOM credits over a live camera shot. No pre-rendered video.
- **Post-game continues the same save.** After credits the sandbox resumes:
  the radio goes quiet, the threat director switches to a post-game profile
  (full encounter variety, no story gating), and the title screen's Continue
  loads back into the moving machine.

## Open questions (recommended defaults)

- What IS the destination, narratively? — decided in the Phase 9/13 design
  passes; this plan only requires "a hand-authored landmark the machine can
  arrive at." Default placeholder: the signal's source, a green refuge.
- Can the finale be failed out of fuel? — default: the final approach
  disables fuel starvation (the story grants a full tank) so the only
  failure modes are the §37 ones.
- Difficulty of the arrival gauntlet? — default: tuned to a machine that
  survived Act IV; god mode and F-keys remain for testing.

## Asset needs

| Need | Source (by name) | Licence rule | Note |
| --- | --- | --- | --- |
| Destination landmark kit | Reuse Phase 9/13 destination assets (Quaternius, Kenney via Poly Pizza) | CC0 preferred | No new sourcing if Act IV kit suffices |
| Ending music sting | Synthesised first per `ASSETS.md` audio policy; else a CC0 track from OpenGameArt or FreePD | CC0; CC-BY recorded | Full music pass is Phase 15 |
| Credits | DOM/CSS only | — | No asset |

## File structure (indicative)

- Create: `src/story/FinaleDirector.ts` — finale state machine
- Create: `src/story/EndingSequence.ts` — arrival script, camera, credits cue
- Create: `src/ui/CreditsUI.ts` + `src/ui/credits.css`
- Modify: `src/data/story.ts` (or Act III equivalent) — final chapter data
- Modify: `src/save/SaveSchema.ts` + `src/save/migrations/` — `storyComplete`
- Modify: threat director — scripted-encounter entry point (if Phase 11 did
  not already add it)
- Test: `tests/unit/finaledirector.test.ts`, migration tests; extend a
  browser harness for the finale boot

## Tasks

### Task 1: Redesign pass gate

- [ ] Re-brainstorm this phase against the shipped Act IV systems; update
      this plan's assumptions into real interfaces; get approval on the
      narrative specifics currently marked DRAFT.

### Task 2: Final chapter data and approach

- [ ] Add the final chapter to story data: last signal, destination
      definition, approach distance thresholds.
- [ ] Destination landmark visible on the horizon well before arrival
      (LOD/impostor at distance).
- [ ] Radio escalation beats on approach.
- [ ] Unit-test the chapter's threshold arithmetic; commit.

### Task 3: Finale state machine

- [ ] `FinaleDirector` states: `APPROACH → GAUNTLET → ARRIVAL → ENDING →
      POSTGAME`, driven by distance and encounter completion events.
- [ ] Point-of-no-return checkpoint autosave on entering `GAUNTLET`;
      death/core-loss during the finale reloads that checkpoint.
- [ ] Unit-test every transition and the checkpoint rule; commit.

### Task 4: The gauntlet

- [ ] Story-schedule the worst terrain region for the final approach
      (Phase 12 API).
- [ ] Hand the threat director a scripted staged assault (Phase 11 API):
      mixed vehicle classes, boarding attempt, telegraphed waves.
- [ ] Disable fuel starvation for the duration (per default above).
- [ ] Harness proof: boot into the gauntlet via debug action, assert the
      scripted waves arrive and control returns after; commit.

### Task 5: Arrival and ending sequence

- [ ] `EndingSequence`: player control handoff, scripted final walk-in,
      last journal/story beat, fade, credits roll over live camera.
- [ ] Credits content sourced from `ASSETS.md` attribution table plus
      project credits.
- [ ] Ending music sting per asset table.
- [ ] Skippable (hold-to-skip), same convention as the Phase 2 opening.
- [ ] Commit.

### Task 6: Post-game "keep driving" mode

- [ ] `progression.storyComplete` flag + save migration + migration test.
- [ ] Threat director post-game profile: full variety, story gating off.
- [ ] Radio behaviour post-story: quiet/ambient.
- [ ] Continue from title screen loads post-game state correctly
      (harness-check).
- [ ] Commit.

### Task 7: Debug and proof

- [ ] Debug action: jump to finale start (handoff §57 pattern, alongside
      F-keys).
- [ ] Full-run smoke: from a late-game save, play finale → credits →
      post-game without console errors (Playwright/harness).
- [ ] Commit.

## Interfaces other phases rely on

- **Phase 15 (release polish):** `progression.storyComplete` is part of the
  final locked save schema; the credits UI is reused from the title screen's
  "Credits" entry; the finale debug action must be behind the same debug
  gate Phase 15 introduces.
- **Post-game contract:** `FinaleDirector` emits `story:completed` on the
  event bus; the threat director owns its post-game profile and the radio
  owns its quiet mode — both react to that event rather than being driven
  frame-by-frame by the finale. Anything post-1.0 (new chapters) re-arms the
  radio by clearing nothing — expansion chapters key off their own flags,
  `storyComplete` stays true forever once earned.
