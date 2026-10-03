# Character refinement — 25 September 2026

S-07 and all six enemy types now use refined native skins. [Open the before-and-after gallery](character-refinement.html) to compare full figures, head details and back views with matching lighting and poses.

The art pass rounds fabricated armor edges, reduces the bulk of S-07's temple and respirator fittings, reduces fastener size, subdivides and relaxes selected cloth folds, and retains more curved detail in the runtime meshes. Painted metal has less uniform, high-contrast chipping, less aggressive normal maps, and adjusted roughness/metallic values. The visor has a darker blue reflective finish. Existing silhouettes, palettes, identifying markings and equipment remain recognizable.

Each character remains one shared skinned mesh, with 9–15 material surfaces. The compiler replaces mesh resources on the original native scenes after verifying every binding name, order, matrix and mesh transform. Original node graphs, skeletons, animation keys, sockets and physical character scale are preserved. Encounter preloading now loads the refined scenes; the commander body and enemy footing are rebuilt from them.

| Character | Runtime triangles | Material surfaces |
|---|---:|---:|
| S-07 | 158,126 | 14 |
| Bastion | 100,514 | 10 |
| Revenant | 116,476 | 10 |
| Warden | 122,961 | 15 |
| Sovereign, before separating its drone | 125,774 | 13 |
| Raider | 88,545 | 13 |
| Scavenger | 48,407 | 9 |

The commander uses the existing separate drone at runtime; 3,788 placeholder drone triangles are removed from the refined combined skin. Tiny degenerate equipment sidewalls were removed during export. Weapon attachment coordinates and gameplay rigs are unchanged.

## Validation

759 checks pass across ten suites: character mesh/rig integrity, legacy enemy integration, enemy equipment, player locomotion, weapon presentation, wrist terminal, enemy animation, current boarding, enemy combat replay, and encounter loading. The mesh checks cover normalized weights, valid shading vectors, no collapsed faces, source hashes, exact animation keys and actual runtime model selection.

Native visual review covers seven front/detail/back views, raider and scavenger walk/attack/death/boarding poses, and an active deck encounter. On an RTX 3070, the six-enemy review scene at 1920×1080, high quality, Vulkan and 4× MSAA measured 3.824 ms median frame time / 3.271 ms GPU while walking, and 3.741 / 3.230 ms when fallen. This is an isolated scene with animation active and simulation frozen, not a full campaign performance claim.

The older `boarding_contract.gd` replay still dereferences a missing hook at line 39. It reproduces with the previous character assets. The current boarding suite passes all 69 checks; no combat behavior was changed for this art pass. Detailed results are in [character-refinement.json](results/character-refinement.json).

## Assets and reproduction

- Editable named component masters and packed materials: `assets/native-character-refinement/*-components.blend`.
- Portable refined skins: `godot/art/refined-*.glb`.
- Native scenes: `godot/art/refined-*.scn`, with provenance in `godot/art/character-refinement.json`.
- Original Blender masters remain intact. Browser assets are unchanged.

Run `tools/art/character_refinement/build.ps1` with Blender 5.1, then `tools/godot/setup.ps1` to import and compile the native scenes, commander mesh and footing. To re-export an edited component master only, use:

```powershell
& $Blender --background --factory-startup --python-exit-code 1 --python tools/art/character_refinement/export.py -- s07
```

Use `bastion`, `revenant`, `warden`, `sovereign`, `raider` or `scavenger` in place of `s07`. The export restores edited packed textures, optimizes geometry, cleans invalid sidewalls and UVs, preserves original joint bindings, and records triangle/material counts. `godot/tests/character_review.gd -- --label=before` or `--label=refined` regenerates native comparison captures.
