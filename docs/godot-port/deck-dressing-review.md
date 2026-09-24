# Secured deck fittings and imported collision

Starting revision: `09244a9`. Continue refining the existing machine without changing its layout or story. The desert atmosphere and removal of storm-dependent water loss are already implemented and documented in [desert life](desert-life-review.md).

## Implemented tasks

1. Inspect the original Blender source and frozen native batches before changing perceived floating geometry. The three service-drum bodies already reached the upper deck at Y=16.03 m; their sparse geometry and lack of securing hardware made the attachment unclear.
2. Author three complete Blender assemblies with smooth pressed shells, rolled seams, recessed lids, capped bungs, curved labels, bolted feet and restraining hoops. Use continuous cylindrical UVs so weathering does not restart on every shell strip. Inspect the studio, live MCP scene and all three native close views.
3. Replace only the selected drum components in two frozen cargo batches. Preserve every other source coordinate exactly and reuse the original material on the retained fittings. Keep the existing stair cable/access refinements, all other cargo meshes, deck heights, original footprint and gameplay rules.
4. Turn the port drum's label and latch toward the open aisle. Its other side faces an existing locker. Keep all three assemblies static on the machine, with no new lights, particles or collision bodies.
5. Investigate a failed near-surface collision probe. Reproduce the error with the old importer, correct the conversion, and verify actual controller movement as well as rays and swept-body queries.
6. Run geometry, access, traversal, camera and gameplay regressions; measure matching native GPU views. Use the existing audio-drain helper in the play-parity harness to avoid ending that test before active hook sounds retire.

## Collision correction

`tools/godot/bake-runtime.mjs` freezes the original Rapier vertices and indices without changing their order. `MMFAssets.collider` previously copied that order directly into a Godot concave triangle shape. Godot uses clockwise front faces, while its default concave collision is one-sided. The required conversion was missing. [Godot ArrayMesh winding](https://docs.godotengine.org/en/4.7/classes/class_arraymesh.html), [concave shape collision](https://docs.godotengine.org/en/stable/classes/class_concavepolygonshape3d.html).

The old-code fixture reproduces rays passing through the near face and hitting the far face on all six axes. Reversing each imported triangle fixes the fixture and actual machine surfaces. A swept character-sized sphere stops outside the fixture on all six axes. The real player walks into each of the three drums and stops approximately 0.625 m from its centre, including capsule clearance.

The frozen runtime contains one such triangle collider with 135,052 triangles. Positions, indices' vertex membership, body count and triangle count stay unchanged; only front-face order is converted. Existing box colliders and separately authored native geometry are unaffected. Double-sided collision is not enabled. This is a correction to native collision behavior, not a change to machine layout or combat rules.

An initial walking probe approached the port drum from inside the neighbouring cargo locker. The corrected probe verifies its starting clearance and approaches from the open aisle, matching normal play.

## Art and rendering cost

[Editable assets and rebuild instructions](../../assets/native-deck-dressing/README.md). The three drums contain **180 editable mesh parts**, exported as **49,776 triangles in 15 material batches**. They replace 1,828 old drum/bead triangles; 84 unrelated fitting triangles remain. Native import compression changes retained fitting coordinates by at most **0.382 mm**, below the tested 1 mm threshold; their Blender source coordinates are exact. All exported drum triangles have nonzero area.

RTX 3070, 1920×1080, high Forward+/Vulkan, 4× MSAA, VSync off. Same native seed, camera, surroundings and generator. Each view warms for 2.5 seconds and samples for 5 seconds. The baseline restores only the old two visible batches in the current scene. Gameplay is frozen, so these are **not overall gameplay FPS**. Both resource sets remain resident in the review process; this does not measure asset-memory differences.

| Native view | GPU median before → after | Frame median before → after | Frame p95 before → after | Draw calls before → after |
|---|---:|---:|---:|---:|
| Starboard drum beside generator | 2.416 → 2.472 ms | 2.982 → 2.988 ms | 3.605 → 3.726 ms | 310 → 327 |
| Port drum, open-aisle view | 3.248 → 3.301 ms | 3.771 → 3.836 ms | 4.561 → 4.703 ms | 828 → 868 |
| Aft drum | 2.770 → 2.834 ms | 3.276 → 3.341 ms | 3.763 → 4.013 ms | 238 → 246 |

The measured median GPU addition is **0.053–0.064 ms** in these close views. This is a model-quality improvement with a small measured rendering cost, not an optimization. Draw counts include renderer passes and nearby visibility. Both runs still include isolated approximately 30 ms frames; the existing intermittent-stall investigation remains open. Small differences are subject to host variation.

## Verification

**457 selected assertions passed**, counting each final suite once:

- 37 dressing checks: installation, source-material reuse, retained coordinates, unrelated meshes, original cable refinements, orientation, deck contacts, bounds, zero-area faces, batch budget, existing collision and static gait attachment.
- 42 imported-collision checks: old-code reproduction, six-axis exterior contact, swept-body clearance, real machine surfaces, actual player walking, unchanged topology count and shutdown.
- 108 integration, 132 audit parity and 58 play parity checks.
- 13 access checks, including 366 stair torso/head samples and 400 deck-height samples; 13 traversal checks; 54 rendered camera-clearance checks.

An initial play-parity run ended with audio resource lifetime warnings after an in-flight hook test. A verbose trace isolated the pending audio streams. Its fixed-delay test teardown now calls the existing bounded mixer-drain helper and asserts retirement. The final verbose rerun passes all 58 checks with no leak warnings. Production audio is unchanged; no broader memory improvement is claimed.

Final selected geometry, collision, regression and rendered-review logs contain no script errors or resource-leak warnings. Historical initial-run logs remain in ignored `test-results/godot-native/`. Tests use isolated campaign directories and `test_mode`; they do not change personal settings or saves. These focused checks do not constitute a full manual campaign playthrough.

Committed evidence is in `results/deck-dressing.json`, `results/imported-collision.json`, `results/dressing-*.json` and `previews/dressing-*.png`. Run the focused checks and matching rendered views from the repository root:

```powershell
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script tests/deck_dressing.gd
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script tests/imported_collision.gd
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script tests/deck_dressing_review.gd -- --legacy --label=before
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script tests/deck_dressing_review.gd -- --label=after
```

The wider enhancement goal remains active. Nearby cargo lockers still have visibly coarse baked wear compared with the new drums; they are a concrete next art target. Normal-speed full-campaign feel and intermittent render stalls remain separate review tasks.
