# ART100 — Wasteland assemblies

25 complete original model assemblies: ten existing wasteland landmarks refined in place, plus fifteen new desert, railway, power, survey and story props. Original runtime files and Blender sources are preserved. The replacement set is `godot/art/art100-wasteland.glb`.

Each existing model keeps its exact root mesh ID and primary silhouette. Refinement adds actual service hardware and architectural detail, small physical edge chamfers, area-weighted normals, and shared portable PBR finishes. The new set uses specific functional designs: a six-wheel science rover with sample gantry; a peaked signal arch; a workshop reel lifting frame; six-wheel locomotive running gear; a sealed relay vault; and water, power and salvage infrastructure.

## Deliverables

- `art100-wasteland.blend` — editable mesh gallery, arranged on 25 m centres. Objects retain independent meshes and material assignments. Gallery positions are intentionally different from runtime origins; rebuild to re-export safely.
- `manifest.json` — all 25 exact IDs, status, feature description, dimensions, bounds, triangles, used materials, grounding, topology diagnostics, and broad-phase collision hints.
- `contact-sheet.png` — all 25 assemblies together.
- `contact-sheet-1.png` through `contact-sheet-5.png` — larger inspection sheets.
- `renders/` — individual 768 × 576 Cycles material renders.
- `textures/` — shared neutral substrate maps. Phase 2 paint maps use the fourteen-family palette from `assets/art200/palette.json` and its companion wasteland textures; all required maps are packed in the Blender source and embedded in the runtime GLB.
- `validation.json` — Khronos glTF validator results and export contract checks.
- `visual-review.json` — receipt for direct inspection of all 25 final renders, including corrected support/contact issues and the reviewed GLB hash.

## Runtime contract

Godot +Y is up, units are metres, and every exported top-level mesh has identity transforms. All 25 minimum ground elevations are zero. After independent review repairs, the combined set is **243,204 triangles**, with a maximum **20,252 triangles** on the passenger coach. The ten refinements total 128,124 triangles; the fifteen later assemblies total 115,080. There are 35 shared PBR materials across fourteen coherent muted paint families, with at most six used surfaces per assembly. Preserve Godot's generated LODs and shadow meshes when importing.

Every model received a specific physical refinement in phase 2: bracketed window sills, actual ladder standoffs, supported service covers, valve hardware, bearing seats, drain connections and similar functional construction details. Per-model descriptions are in `phase2_refinement` in the manifest. This adds 2.65% triangles over the archived ART100 delivery. Explicit triangulation and valid portable tangents now accompany all models. Three formerly blank site panels now carry meaningful DINER, DUSTLINE and STOP lettering.

All fifteen new assemblies have zero boundary edges, nonmanifold edges, degenerate faces and loose vertices. The ten retained architectural ruins include intentionally broken original sheet roofs, open concrete shells and glassless structures; their boundary/nonmanifold counts are disclosed in the manifest. No assembly has degenerate faces or loose vertices. This is visual geometry, not a promise of watertight volume for the original ruins.

The separate fine-comb pass corrected eight models: supported diner and coach furniture, connected fascia and roof members, planted greenhouse beds, anchored tunnel reinforcement, individually grounded loose rubble, a complete solar backing/support system, and hanging bogie brake beams. `fine-comb-repairs.json` records repairs and final render hashes; the independent findings are in `assets/art200/fine-comb/wasteland-review.json`. All 25 pass the component bounds support screen, supplemented by source endpoint checks and six reverse-view renders. This is 1.06% more geometry than phase 2. The reproducible repairs are in `tools/art/art100_wasteland/fine_comb.py`.

Collision dimensions in the manifest are **broad-phase bounds only**. Do not use a full solid bounding box for a building, arch or other walkable opening. Native placement owns segmented/trimesh collision, route clearance, interaction and scenery density. Models are static scenery; the shop hoist, checkpoint arm and valves are not independently articulated gameplay mechanisms.

## Rebuild and verify

From the repository root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --threads 4 --python tools/art/art100_wasteland/build.py
python tools/art/art100_wasteland/contact_sheet.py
node tools/art/art100_wasteland/validate.mjs
```

Add `-- --skip-render` to rebuild only geometry, PBR textures, the manifest, GLB and Blender source. The builder uses only the two existing original wasteland GLBs plus authored geometry. No downloaded models, textures or generated reference imagery are involved. Contact sheets show the actual exported model geometry under a common review light rig.
