# Interior camera and galley polish

**Final local acceptance (2026-09-15):** All five implementation tasks are complete. The isolated cold Continue run passed at `test-results/interior-camera/2026-09-15T19-23-31-281Z`: all 13 structures (including producer progress and stored output), all 20 inventory slots and the three authored roots restore. The normal-input matrix passed at `test-results/interior-camera/2026-09-15T19-25-28-084Z`: both shoulders, hip/aim at the galley and middle stair mouth, and normal upper/middle stair descent and ascent. Root visually reviewed all eight matrix frames. An additional 100-cycle clone-reuse test passes, bringing the expected CI total to 1,538. Local lint, types, production build and independent GLB validation passed. [Curated evidence, scope and performance limits](../../interior-galley/README.md).

The task descriptions below retain the originally proposed broader matrix. This release's accepted scope is the measured cloth regression, warning lifecycle, new galley models and the specifically recorded normal-input routes. All-station/all-deck/fallback manual coverage and manual relocation/demolition are follow-up coverage, not completed claims; unchanged camera, build and save behavior remains covered by the full unit suite. No current evidence requires changing those mechanisms.

The original screenshot at `test-results/continuity-meridian/run-2026-09-15T17-55-52-445Z/meridian-docked.png` proved that nearby opaque geometry could fill the playable view; it did **not** identify that geometry as the stove.

## CAM-01 — Identify the real close-quarters blocker

**Implemented.** The controlled orbit in `test-results/interior-camera/2026-09-15T18-46-20-756Z/orbit-3.2--0.35.png` identifies the authored `Tailored_hanging_banner` mesh using material `Nomad_cloth`. It was less than 1.5 m from the camera while the player body remained 3.84 m away and the boom fraction remained approximately 0.998. The separate level-pitch result identified the engine collider legitimately shortening the boom; that solid remains unchanged.

**Owner:** Root (render/physics integration and GPU evidence).

Instrument one diagnostic capture at the saved Meridian stove approach. Record the camera anchor and position, requested and collision-limited boom distance, first blocking collider, mapped scene object name/ancestry, material ownership, player position, current interaction ID, and distances to the stove and surrounding authored/build meshes. Repeat with procedural visuals, full art, both shoulders, hip/aim, and one clear aisle control.

**Acceptance:** The evidence names the actual foreground object and distinguishes camera collision shortening from a mesh rendered between the solved camera and player. No camera, collider, interaction, or asset behavior changes in this task.

## CAM-02 — Apply the smallest measured camera correction

**Owners:** Root owns `PlayerCamera`, `Game`, render/material integration, and visual acceptance. A Luna worker may own a new pure occluder-selection/state helper and focused tests after CAM-01 freezes its inputs.

Preserve mouse sensitivity, yaw/pitch limits, FOV, shoulder selection, hitscan origin, player capsule, station colliders, and interaction targeting. Choose from current camera mechanisms first: compact boom, safe-anchor recovery, and collision-limited boom. Add presentation-only occluder treatment only if CAM-01 proves the solved boom still renders a machine/build mesh across most of the view. Any treatment must:

- include only the measured machine/build visual between camera and player;
- exclude floors, terrain, player/enemies, expedition objectives, and UI;
- clone per-object materials rather than mutate borrowed/shared materials;
- restore exact original material and visibility state when clear, when the active camera changes, on turret mount, death, load/new game, and disposal. Pause and inventory retain the fade while the active camera is still the player camera so the paused background does not return to an all-cloth frame;
- remain bounded across 100 enter/leave cycles.

**Acceptance:** At the measured stove approach and at condenser, workbench, radio, cabin doorway, stairs, and a clear deck control, the player sees the prompt and a usable exit direction. Aim and interaction IDs before/after match. Prehidden objects remain hidden, borrowed materials remain unchanged, and renderer programs/material counts return to the warmed baseline. Full-art and fallback modes pass.

**Implemented evidence.** `test-results/interior-camera/2026-09-15T19-01-18-025Z/orbit-3.2--0.35.png` repeats the failing angle with the deck and player view clear. The implementation selects the single measured `Nomad_cloth` batch under `Canvas_and_Rigging`, uses owned material clones, and does not alter Rapier or `PlayerCamera`. Focused lifecycle/material tests are present. The High-quality sample at `test-results/interior-camera/2026-09-15T19-14-22-111Z/summary.json` held renderer programs at 181 and observed the cloth return from opacity 0.06 to 1 after the camera cleared it. Its only frame over 50 ms occurred while an ordinary skiff spawned. This is representative current-build evidence, not an exact before/after benchmark; the available Medium comparison used an archived distribution and showed the same spawn-related growth. The broader shoulder, aim, station, doorway, stairs, fallback, and cold Continue matrix is not yet complete.

## HUD-01 — Give encounter warnings an owner

**Implemented locally.** `OwnedWarning` uses generation-bearing tokens, while `HUD` exposes claim and exact-token clear operations. `Game` preserves the compatibility event ID `orchard-patrol-skiff`, derives the displayed patrol label from the current chapter, and clears its owned boarding warning on terminal boarding, docking, death, load, and new game. Focused stale-clear, replacement, reset, and Game reward/event tests are present.

**Owner:** Luna warning-helper worker (new pure helper/tests only initially). Root owns HUD and `Game` call-site wiring.

Current HUD warnings have no expiry or ownership. In addition, `Game.spawnScriptedSkiff` always emits compatibility encounter ID `orchard-patrol-skiff` and hardcodes the text `Orchard patrol`, even when the same scripted-skiff path runs for Meridian. Preserve existing event IDs consumed by saves/tests/evidence; derive player-facing label from the active expedition/route separately.

Freeze a small warning model with `show(owner, text)`, `clear(owner)`, `replace(owner, text)`, and `reset()`. Clearing a stale owner cannot erase a newer warning. Warnings are presentation state and are not serialized. Ordinary one-shot notices may keep their existing behavior.

Root wires owners at scripted, tutorial, ordinary, and optional-salvage skiff start, terminal boarding, player-death cleanup, load/new game, and destination docking. Gunboat messages that are ordinary one-shot notices remain on the existing replacement path. The current story objective remains independently authoritative.

**Acceptance:** Resolve the Orchard patrol and dock at Meridian: no Orchard warning remains and the Last Garden objective stays visible. Cover hook cut, boarder clear, vehicle kill, death/respawn, save/load, destination docking, and a new ordinary warning replacing an old owned warning. Compatibility event IDs and reward/raid ownership do not change.

## GAL-01 — Measure galley footprints and approach lanes

**Implemented locally.** Focused fixtures now compare the one-cell procedural bounds and collider extents and explicitly record that adjacent wide planters do not form a capsule aisle. They do not reinterpret the original cloth screenshot as a galley collision failure.

**Owner:** Luna galley-fixture worker. Read-only production audit plus focused data/geometry tests.

For stove, condenser, and planter, compare the declared one-cell placement, `pieceColliders`, fallback geometry bounds, authored model bounds, interaction point, and a radius-0.34 player approach from each exposed face. Include the representative late-campaign arrangement with nearby floor, generator, workbench, storage, and cabin/stair solids. Report measured mismatches; do not infer them from the screenshot.

**Acceptance:** Fixtures fail on a real mismatch in footprint, collider, anchor, or required service aisle and pass the current valid controls. Tests identify the exact mesh/collider responsible rather than merely asserting piece IDs.

## GAL-02 — Refine only measured galley defects

**Implemented locally.** Root authored `GalleyStove`, `GalleyCondenser`, and `GalleyPlanter` as 25 meshes / 38,740 triangles in a 4.685 MB kit with shared array-palette materials. Runtime mapping borrows cached geometry/materials and retains the existing colliders and gameplay definitions.

**Owner:** Root (Blender sources, exports, collider data, art and GPU review). Luna updates the frozen fixtures only for intentional authored bounds.

Keep recipe inputs/outputs, producer periods and capacities, power draw, costs, mass, health, armor, save IDs, grid footprints, relocation/demolition behavior, and interaction semantics unchanged. Adjust silhouettes, authored bounds, collider boxes, or interaction anchors only where GAL-01 proves a defect. Preserve a capsule-width service lane and distinct stove/condenser/planter silhouettes.

**Acceptance:** A normal-input player can walk the representative cluster, target each intended station without nearest-target ambiguity, collect water/greens, cook and use one ration, and exit. Save/load, relocation, demolition, fallback/full-art parity, and resource conservation pass. Blender/GLB validation passes. Representative warmed Medium and High samples show no material regression.

**Implemented evidence.** `test-results/interior-camera/2026-09-15T19-05-57-260Z/summary.json` records normal keyboard/mouse collection of water and greens, cooking and using one ration, and leaving the galley with no state grants, teleport, or accelerated simulation. `test-results/galley-mcp-review.json` and `assets/galley/previews/galley-kit.png` cover the authored source review. These runs verify the exercised galley route and interactions; they do not yet prove every save/load, relocation/demolition, fallback, or camera-matrix case listed above.

## Release order and limits

1. CAM-01, HUD-01, GAL-01, CAM-02, and GAL-02 are implemented locally.
2. The current full unit suite passes 1,537 tests, and the focused High-quality sample records stable program count and cloth restoration.
3. Cold Continue and the galley/stair shoulder/aim matrix are now complete as recorded above. Lint, TypeScript, production build and GLB validation passed independently. Remaining broader manual coverage is explicitly listed as follow-up scope in the delivery document.
4. Commit, run PR validation including the GLB contract, merge main, and verify the public deployment.

This iteration adds no chapter, currency, recipe, combat AI, save field, or new survival meter. Root retains all shared `Game`/HUD/camera/render changes and all Blender/GPU work. Sol reviews lifecycle, material ownership, conservation, and evidence claims.
