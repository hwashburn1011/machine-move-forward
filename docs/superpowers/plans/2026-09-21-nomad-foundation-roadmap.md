# Nomad foundations: scanner, salvage, space, and wrist terminal

Status: four foundation workstreams implemented in the local build. See the
[delivery and verification record](../../campaign/nomad-foundations-delivery.md)
for tested behavior, acceptance limits and publication status. The tasks below
preserve the design plan; they are not a claim that every release check has run.
Date: 2026-09-21. Requested by the user before continuing the optional-expedition,
machine-operations, and specialization work.

## Intended experience

The player reaches the Nomad, reels in an unmistakable cargo crate, completes a
few practical building objectives, makes and installs a scanner repair module,
and explicitly starts scanning. They have a calm period to build and get settled.
At 100%, the existing passing-ship battle starts after a short, visible delay.
The machine has more usable floor area and headroom. Its equipment reads clearly
through shape, materials, labels, and working indicators. A wrist terminal brings
routine inventory and machine management together without repeated station visits.

Exploration takes place above radioactive ground. There is no walk-on-sand route,
required ground pickup, protective suit, or ground-exploration unlock in this round.

## Decisions and assumptions

| Topic | Planning decision |
| --- | --- |
| Opening | Retain the rooftop escape and boarding of the Nomad. Interpose scanner onboarding after workbench construction; defer defense/skiff/repair until after the reveal while preserving their existing history. |
| Scanner/radio terminology | One existing communications/scanner assembly; “Scanner” describes reception and the repair objective, “Radio” describes messages. Do not introduce a second competing signal meter. |
| Calm opening | Suppress recurring threats and the old compulsory tutorial boarding while settling in and scanning. Keep later defense lessons available after the reveal. |
| Scan duration | Initial tuning target: 180 active, unpaused seconds after Start Scan; independent of travel speed. Verify pacing before release. |
| 100% event | A three-second countdown on a safe, active gameplay screen, then the existing ship battle and Revenant reveal. No defense-tutorial completion requirement. |
| Roomier layout | Delivered: 14 × 18 m core, 16 × 20 m supported perimeter and 3.6 m deck spacing. Blender and browser traversal checks cover the expanded stairs. |
| Wrist menus | Implemented with simulation paused while open, using the stated default. Closing releases only the terminal-owned pause. |
| Remote management | Routine management works anywhere aboard the connected machine; installed equipment, power, unlocks, costs, and storage capacity remain real requirements. |
| Physical controls | Helm steering/course commitment and manual fuel delivery remain physical. Field pickups, scanner installation, manual weapons, and hands-on repair holds remain physical in this iteration. |
| Art | Astra owns Blender modeling, materials, animation, and visual approval. Unreal may be used for an additional asset review; the shipped game remains the existing Three.js browser game. |

The menu pause policy uses the previously stated default; it is not recorded as
an explicit user selection. Physical placement resumes active simulation.

## Four foundation plans

1. [Build first, repair the scanner, then reveal the battle](2026-09-21-01-scanner-opening.md)
2. [Recognizable reel cargo and physical fuel handling](2026-09-21-02-salvage-fuel-readability.md)
3. [Roomier Nomad and complete onboard Blender refinement](2026-09-21-03-roomier-nomad-art.md)
4. [Wrist terminal, HUD, and remote routine management](2026-09-21-04-wrist-terminal-hud.md)

Plan 3 explicitly covers **all onboard prop families**, with interactable objects
first. It also establishes the art standard for the later specialization modules.

## Work already in progress

The working branch is `codex/expedition-operations-desert`, based on `77c4aef`.
It contains unfinished, uncommitted expedition rules, machine-operations views,
caretaker changes, and desert art. The last published release is not this working
tree. Preserve that work and unrelated local directories; do not reset, stage, or
publish everything as a shortcut.

The September 17 plan remains a reference for its existing transactions and test
requirements. This roadmap changes its ordering and presentation:

- Optional sites must become believable raised structures with connected safe
  walkways, rather than terrain excursions or boxes apparently resting on sand.
- The operations projection becomes a Machine page inside the wrist terminal.
  Do not finish a second, unrelated full-screen operations panel first.
- Current desert art improvements may continue as asset work once sources and
  exports are reconciled; they do not justify shipping unfinished site logic.
- Finish the existing reward-state, save-validation, and type-check issues before
  integrating those optional sites. Do not mistake old focused-test results for
  validation of the current dirty tree.

## Foundation and integration tasks

| ID | Owner | Work | Completion evidence |
| --- | --- | --- | --- |
| F-01 | Sol + Astra | Inventory changed files and classify completed, reusable, incomplete, and unrelated work; record an exact source/art baseline. Isolate reviewed commits without dropping local work. | A manifest of retained work and reproducible baseline, excluding unrelated dealer/VPC directories. |
| F-02 | Luna + Astra | Create representative isolated save fixtures: fresh Story/Survival, legacy signal at 100%, mid-campaign docked, three-deck base with full containers, L-12, and Keep Walking. | Readable exports and precise inventory/structure/progression comparison assertions; no changes to the user's browser saves. |
| F-03 | Astra | Establish a single release integration owner for `Game.ts`, save schema/codec, loading, and runtime asset registration. | Assigned file boundaries and dependency order; no concurrent edits to the same integration code. |
| F-04 | Sol | Check each plan against actual authority, resource, and save contracts. | Review catches duplicate reward authority, inaccessible physical actions, menu pause bypasses, and impossible geometry. |
| F-05 | Luna + Astra | Run focused tests per delivered subsystem; then full type check, lint, production build, unit suite, authored-asset checks, and relevant normal-input browser routes. | Current-source reports distinguish pass/fail, automation defects, and untested cases. |
| F-06 | Astra | Publish only a complete, tested milestone through a focused PR and verify the deployed game. | Commit, PR, CI/deployment result, and live-game smoke check; no claim that local work is already live. |

## Recommended delivery sequence

**Milestone A — opening clarity.** F-01/F-02, scanner tasks S-01–S-07, and first
cargo/fuel tasks C-01–C-05. The scanner sequence must be playable using current
menus before the terminal replaces their presentation. Keep the tutorial prompts
behind semantic actions so the later UI does not require another progression rewrite.

**Milestone B — room and object readability.** Freeze the measured layout,
author the roomier hull, migrate saved placements, and refine all prop families.
Start with greybox traversal, then detail; do not model obstructing finished rooms
before checking movement and the camera. Scanner/cargo assets from A share this art language.

**Milestone C — wrist terminal.** Agree the access and pause contracts first;
build the semantic shell, connect existing authorities, add the arm presentation,
then replace the scattered panel entry points. Bring in the existing operations
projection after it is corrected and tested. Avoid two separate pause systems.

**Milestone D — resume the three recommended features.** Only after A–C are
stable: raised exploration sites; complete operations/L-12 prioritization inside
the Machine page; substantial visible machine specialization modules.

Art can proceed alongside isolated logic tasks once scale and anchor contracts
are fixed. GPU/render/browser performance work runs serially. Use focused model
exports and retain only useful test profiles to avoid repeating the storage blocker.

## Follow-on feature tasks, explicitly deferred

| ID | Feature | Bounded next work and acceptance |
| --- | --- | --- |
| E-01 | Elevated exploration | Redesign depot as an upper service deck, convoy as connected tops of large wrecked carriers/service gantries, and relay as a raised maintenance platform. Visible columns/hulls explain their height. Every entry/task/reward/return path stays on valid floors. |
| E-02 | Safe connections | Align gangways to the new expedition gate; gate cannot open before a supported connection is ready. Prevent departure while player is off the Nomad. Use the pre-contact recovery rule from L-09 for every site, preserving its last safe raised-platform anchor. |
| E-03 | Site state and loot | Finish two-step tasks, enforce all completion/reward gates at RouteChart authority, validate imported saves, and preserve partial rewards and the current safe/broadcast reward caps. |
| E-04 | Site art and validation | Astra models the three sites in Blender; Luna verifies both directions, objective reach, full inventory, departure, legacy saves, and authored/fallback art. No mandatory jumping across a gap over sand. |
| O-01 | Operations | Finish the pure, correctly positioned three-deck equipment projection, deduplicated storage/work nodes, repair pins, and honest power/blocker descriptions; embed it in the terminal. |
| O-02 | L-12 | Add explicit work priorities with fallback work, no loss of in-flight jobs, and clear blocked-route/power feedback. Test real stair traversal in the expanded layout. |
| M-01 | Specialization design | Specify three capability-changing modules: heavy salvage recovery, reconnaissance, and an emergency defensive screen. Define power/weight/slot tradeoffs, useful rewards, and progression placement before balancing numbers. |
| M-02 | Specialization implementation | One capability at a time through existing build, power, damage, save, and resource authorities; no duplicate scanner progression or free loot collection. |
| M-03 | Specialization art | Astra authors each module to the same Blender standard as Plan 3: readable function, genuine state indicators, moving functional parts, service access, bounded collision, and optimized game export. |

## Shared acceptance boundaries

- New tutorial is completable using ordinary controls on both profiles; legacy
  campaigns do not lose progress, researched upgrades, fuel, structures, or items.
- Ground is inaccessible gameplay space, including during exploration and restores.
  Visual scenery on the sand never implies a reachable mission pickup.
  Replace the current four-second controllable stand-on-sand window with recovery
  before contact; do not merely relabel that existing behavior “radiation.”
- The terminal does not create items, heal for free, refuel remotely, steer the
  machine remotely, or make offline/dead stations function.
- More space must improve measured player, camera, enemy, and caretaker clearance.
  A larger rendering mesh over the original colliders does not satisfy the task.
- Medium-quality 60 FPS on the target midrange PC remains the design target.
  Report frame-time distributions and peak/memory behavior in matched scenes;
  do not turn a short average-FPS sample into a hardware guarantee.
- Validation includes the low-detail fallback path and missing-asset recovery.

## Staffing

Sol refines sequencing and reviews contracts. Luna subagents receive independent
logic/UI/test tasks with explicit file ownership. Astra owns integration, Blender
and material work, measured visual review, and release verification. Shared
`Game.ts`, save, and asset-cache edits are integrated by one owner after module
contracts stabilize. This document authorizes no claim of completed implementation.
