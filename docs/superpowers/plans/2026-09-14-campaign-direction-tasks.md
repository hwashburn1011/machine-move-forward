# Full campaign direction — next iteration tasks

Implementation backlog for the direction in
[`2026-09-14-campaign-direction.md`](2026-09-14-campaign-direction.md). Base is
main `b8ccafb`. Checkmarks belong in a later execution record backed by tests and
runtime evidence.

## Work and ownership rules

- Root freezes shared contracts, owns `Game.ts`, events, save schema/migration,
  input/menu integration, visual/audio assets and final runtime wiring.
- **Luna navigation** owns new pure course/projection modules, new Helm UI files
  and focused tests. It does not edit world, story, save or `Game.ts`.
- **Luna story** owns `StoryDirector.ts`, `src/data/story.ts`, destination data
  validation, narrative copy and focused tests. It does not edit `Destination`,
  Game, save, UI or world movement.
- **Luna chart** owns a pure chart/discovery controller, contact data and focused
  tests. It does not award inventory, mutate story, spawn destinations or edit
  Game/save/UI.
- Root owns all world-coordinate work plus `Game.ts`, save, Radio/HUD/Chart UI,
  CSS and art. Luna story may own `Destination.ts` and `ExpeditionUI.ts` within
  its disjoint window after the definition contract freezes.
- Sol reviews contracts, state transitions, coordinate math, migration and
  acceptance evidence. Preserve unrelated `dealer-agent-readiness/`,
  `dealer-signal-work/` and `docs/vpc-mvp/`.
- All simulation timers use fixed time. Deterministic systems take an explicit
  seed. No worker starts Blender or browser/GPU acceptance while root owns those
  resources.

## DIR-01 — Freeze navigation and projection contracts

**Owner:** root with Sol review. **Files:** shared type declarations and these
plans only until accepted.

Define:

```ts
type NavigationTier = 0 | 1 | 2 | 3;
interface CourseSave {
  tier: NavigationTier; bearingDeg: number; desiredDeg: number;
  throttle: number; lateralM: number;
}
interface CourseSnapshot extends CourseSave {
  maxBearingDeg: number;
  turnRateDegPerS: number;
  helmPowered: boolean;
}
interface TravelDelta { forwardM: number; lateralM: number }

course.setDesiredBearing(degrees: number, context: HelmContext): CourseResult
course.setThrottle(value: number, context: HelmContext): CourseResult
course.holdCourse(context: HelmContext): CourseResult
course.fixedUpdate(dt: number, forwardDeltaM: number): TravelDelta
course.restore(raw: unknown, earnedTier: NavigationTier): void
```

Bearing zero must reproduce current world coordinates exactly. Positive/negative
signs, degrees/radians conversion, course frame origin and save/load rounding are
pinned by tests before integration. The controller clamps desired and current
bearing to the earned tier and rate-limits turns. It never moves the player,
machine root or deck colliders.

**Acceptance:** 30/60/144 render schedules produce identical fixed-step course
state; old/malformed saves settle to zero; power loss and pause cannot create a
jump; reversing sign mirrors lateral displacement; tier limits are 0°, 12°,
28° and final-route-only respectively.

## DIR-02 — Pure course controller

**Owner:** Luna navigation. **Create:** `src/navigation/CourseController.ts` and
focused tests.

Implement DIR-01 without Three.js scene ownership. Accumulate world travel using
the authoritative machine distance delta once per fixed tick. Provide pure
helpers for projecting a route-relative `{forwardM, lateralM}` contact into the
current streamed-world frame and computing intercept distance/fuel estimates.
Reject NaN, infinity, unknown tiers and backward distance.

**Acceptance:** exact zero-bearing compatibility, deterministic restore, bounded
turn rate and projection round trips. No gameplay balance, fuel or story imports.

## DIR-03 — World and encounter projection

**Owner:** root. **Files:** `WorldManager.ts`, `TerrainChunk.ts`, `DuneField.ts`,
`DesertScenery`, salvage/tracks/ground-query call sites, `Game.ts`, destination
and threat wiring. Luna supplies pure projection math only.

Apply one course frame to terrain chunks, props, desert scenery, salvage, tracks,
ground samples and detached destination placement. Attached boarding ships, the
deck and its physics stay in machine space. Preserve current -Z forward
convention and reset recycled content from canonical coordinates before
projection so transforms do not accumulate. Nav graphs, physics bodies, visuals
and interactables must use the same projected pose during a fixed tick. Lock
bearing changes while a destination is docked. Define a bounded lateral envelope
with recentering or a visible clamp before the finite terrain X band is reached.

**Acceptance:** bearing zero matches main; ±12° produces mirrored contacts;
player-to-interactable and enemy path targets coincide with visuals; boarding on
both sides, stairs, relocation, demolition and save/load still pass. A
100-course-change/reset cycle has stable physics and scene counts.

## DIR-04 — Helm interaction and earned tier

**Owner:** root. **Files:** `Game.ts`, input bindings/types if required, machine
interaction view, save schema and focused integration tests.

Expose hold-left/hold-right and center-course only while using the powered helm.
Keep ordinary movement bindings unchanged. Course Gyro retains route-selection
authority; Quiet Array's `course-actuator` grants tier 1 exactly once and Glass
Orchard later grants tier 2. Existing Foundry direct/detour cards
remain authored route commitments rather than being replaced by raw steering.
Show current/desired bearing, authority limit, power refusal and fuel forecast.

Persist optional course state and validate it against durable story uniques.
Old saves with the current placeholder `navigationTier` must load at the tier
their recovered uniques justify, with zero bearing. Save remains unavailable
during the existing unsafe states.

**Acceptance:** actual held input changes bearing only at the helm; release holds
course; unpowered/paused/menu input does nothing; save/load resumes without a
world jump; remaps and pointer lock remain correct.

## MER-01 — Generalize expedition definitions

**Owner:** Luna story for data/types; root for `Destination.ts` consumption.

Replace substring-derived unique identity with explicit interactable `factId`.
Add explicit local bounds, model ID and completion requirements to each
definition. Extend the typed IDs without weakening validation to arbitrary
strings. Preserve Wreck One and Relay Foundry serialized IDs and projections.

**Acceptance:** old definitions serialize byte-for-byte equivalent campaign
facts; all anchors, facts and requirements validate; unknown saved IDs are
ignored safely; configure/reset cycles do not leak colliders or model resources.

## MER-02 -- Quiet Array state and narrative

**Owner:** Luna story. **Files:** `StoryDirector.ts`, `src/data/story.ts`, a
dedicated narrative data file if useful, focused tests.

Add the optional post-Chapter-One lead, approach, docked exploration, departure
and completion states for Quiet Array. The destination lies on the automatic
line and requires no manual steering. Required recoveries are
`course-actuator` and `annika-archive-shard`. Calibration journals gate the
actuator interaction; this is story comprehension at the station, not an
unrelated inventory collection quest. Journals establish that civilian
route keepers and an S-series intelligence concealed human records from the
Custodian network. Keep prose in data.

After Foundry completion, `beginNextExpedition(context)` offers a 950 m Quiet
Array approach and re-offers until accepted. Completion grants tier 1 once, records the
archive fact, produces one milestone event and returns to recurring survival.
Reload never replays rewards, journals or encounter requests.

**Acceptance:** exhaustive pure transitions; decline/re-offer; invalid power,
enemy, location and build-conflict refusals; every stable phase round-trips; old
format-2 saves retain their exact Chapter One state. The campaign format changes
only if optional fields cannot express the new active expedition safely.

## MER-03 — Destination layout, encounter and presentation

**Owner:** root. **Files:** destination integration, authored model/Blender
source, encounter data, Game/UI/audio wiring and runtime harness.

Build one recognizable observatory/route station at root X 17 with a 9 x 10 m
floor half-extent and gangway at local X -9.5. Authored anchors are
`CourseActuator` (3,1,6), `AnnikaArchive` (-3,1.2,-6), `JournalPort`
(-5,1.2,-3), `JournalStarboard` (6,1.2,0) and `JournalArchive` (0,1.3,3).
Use a readable entry/exit and a bounded Custodian ambush.
Reuse the existing enemy pool and tactics. Add radio approach/arrival/completion
cues and distinct ambience without blocking boot when audio or models are off.

**Acceptance:** the automatic line reaches the intercept corridor; the destination
docks, all geometry and interaction anchors agree, both facts can be recovered,
the player can always return, completion grants tier 1, and later raids resume.
Capture approach, interior, reward and departure at target quality.

## CHT-01 — Freeze chart/contact contracts

**Owner:** root with Sol review.

```ts
type ContactState = 'unknown' | 'detected' | 'identified' | 'committed' | 'visited' | 'missed';
interface RouteContact {
  id: string;
  kind: 'story' | 'water-cache' | 'salvage-wreck' | 'memorial';
  forwardM: number;
  lateralM: number;
  confidence: number;
  hazard: 'calm' | 'uncertain' | 'hostile';
  recurring: boolean;
}
interface ChartSave { discovered: string[]; visited: string[]; missed: string[] }

chart.observe(input: RadioObservation): readonly ChartEffect[]
chart.preview(id: string, course: CourseSnapshot): InterceptPreview
chart.commit(id: string, context: CommitContext): ChartResult
chart.fixedUpdate(travel: TravelDelta): readonly ChartEffect[]
```

Effects announce detection, identification, expiry and requested destination;
they never mutate resources, story or scene objects. Stable IDs derive from seed
and schedule slot, not array position.

## CHT-02 — Deterministic contacts and three opportunities

**Owner:** Luna chart. **Create:** `src/navigation/RouteChart.ts`, contact data
and focused tests.

Generate a bounded forward window with at most one active optional contact plus
the current story lead. Implement water cache, salvage wreck and memorial
templates. Story contacts recur; optional contacts may expire only after their
clearly exposed window passes. Seed and saved facts reproduce the same schedule.

Rewards are declarative requests: water cache requests a bounded water stack,
salvage requests bounded ordinary materials and may request an existing enemy
composition, memorial requests one journal fact. Root performs all mutations
through existing authorities after revalidation.

**Acceptance:** deterministic schedules, no duplicate rewards, exact expiry
boundaries, one active optional site, story priority without erasing the optional
site, malformed save filtering and 1,000 schedule steps with bounded memory.

## CHT-03 — Chart UI and discovery integration

**Owner:** root. **Files:** new `RouteChartUI.ts`/CSS, Radio/helm entry points,
Game/save integration and browser tests.

Create a readable forward strip with contact name/type, bearing, confidence,
distance, estimated fuel, hazard and expiry/re-offer language. Preview is free;
commit requires powered helm, safe world and a reachable bearing. Use the common
panel lifecycle and effective remapped controls. HUD shows only the committed
contact and immediate course correction.

**Acceptance:** keyboard/mouse can open, inspect, preview, confirm and cancel;
focus/pause/pointer lock are correct; denial text states the real reason; 100%
and 200% UI scale remain readable at 1280×720 and 1600×900; labels never expose
raw IDs.

## CHT-04 — Opportunity runtime proof

**Owner:** root.

Instantiate each template through the generalized destination seam. Revalidate
reward capacity at interaction, deposit only the actual accepted amount and
record visited only after the interaction succeeds. Reset/load/cancel removes
transient bodies and markers without granting rewards.

**Acceptance:** reach all three through real course control; collect a partial
water/material reward with conservation; read the memorial; reject duplicate
interaction; miss an optional site and see the chart update; save/load before
commit, during safe docking and after visit.

## POL-01 — Cohesion pass for this iteration

**Owner:** root.

Add final authored art, radio/helm/chart sounds, objective copy, control prompts
and accessibility styling only after mechanics freeze. Reuse cached materials and
pooled markers. Add quality fallbacks for models/audio disabled.

**Acceptance:** no raw IDs, silent controls or invisible interactables; volume
sliders affect new sounds; screenshots show bearing and consequence clearly;
model/audio failures retain functional fallback presentation.

## VAL-01 — Release evidence

**Owner:** root runs; Sol reviews.

- Unit tests: course math/clock/restore, story transitions/migration, schedule
  determinism, reward idempotence and data validation.
- Real browser: reach Quiet Array from an old and new profile, earn tier 1,
  steer both directions, complete/reload it, visit all three opportunities, and
  verify actual UI/input/pointer-lock flows.
- Compatibility: opening, crossfire, Chapter One both routes, boarding both
  sides, hook cutting, build relocation/demolition, stairs and post-chapter raids.
- Soak: 100 mixed course/contact/destination/save cycles with stable bodies,
  colliders, scene objects, materials, containers and resources.
- Performance: representative deck, active steering, destination and eight-enemy
  samples at High 1600×900 on RTX 3070; compare against the accepted Chapter One
  baseline and investigate repeatable regressions.
- Save fixtures: pre-feature version 1, every current Chapter One phase, each new
  stable Meridian phase, committed optional contact, visited facts and malformed
  optional fields.

The iteration is complete only when the course reward changes real play, Quiet
Array reaches a durable milestone, chart opportunities form a repeatable calm
travel loop, all compatibility gates pass, and the evidence distinguishes pure
tests, fixture-shortened browser runs and manual play.

## Execution record — September 14, 2026

Sol refined and reviewed this iteration; Luna implemented bounded navigation, UI, story and test tasks. Root integrated gameplay, fixed migration/reward/projection edge cases and authored all four Blender models. Sol supplied the final course-band, chart and planted-foot correctness refinements.

| Tasks | Delivered behavior / remaining scope |
| --- | --- |
| DIR-01–04 | Earned tier-one course control, ±12° bearing, 35–100% throttle, turn-rate integration, power/safety gates, canonical lateral travel across three recycled world bands, saved control state authorized by recovered facts, and a stable Helm UI. Higher tiers remain planned. |
| MER-01–02 | Explicit interaction facts, generalized destination definitions, optional post-Foundry Quiet Array, two calibration logs gating the actuator, independent ANNIKA archive, durable completion and continued raids. |
| MER-03 | Original authored station, physical gangway, collision/interaction anchors and first steering reward. This iteration deliberately delivers a peaceful archive visit; the proposed special ambush and unique ambient audio were not implemented. |
| CHT-01–04 | Deterministic bounded contacts, physical water/salvage/memorial sites, powered safe Plot/cancel guidance, exact partially accepted rewards, memorial journal and save/load. Salvage uses ordinary patrol risk, with no bespoke contact ambush. The chart is integrated into HelmUI rather than a separate RouteChartUI class. |
| POL-01 | Original PBR art, material/texture reuse, matching procedural fallbacks, readable objectives, departure warning and journal presentation. Dedicated new radio/helm sound assets remain a polish follow-up. |
| VAL-01 | 35 campaign runtime checks, six visual/movement checks, 52 existing chapter/tactics regression checks, unit/type/build/lint checks and Sol correctness review. Evidence is linked from docs/campaign. |

The local 20-second 1080p medium camera-motion sample held about 60 FPS. It does not substitute for the proposed eight-enemy high-quality benchmark or an uninterrupted manual campaign playthrough. Browser fixtures shortened initial story setup; both optional approach directions then advanced through real fixed steps. One hundred reuse cycles kept measured scene and physics counts stable.

The release closes this iteration's steering, Quiet Array and repeatable discovery work. Glass Orchard, wider earned steering, expanded chill/building activity and Last Garden remain future work under the full-game goal.
