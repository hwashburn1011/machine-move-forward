# Continuity and smoothness implementation tasks

Status: in progress. This task list implements the adjacent
[`continuity-and-smoothness contract`](./2026-09-15-continuity-and-smoothness-contract.md).
The acceptance criteria below remain the original contract. Current evidence is
tracked in the [delivery record](../../campaign/continuity-and-smoothness-delivery.md).

| Task | Current result |
| --- | --- |
| STAIR-01 | Measured adhesion/slope failure; repaired misplaced Blender workbench support and rebuilt matching collision |
| STAIR-02 | Implemented measured portals, live station exclusion, bounded cache, segment clearance and in-cell destination checks |
| STAIR-03 | Authored Game transfer/follow/relocation fixture 8/8; interruption regression 15/15; 24 directional/cadence cases plus 100 physical crossings pass on final source |
| PERF-01 | Corrected actual-frame warm-up; 3 warmed main samples median 59.00 FPS at 1080p Medium, eight enemies |
| PERF-02 | No production enemy optimization justified by the corrected baseline; combat and quality unchanged |
| PERF-03 | Three alternating Medium pairs plus Low/High samples collected; candidate median 59.12 FPS with unfavorable variability; improvement and repeatable startup remain open |
| FLOW-01 | Interaction audit written; normal opening/salvage/save actions mapped and exercised |
| FLOW-02 | Incremental persistent-profile runners implemented; cold restart and real building/crafting/turret entry pass through tutorial boarding start |
| FLOW-03 | Opening-owned pursuer cleanup fixed an observed saving blocker; full Story lineage through ending remains incomplete |
| FLOW-04 | Not yet run; no duration or Survival-completion claim |
| VAL-01 | 1,457 tests / 163 files pass; lint, TypeScript and production build pass; Sol source/evidence review passed; PR #16 merged at 6487abd; CI/Pages deployment and live asset hash pass; full campaign and performance targets remain open |

Root took ownership of final navigation clearance/connector integration after
the initial Luna implementation. Luna retained the movement tests and Game QA
harnesses. The matrix below records the original planned division of work.

## Ownership and sequencing

| Owner | Files and responsibility |
| --- | --- |
| Root | Machine/ramp measurement, collider or authored-art correction, Game/shared integration, renderer/art changes, final browser runs and release evidence |
| Luna `build_foundation` | `src/companion/CaretakerNavigation.ts`, `src/companion/CaretakerActor.ts`, focused caretaker tests after STAIR-01 freezes measurements |
| Luna `controls_camera` | Crowd profiler and measured narrow optimizations in explicitly handed-off files; no balance or Game changes without root handoff |
| Sol | Campaign interaction audit, runner design/implementation when assigned, correctness review and acceptance-accounting review |

Workers do not edit another row's files without an explicit handoff. Run GPU
browser work serially with root.

## STAIR-01 — measure the two real stair passages

**Owner:** root.

Instrument the current Game/Machine and record both fixed links in both
directions. Capture local and posed landing coordinates, ramp centerline,
clearance, slope, capsule contacts and blocking collider IDs. Step the fixture
in production order: Game/Machine fixed update, caretaker movement, Rapier
step, then render interpolation as applicable. Compare stationary and walking
machine poses.

If collision disagrees with the visible passage, correct the smallest Machine
geometry/collider boundary and rerun existing player/enemy stair checks. Freeze
the measured portal points or derivation API for STAIR-02.

**Acceptance:** evidence identifies why the present actor fails; all four
directions have finite clear portal samples or an explicit collider correction;
the fixture cannot repeat stale `carryFor` deltas; player/enemy/build behavior
does not regress.

## STAIR-02 — expand fixed links into caretaker portals

**Owner:** Luna `build_foundation`, after STAIR-01.

Derive directed portal sequences from the frozen Machine measurement. Extend
the caretaker's filtered graph routing so a cross-level route contains the
ordinary source path, every ordered portal point, and the ordinary target path.
Keep live station exclusion, clearance sampling, bounded route caching and the
safe null result when any segment is unavailable.

**Acceptance:** pure tests cover both links/directions, malformed links,
occupied landings, stations adjacent to an entry, moving machine transforms,
same-level routes and cache invalidation. No route jumps from one landing cell
to another, crosses a station, or applies a pose twice.

## STAIR-03 — committed physical portal traversal

**Owner:** Luna `build_foundation`; root integrates and runs the real fixture.

Teach `CaretakerActor` to retain portal traversal state once it enters a ramp.
Follow ordered centerline points with bounded steering; replan only outside the
portal. Stop safely if blocked. Preserve gravity, deck carry, wheel animation,
controller disposal and the existing actual-arrival job gate.

**Acceptance:** focused actor tests cover entry/exit, obstruction, route-version
change, null route, cancellation and reset. Root's real Game fixture then proves
ascent/descent on both ramps while stationary and walking, cross-deck follow and
one exact cross-deck resource transfer. Run 100 traversals with stable resource,
controller, body, collider and cache counts. Remove the same-deck disclaimer
only after physical proof passes.

## PERF-01 — freeze a reproducible crowd baseline

**Owner:** Luna `controls_camera`.

Build a same-process profiler using one saved scene, deterministic seed, camera
path, eight-enemy roster, build layout, warm-up and sample duration. Record the
contract metrics and perform isolated ablations without changing production
behavior. Separate render, fixed simulation, physics/controller, raycast,
enemy-visual/mixer, shadow and authoritative-pose costs as far as the runtime
permits.

**Acceptance:** rerunning the baseline three times produces comparable actor and
scene counts; each ablation changes only the named subsystem; raw JSON includes
backend/build hash and retains unfavorable samples. Return a ranked cost table
before requesting production ownership.

## PERF-02 — implement only measured narrow wins

**Owner:** Luna `controls_camera` for assigned files; root for shared renderer,
Game and art integration.

Implement the smallest changes supported by PERF-01. Candidate classes include
redundant hierarchy updates, distant visual mixer/shadow cadence and repeated
queries. Preserve fixed-step AI/combat and force immediate visual refresh for
player-visible state changes. Do not reduce enemy count, damage, navigation or
the selected quality preset.

**Acceptance:** focused tests compare shot times, damage, state transitions,
muzzle positions, spawn/death/reset and pooled reuse with the baseline. No
per-frame allocation growth or late shader compilation is introduced.

## PERF-03 — paired hardware acceptance

**Owner:** root.

Run three warmed baseline/candidate pairs at 1920x1080 Medium on the declared
reference machine, plus Low/High sanity samples and a 100-cycle enemy soak.

**Acceptance:** crowd median target at least 55 FPS, materially fewer frames
above 25 ms, no candidate-attributable frame above 50 ms, and no regression in
deck/rapid-look scenes or authoritative combat. Publish all samples and scope
claims to the measured hardware.

## FLOW-01 — audit the actual campaign interaction surface

**Owner:** Sol.

Map every required action from fresh New Game to Keep Walking to its normal DOM
or input path in `Game`, TitleScreen, RadioUI, ExpeditionUI, HelmUI, build,
crafting, interaction and SaveManager. Record the durable observable used to
confirm each step. Identify travel-only spans that can be accelerated by
running real fixed steps without assigning state.

**Acceptance:** the map contains no direct StoryDirector, inventory, resource,
distance or encounter mutation. It lists safe checkpoints and recovery routes
for opening, raids, each expedition, death, final commitment and post-ending.

## FLOW-02 — implement a resumable fresh-profile runner

**Owner:** Sol when handed implementation; root owns any narrow production fix.

Create a campaign acceptance tool under `tools/campaign/` using a fresh isolated
browser profile. Drive real UI, bindings and interactions. Accelerate only
travel by executing authoritative fixed steps faster than wall time or reducing
render frequency. Keep combat and interiors at normal fixed-step cadence. Save
through Game, quit, and resume through Continue. Persist append-only runner
evidence after each durable checkpoint and failure.

**Acceptance:** the tool refuses to proceed if a required fact/resource appears
without an observed authoritative action; reports console/page errors and last
state on failure; and distinguishes simulated time, rendered time and wall time.
No helper writes campaign phase, facts, inventory, resources, distance or health.

## FLOW-03 — Story continuity run and observed fixes

**Owner:** root runs; Sol diagnoses/reviews.

Complete one fresh Story profile from opening through peaceful Meridian and
Keep Walking. Exercise save/quit/Continue while traveling, docked, between
chapters, after a recoverable death and after the ending. Use both ordinary
building/crafting and representative infantry/vehicle combat.

For each blocker, preserve the failing evidence, fix the owning production
system narrowly, add a focused regression and restart from the most recent
real save rather than seeding past it.

**Acceptance:** one coherent save lineage reaches Keep Walking with exact facts,
uniques and resource conservation. The report includes observed simulated and
wall time and does not call accelerated travel manual play.

## FLOW-04 — Survival continuity and duration estimate

**Owner:** root runs; Sol reviews.

Start a separate fresh Survival profile. Prove finite rifle/shotgun depletion,
matching-ammo crafting and reload conservation, representative raid/vehicle
combat, death recovery, one complete expedition and a save/Continue boundary.
Continue to Meridian if the run is tractable; otherwise record the exact tested
boundary and why.

**Acceptance:** no Story infinite-reserve behavior appears; no resources or ammo
are injected; recovery advice remains actionable. Combine measured travel,
combat, build and interaction times into an explicit unaccelerated campaign
estimate with assumptions. Do not claim 8–15 hours from simulation distance
alone.

## VAL-01 — release accounting

**Owner:** Sol review; root publishes.

Run focused and full unit tests, lint, TypeScript and production build after the
three tracks settle. Link raw stair, performance and campaign evidence from the
delivery record. State which checks are synthetic, real-physics, accelerated,
normal-input, hardware-local and manually observed.

**Acceptance:** no tracked report describes a graph-only stair result as
physical traversal, a single frame sample as a guarantee, or a fixture-seeded
chapter as an uninterrupted campaign. Existing peaceful-ending, save and combat
regressions remain green.
