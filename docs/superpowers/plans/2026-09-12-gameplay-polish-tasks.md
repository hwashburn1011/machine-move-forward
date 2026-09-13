# Gameplay polish execution backlog

Implementation was authorized on 12 September 2026. This is the approved task
contract; current completion and acceptance evidence live in the
[execution record](../../gameplay-polish/README.md). Design authority:
[gameplay-polish-plan.md](2026-09-12-gameplay-polish-plan.md).
Base: main `1cf3835`. Task descriptions below preserve the original acceptance
requirements rather than serving as a live status checklist.

## Roles and dispatch rules

- Sol: refine/review task contracts, evaluate edge cases and review acceptance
  evidence. A Sol source review informed this backlog.
- Luna: bounded runtime implementation and meaningful tests, dispatched only
  when implementation is requested. A worker gets task IDs, exact files,
  prerequisites and acceptance checks, not an open-ended request to polish the game.
- Astra: Blender animation/rig authoring, export validation, visual corrections,
  integration decisions and final gameplay review. Luna may wire established
  clip contracts and run export/QA scripts; creative model/animation decisions
  and visual asset promotion remain with Astra.

Maximum three active workers plus Astra. One owner per shared file at a time.
`Game.ts`, `GameEvents.ts`, `Player.ts`, `PlayerVisual.ts`, `InputManager.ts`,
`TitleScreen.ts`, `hud.css`, `BuildSystem.ts`, and generated GLBs need explicit
handoff. Workers first use isolated modules and hand root a small integration
patch list; do not concurrently edit these files. No extra agents or surprise
feature work. Preserve unrelated `dealer-agent-readiness/` and `docs/vpc-mvp/`.

For every task: report files, behavior, tests/commands/results, assumptions and
remaining issues. Do not claim completion from TypeScript success alone when the
task has visual/browser acceptance. Do not modify balance data to make a test pass.

## Contract and baseline tasks

### POL-00 — Reproduce and record baseline (Astra, Sol review)

- Own: new `tools/polish/` harnesses and `docs/gameplay-polish/baseline/` evidence.
- Record existing aim/fire/reload/AI event times and cover results in seeded scenes;
  retain original mech socket clips/transforms before editing assets.
- Reproduce lower-deck level clamping and short/blocked build targets with real
  controls. Capture UI selection steps and camera obstruction cases.
- Record current asset budgets, materials, clip/bone/socket names and repeatable
  hardware performance. Preserve original GLB/source copies outside promoted paths.
- Done: input-driven reproductions plus JSON/screenshots; balance/save files have
  recorded baseline hashes. Depends: none.

### POL-01 — Freeze interfaces and input ownership (Sol + Astra)

- Own: `docs/gameplay-polish/contracts.md` during implementation, shared type patches
  in one serialized window. No duplicate settings/input/event registries.
- Agree `InputContext`, `BuildSessionState`, `BuildTargetResult`, `ThreatSnapshot`,
  `RelocationResult`, `PlayerPresentationState`, reload phase and asset manifest.
- Separate build access, encounter eligibility and save safety. Decide exact
  integration seams before workers edit the main loop.
- Done: typed field meanings, clock/coordinate ownership, cancel semantics and
  error enums accepted by each worker; dependency graph has no cycle. Depends: POL-00.

## Building and everyday machine use

### BLD-01 — Deck and reach targeting (Luna build)

- Own: new `src/building/BuildTargeting.ts`, `BuildPreview.ts`, focused targeting
  tests; minimal `BuildValidation.ts` rejection additions in its reserved window.
- Return `{ placement, pointLocal, pointWorld, level, distance, rejection }` from
  explicit view/player/machine/level inputs. Use 12 m player-relative reach,
  local deck-plane intersection, compatible support hits and separate LOS.
- Legal levels include `GRID_MIN_LEVEL`; remove the 0-only assumptions in the
  later Game integration. Auto floor follows support with stair hysteresis.
- Recheck legality at commit; no camera-distance fallback point. Reuse math objects.
- LOS uses the snapped/oriented target, terminal-support identity and a 2 cm
  endpoint tolerance: accept intended floor/wall contact, reject earlier blockers,
  ignore geometry behind the endpoint. Use the same predicate at preview/commit.
- Done: tests for -2..2, negative cells/edges, 4/8/11 m, >12 m, parallel/backward
  rays, shifted camera/shoulder, tilted machine, machinery/ceiling blockage,
  actor overlap and floor extension requiring real support. Browser demo places
  on all three decks without standing in the adjacent cell. Depends: POL-01.

### BLD-02 — Direct build catalog and clear preview (Luna UI)

- Own: `BuildUI.ts`, new `BuildCatalog.ts` and scoped build CSS, preview presentation
  additions after BLD-01 releases `BuildPreview.ts`; no input/scene ownership.
- Add category tabs, searchable cards with cached thumbnails, cost/lock reasons,
  last selection, visible active item and direct keyboard/mouse selection.
- Show footprint, direction, deck, range and rejection text/symbol on the ghost.
  Display movable target name and demolition hold/cascade/refund preview.
- Use action-label lookup; typed callback commands rather than mutating Game.
  Catalog scrolling cannot rotate the ghost; selecting a card cannot also place.
- Done: every existing item reachable without cycling G; clear invalid/locked
  states at 1280×720 and 1920×1080; no per-frame full catalog rebuild or creation
  of every high-detail model. Depends: BLD-01 target DTO, IN-01 label API.

### BLD-03 — Build session and combat interruption (Luna build)

- Own: new `BuildSession.ts`, `BuildCombatGuard.ts`, unit tests. Root integrates
  Game/event seams later. State is closed/catalog/placement/relocation.
- Centralize entry/exit/cancel reasons and command eligibility. Preserve the original
  equipped weapon and selection; cancel pending placement/move/demolition on threat.
- Guard reads committed hostile encounter states, living boarders, active grapples,
  damaging projectiles and direct health deltas. Include a 2 s clear interval;
  ignore stale damage and harmless/presentation actors.
- Reset the clear interval every fixed tick with a live source, including restored
  threats. No-event ticks are not automatically safe. Use simulated time without
  changing director RNG, volley due times, windups or other encounter clocks.
- Emit close/rearm/UI requests, not enemy manipulation or partial-world pause.
  Build access must not be fed back as the raid director's safe predicate.
- Done: table tests cover each threat and nonthreat, threat during every build
  state, rapid toggles, no auto-reopen, attack before vs after command commit,
  death/load/cinematic/normal pause. Depends: POL-01, IN-01/02 interfaces.

### BLD-04 — Safe relocation transaction (Luna building systems)

- Own: `BuildSystem.ts` and needed `BuildGrid.ts`/`BuildValidation.ts` additions,
  relocation tests. Exclusive owner; BLD-01 changes must be integrated first.
- Add `canRelocate(instanceId, placement)` and `relocate(...)` with discriminated
  result/reason. Preview never removes the source. Validate with only its old
  occupancy excluded, without mutating the live grid just to ask a question.
- Move supported nonstructural equipment/furniture only; preserve same instance
  and state. Commit new mesh/collider/grid placement atomically, rollback on failure.
- No remove/place calls, spending/refunds, health reset, container replacement or
  build/progression reward. Reject externally occupied/claimed devices.
- Done: full/damaged/unpowered crate, producer, generator, lamp and both turret
  types plus collector preserve state; invalid/busy/cancel/destroyed source leaves
  no partial move; total item/mass/power counts unchanged; full-player-inventory
  move works; blocked actor/support/structural requests give reasons. Depends: BLD-01/03.

### BLD-05 — Relocation consumers and save compatibility (Luna integration)

- Own: serialized `Game.ts`/`GameEvents.ts` window, device/resource lookup adapters
  in `src/defense/`, `src/salvage/`, `src/machine/` as necessary; root assigns files.
- Add `build:relocated` with ID and old/new placement. Update cached positions,
  navigation/rooms/lights, power consumers and device target lookups without
  resetting cooldowns/output or duplicating registration. Preserve collector claims
  by rejecting busy moves, not by minting/reassigning loot.
- Saves use committed position, existing contents/health and stable IDs; an in-progress
  preview saves the original. Load/reset cancels previews. Keep legacy saves valid.
- Done: real save/load before/during/after move, generation/shutdown behavior,
  automated target/reel origins after move, no stray old colliders, no duplicate
  reward events; 100 moves return to stable resource counts. Depends: BLD-04, INT-01.

### INV-01 — Bulk storage primitives (Luna inventory)

- Own: `Container.ts` or new `ContainerTransfer.ts`, `container.test.ts`/bulk tests.
- Implement Take All, Deposit Matching using destination types snapshotted at start,
  and deterministic compact/sort. Return counts moved and leftovers for truthful UI.
- Reuse stack limits; do not use global ResourceAccess to distribute a UI transfer
  into other crates. Reject self-transfer and nonpositive/malformed counts.
- Done: mixed stacks, full/partial destinations, repeated actions, conservation
  and stable sort/IDs. No loot, crafting or story events. Depends: POL-01.

### INV-02 — Storage controls and interaction highlighting (Luna UI)

- Own: `InventoryUI.ts`, new scoped interaction highlight component, scoped CSS;
  minimal `InteractionSystem.ts` readonly target exposure if absent.
- Add labeled Take All / Deposit Matching / Sort buttons and partial-transfer
  feedback; retain click-stack/shift-click-one. Keep open-panel target identity
  stable and invalidate on destruction/range loss.
- Highlight only the already-selected usable/repair target; reuse shared geometry,
  own materials and obey existing occlusion/repair priority.
- Done: full inventory has clear leftovers; UI click never triggers use/fire;
  target destroyed during transfer closes safely; nearby machines/repair panels
  highlight consistently, decorative art does not imply interaction. Depends: INV-01, IN-01.

### HUD-01 — Compact machine maintenance status (Luna UI)

- Own: `MachineCondition.ts`, new `MachineStatusView.ts`, HUD section and scoped CSS
  during reserved window. Root supplies one readonly status snapshot.
- Combine fuel/crawl, power capacity/demand/shed devices and subsystem condition;
  expandable details name service deck, repair materials and real failure reasons.
- Update fuel independently from power-change events; deduplicate notifications
  and retain quiet ambience. No remote repair/refueling controls.
- Done: healthy/empty-fuel/damaged-engine/disabled-leg/no-power/full-repair states
  accurate at multiple resolutions; values come from simulation and existing
  service points. Depends: POL-01, IN-01 labels; integrate after INV-02 releases UI.

## Input, settings and camera

### IN-01 — Settings and binding registry (Luna controls)

- Own: new `src/core/settings/SettingsStore.ts`, `src/core/input/Bindings.ts`, tests;
  TitleScreen storage extraction after root hands off that file.
- Version/validate legacy `mmf-settings` without losing volume/ambience/quality.
  Define action/context labels and defaults from the design, sensitivity .25–3,
  vertical FOV 50–80/default55 and right-shoulder default.
- Context-exclusive reuse is legal; same-context conflicts require explicit UI
  choice. Keep Escape recovery and browser-reserved shortcuts; reset supported.
- Done: corrupt/partial/legacy/current settings, conflicts, duplicate aliases,
  reset and persisted preferences; definitions can render every current hint.
  Depends: POL-01.

### IN-02 — Context routing and release safety (Luna controls)

- Own: `InputManager.ts`, routing/rearm tests. Expose `setContext`, physical held
  state, consumed actions/look/wheel and `suppressUntilReleased` semantics.
- Resolve only applicable actions per context, not broad E/RMB dual emission.
  Preserve look consumption and held locomotion through build interruption;
  suppress stale fire/aim/use/confirm until physical release.
- Catalog/text/menu clicks own the pointer. PageUp/Down/Home suppress page movement
  only in the appropriate context. Pointer-lock/focus handoffs have one owner.
- Done: held LMB/RMB/E/V/G/X across build/play/menu, two keys for one action,
  rebinding while held, key-up after context change, blur/unlock, wheel once,
  30/60/120/144 Hz unchanged look deltas. Depends: IN-01.

### CAM-01 — Volume-based camera obstruction (Luna camera)

- Own: `PlayerCamera.ts`, narrow `PhysicsWorld.ts` sweep/overlap API and tests.
  Coordinate PhysicsWorld ownership with foot-probe work.
- Add near-plane-aware sphere sweep/overlap recovery, fast pull-in, slower
  collision-safe release and final rendered/interpolated position validation.
  Do not introduce aim smoothing or collision-group changes to player/enemies.
- Reset history after reposition/load/respawn/camera takeover.
- Done: corner/ceiling/beam/corridor/turn cases and moving blockers; initial
  overlap recovery, multiple FOV/aspect values, no camera-induced jitter, no
  wall traversal during smoothing. Existing sensitivity tests still pass.
  Depends: IN-01/02, POL-00 camera fixture.

### CAM-02 — Shoulder, fade and configurable view (Luna camera)

- Own: `PlayerCamera.ts` after CAM-01; dedicated player fade helper with an
  agreed `PlayerVisual` adapter, not a concurrent PlayerVisual edit.
- Bind shoulder swap and sensitivity, use FOV optical ratio from design. Sweep
  the shoulder transition; preserve rotation and actual camera-center hitscan.
- Fade local body/weapon near the camera with owned material state; restore on
  distance/load/death/cinematic exit. Other instances/materials remain untouched.
- Done: double swap restores view, both shoulders near obstructions, no opacity
  leaks, no collider changes, defaults retain55/38 FOV. Test unobstructed aim
  and expected corner visibility differences rather than false identical-hit
  assertions across different camera origins. Depends: CAM-01, ART-00 metadata.

### IN-03 — Settings UI and live control labels (Luna UI)

- Own: `TitleScreen.ts`, settings CSS and action-label consumers in an assigned
  UI window; `Game.applySettings` only during integration handoff.
- Expose sensitivity, FOV, shoulder preference and key/mouse remapping with
  conflict/recovery/reset UI. Escape cancels binding capture instead of rebinding
  away the only exit. Preserve URL harness quality overrides.
- Replace literal in-game prompt/tutorial/build/repair/skip labels with registry
  output. Do not alter objective logic or cinematic durations for a label change.
- Done: live apply/persist/restart, corrupt settings recovery, new mappings work
  in their context and every displayed hint matches. Depends: IN-01/02, CAM-02.

## Astra asset work and Luna animation adapters

### ART-00 — Animation and socket contract (Astra)

- Own: copied Blender sources and export scripts under a new `assets/animation-polish/`
  and `tools/art/animation_polish/`, plus asset manifest in `docs/gameplay-polish/`.
- Inventory existing skeleton hierarchy, handedness, local axes, clip durations,
  grip/muzzle markers, dimensions and original reference images. Preserve originals.
- Freeze exact canonical names for directional motions, aim layers, reload clips,
  foot/hand bones, visual sockets and preserved combat socket path. Use in-place
  clips; no new root motion. Record baseline budgets from POL-00.
- Done: a small validation export and runtime-readable manifest; no invented
  bone names or forced skeleton refit. Depends: POL-00/01.

### ART-01 — S-07 locomotion, aim and reload authoring (Astra)

- Own: S-07 Blender work and staged GLB, never Luna's runtime files.
- Author forward/back/left/right armed walk/run and directional crouch movement,
  blended diagonals, appropriate starts/stops/landing, upper-body aim limits,
  two-hand rifle/shotgun grip and separate duration-scaled reload clips.
- Retain unarmed opening clips and stable sockets. Review from actual gameplay
  camera as well as side/front closeups, returning to gunner reference for gear fit.
- Done: no foot sliding at authored reference speeds, foregrip penetration or
  reversed joint bends; per-weapon reload supports existing whole-mag timing.
  Manifest/GLB validation and source/rebuild instructions included. Depends: ART-00.

### AN-01 — Directional locomotion and upper-body aim (Luna animation)

- Own: `Player.ts`, `PlayerVisual.ts`, `PlayerGait.ts` in reserved animation window.
- Add readonly `PlayerPresentationState`: local planar self-velocity, grounded,
  crouching/armed/aiming, aim pitch/yaw and weapon/reload state. Remove deck carry
  from visual gait input; do not change the physics/controller state.
- Directional blend/resolver uses agreed clip names with old-clip fallback.
  Apply bounded aim/grip layers after base mixer; preserve hip/root locomotion.
- Done: stationary moving deck, forward/back/strafe/diagonals, rapid aim/weapon
  switches, crouch/jump and missing-clip fallback at multiple frame rates;
  unchanged trajectory/speed/hitscan in paired fixtures. Depends: ART-01, IN-02.

### AN-02 — Reload and weapon presentation synchronization (Luna animation)

- Own: player visual files after AN-01, minimal `PlayerCombat.ts` snapshot/event
  adapter in a reserved window; no changes to Weapon balance/timing rules.
- Drive reload clip progress from authoritative weapon state, not elapsed render
  time alone. Handle equip/death/load/cancel/pause/build transitions explicitly.
- Blend support hand between grip and reload, preserve bounded visual kick and
  player camera ray. No per-shell shotgun rule or animation event that grants ammo.
- Done: same fire/reload timestamps and ammo totals with presentation on/off,
  interrupted reload never finishes visually after cancel, repeated fire blends
  without blocking shots; rifle and shotgun reviewed. Depends: AN-01, ART-01.

### AN-03 — Grounded feet and stair contact (Luna animation; Astra visual tuning)

- Own: new `PlayerFootPlacement.ts`, PlayerVisual adapter after AN-02; readonly
  ground-query interface from PhysicsWorld after CAM-01 releases that file.
- Two foot samples, bounded knee/ankle/pelvis correction in the correct coordinate
  space; blend out airborne/missing or steep/unreachable support. Avoid allocations.
- Done: ascend/descend authored and built stairs, land/jump at edges, moving/tilted
  deck, idle; no capsule/grounded/step-height changes, no growing transforms or
  knee snaps. Record overhead in the actual scene. Depends: AN-01/02, CAM-01.

### AN-04 — Preserve enemy firing transforms (Luna animation + Astra contract review)

- Own: narrow `Enemy.ts`/`EnemyVisual.ts` socket adapter and tests. Astra owns
  transform-only original-clip/socket asset data.
- Separate authoritative firing origin from new cosmetic muzzle without replacing
  the baseline animated origin with a guessed fixed point. Keep original transform
  chain/clip behavior for simulation; no second rendered character.
- Record/test original-vs-preserved origin, target and barrel-occlusion behavior
  through movement, aiming, bursts, hits, death and pool resets before new clips land.
- Preserve original action selection, resets/crossfades and render-dt advancement
  of the socket hierarchy: the baseline samples origin before `visual.attack()`.
  Later burst shots can sample the intervening original animation. Use a bone-only
  original hierarchy/mixer if flattened tracks do not retain parity; never read
  authoritative origins from the newly layered skeleton. Sample before raycasts
  at 30/60/144 rendered FPS and fixed 60 Hz for single and three-shot bursts.
- Done: origin parity within numerical tolerance, identical damage/cover/dodge
  outcomes and no notable CPU regression; visual socket is used only for FX.
  Depends: ART-00, POL-00. Blocks promotion of ART-02 and AN-05.

### ART-02 — Four mech motion refinements (Astra)

- Own: copied Bastion/Revenant/Warden/Sovereign Blender sources and staged exports.
- Refine existing attacks/recoil and create bounded cosmetic hits, distinct death
  weight/follow-through; keep old timing and authoritative socket contract intact.
- Align impact/release pose to existing action time; anticipation may only use
  already available windup. Preserve cloth/weapon clearance and pooling final pose.
- Done: four gameplay-view contact sheets/clips for aim/release/hit/death with
  original badmechs reference comparisons; weapons don't pass through hands/body,
  no new attack hold/stun/root motion. Depends: ART-00, AN-04 contract.

### AN-05 — Enemy presentation overlays (Luna animation)

- Own: `EnemyVisual.ts` and minimal event wiring in `Enemy.ts`, after AN-04.
- Play archetype-specific strike/recoil at existing calls, add bounded hit overlays
  alongside current flash, preserve clamped death and existing retirement duration.
- Higher-priority death clears attack/hit layers; burst recoil cannot block a later
  shot. Reset all transient pose/fade state when a pooled instance is reused.
- Done: paired seeded damage/release parity, cover/dodge and kill/loot counts,
  eight-mech pool reuse, missing-clip fallback and no lingering invisible characters.
  Astra approves visual result. Depends: ART-02, AN-04.

### ART-03 — Optimize and promote the approved assets (Astra)

- Own: optimized exports, public runtime GLBs and asset docs only after reviews.
- Share mesh/texture data, keep existing source-detail budgets, compress/trim
  animation tracks without losing feet/grip/socket precision. Do not add materials
  or triangles just to animate an unchanged character.
- Done: glTF validator, bounds/socket/clip contract, fallback load, runtime decode
  and gameplay review pass. Compare download and memory budgets with POL-00;
  every source change reproducible. Depends: AN-01..05, ART-01/02.

## Integration and release gates

### INT-01 — Wire build, input and UI (Astra assigns one Luna integrator)

- Own: sole `Game.ts`/`GameEvents.ts` writer for this window.
- Connect build session, target command validation and threat projection in proper
  fixed-step order; remove build-only radio-raid suppression. Preserve all other
  director/sanctuary/story/health gates and seeded random draws.
- Integrate catalog pointer/cursor ownership, action rearm, failed lock recovery,
  statuses and setting application. Normal pause is still a full pause.
- A threat while catalog owns the cursor closes building and pauses before the
  next world step. Resume requests lock and unpauses only after success/bypass;
  denial/blur keeps it paused. Suppress the Resume gesture until release. Test a
  threat while the cursor rests on a catalog card, lock denial/retry and blur
  during Resume; enemy/volley clocks must not advance across the paused interval.
- Done: browser command tests show no fire on forced exit, no click-through,
  no construction after a threat begins, locomotion retained when appropriate,
  catalog has no raid immunity, all lower decks selectable. Depends: BLD-01..03,
  IN-01/02, initial BLD-02 UI. Handoff BLD-05 only after this lands.

### INT-02 — Integrate animation, inventory and maintenance (one Luna integrator)

- Own: next serialized `Game.ts`/player/UI integration window after BLD-05.
- Wire readonly presentation/status snapshots and lifecycle cleanup; integrate
  INV-02/HUD-01/IN-03. Keep render and simulation ownership separate.
- Save restore, respawn, new game, opening skip, cinematic return and quality
  switching must restore coherent input/material/animation state.
- Done: no unrelated gameplay definition changes; legacy/default/malformed
  settings and existing saves work. Depends: INT-01, BLD-02/05, INV-02, HUD-01,
  CAM-02, IN-03, AN-03/05. This is a one-way integration dependency, not a
  prerequisite for those isolated modules or their unit tests.

### QA-01 — Behavior and compatibility acceptance (Luna QA, Sol review)

- Own: tests/harnesses and `docs/gameplay-polish/acceptance/`; no balance edits.
- Run deterministic paired combat fixtures; relocation/storage conservation;
  lower/upper deck targeting and support; threat interruption/held inputs;
  opening, signal cinematic, both-side boarding, hook cutting, saves and legacy
  expedition flow. Include pointer-lock/cursor recovery in a real browser.
- Run lint, all unit tests and build, then relevant browser suites once features
  converge. Existing main has 1,103 tests; do not treat count growth as acceptance.
- Done: failures resolved or explicitly returned to their owner, no waived
  combat/save invariants, no browser console/page errors. Depends: INT-02, ART-03.

### QA-02 — Visual, performance and lifecycle review (Astra)

- Own: hardware browser/Blender review and final evidence. Schedule GPU work
  sequentially; do not benchmark while Blender renders or another agent tests GPU.
- Review all new animations on the actual decks and compare reference details.
  Verify camera obstruction, local fade, palette readability and target clarity.
- Three 30 s samples per stress scenario, plus 100 UI/move cycles and a 10-minute
  play/build/fight/save loop. Record p95/p99, slow frames, resource counts and
  before/after settings. Investigate repeatable >5% regression at same quality.
- Done: acceptance matrix from the design has evidence, no growing resources,
  no unexpected loss of model detail; final real-game clips show the improvements.
  Depends: QA-01 (earlier provisional visual reviews can run as assets arrive).

### REL-01 — Document and release the completed implementation (Astra)

- Own: README/controls/art notes, scoped PR/change log and release evidence.
- Only after implementation is authorized and accepted: publish the reviewed code
  through the project's main/Pages workflow, verify live gameplay and controls,
  and list actual limitations. Do not recapture a trailer unless requested.
- Done: merged commit and deployed build verified; no unrelated directories included.
  Depends: QA-01/02. This planning round does not perform this task.

## Dispatch waves and file handoffs

| Wave | Luna slot 1 | Luna slot 2 | Luna slot 3 | Astra |
| --- | --- | --- | --- | --- |
| 0 | Not dispatched | Not dispatched | Not dispatched | POL-00/01 with Sol review; ART-00 |
| 1 | BLD-01 → BLD-03 pure modules | IN-01 → IN-02 | INV-01 → BLD-02 UI shell (interfaces stubbed) | ART-01 |
| 2 | INT-01, then BLD-04 | CAM-01 → CAM-02 | INV-02 → HUD-01 → IN-03 UI, serialized CSS/TitleScreen | S-07 visual iterations; AN-04 socket review |
| 3 | BLD-05 | AN-01 → AN-02 → AN-03 | AN-04 → AN-05 (wait for ART-02) | ART-02, then ART-03 |
| 4 | INT-02 sole integration writer | QA harness preparation, no game edits | Sol acceptance review replaces a Luna slot if needed | QA-02 provisional captures |
| 5 | QA-01 and bounded assigned fixes | Only assigned fixes | Only assigned fixes | Final QA-02 → REL-01 |

Each arrow depends on completed prerequisites above, not merely on the wave number.
In wave 2 CAM-02's PlayerVisual adapter is handed to the animation owner; it must
not race AN-01. In wave 3 AN-04 is finished before affected mech assets promote;
it can be pulled earlier into a free slot if the asset pipeline needs it.
INT-01/BLD-05/INT-02 are strictly sequential Game.ts windows. Root may rebalance
idle workers onto isolated tests, but must not create concurrent shared-file writers.

First user-visible milestone is BLD-01/02/03 + IN-01/02 + INT-01: easier selection,
all-deck placement and combat-safe building. Character art work can continue in
parallel without delaying review of that improvement. Later milestones add
relocation/storage, camera/settings, then the fully reviewed animation pass.
