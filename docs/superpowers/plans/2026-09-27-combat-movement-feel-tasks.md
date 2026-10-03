# Combat, movement presentation and frame-stall tasks

Status: implemented presentation/recorder pass and attributed stairs first-use fix with bounded native evidence, 28 September 2026. Detailed task dispositions distinguish completed correctness/performance acceptance from unresolved startup costs and human evidence. This is workstream 3 of the five-priority improvement plan.

Parent: [five-priority delivery plan](2026-09-27-five-priority-delivery-plan.md).

## Execution disposition — 28 September 2026

Evidence: [implementation and review](../../godot-port/combat-feel-and-recording.md), [source hashes/results](../../godot-port/results/combat-feel-2026-09-28.json). Task checklists below retain the original broader acceptance protocol; this table records what was actually delivered.

| Task | Status | Evidence / remaining boundary |
| --- | --- | --- |
| F01 | Accepted | Source-attributed detached results; single damage authority; 42 unchanged enemy replay checks plus focused armor/falloff/exposure/protection/zero/dead-zone cases. No save migration or combat-rule change. |
| F02 | Bounded baseline and matched recording samples complete | Five preserved-source samples plus nine combined-source native samples, including three alternating recorder OFF/ON pairs and ordinary autosave/construction/Foundry workloads. Full broader route/cold-cache/Continue matrix and fine callback-stamp overhead remain outside measured scope. |
| F03 | Accepted | Player/manual-gun confirmation only, automatic/world feedback separated, one pellet summary; 18 focused checks and 31 real-input native checks. |
| F04 | Review complete for implementation | Layered directional response, distinct restrained impacts/sounds; six-enemy ready/impact/recovered captures; animation/audio/weapon regressions pass. Human listening/feel judgment remains C05. |
| F05 | Accepted within tested scope | 55 camera and 68 canopy checks; 55 native camera checks. No reproduced controller defect, so movement/collision rules preserved. Wrist mount intrusion corrected by lead; construction reviewer subsequently passed 45 wrist and 21 construction/UI native checks. |
| F06 | Bounded travel non-reproduction; stairs first-use attributed | Historical steady-travel stalls not reproduced. Three first-stairs outliers aligned with uncached selection; split probe isolated 76.662 ms resource load versus less than 0.1 ms instantiation/overrides/cached selection. Initial checkpoint frames remain unattributed. |
| F07 | Narrow attributed fix accepted | Stairs joins existing asynchronous title queue; immediate cold loads drain original outstanding preparation owners safely. Loader 40, integration 109 and checkpoints 290 pass cleanly. Five alternating same-source causal-control/production pairs pass: selection 77.315–85.183 ms → 0.074–0.339 ms; production steady maxima 18.845–24.617 ms, with no frame over 25 ms after first five seconds. Earlier title residency/loading costs are explicit; no general FPS or historical travel-hitch claim. |
| F08 | Automated/native evidence delivered; C05 pending | 546 checks across 11 focused headless suites and 149 native checks; earlier independent C04 subset passes 517 with explicitly post-run hash. Final canonical combined report passes 609 checks on matching start/end source 05ed64e1…, including final affected loader integration. Counts overlap. Human campaign/feel evidence remains pending. |
| F09 | Excluded | No stagger, attack interruption, new hit zones or balance changes. |

P01 implementation is also delivered by this worker: bounded opt-in `playtest_recorder.gd`, source fingerprint, coalesced dwell/segments, explicit local export and `summarize-playtest.py`; 22 focused checks. Shared hooks/export UI are lead-owned. No uncoached human observation has been claimed.

Improve the clarity and physical credibility of impacts and movement around the Nomad's equipment. Investigate the historical intermittent frame stalls against the current native build. Preserve combat rules during the initial pass; evaluate actual stagger or balance changes separately.

## Starting point and constraints

The current native game already supplies much of the foundation:

- `enemy_animation.gd` and `enemy_hit_pose.gd` layer the authored hit animation onto chest, neck and head rotations, retaining locomotion and attack timing. Death clears the overlay. This needs review and refinement, not replacement with interrupting full-body animation.
- `enemy.gd` already distinguishes armor, exposed Bastion vent hits and eliminations in text. Its generic `take_damage()` also emits player-facing combat text without knowing the attacker. Source attribution is therefore a concrete gap. Bastion upper vent damage and Sovereign protection are existing combat rules.
- `owned_shot.gd` permits damage only to explicit hostile targets and rejects owned pieces while retaining world collision. The player uses a resolved muzzle, muzzle-obstruction safety trace and one reticle confirmation per trigger event; the mounted gun confirms hits, and automatic guns do not create reticle confirmation. Preserve these protections while unifying feedback.
- The camera already sweeps diagonally from the player's eye, retracts the shoulder offset with the boom, and fades the complete player/equipment set nearby. `ground_boundary.gd` checks actual supported platform positions using the player's capsule. Diagnose remaining camera issues around real equipment before changing those systems.
- Footsteps already follow actual locomotion contact phase. Audio assets and synthetic cues are prewarmed and use bounded voice pools. Enemy resources are prefetched, scenery preparation is sliced, and autosave serialization/I/O runs on a worker with detached snapshots. Do not add duplicate versions of these systems.
- Refined character mesh bindings, animation keys, physical scale, equipment sockets and collision authorities are established contracts. Presentation must not enlarge collision shapes or move gameplay roots to make an animation look stronger.

Historical evidence is scoped. The autosave review recorded a 190 ms maximum and a separate 72 ms main tick outside autosaving; their causes were unverified. Later work reduced identified enemy-loading, warning-material and scenery costs, while moving some first-use work into startup. Those reports do not prove that the same stalls occur in today's build. An isolated refined-character rendering median is not a full-game frame-rate measurement.

Relevant local evidence:

- [Autosave and movement review](../../godot-port/autosave-motion-review.md)
- [Encounter loading review](../../godot-port/encounter-loading-review.md)
- [Scenery streaming review](../../godot-port/streaming-review.md)
- [Audio contact and lifecycle review](../../godot-port/audio-contact-review.md)
- [Weapon presentation review](../../godot-port/weapon-presentation-review.md)
- [Interception review](../../godot-port/interception-review.md)
- [Refined characters](../../godot-port/character-refinement.md)
- [Current checkpoints and menu behavior](../../godot-port/playtest-checkpoints.md)

## Shared contracts and ownership

Master-plan dependencies use C01–C06; pacing instrumentation uses P01. S/M/L are relative effort: S is a focused change or report, M spans a subsystem and its tests, and L requires several connected systems or reproducible performance investigation. They are not elapsed-time promises.

The feel agent owns new impact-result/presentation helpers, enemy presentation, feedback audio/effects and focused tests. A performance agent may independently own test-only tracing, analysis and evidence. One integration owner edits shared `main.gd`, `player.gd`, `ui.gd`, `combat.gd` and test launcher wiring; other agents submit exact patches/contracts for those files. The construction agent owns construction behavior. Camera fixtures may construct a cluttered test deck but must not modify construction rules. No simultaneous agents edit the same file.

F02 and F06 reuse P01's run/trace ID, checkpoint ID, campaign-versus-checkpoint origin, wall clock and simulation clock. The bounded local event recorder records coarse events such as encounter start, shot, save request/completion, chunk crossing and camera/menu transitions. Fine CPU/frame probes remain test-owned and opt-in; they must not add an unbounded shipping trace or mutate session RNG. Save schema changes, if any prove necessary, go through C03. Initial presentation work should require none.

The proposed immutable impact result contains source (`player_weapon`, `player_manual_turret`, `owned_auto_turret`, `hostile`, or `environment`), target category, surface point/normal, pre-hit armor/exposure state, applied damage, blocked/immune status and killed status. Name and exact type are finalized in F01. Classify exposure before applying damage because death can change target state. The damage authority is called once. Retain a float-returning compatibility wrapper for existing `MMFOwnedShot.damage()` callers or migrate all callers atomically; do not accidentally deal damage twice to collect feedback.

World impacts may play for any visible collision. Personal hit text and reticle confirmation require positive damage to a hostile target from the player's firearm or actively crewed gun. Automatic guns may cause target reactions and positional sound without claiming a personal hit. Friendly NPCs, owned pieces, world cover, missed shots, dead/inactive collision zones, and zero applied damage cannot produce successful personal-hit feedback. A shotgun shell produces at most one personal confirmation, even across multiple pellets/targets; select its summary deterministically without extra gameplay RNG. Enemy/world damage and scripted cleanup remain valid without a player source.

## Task queue

### F01 — Freeze behavioral and feedback contracts (S)

Depends on C01 and C02. Owner: feel agent, with integration owner approval of shared call sites.

Files: `godot/scripts/{owned_shot,damage,hit_zone,enemy,combat,player,main}.gd` (inspect); new contract section in the eventual review and focused test fixtures.

- [ ] Record the current call graph for firearms, mounted/automatic guns, hostile attacks, ship/component/scout zones and scripted cleanup. Inventory every player-feedback emission, including generic `enemy.take_damage()`.
- [ ] Define the result/source contract above and whether a target's hit state is metadata or a query method; keep damage/falloff/protection calculations in their existing authority.
- [ ] Record deterministic reference scenarios for all six enemy kinds, armor/falloff edges, Bastion vent height/phase, Sovereign protection, ship components and the scout. Preserve ammo, cadence, pellet RNG sequence, reload, windup, attack events, root movement, drops and rewards.
- [ ] Record presentation interruption rules: death overrides hit reaction; menus, cinematics, boarding transitions and weapon pose ownership remain coherent; repeated hits cannot accumulate a permanent bone offset.

Acceptance: every attack source is classified; references identify source revision/content hashes and fixture seed; current supported contract suites pass before edits or have a reproduced, separately recorded baseline failure. The old `boarding_contract.gd` fixture describes a superseded ship lifecycle and is not a reason to restore that old behavior or overwrite evidence. Use current boarding/interception tests.

### F02 — Capture current native feel and performance baseline (M)

Depends on C01, C02 and P01 instrumentation contract. Can run independently of F03–F05 after their baseline is captured. Owner: performance agent.

Files: `godot/tests/travel_profile.gd`, new `godot/tests/feel_route_profile.gd`, analysis script under `tools/godot/`, and `docs/godot-port/results/feel-performance-*`. Shared recorder integration belongs to P01's owner.

- [ ] Validate existing trace hooks against current source. Fail loudly when an expected replacement/probe is absent; do not silently attribute the preceding call's time to the next stage label.
- [ ] Define repeatable checkpoint/input routes: `defense` for approaching ship, mounted shots, grapple and boarding; `scout` for on-foot hits and travel; `foundry-route` for real travel/streaming and at least one normal autosave; `workshop` for stairs, tight equipment and menu/build transitions. Add a controlled six-enemy scene for reaction comparisons, clearly labeled as a fixture.
- [ ] Record title preparation, immediate New Game, immediate Continue, checkpoint loading/handoff, and steady gameplay as separate segments. Checkpoints skip earlier resource exposure and story time; supplement them with one normal startup-to-play route. Keep cold process/first-use samples separate from warm repeats; report OS/driver cache state as unknown when it is not controlled.
- [ ] Run a lightweight uninstrumented frame-interval control and the instrumented route in alternating order. Use three initial repetitions per route; retain raw timings, sample counts and all outliers. Run travel for at least 90 real seconds so it covers the normal 60-second save interval; extend if that workload prevents saving, rather than forcing a save and calling it ordinary behavior.
- [ ] Record wall-frame intervals, physics/process callbacks, CPU stages, renderer CPU/GPU time, pipeline compilation counters where supported, event timing, scene/draw counts and available memory counters. Mark unavailable metrics explicitly and distinguish delayed GPU samples from synchronous CPU timestamps.
- [ ] Record build/content hash, seed, exact input route, renderer/Godot version, GPU/CPU, resolution, quality/MSAA, VSync/frame cap, window focus and relevant competing workloads. Profile one native game at a time; do not run Blender, another GPU test, or an active user game concurrently. This planning task does not close or profile the user's game.

Acceptance: repeatable raw runs and a report with median, p95, p99, maximum, counts above 25/50/100 ms, startup and steady segments, and measurement overhead. Include an uncapped diagnostic plus a separately labeled normal 60 Hz capped playability run; headless timing is not rendering FPS. A stall absent from current repetitions is reported as not reproduced, not fixed. No current root cause or speedup is inferred from old reports.

### F03 — Route authoritative impact classification and confirmation (M)

Depends on F01 and the F02 combat baseline. Owner: feel agent; shared caller changes through integration owner.

Files: proposed `godot/scripts/impact_result.gd` / `combat_feedback.gd`, `owned_shot.gd`, `hit_zone.gd`, `enemy.gd`; caller changes in `player.gd`, `main.gd`, `combat.gd`, and `ui.gd`. New `godot/tests/impact_feedback.gd`; extend `survivor_combat.gd` as needed.

- [ ] Return/consume authoritative result data without a second damage pass. Capture Bastion exposure before mutation; honor actual applied damage after armor, falloff, drone protection and remaining health.
- [ ] Remove source-ambiguous personal confirmation from generic damage handlers. Route player firearm and manual-gun summaries once per trigger event; keep automatic-gun feedback in the world.
- [ ] Separate blocked metal impact from successful armored damage and exposed damage. A cue must never claim a weakness when only a normal body hit occurred.
- [ ] Use a deterministic summary rule for multi-pellet hits and one death announcement per killed target. Preserve generic legacy/test targets through a documented fallback that cannot invent armor/exposure.

Acceptance: owned/friendly/world objects retain collision and take no owned-shot damage; wall/muzzle obstruction stops both damage and misleading traces; miss, zero damage and dead-zone cases never confirm. Player rifle, shotgun and manual gun each confirm exactly once per damaging trigger event; automatic guns never produce personal hit text/reticle pulses. Damage, ammo, timers, drops and RNG match F01.

### F04 — Refine reaction, sound and impact presentation (M)

Depends on F03. Owner: feel agent.

Files: `enemy_hit_pose.gd`, `enemy_animation.gd`, `effects.gd`, `audio.gd`, new feedback helper and focused rendered tests. Reuse existing sound assets first; any new assets need source/provenance and setup prewarming.

- [ ] Tune bounded directional upper-body response for armored and exposed hits using the existing modifier. Preserve feet, root, navigation and attack/boarding state; ensure rapid impacts blend/restart without indefinitely freezing the pose or masking attack warnings.
- [ ] Give armor and exposed hits distinguishable sound envelopes/timbres and small effect patterns. Retain a readable non-color distinction and avoid obscuring the target with particles or flash. Keep the reaction strength and audio balance reviewable in matching clips.
- [ ] Reuse/prewarm shared materials and audio streams. Bound simultaneous cues/effects; preserve reserved radio/warning audibility, master-volume/mute behavior and scene cleanup. Presentation randomness, if needed, uses its own stream and never consumes session RNG.
- [ ] Reset overlays on death, removal, load/restart and model replacement. Verify final skeleton poses through the modifier callback, not pre-modifier bone reads.

Acceptance: all six enemy kinds show the intended reaction in actual rendering during idle, moving, firing, venting, boarding and lethal sequences; no foot/root displacement beyond unchanged baseline. Same hit replay preserves attack events and damage tick-for-tick. Rapid rifle/shotgun/auto-turret hits leave no persistent pose, audio-node growth or repeated kill reward. Matching before/after native clips and muted/color-independent review demonstrate the distinction; automated checks alone do not establish subjective feel.

### F05 — Refine camera behavior around equipment and movement transitions (M)

Depends on F01, F02's camera baseline and C02 ownership contract. Coordinate the construction workstream's clearance fixtures. Owner: feel agent; `player.gd` edits through integration owner.

Files: `player.gd`, `weapon_pose.gd`, `equipment.gd`, `ground_boundary.gd` only if a reproduced defect requires it; `camera_clearance.gd`, `canopy_camera.gd`, and a new checkpoint-based camera route test.

- [ ] Reproduce close-camera obstruction/popping at helm, refinery, workbench, generator, stairs, doorways, canopy supports, gun mounts and workshop bridge. Include both shoulders, aim/hip, crouch, supported FOV extremes and 16:9/4:3 windows.
- [ ] Fix only observed probe/handoff/smoothing defects. If recovery oscillates near an edge, use bounded presentation smoothing/hysteresis while preserving immediate collision safety; never smooth the camera through solid geometry.
- [ ] Verify wrist opening/closing, station close, Build → Place, mount/dismount, reload, quick rear-facing aim, safe-ground recovery and checkpoint restart return camera/input ownership exactly once. Keep the player menu personal and station interfaces local.
- [ ] Keep the resolved muzzle/aim contract and close-camera fading synchronized across body, rifle, shotgun, attachments, cutter and carried items. Do not change movement acceleration/speed, capsule dimensions, step height, character scale or grounded recovery to conceal a camera problem.

Acceptance: fixture camera clearance sphere and eye-to-camera path stay clear on every sampled transition; both shoulders recover the existing unobstructed offsets/directions. No accidental shot after menus and no shot through nearby cover. No new repeated shorten/extend oscillation in a stationary edge fixture; record frame-by-frame boom lengths and a rendered clip. Existing locomotion contact, hand-grip, canopy and supported-platform tests pass. Full physical-input native runs remain required because headless mouse capture differs.

### F06 — Attribute a reproduced stall to its actual owner (L, bounded investigation)

Depends on F02; coordinate P01's event IDs. Owner: performance agent.

Files: test-only trace probes and analysis; production systems remain read-only until attribution. Candidate owners include encounter/resource preparation, scenery preparation/activation, navigation rebake, player/pose/UI/effects CPU work, snapshot capture/completion, renderer/shader work, driver waits and host scheduling. This is a search space, not a diagnosis.

- [ ] Select a repeatable current outlier, align wall/physics/render timestamps and coarse event markers, then narrow probes around the expensive stage. Keep GPU timing latency and CPU/render overlap visible; do not add overlapped times as though they were sequential.
- [ ] Compare one factor at a time with identical scene/content/inputs: first versus warm use, preparation versus activation, save snapshot versus worker completion, and stable world versus boundary transition. Diagnostic toggles may disable a feature to isolate its cost but cannot become the shipping fix by removing detail or gameplay.
- [ ] Check uncategorized wall gaps against focus, VSync/cap, background work and available host evidence. Use a supported system trace only if needed; report driver/OS attribution as inconclusive unless directly supported.
- [ ] Keep a bounded investigation log: after the F02 repetitions and two targeted probe rounds, either identify a reproducible owner or produce a narrowed unresolved report with a minimal next reproduction. Do not consume the other four priorities in an open-ended optimization search.

Acceptance: a cause is actionable only when the same stage/event aligns with the spike in at least three matched reproductions and a controlled isolation changes that specific cost, without hidden workload changes. Otherwise F07 has no speculative patch; retain an explicit unresolved performance task. Instrumentation overhead is measured and any newly induced spikes identified.

### F07 — Implement and validate only evidence-supported stall fixes (M per isolated fix; conditional)

Depends on F06 attribution; production file owner assigned from the diagnosed stage, not preassigned across the whole engine. Owner: relevant subsystem agent with integration owner.

Files: only the attributed production subsystem plus its lifecycle/behavior tests and retained before/after evidence. Existing candidates are `encounter_assets.gd`, `assets.gd`, `scenery_stream.gd`/`scenery_chunk.gd`, `world.gd`, `autosaver.gd`, pose, UI and effects scripts; inclusion here does not authorize speculative rewrites.

- [ ] Before editing, state the targeted event cost/spike threshold from F06 and a measurable reduction criterion. Preserve resource ownership, cancellation, bounded queues/caches, save durability, scene safety, visual density and gameplay order.
- [ ] Run at least five alternating before/after matched samples in separate sequential processes. Report the complete p95/p99/max distributions and slow-frame counts, as well as the isolated stage time, startup/handoff effects and memory tradeoffs. Include normal capped gameplay and the diagnostic mode.
- [ ] Reject a proposed fix if its improvement is within observed run variation, it merely displaces a stall into another interactive segment, or it worsens sustained frame behavior, memory bounds, save reliability or visual quality. Deliberately moving first-use work into an explicit loading state may be valid, but report the resulting time-to-play cost.

Acceptance: the predeclared criterion is met across matched samples, unaffected segments show no reproducible regression beyond measured variation, and the diagnosed subsystem's correctness/lifetime tests pass. Keep maximum outliers visible even when host noise prevents a deterministic ceiling. If attribution fails, no FPS claim or fake completion: report F07 as not triggered and F06's unresolved result.

### F08 — Integrate checkpoint and native acceptance (M)

Depends on F03–F05 and F06/F07 disposition; contributes to C04, C05 and C06. Owner: integration owner with a separate review agent where useful.

- [ ] Run focused `impact_feedback`, `survivor_combat`, `enemy_animation`, `enemy_combat_contract`, `enemy_equipment`, `weapon_presentation`, `player_locomotion`, `camera_clearance`, `canopy_camera`, current `boarding`, `encounter_loading`, `audio_lifecycle`, `autosave_worker`, `play_parity` and checkpoint/menu tests where the actual changed paths require them. Use the current supported names/launchers verified during C01; do not invent passing counts or hide baseline failures.
- [ ] Native real-input review: `defense` (deck gun, boarders and taking cover), `scout` (rifle/shotgun and movement), `workshop` (tight traversal/build/menu), `foundry-route` (travel/save). Use the deterministic controlled scene to cover all enemy kinds, Bastion vent and Sovereign aura without claiming every enemy naturally spawns in these checkpoints.
- [ ] Native captures at 1920×1080 and a supported 4:3 size show impacts, close obstacles, aim and menu handoffs at normal speed. Capture readbacks/video separately from timed samples. Check reduced effects/mute/text legibility where supported.
- [ ] Confirm isolated test saves/settings, checkpoint provenance and normal campaign save integrity. Teardown waits for actual outstanding navigation/asset/save/audio ownership according to existing helpers; no gameplay sleeps are introduced to silence test warnings.
- [ ] Deliver before/after clips, source hashes, test results, performance scope and unresolved issues. Add a short uncoached-playtest questionnaire: what hit, whether damage landed, why the enemy reacted, and whether movement/camera control remained predictable. C05 owns human acceptance; scripted success cannot complete it.

Acceptance: machine-checkable contracts pass, rendered comparisons show the intended distinctions without collision/scale changes, and a human reviewer can independently understand the feedback and camera behavior. Report performance conclusions only within the measured routes/configuration. Release notes distinguish completed presentation work, verified fixes and any still-unreproduced stalls.

### F09 — Optional later stagger or combat-rule experiment (separate decision)

Not part of the committed initial feel pass and not a prerequisite for F08. Depends on F08/C05 evidence identifying a remaining combat-design problem and an explicit scope decision.

Potential work: bounded stagger windows, poise/armor break, new weak zones or modified recoil/cadence. These change difficulty, interruption, encounter length and resource use. They require a separate design, new deterministic combat reference fixtures, AI/boarding fairness review, checkpoint and normal progression balance tests, and coordination with pacing tasks. Never introduce an attack cancel, invulnerability change, physics impulse or hitbox enlargement as an undocumented side effect of F04's animation polish.

## Execution order and completion rule

After C01/C02, F01 and P01/F02 preparation can run independently. Capture F02's relevant baseline before changing presentation. Then execute F03 → F04 while a separate owner investigates F06; F05 shares core player files and must be sequenced with the integration/construction owner. F07 runs only for an attributed cause. F08 integrates the result into the full checkpoint and normal-campaign acceptance sequence.

This workstream is not complete merely because a diagnostic median looks good. Completion requires preserved gameplay/collision contracts, correct source-attributed feedback, reviewed movement/camera presentation and an honest performance disposition. An unresolved but bounded investigation must remain visible in the master plan rather than being described as a stutter fix.
