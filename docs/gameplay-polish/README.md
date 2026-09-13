# Gameplay polish implementation

Authorized on 12 September 2026, against main `1cf3835`, on
`codex/gameplay-polish`. Sol refined and reviewed the contracts; Luna workers
implemented bounded runtime/UI tasks; Astra authored the Blender animation,
integrated the systems and reviewed the actual rendering.

Design: [approved plan](../superpowers/plans/2026-09-12-gameplay-polish-plan.md),
[29-task backlog](../superpowers/plans/2026-09-12-gameplay-polish-tasks.md),
[integration contracts](contracts.md).

## Implemented behavior

- **Building:** B opens a category/search catalog with direct selection. Placement
  reaches 12 m from the player, works on all three decks, and explains support,
  obstruction, range and material failures. Page Up/Down choose a deck; Home
  follows the player's deck. The ghost shows its footprint and facing.
- **Combat handoff:** the world keeps running while building. Committed enemies,
  boarding hooks, dangerous projectiles or damage immediately close building.
  Held place/aim/use inputs cannot become a shot. If the catalog owns the cursor,
  the entire game pauses; Resume needs successful pointer lock before time moves.
  Failed lock or blur leaves it paused. The ready radio-raid clock ignores build
  mode, and a two-second clear interval prevents rapid build/combat toggling.
- **Moving equipment:** V in placement selects an eligible device; Q/E rotate;
  click commits and RMB/Escape cancels. The original remains until a valid commit.
  IDs, contents, health, producer progress, power and device controllers survive.
  Busy collectors, occupied guns and structural supports reject relocation.
  Hold X previews demolition's real support cascade and refund before committing.
- **Storage/maintenance:** Take All, Deposit Matching and deterministic Sort use
  the existing stack limits, leave overflow at its source and report the result.
  Interaction highlighting follows the selected usable target. Fuel/crawl,
  power shedding and service-deck repair needs are displayed together.
- **Camera/controls:** near-plane volume checks prevent corner/beam clipping,
  including the final interpolated render position. Obstruction pulls in quickly
  and releases gradually. Close local geometry fades smoothly. V swaps shoulders
  in normal play. Settings add sensitivity, FOV and context-specific key/mouse
  remaps, with explicit conflict handling and persistent recovery controls.
- **Animation:** S-07 has directional armed walking/running/crouching, bounded
  upper-body aim, rifle/shotgun reload hand motions and stance-aware two-bone foot
  contact. The four mechs have distinct strike/recoil, hit and death presentation.
  Authored motion changes neither player physics nor combat timing/damage.

## Task coverage and evidence

| Tasks | Implementation / acceptance |
| --- | --- |
| POL-00/01 | Original checkout, input reproductions, source/asset inventory and frozen interfaces retained in `baseline/` and `contracts.md`. |
| BLD-01/02/03, INT-01 | [12 real-game build invariants](acceptance/build-invariants/results.json): 4/8/11 m targets, >12 m rejection, all three deck commits, catalog and placement threat handoff, held-input suppression, actual IndexedDB save during preview. |
| BLD-04/05 | Real full-crate V/click relocation with stable ID and contents; transaction/rollback, device identity, supports, busy cases and state tests in `build-relocation.test.ts`. Long-run resource acceptance is recorded below. |
| INV-01/02, HUD-01 | Bulk transfer conservation/overflow tests, DOM button tests, [14 actual-game storage checks](acceptance/build-storage/results.json) and [gameplay review](acceptance/visual/). |
| IN-01/02/03, CAM-01/02 | [8 browser controls checks](acceptance/controls-qa.json), real successful/denied pointer lock, UI remapping/FOV persistence, physical remapped inputs, camera volume and held-input unit fixtures. |
| ART-00/01/02/03 | Five editable Blender sources, reproducible export/append scripts, original geometry/BIN preservation and [zero-error glTF validation](asset-validation.json). See [asset delivery](../../assets/animation-polish/README.md). |
| AN-01/02/03 | Directional cadence, authoritative reload override and bounded visual IK; [eight built-stair checks](acceptance/stairs/results.json), [four authored-stair checks](acceptance/authored-stairs/results.json), authored/runtime contact sheets and actual gameplay captures. |
| AN-04/05 | [36 combat muzzle comparisons](acceptance/combat-parity.json): all four real GLBs at 30/60/144 FPS retain exact original muzzle positions, clip order and transition behavior (maximum difference 0). Cosmetic muzzle motion is separate. |
| INT-02, QA-01 | Integrated save/reset/opening/cinematic/UI lifecycle; unit/lint/build and focused compatibility acceptance recorded below. |
| QA-02 | Hardware visual, performance and 100-cycle/10-minute lifecycle evidence recorded below. |
| REL-01 | Release pending final acceptance; no deployment is claimed by this record yet. |

## Review findings and corrections

- Initial animation exports inverted the mech root at death. Resetting every
  bone's basis before each authored sample corrected the fall pose. Original
  combat clips and mesh data remained untouched.
- Ground probes now account for the boot sole, preserve bone lengths and release
  the swing foot. Reload channels override the upper body after locomotion rather
  than competing at half weight with a second full-body mixer action.
- Close-camera fading initially compiled shaders during play. Its material clones
  now retain authored fog callbacks, warm before play and survive opening/load.
  Equipment replacement disposes only retired clones. Visual review rejected a
  grainy alpha-hash experiment; the delivered path uses smooth single-pass blending.
- A final close-camera review found translucent helmet/backpack surfaces filling
  the view. The player now fades out before the camera enters the gear and fully
  faded geometry skips rendering. Its skeleton and physics continue updating;
  load, equipment changes, camera withdrawal and disposal restore visibility.
- Locomotion now uses resolved self-movement after subtracting the machine's
  applied carry, preventing a walking gait against walls or while standing still
  aboard. The original movement speed, facing policy and combat spread remain intact.
- Long-session testing exposed empty physics bodies left by equipment relocation
  and build restoration. Box-helper bodies now have explicit ownership and are
  reclaimed with their final collider. Explicitly owned shared machine bodies
  remain intact. A real-Rapier 100-replacement test guards this fix.

## Validation status

Final validation passes lint, **1,180 tests in 119 files**, the production build
with the Pages base path, and media packaging. [Unit results](acceptance/validation/unit-tests.json)
and [build output](acceptance/validation/build.log) are retained. The existing
large-bundle warning remains; it is not a build failure. The seven baseline
balance/schema/timing files remain [byte-for-byte unchanged](acceptance/preserved-gameplay-definitions.json).
The focused [compatibility harness](acceptance/compatibility-qa.json) passes the
opening hand-back, 100% signal cinematic, both boarding sides and real hook
damage, and docked expedition save/load/progression/departure. Its JSON states
which setup uses campaign fixtures and which transitions use physical input.
Both boarding sides also pass [physical hold-E hook cutting](acceptance/hook-cut-qa.json)
through the real input, proximity, hold-charge and retreat paths.

Final visual review includes [720p and 1080p catalog/placement captures](acceptance/visual/results.json),
[the actual-game review clip](acceptance/visual/gameplay-polish-review.webm) and
[twenty runtime character/weapon poses](../../assets/animation-polish/review/).
The clip uses isolated saves, prepared positions and enemy spawning to review
the presentation; movement, reload and build controls use physical browser input.
Inherited panel positioning and unreadable unlock IDs were corrected during
this review. The maintenance view says "No repairs needed" when all subsystems
are sound.

The initial lifecycle run is retained in
[lifecycle-soak-before-fix](acceptance/lifecycle-soak-before-fix/results.json).
It correctly failed because empty bodies accumulated. The corrected
[100-cycle, ten-minute run](acceptance/lifecycle-soak/results.json) passes with
zero errors and exactly stable counts: 25 physics bodies, 439 geometries,
490 textures, 174 shader programs and 141 scene materials. All cycles retain
the same three pieces and 35 stored items through relocation/save/load and
repeated four-mech combat. The subsequent velocity correction only changes
animation input math. The final close-camera visibility shortcut adds no resource
allocation and passes another 100 hide/restore cycles; neither changes ownership.

Performance folders `after/`, `final/`, `accepted/`, `optimized/` and `clean/`
contain **diagnostic iterations, not release acceptance**, despite their original
working labels. Some samples overlapped unrelated Blender/background browser
work on the host. A contemporaneous original-build check also slowed substantially;
the first three baseline samples are retained unchanged. The intermediate
`release-performance/before-visibility-current-*` runs include the close-camera
case that prompted the final hide/draw-skip correction; none was substituted
into the final series.

The [final hardware comparison](release-performance/README.md) includes all three
30-second samples for every scenario at 1920×1080 High on RTX 3070/D3D11:

| Scenario | Original median FPS | Final median FPS | Change |
| --- | ---: | ---: | ---: |
| Deck | 59.73 | 60.00 | +0.45% |
| Rapid camera turns | 59.96 | 59.80 | -0.27% |
| Eight mechs and rapid turns | 57.93 | 57.07 | -1.48% |

The final crowded samples range from 54.67 to 58.80 FPS, with p99 near 33.4 ms,
three frames over 50 ms across 5,119 measured frames, and one 83.4 ms frame.
The contemporaneous original-build crowd control measured 55.60 FPS. No final
scenario's median regresses by 5%; occasional hitches and desktop variability
remain, so this is not a locked-60-FPS promise. Shader programs remain at 174
through every final sample, with no late fade variant compilation.
The [direct fade check](fade-shader-diagnostic.json) measures 708 restored-model
draws versus 501 fully-hidden draws in the same view, with 174 programs before
and after first use and another 100 visibility cycles.

## Scope limits

Reload presentation moves the hands and arms; it does not add removable magazines
or a per-shell shotgun mechanic. Foot contact is a bounded visual correction,
not full-body IK or ragdoll. Enemy death retirement and hit response do not stun
enemies or alter difficulty. Catalog thumbnails are lightweight original SVG
symbols. No new story, progression, model polygons or texture sets were added.
The existing trailer remains available; this round did not commission a new one.

## Reproduce

Start the current checkout at port 5201 and an original `1cf3835` checkout at
5203. Every harness uses isolated browser storage. Run GPU work sequentially.

```powershell
npm run lint
npm test
npm run build
node tools/polish/build-invariants.mjs
node tools/polish/controls-qa.mjs
node tools/polish/build-storage-qa.mjs
node tools/polish/combat-parity.mjs
node tools/polish/compatibility-qa.mjs
node tools/polish/hook-cut-qa.mjs
node tools/polish/lifecycle-soak.mjs
node tools/polish/gameplay-review.mjs
node tools/polish/capture-animation-review.mjs
```

`tools/performance-smoothness.mjs` accepts `MMF_PORT`, `MMF_QA_OUT`, `--label`,
`--seconds`, `--seed` and `--distance`. `performance-isolation.mjs` temporarily
disables features only inside its test page to identify costs; it is not a
playable configuration or a release performance claim.
