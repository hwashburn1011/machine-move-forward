# Machine Move Forward: five-priority delivery plan

Planned 2026-09-27; implementation updated 2026-09-28. Status: **all five workstreams have a playable implementation; automated and native acceptance passed within the documented test scope**. Scope: the native Godot game. The lead and three subagents implemented and refined shared UI/progression, construction, combat/recording and physical expeditions. Human acceptance and observation-dependent balance changes remain awaiting evidence. See the [implementation handoff](../../godot-port/five-priority-update.md) for controls, evidence and limits.

## What the player will get

| Priority | Deliverable | Task board | Tasks |
| --- | --- | --- | --- |
| 1 | A truthful next objective, optional destination markers, one pinned materials checklist and short contextual help. | [Objectives and first-hour guidance](2026-09-27-objective-guidance-tasks.md) | G01–G08 |
| 2 | Safe recent-build undo, copy blueprint, steadier snapping and clear material, clearance and power previews with controls visible during placement. | [Construction usability](2026-09-27-construction-usability-tasks.md) | B01–B10 |
| 3 | Readable armor/exposed-hit feedback, smoother reactions, dependable camera clearance and an evidence-based investigation of frame stalls. | [Combat and movement feel](2026-09-27-combat-movement-feel-tasks.md) | F01–F08 |
| 4 | A distinct physical operation at each major destination: Wake rotor release, Foundry gantry, Array alignment, Orchard access restoration and Meridian archive/transmitter work. | [Physical expeditions](2026-09-27-physical-expedition-tasks.md) | E01–E12 |
| 5 | Measured travel/build/fight/recovery pacing, recoverable resource budgets and useful opportunities after new equipment unlocks. | [Journey pacing and balance](2026-09-27-journey-pacing-balance-tasks.md) | P01–P09 |

There are **53 planned tasks**, including six shared integration/acceptance tasks below. F07 is conditional on finding a reproducible cause; a documented non-reproduction is a valid disposition, not a claimed fix. F09 is a separate optional combat-rule experiment and is excluded from the 53. S/M/L in the task boards describes relative scope; it is not a calendar estimate.

## Preserve the current game

- Keep the wrist personal. A checklist is information; workbench crafting, machine research, storage and equipment operation stay at their physical interfaces. Build remains a separate catalog that returns control immediately to placement.
- Preserve the 19 prepared checkpoints, inventory previews, campaign/playtest save separation, restart and return-to-campaign behavior. Existing player saves are compatibility inputs, never disposable test data.
- Preserve robot health/repair/fuel survival, L-12's companion role, existing story/reward order, both late routes and Meridian's ending. Optional crane, battery and quiet-drive equipment must remain optional.
- Required site progress uses reachable supported walkways and local controls. No compulsory sand walking, player-built site bridge, timed jump or newly required consumable.
- Keep the refined player/enemy assets and current damage, ammunition/reload, armor, movement and attack rules during the initial feel pass. Presentation changes must not silently rebalance combat.
- Preserve the heavily modified working tree. A baseline must include required untracked sources/assets and identify their hashes; a clean HEAD checkout does not represent the current build.

Existing snapping, enemy reactions, camera collision, console activities and encounter rules were extended. The [physical expedition report](../../godot-port/results/physical-expeditions.json) includes the updated checkpoint and local-interface regression. Historical test totals do not establish current performance or human playability.

## Delivery order and agent assignments

Use at most **one lead/integrator plus three workers**. Names below describe the planned capacity and handoffs. Implementation used one shared-file owner and three bounded workers, followed by independent code review and serialized native captures.

| Batch | Lead / integrator | Worker 1 | Worker 2 | Worker 3 | Exit criterion |
| --- | --- | --- | --- | --- | --- |
| 0: foundation | C01 current-tree/test manifest; C02 shared contracts | E01 site/geometry contract survey | Prepare G/B interfaces from inspected code | Prepare recorder/performance contracts | Required baseline can be reproduced; E01 accepted; C02 settled before gameplay edits |
| 1: first playable usability pass | Shared hooks, input/UI ownership and C03 initial migration integration | G01–G07, followed by G08 when observation is available | B01–B10 | P01, then F01/F02 and P02 baseline capture; E02 state/migration module after required captures | Guided opening and corrected construction work together; C03 accepted before G06; current baseline captured before changing measured behavior |
| 2: feel and first physical site | Maintain C03 migration coverage; serialize camera/main/UI edits | F03–F08 | E03–E04 Foundry prototype | P03 resource audit; independent E05 prototype review when ready | Foundry is playable and safe through save/load; feedback/camera acceptance passes; stalls have a supported disposition |
| 3: expedition expansion | Shared campaign/scene hooks; Meridian integration; independent review of Array | E06 Wake, then E10 fixtures after all site slices land | E07 Array, then E11 native review after E10 | E08 Orchard, then E09 Meridian | Five sites built; both late routes preserved; E10 fixtures and E11 native review complete |
| 4: pacing and combined validation | C04 integrated acceptance and checkpoint updates | P04 opening, P05 encounters, P06 unlock opportunities | P07 route/contact tuning, then P08 fixture/loadout changes | Independent review of affected G/B/F/E behavior | Changes pass affected suites, native review and save migration; tuning is linked to observations |
| 5: human acceptance and handoff | C05 uncoached campaign and C06 handoff | P09 trace/balance report | E12 challenge review and player guide | Independent regression review of fixes | Honest human results, final source-stamped evidence, remaining issues and ready-to-play instructions |

Batches describe capacity and handoffs, not permission gates or a requirement to keep three workers busy. A worker whose prerequisites are missing takes an independent ready task. Performance runs reserve the machine: no second game, renderer, Blender job or asset bake competes during timing. An active user play session is not silently closed to take a benchmark.

Capture F02/P02 baseline from a reproducible C01 source snapshot before merging changes that affect the measured route. Isolated implementation may proceed against frozen interfaces meanwhile. Human baseline/acceptance requires an actual participant; if unavailable, record it as awaiting evidence and continue other independent work. In particular, E02 does not depend on P02 and may proceed while a participant is being scheduled; this prevents the G06/C03 save work from waiting on unrelated human availability. Do not label agent-driven or accelerated runs uncoached human playtests.

### Original implementation queue (completed)

1. **C01 — Lead:** record current source/content hashes, working-tree inputs, engine/renderer configuration and available correctness evidence. Establish a reproducible local test baseline without resetting existing work.
2. **E01 — Expedition worker:** verify native site anchors, existing reward gates and permanent return routes. This bounded survey supplies the expedition fields needed by C02.
3. **C02 — Lead:** settle the interfaces and ownership rules below, incorporating E01. Drafts already in the task boards are inputs, not extra feature projects.
4. **G01 — Guidance worker:** implement the pure objective provider and replace stale station instructions, including the old wrist Signal wording.
5. **B01 → B02 — Construction worker:** record behavioral cases, then implement successful-operation receipts without exposing undo until its safety conditions are complete.
6. **P01 → F01/F02 → P02 — Measurement worker:** add bounded opt-in recording and capture the unchanged route/feel baseline. The lead integrates recorder hooks serially.

## Shared integration tasks

C03 owns migrations throughout delivery; accepting its initial framework does not exempt later additions from migration checks. Current dispositions:

| ID | 2026-09-28 disposition |
| --- | --- |
| C01 | Accepted: archived the dirty working sources and required untracked files, separate art hashes, configuration and isolated test roots. [Baseline metadata](../../godot-port/results/five-priority-baseline-2026-09-28.json). |
| C02 | Accepted: contracts below implemented; lead retained sole ownership of shared production files. Workers independently reviewed refund/use tracking, migration, impact attribution and encounter scheduling. |
| C03 | Technical checks pass: optional pin identity, old/partial physical activities, paired rewards, scan fraction migration, malformed input rejection and checkpoint isolation. Undo receipts remain ephemeral. Final evidence is linked in the handoff. |
| C04 | Accepted within tested scope: [609 final checks](../../godot-port/results/final-frozen-integration-2026-09-28.json) pass on matching start/end source, with no engine errors. Native UI, seven physical route variants and five paired stairs performance comparisons pass separately stamped reviews. Broader startup profiling and human acceptance remain explicit limits. |
| C05 | Awaiting evidence: no uncoached human opening or continuous campaign was observed in this implementation session. |
| C06 | Implementation handoff delivered with controls and task dispositions. Final human/balance acceptance remains dependent on C05, G08, E12 and P09. |

| ID | Deliverable and owner | Dependencies | Size | Acceptance |
| --- | --- | --- | --- | --- |
| C01 | Lead: current-tree manifest, baseline configuration and regression inventory | None | S | Capture changed/untracked required inputs, source/content hashes, Godot/render settings and baseline test results or reproduced pre-existing failures. Keep mutable runtime results outside baseline sources. Identify current campaign/checkpoint save roots and use separate test data. |
| C02 | Lead: freeze shared contracts, schema proposals and file ownership windows | C01, E01 | S | G/B/F/E/P agree stable IDs, source attribution, clocks, events, input priority, clearance authority and save boundaries. Each shared-file edit has exactly one active owner. No cyclic prerequisite or duplicate recorder/progression authority. |
| C03 | Lead: optional save fields, mechanism migration and common round-trip policy | C02, E02; G01/G03 provide pin IDs before their fields integrate | M | Preserve old/partial/current campaign and checkpoint saves, paired rewards and route grants; normalize into a temporary candidate before live mutation. Invalid state cannot partially apply. Pins store identity only; undo history is absent. Later P04 scan tuning supplies proportional migration cases through this same owner. |
| C04 | Lead plus independent reviewer: integrated checkpoint, native UI/traversal and regression acceptance | C03, G07, B10, F08, E11, P08 | L | All changed feature matrices pass together; both late routes and normal startup/continue work. Use actual walking/inputs for construction, menus and moving machinery; old saves retain progress. Record source hash, focused/full affected suites, native captures and performance evidence. Fix regressions before final campaign assessment. |
| C05 | Lead/playtest coordinator: uncoached human campaign acceptance | C04; incorporates G08, P09 and E12 observations | L | Observe at least one uninterrupted normal-speed campaign; supplement the alternate route and earlier first-time opening pilot. Record wrong-station visits, help requests, accidental placements, corrections, combat clarity, route/control confusion, waiting and resource pressure. No debug grants or narrator coaching. State sample size, limitations and unresolved findings explicitly. |
| C06 | Lead: implementation and playtest handoff | C05, P09, E12 and any regression checks needed by final fixes | S | Each task has status and linked evidence or explicit unresolved disposition. Deliver updated controls/checkpoint guide, accepted tuning, source/config hashes, save compatibility results and concise remaining issues. No unverified human/performance claim; no publishing or external rollout is part of this plan. |

C03 accepts E02's state/migration implementation before G06 and final E11 validation; it does not wait for E12 or C04. B10 adds regression coverage without creating a C03 prerequisite loop. P04/P07 are informed by early observations and E11; they do not wait for the final C05 review. C04 precedes P09/E12, whose observations are collected within C05's review session. If final observation produces a code/tuning fix, repeat its affected acceptance cases and the relevant observation rather than restarting every unrelated test.

## Shared contracts and file ownership

| Boundary | Authority and consumer | Integration rule |
| --- | --- | --- |
| Objectives and station requirements | G's pure semantic provider reads authoritative session/activity state | Rendering never awards items or updates story facts. Resolve world targets from stable IDs and current generation; no saved node references. |
| Cost, clearance and power | B's read-only placement report reuses real validation/payment/power rules; G consumes it | Final click revalidates. Preview cannot charge supplies, mutate power or create a temporary live part. Warning vs blocking error remains explicit. |
| Build history | B owns bounded ephemeral receipts with exact paid quantities and usage revisions | Only eligible exact-instance placement/move reversal; atomic refund preflight, no cascade, duplicate refund, free-piece receipt or whole-inventory rewind. |
| Damage feedback | F's authoritative result carries source, actual damage and impact classification | Damage runs once. Player/manual gun confirmation is distinct from automatic/world feedback; presentation RNG never consumes session RNG. |
| Expedition state | E owns mechanism transitions and reachable local action anchors; campaign remains reward authority | Local guarded interactions drive visible/collision changes. Existing step/value/done states and separately claimed paired rewards migrate safely. |
| Measurement | P01 owns one bounded opt-in local recorder; F adds test-only frame probes | Shared run/source/checkpoint IDs, clocks and committed-transaction events. Synthetic, checkpoint and normal campaign evidence remain distinguishable. |
| Save compatibility | Lead owns session/validator/checkpoint integration | Validate/normalize before live application; use actual campaign copies only in separate test roots. No feature creates its own incompatible migration pipeline. |
| Timing and tuning | P proposes evidence-backed config; lead changes authority and all consumers together | Scanner constants/text/validation/migration must agree. Director eligibility is shared; no duplicated protection rules or hidden gameplay changes in UI text. |

**Single-owner shared files:** `godot/scripts/main.gd`, `ui.gd`, `session.gd`, `save_validation.gd`, `controls.gd`, `player.gd`, `campaign.gd`, `combat.gd`, `journey.gd`, `playtest_checkpoints.gd`, shared terminal pages, runtime loading and common definitions/overrides. Feature task boards list requested edits; they are not permission for simultaneous writes. Reserve additional shared files as overlaps are discovered.

Workers own dedicated new modules/tests and assigned authored assets. For a shared file, provide a narrow proposed patch and test cases to the lead, or obtain an exclusive ownership window in the active task assignment. Integrate one window at a time. Avoid multiple agents rewriting a complete source file from different snapshots. Do not regenerate all native assets to alter one mechanism; retain source assets and a repeatable build/import path for new art.

Each implementation handoff must include task IDs, exact changed paths, accepted behavior, test commands/results, source/config hash, save implications and unresolved issues. The lead reviews the actual diff and merges the current behavior, not just the worker's summary. A separate worker reviews risky undo/refund, migration, moving-collider and feedback-attribution changes after implementation.

## Acceptance and evidence

### Automated correctness

Run each workstream's focused tests when its behavior lands. Select existing suites from changed authority paths, including controls/interactions, wrist/station separation, checkpoints, construction/traversal/workshop, power/inventory, story/expeditions and combat/boarding/camera. C01 records the actual available commands; obsolete fixtures must not be used to restore superseded behavior. At C04 run the combined affected set once, then repeat only when a change or unresolved failure justifies it.

Critical cases include: full bags and atomic undo refusal; used/damaged part ineligibility; dependent floor and occupied return route; remapped controls and no accidental fire after menu close; stale objective targets; paired reward partial saves; quit/load during machinery motion; both route variants; checkpoint restart and campaign restoration. Validate movement through real collision, not only teleporting the player or calling a puzzle method.

### Native presentation and performance

Review HUD/wrist/stations/build at the supported ordinary and 4:3 sizes, including large text and reduced motion. Use matching native captures for six enemy types, close equipment camera transitions and each expedition's controls, machinery and return route. Smooth animation must preserve collision and world state.

F02/F06/F07 define the performance protocol: current reproducible routes, source/config hashes, separate startup/steady and cold-process/warm samples, instrumentation overhead, p50/p95/p99/max and counts of long frames. A historical hitch is an investigation input, not an established diagnosis. A camera or art change cannot be called faster based only on headless timings or a favorable average. Compare final construction and expedition workloads too.

### Human experience

G08 targets a small first-time opening pilot when participants are available; C05 covers the continuous campaign. P09 and E12 use that same final recording and notes to avoid redundant full playthroughs. Checkpoint tests provide fast iteration but cannot prove resource balance or journey pacing. Human observations and unresolved questions remain visible even when automated checks pass.

Success means the player can identify and reach the next task, correct an ordinary building mistake, read combat feedback, complete each site's physical operation and recover from ordinary resource mistakes. Track these outcomes, then adjust timers/rewards from evidence. No fixed campaign length or improvement percentage is promised before measurement.

## Completion tracking

Keep task status with the owning board: **Planned → Ready → In progress → Review → Accepted**, or **Awaiting evidence** with the precise missing input. A documented conditional disposition is allowed for F07; F09 remains outside this delivery. Dependencies mean the named contract or completed task must be available before dependent integration, as specified in the detailed row.

Proposed evidence locations are `docs/godot-port/results/` for structured results/traces and `docs/godot-port/previews/` for native captures. Include the source revision/content hash in each report; test totals from different builds must not be added into a fabricated single pass. Task boards should link actual results as they exist, with no placeholder success claims.

These six task boards now track implementation as well as the original acceptance criteria. The playable delivery is documented in the handoff; observation-dependent tasks remain open rather than being counted as completed by scripted checkpoint runs.
