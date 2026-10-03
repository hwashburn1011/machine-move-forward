# ART200 wasteland — 25 new complete assemblies

Original fictional desert businesses, transport relics and industrial equipment. These are 25 distinct whole assets, not individual parts or colour variants.

`Art200Wasteland.blend` is the editable master. It contains the 25 named assemblies in a 5 × 5 review grid at native metre scale. Component vertex groups identify structures, machinery, fittings and integral lettering. Select a named object and frame it with Numpad Period. The component groups remain selectable in Edit Mode. The source builder is the repeatable construction recipe.

Runtime: `godot/art/art200-wasteland.glb`. The export contains exactly 25 top-level meshes, identity transforms, embedded textures, Godot +Y up and ground at Y=0. Runtime roots use the IDs in `manifest.json`. `width` is maximum X/Z span; `theme` gives placement intent. All entrances, open frames, sieve openings and walking decks are geometry rather than painted illusions. Runtime placement owns collision geometry and must retain usable openings.

Muted paint and secondary colours follow `assets/art200/palette.json`. Every one of its 14 families appears. Paint colours are converted from sRGB into scene-linear shader values. Most assemblies use two related finishes with shared steel, aged aluminium and concrete. Sparse dark coating wear and slight roughness variation avoid blanket orange weathering or bright accent colours.

Build from the repository root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --threads 4 --python tools/art/art200_wasteland/build.py
C:/Python311/python.exe tools/art/art200_wasteland/contact_sheet.py
node tools/art/art200_wasteland/validate.mjs
```

Append `-- --skip-render` to rebuild geometry and export only. The snapshot helper at `tools/art/art200_wasteland/geometry.py` keeps this collection independent of later ART100 changes. No original ART100 source or runtime file is replaced by this build.

The manifest records dimensions, triangle and material counts, vertex groups, bounds and topology diagnostics for each assembly. `validation.json` is the Khronos glTF validator result. `visual-review.json` records the actual rendered review. The 25 individual renders and five numbered contact sheets provide inspectable previews.

Budget: at most 15,000 triangles and six material batches per model, 140,000 triangles for the collection. Final measured values are in the manifest. Physical subassemblies are intentionally intersecting closed components rather than a Boolean union. Three fine letter contours retain one shared nonmanifold edge apiece; there are no boundary edges, zero-area faces or loose vertices anywhere in the collection.

Phase 2 refines all 25 models with individually placed physical details, including wash-drum handles, cold-store hinge barrels, pumpjack cross-shafts, bridge bearing plates, trommel cradle rollers, complete clinic handrail posts and irrigation axles. The manifest records the change to each model. After independent review corrections, the collection totals 125,320 triangles, with a maximum 11,368 on one model and no more than six material batches. `phase2-review.json` records the separate rendered inspection of this pass.

The independent fine-comb pass additionally connected the laundry wash manifold, bridge deck to its side trusses, water-crane valve spindle to its handwheel, and ballast hopper to all four columns. All 25 pass the component bounds support screen, supplemented by authored endpoint checks and visual inspection of the four repaired renders. `fine-comb-repairs.json` records the owner repairs and final render hashes; the independent findings are in `assets/art200/fine-comb/wasteland-review.json`.

To rerender a frozen source without changing its GLB during game integration:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --threads 4 --python tools/art/art200_wasteland/render_review.py -- --collection=art200
```

Use `--collection=art100` to render the older cohort with the same light rig.

