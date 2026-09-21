# Plan 3 — roomier Nomad and complete onboard art refinement

Parent: [Nomad foundation roadmap](2026-09-21-nomad-foundation-roadmap.md).
Status: implemented locally. Astra authored the v2 Nomad and eight props and
reviewed all onboard families; Luna/Sol delivered and reviewed layout/save adapters.
[Delivery evidence](../../campaign/nomad-foundations-delivery.md) ·
[Art inventory and retained-family decisions](../../art/nomad-foundations/README.md).

## Pre-implementation baseline

The current core is 12 × 16 m. Authored perimeter extents are approximately
13.95 × 17.55 m, with floors at 8.83, 11.83, and 14.83 m. Stair ramps, build levels,
caretaker samples, service points, opening jumps, and destination connections
depend on these coordinates. Several implementations repeat a literal three-metre rise.

This is a layout remodel, not a uniform scale operation. Keep S-07, enemies,
equipment, rail heights, steps, and controls at a believable human scale.

## Proposed measured blockout

| Element | Prototype target |
| --- | --- |
| Main core | 14 × 18 m, an extra 2 m in each horizontal dimension. |
| Outside platforms | Approximately 16 × 20 m overall, adjusted to provide genuinely usable circulation. |
| Deck spacing | 3.6 m, up from 3 m. |
| Deck heights | Keep lower floor at 8.83 m; middle 12.43 m; upper 16.03 m. Preserves underbody clearance while raising upper connections. |
| Main circulation | Continuous clear routes about 2 m wide; 2.2–2.4 m at busy service areas and stair landings where practical. |
| Interior head clearance | Target at least 3 m under ordinary beams; no unmarked low beam on a required route. |
| Stairs | Preserve at least the current ~1.92 m clear width; lengthen the run to about 4.8 m for the 3.6 m rise, rather than making it steeper. |
| Service clearance | Clear standing/aiming space at each required interaction, with no cabinet or hose crossing the approach. |

These are blockout acceptance targets, not final exported dimensions. Measure
actual clearance with the character and camera before committing the art. Keep
the 2 m horizontal build grid. Specify the new level rise once and consume it
throughout the runtime and the Blender exporters.

## Layout tasks

| ID | Owner | Specific work | Acceptance |
| --- | --- | --- | --- |
| L-01 | Astra + Luna | Audit and centralize the Nomad layout profile: deck rise/extents, floors, stair opening/ramp/landings, safe spawn, service points, gate, helm, radio/scanner, leg hips, and named art anchors. Include `Machine.fixedLinks`, the caretaker ramp samples, and generator/exporter constants. | All coordinate consumers identified; no parallel nominal dimensions in Blender and runtime. |
| L-02 | Astra | Build and render a three-deck greybox/cutaway, with real equipment envelopes. Arrange distinct helm/scanner, workshop/storage, and galley/service areas. | Continuous circulation; required stations and openings can be seen and approached; open platforms feel visibly roomier. |
| L-03 | Luna + Astra | Update procedural support floors, walls/stairs/roofs, ramps, building reservations, room detection, obstacle bounds, shared solids, enemy navigation, `Machine.fixedLinks`, and L-12 portals to the same measured stair profile. Replace literal ramp offsets/slopes. | Player, enemy, and L-12 traverse all decks; built stairs/walls meet the revised levels without gaps. |
| L-04 | Astra | Remodel floors, columns, beams, catwalks, cabin, hull cladding, railings and service bays in Blender. Reposition whole equipment assemblies. Adjust hip attachment/underbody structures only where needed; preserve four-leg rig operation. | No stretched human-scale props, detached workbench pieces, misaligned railings, floating legs, or visual/collider disagreement. |
| L-05 | Luna + Astra | Re-anchor the opening rooftop jump, expedition gate/gangway, story and optional sites, skiff hooks/boarder landings, gunboat references, radio mount, and `SignalBattleScene` root/camera framing. Replace old 14.83 m harness coordinates. Expand camera/shadow coverage if required. | Normal-input rooftop escape, boarding, crossfire scene, and each existing campaign dock still work. |
| L-06 | Luna + Astra | Add `iron-nomad-v2` migration. Keep grid X/Z origin and structure IDs; remap player poses by source deck and relative height, then query actual support and clearance. Retain contents, conditions, jobs, research, fuel, and equipment orientation. | Legacy three-deck base and docked save restore without losing items or embedding the player. |
| L-07 | Astra | Export visual GLB, structural collision GLB, obstacle/shared-solid data, and manifests together; check fallback geometry against the same profile. | Authored and fallback paths agree; named nodes/pivots present; glTF validation clean. |
| L-08 | Luna + Astra | Run traversal/camera/placement/restore/boarding/docking matrix and matched performance review before asset signoff. | Evidence covers both stair directions, shoulder/aim/FOV extremes, equipment approaches, jumping, crowded builds, and L-12 deliveries. |
| L-09 | Luna + Astra | Replace the current `ON_THE_SAND_Y` / four-second `LOST_IN_THE_DESERT_S` control window with a pre-contact radioactive exclusion boundary and supported last-safe platform recovery. Recognize machine, connected gangway/destination, and opening rooftop surfaces explicitly. | No ordinary-input path or restored pose lets the player walk on sand. A missed rooftop jump returns to its safe rooftop anchor during the opening; other falls return to a valid machine/site anchor before contact. |

When a saved structure conflicts with the new base, use a deterministic supported
relocation on the same deck first. If none exists, retain it with its state in
`BuildSystem.recoveryPieces` and surface an explicit recovery notice. Do not
silently delete, duplicate, or refund a container full of items. Store/source
coordinates for pending recovery so repeated load/save cycles do not remap twice.
Stable instance IDs preserve turret and station state. Require equivalent recovery
piece data across two v2 save/load cycles; a v2 load must not re-run v1 migration
or repeatedly add migration support floors.
For saves on a destination, reconstruct the destination/gangway in the new layout
before validating the player's destination-local pose; explicitly derive/store a
destination-local coordinate or apply the source-layout transform before the
capsule query. Do not force every docked player back onto the upper deck. The save
validator accepts only absent (legacy), `iron-nomad-v1`, and `iron-nomad-v2` layout
tags; reject unknown tags before any load mutates live state.

The radioactive boundary must use actual valid support/terrain relationships,
not only a global Y cutoff that could mistake a low safe platform for sand.
Store last-safe points relative to their moving machine/destination root and
revalidate support on recovery. Detect a fall before the capsule touches terrain,
show a brief readable recovery cue, and never use a required sand landing to
bridge two platforms. Keep later penalties/suit mechanics outside this iteration.

## Complete onboard art inventory

Every row must end with either an improved export or an explicit visual review
that the existing asset already meets the agreed standard. “All items” does not
mean replacing good recent art merely to increase mesh counts.

| Group | Objects and readability goals |
| --- | --- |
| Navigation and communications | Physical helm, scanner/radio, antenna and repair-module socket, navigation upgrades, displays and controls. Distinguish offline, awaiting repair, scanning, and locked states. |
| Fuel and propulsion | Carried fuel canister, generator, refill port, tank, protected hose/line, gauge, engine/turbine, leg and engine service covers. Clear fuel path and truthful fill/health indicators. |
| Production and supplies | Refinery, workbench, stove, condenser, planter, seed garden, storage crate and automatic collector. Recognizable inputs, working area, outputs, fill/ready indicators and usable access. |
| Defense and robotics | Manual deck gun, automatic turret, gun service controls, L-12 dock and charging contacts, caretaker status fixtures. Preserve aim arcs and walkable approaches. |
| Construction | Deck plates, walls, doorways, railings, roofs and stairs. Consistent panel thickness, joints, fasteners and scale; floor finish distinguishes walking routes. |
| Lighting and decor | Lamps, chair, table, rug, shelf and keepsake displays. Improve contact shadows, material consistency and placement without cluttering routes. |
| Built-in machinery | Furnaces, pressure vessels, pumps, pipes, vents, crane, lockers, cable runs, fire/service cabinets and panels in the master hull. Clear hierarchy between decoration and functional controls. |
| Wearable interface | Wrist housing, screen, strap/cable/hinge, left-arm fit and raise/lower presentation. Coordinate with Plan 4 and existing gun/reload animations. |

Later heavy-salvage, recon, and defensive-screen modules use this same standard
and get their own Blender tasks when the deferred capability design is fixed.

## Blender refinement tasks

| ID | Owner | Work | Acceptance |
| --- | --- | --- | --- |
| A-01 | Astra | Capture the current assets at player eye height and label every prop family as readable/ambiguous/obstructing. Record interaction point, visible controls, collider envelope and source file. | A complete inventory, not just hero-object screenshots. |
| A-02 | Astra | Establish material/color rules: weathered charcoal steel, restrained ivory equipment panels, amber service indicators, cyan information displays, red urgent faults; pair all colors with shape/text. | Consistent function labels and believable wear across separate asset generations. |
| A-03 | Astra | First detail batch: scanner repair assembly, fuel canister/port/generator, cargo crates and hook. | Distinct silhouettes at real play distance; new controls and labels match live behavior. |
| A-04 | Astra | Second detail batch: refinery, workbench, storage, collector and all galley/growing equipment. Refine existing good galley assets instead of replacing them blindly. | Clear working surfaces, input/output areas, handles and fill states; no new passage obstruction. |
| A-05 | Astra | Third detail batch: defense, L-12 dock, helm and service panels; then construction and remaining decor/built-ins. | Every inventory row reviewed; no decorative handle or screen implies an unavailable action. |
| A-06 | Astra | Build bevels and smooth normals for silhouette; bake fine panel seams, bolts, grime and scratches into PBR maps; keep large functional pieces as geometry. | Smooth close-up shading, plausible roughness/metalness, no excessively noisy wear or glaring emission. |
| A-07 | Astra | Publish named interaction/status anchors, per-object material/geometry budgets, LODs and small shared atlases; preserve collision separately. Use the Blender MCP workflow when available and the reproducible Blender scripts for exports. | Editable `.blend`, repeatable build scripts, optimized GLB, fallback contract and validation manifest. |
| A-08 | Astra | Compare each batch in Blender closeups and in-game eye-level views on all decks, including dusty/dark conditions. Optional Unreal import confirms portable assets, not browser performance. | Before/after contact sheets plus issue list resolved; no approval based only on an Unreal beauty render. |
| A-09 | Luna + Astra | Validate loading, missing-file fallback, collider alignment, moving/relocated equipment, state lamps, and disposal. Profile assembled scenes, not only isolated props. | Bounded frame times/memory; indicators never claim fuel, charge, production or repairs not present in authoritative state. |

Prioritize small shared texture sets, reused geometry, and baked detail. Most
indicator lights should be emissive surfaces, not dozens of new dynamic shadow
lights. Keep player/combat animation unchanged except for the planned wrist pose.

## Primary paths and dependencies

- Layout/runtime: `src/data/iron-nomad.json`, `iron-nomad-obstacles.json`,
  `iron-nomad-shared-solids.json`, `src/game/constants.ts`,
  `src/machine/IronNomadGeometry.ts`, `IronNomadLegs.ts`, `Machine.ts`.
- Building/navigation: `src/building/BuildGrid.ts`, `BuildSystem.ts`,
  `BuildPieceGeometry.ts`, `RoomDetector.ts`, `src/enemies/NavGraph.ts`,
  `src/companion/CaretakerPortals.ts`, `CaretakerNavigation.ts`.
- Connections/restore: `src/game/Game.ts`, `OpeningDirector.ts`,
  `src/story/Destination.ts`, `src/player/RestorePlacement.ts`, save schema/codec.
- Authoring: `tools/art/iron_nomad/prepare_runtime.py`, `export_collision.py`,
  the existing graphics/galley/home/fieldwork/workshop authoring directories,
  `assets/iron-nomad/gameplay/source/`, and corresponding runtime model registries.
- Tests: existing Nomad, shared-solids, camera-volume, caretaker, build-grid,
  room, save-migration, opening, boarding, and campaign-docking suites/harnesses.

No gameplay layout change is complete until the visual export, collision shell,
reserved build cells, navigation links, interaction anchors and save migration
ship together. Source screenshots and art-only exports are intermediate results.
