# Nomad furnishings — 25 complete assemblies

An original, coherent furnishing family for the moving Nomad. Every entry is a
complete placeable object, not a loose fastener, material swap or colour variant.
These are cosmetic decorations, available through the existing build catalogue.
They do not simulate power, storage, sleep, health, water, radio reception or
production. The existing construction, movement, damage, cutter and save systems
own their behaviour.

## Design and manufacture

The refined family uses the fourteen muted paint families in the shared Art200
palette, graphite steel, aged alloy, ivory ceramic and matched woven canvas.
Each assembly uses at most eight material batches, with packed deterministic image
textures for fine albedo variation and roughness. Edge radii and weighted normals
give manufactured silhouettes; subtle grain replaces large noisy surface stains.
Individual assemblies include usable-scale handles, shadow gaps, folded lips,
retained fixings, backed labels, protected lenses, collars, valve guards and seams.

The furniture dimensions are human-scale metres. The sleeping berth is 1.93 m
long, chairs have approximately 0.5 m seat height, and desks have approximately
1 m work surfaces. Every root has its bottom at local Y = 0 and a footprint inside
one 2 × 2 m deck tile. Compound collision follows supports, shells and major
occupancy volumes. Open table kneespace, shelf bays, rack legs and lamp tripod
openings are retained instead of using a single enclosing collision box. Thin
cloth and small decorative leads are intentionally not separate obstructions.

## Contents

1. Rivetline tool drawers — seven drawers, work mat, corner guards.
2. Portside service cart — caster chassis, two flanged trays, service bottles.
3. Wayfarer field chair — canvas seat, back, armrests and welded frame.
4. Surveyor sleeping berth — full-length compact mattress, pillow and blanket.
5. Longwave radio cabinet — dual speaker grilles and analog tuning face.
6. Rivetline repair trestle — clear underside and forged screw vise.
7. Fastener library — twelve labelled bins on a freestanding shelf.
8. Standby charging cabinet — sealed bays and parked connectors; inactive.
9. Expedition flight trunk — stacking ribs, reinforced shoes and captive latches.
10. Archive specimen vitrine — caged sample tubes on a pedestal.
11. Forward chart desk — physical printed route, compass and rolled chart.
12. Survey tripod floodlight — segmented tripod, mast, yoke and lens guard.
13. Machinist task lamp — weighted stand, linked arm and enamel shade.
14. Survey coat rack — patched jacket, hangers and sling satchel.
15. Retrieval cable drum — wound cable, bearing stand and crank.
16. Crew gear locker — vented personal door and boot cubby.
17. Copperline galley sideboard — cupboard, thermos and enamel mugs.
18. Field ceramic washstand — dry bowl, tap, towel and open support frame.
19. Navigator swivel stool — circular cushion, foot ring and three legs.
20. Patchwork deck bench — separate cushions and repaired canvas patches.
21. Drive shoe service stand — spare shoe retained by a bearing cradle.
22. Cyclone filter column — ribbed housing, clamp rings and instrument face.
23. Twin canister caddy — guarded valves, retaining straps and wheeled frame.
24. Forward signal pennant — creased, thickness-bearing cloth on a deck mast.
25. Carried memories board — pinned postcards, field notes and route thread.

## Files and reproduction

- `NomadFurnishings.blend`: editable unjoined source; all parts are named and
  parented to their individual assembly roots. The overlapping roots are local
  zero-origin assets, not a placed environment.
- `manifest.json`: exact catalogue IDs, names, costs, weights, compound collision
  and measured geometry bounds for all 25.
- `geometry-report.json`: per-model dimensions, triangle and material budgets.
- `textures/`: deterministic shared albedo/roughness texture pairs. Current
  palette textures are also packed in the Blender source and embedded in the GLB.
- `nomad-*.png`: studio renders of the actual exported geometry.
- `contact-sheet-01.png` through `contact-sheet-05.png`: five-model review pages.
- `validation.json`: Khronos glTF validation plus ground and budget checks.
- `support-gap-screen.json`: individual-part and grounded-component support audit.
- `godot/art/art100-machine.glb`: complete runtime kit, joined by material only.
- `godot/data/art100-machine.json`: catalogue and collision definitions.
- `godot/scripts/art100_decor.gd`: cache, registration and model extraction.

From the repository root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --threads 4 --python tools/art/art100_machine/build.py -- --render
python tools/art/art100_machine/contact_sheet.py
node tools/art/art100_machine/validate.mjs
```

Runtime integration calls `MMFArt100Decor.apply(data)` before constructing the
session, `MMFArt100Decor.runtime_contract(runtime)` before placing structures,
and `MMFArt100Decor.model(id)` from the normal building model selector.
`MMFArt100Materials.prepare` supplies native mipmapped anisotropic filtering.
The dedicated `godot/tests/art100_decor.gd` verifies catalogue idempotency,
grounding, budgets, compound physics before and after movement/rotation, exact
purchases and the existing native save round trip. It also checks that selected
open furniture centers remain empty.

After the first full refinement, the collection has 98,743 triangles in total and
at most eight material batches per model. The embedded-texture GLB is 6,382,068 bytes. Only the
selected furnishing is instantiated for an individual preview or placement.

Initial-iteration validation on 2026-10-01: Khronos glTF validator reported zero errors and zero
warnings. The dedicated Godot 4.7.2 headless suite passed 668 checks with zero
failures and no resource leak output. All 25 studio renders were reviewed on the
five contact sheets for silhouettes, floor contact, framing and legible details.
The final support review added intersecting spokes and keyed hubs to the basin
and canister handwheels, then rerendered and inspected those two assemblies.

The subsequent Art200 first refinement regenerated all twenty-five old assemblies
with the shared muted palette and efficient small bevels, seated the parts bins,
backed a vent and labels, connected the trunk grip, and conformed the pennant
stencil to the outside cloth surface. All twenty-five updated renders were
inspected. Current glTF and support audits pass; the coordinated-import native retest passes
678 checks with zero failures or resource leak output.

## Second independent fine-comb

Completed on 2026-10-02, separately from the first refinement. An independent
reviewer evaluated all fifty old and new furniture masters with a stricter 4 mm
support screen. The finishing pass adds compact physical mounts under the filter
column, sample tubes and vise, backs both radio diaphragms, seats raised graphics,
and removes zero-area or microscopic collapsed faces without welding useful
surfaces. Existing collision definitions and structural dimensions are preserved.

All twenty-five old assemblies now pass the stricter screen with zero unsupported
groups, nonfinite vertices or degenerate faces. The final export has 98,811
triangles in 6,400,988 bytes; Khronos validation reports zero errors or warnings.
Affected individual renders and all five contact sheets were refreshed and
independently inspected. `../../art200/fine-comb/machine-review.json` records the
complete fifty-model independent review and closed findings.
The exact evaluated measurements are in
`assets/art200/fine-comb/machine-geometry-independent.json` from the repository
root. `tools/art/art200_machine/fine_comb.py` is invoked by the regular builder
so the attachment and topology corrections are reproducible.
