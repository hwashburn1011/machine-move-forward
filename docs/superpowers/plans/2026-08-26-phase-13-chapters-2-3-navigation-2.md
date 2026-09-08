# Phase 13 — Chapters 2 & 3, Navigation Tier 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two off-path story destinations that require the steering the story
granted, and navigation tier 2 (15–30° course changes) unlocked mid-act.

**Architecture:** Chapters 2 and 3 reuse Phase 9's destination framework
(radio signal → scheduled authored set-piece → journals → unique reward →
next lead) but place their destinations at lateral offsets the tier-1
steering cannot reach, making tier 2 the key that opens them. Navigation
tier 2 extends Phase 10's heading model with a wider authority and a simple
route view. Region overrides (Phase 12) pin the desert around each
destination to its story beat.

**Tech Stack:** Existing stack; destination content is authored TypeScript
set-piece definitions plus sourced models; narrative text lives in data
modules.

**Spec:** `docs/superpowers/specs/2026-08-26-roadmap-to-1.0.md` (Act IV,
Phase 13); handoff §34 (navigation tiers), §35 (world opportunities).

**Status:** PROVISIONAL — requires redesign pass after Act III ships, and a
dedicated *story* design pass (Phase 9 owns the premise; this plan marks all
narrative content DRAFT).

**Depends on:** Phase 8 (unlock system), Phase 9 (destination framework,
radio, Chapter 1), Phase 10 (navigation tier 1 heading model), Phase 12
(region overrides — soft dependency, degrade gracefully without it).

## Global Constraints

- The machine never moves; steering is expressed as lateral world drift and
  heading state, per Phase 10's model (assumed — see below).
- Story text is data, not literals in logic; all narrative here is DRAFT.
- Destinations are hand-authored but *scheduled deterministically*: same
  seed + same chapter state ⇒ same encounter, for saves and tests.
- Missable is acceptable for side POIs, never for chapters: a missed
  chapter destination re-offers after a cooldown distance (the signal
  repeats — Raft's model: the story waits).
- Every phase ships playable; save migration for chapter/navigation state.
- Assets CC0 preferred, CC-BY recorded in `ASSETS.md`; harnesses assetless.

## Design decisions (made now, revisit at redesign pass)

- **Tier 2 = authority, not autopilot.** Same fuel-cost/cooldown verbs as
  tier 1, wider limits (15–30° vs a few degrees) and a horizon *route view*
  (a strip map of known signals/POIs ahead, drawn from the schedule — not a
  world map). Course-holding stays manual; route planning is tier 3+
  (post-1.0 or Phase 14 if the ending needs it).
- **Off-path means committed.** Chapter destinations spawn at lateral
  offsets (~400–800 m) announced 2–3 km out. Reaching one costs sustained
  heading + fuel; the approach is the gameplay. Once within its corridor,
  the destination runs as Phase 9 does (assumed: machine slows to a crawl
  alongside; player crosses aboard; a return is always possible).
- **Bigger than Chapter 1.** Each is a multi-structure compound (3–5
  walkable structures vs Chapter 1's single wreck): authored layout,
  journals, one set-piece encounter using Phase 11 templates, one unique
  reward, and the next lead. Target: 20–30 minutes each.
- **DRAFT narrative shape** (subject to Phase 9's premise pass):
  - *Chapter 2 — the Relay.* A dead broadcast tower complex. Answers WHY
    THE ROUTE: the machine walks an old automated caravan line, and the
    signal the player follows is one node of it still alive. Reward:
    navigation tier 2 (the unlock is IN the story — recovered steering
    vanes / route tables). This ordering means Chapter 2 is reachable
    with tier 1 (nearer offset), and GRANTS the authority Chapter 3 needs.
  - *Chapter 3 — the Foundry.* A half-buried works that built machines
    like this one. Answers WHAT THE MACHINE IS, and points at what is at
    the end of the line (Phase 14's destination). Reward: a machine-scale
    component (heavy hardpoint or engine tier) plus the final signal.
- **Region staging.** Chapter 2 sits in a storm belt (radio through the
  static), Chapter 3 in a ruin field, via Phase 12 overrides. Without
  Phase 12, both sit in open dunes and nothing breaks.

## Open questions (recommended defaults in bold)

- Does the machine *stop* at destinations? **Crawl-alongside (Phase 9's
  assumed model); a true anchored stop only if Phase 9 already built it.**
  A stopped machine breaks the threat director's distance clock — needs
  that phase's answer, not this one's.
- Can the player permanently miss a chapter by refusing the heading?
  **No — the signal re-offers every N km until taken.**
- Do side POIs (Phase 10) also scale up here? **Only by reusing chapter
  compound pieces as smaller wrecks — no new side-content system.**
- Is tier 2 gated on Chapter 2 completion or purchasable via Phase 8
  unlocks too? **Story-granted only.** Navigation is the story's spine.

## Asset needs

| Need | Candidate source | Licence rule | Fallback |
| --- | --- | --- | --- |
| Broadcast tower / antenna structures | Kenney industrial kits; Quaternius (poly.pizza) | CC0 preferred | Procedural trusswork (the machine's own vocabulary) |
| Foundry / industrial compound pieces | Kenney industrial kits; Quaternius | CC0 preferred | Scaled container/wreck packs already installed |
| Journal / pickup prop | Existing prop packs or tiny procedural mesh | CC0 | Procedural |
| Chapter ambience & radio audio | Synthesised (`SoundBank`) — radio static, morse-like beacon | n/a | n/a |

No URLs on purpose; locate, verify licence, and record in `ASSETS.md` at
install time.

## File structure (indicative — reconcile with Phase 9's actual framework)

- Create: `src/story/chapters/chapter2.ts`, `chapter3.ts` — authored
  set-piece definitions, journal text (DRAFT), rewards, leads
- Modify: `src/story/DestinationManager.ts` (assumed Phase 9 name) —
  off-path offsets, re-offer cooldown
- Modify: `src/machine/Navigation.ts` (assumed Phase 10 name) — tier 2
  authority limits, fuel curve
- Create: `src/ui/RouteView.ts` — strip map of scheduled signals/POIs
- Modify: `src/data/progression.ts` — tier-2 unlock entry (story-granted)
- Modify: `src/save/SaveSchema.ts` + migration — chapter state, heading
- Test: `tests/unit/navigation.test.ts` (extend), `tests/unit/`
  destination-schedule determinism, re-offer arithmetic

## Tasks (feature level — split into stepped tasks at the redesign pass)

- [ ] **Task 1: Navigation tier 2.** Wider heading authority behind the
  story unlock; fuel/cooldown tuning; unit tests pin limits per tier and
  that tier 2 is unreachable without the Chapter 2 grant.
- [ ] **Task 2: Route view.** Strip-map UI over the deterministic signal/
  POI schedule; no world map. Harness screenshot check.
- [ ] **Task 3: Off-path destination support.** Lateral-offset spawning,
  approach corridor detection, re-offer cooldown in the destination
  framework. Unit tests for schedule determinism and re-offer.
- [ ] **Task 4: Chapter 2 — the Relay.** Compound layout, journals
  (DRAFT text), set-piece encounter, tier-2 grant, next lead; storm
  region override. Harness: scripted approach reaches the corridor and
  the grant fires.
- [ ] **Task 5: Chapter 3 — the Foundry.** Compound layout, journals
  (DRAFT), encounter, machine-component reward, final signal; ruin
  override. Harness as above.
- [ ] **Task 6: Save migration + docs.** Chapter/heading state versioned;
  README, `ASSETS.md`; full suite + harness pass; act-check play session.

## Test strategy

Unit: navigation authority per tier, unlock gating, destination schedule
determinism, re-offer arithmetic — pure logic. Harness: scripted runs that
take the heading, reach each corridor, and assert the chapter state machine
advances; screenshots of each compound; `?chapter=2` style boot param for
directly staging a chapter (mirrors `?seed=`).

## Interfaces other phases rely on

- The final signal + foundry reveal — Phase 14 opens from Chapter 3's end
  state.
- `RouteView` — Phase 14's arrival and Phase 15's onboarding reuse it.

## Assumptions about earlier phases (verify at redesign pass)

- Phase 9 ships a destination framework: scheduled authored set-pieces,
  crawl-alongside approach, journal pickups, reward grants, "next lead"
  chaining — and owns the premise this plan's narrative must be
  re-derived from.
- Phase 10 ships a heading model (lateral drift + fuel cost + cooldown)
  with tiered authority limits read from data.
- Phase 8's unlock system can hold story-granted (non-purchasable)
  entries.
- Phase 12's `RegionMap` override API exists (soft — degrade to open
  dunes).
