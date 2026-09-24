# Refined fixed cargo cases

Starting revision: `9d2672d`. The prior drum review exposed adjacent cargo cases with flat silhouettes, coarse wear and no convincing closures. This pass refines the four existing fixed cases across the three decks. It adds no story, inventory feature or progression rule.

## Implemented tasks

1. Audit the original Blender assemblies and frozen native batches, then capture all four native positions. Retain the original sites and dimensions; place the opening faces toward the internal walkways.
2. Author a shared Blender master with a gasketed lid, open-centre rim, pressed panel ribs, rounded corner guards, rivets, captured draw latches, interleaved hinge knuckles, folded carry handles and bolted restraints. Ground the rubber-backed skids on the existing decks.
3. Create original portable coating maps with restrained scuffs and wear near panel borders. Inspect front/rear studio renders and native views; correct corner-guard orientation, a covered lid recess, numerical bevel slivers and unreadable dark lettering in deck shadows.
4. Consolidate native dressing installation into one validated replacement. Remove complete old case/drum components from four frozen batches, preserve the unrelated pressure fittings exactly in Blender, and reuse their original material resource. Keep the previously refined drums, cables and access modules.
5. Share one four-batch mesh/material set among all four cases. Preserve the original collision bodies, scene layout and gameplay. Check actual walking, physical surfaces, tank clearance and stationary attachment through machine gait.
6. Compare matched native GPU views, run relevant regressions, and retain source art, review images and reproducible measurements.

The practical design reference was the reinforced corners and closures of the [ZARGES K470 transport case](https://zargesusa.com/products/k470-40568). All geometry, fictional markings and textures here are original; no manufacturer geometry, imagery or branding is bundled. See [editable assets and rebuild instructions](../../assets/native-cargo-lockers/README.md).

## Geometry and fit

The master retains **157 editable mesh parts**, exported as **24,790 triangles in four material batches**, approximately **3.56 MB**. The runtime's four instances share the same four mesh resources and four material resources; their transforms remain independent. Godot imports mesh LODs. This replaces 548 old body/band/handle triangles across four sites; it is an intentional increase in geometric detail.

The new master bounds are **1.108 × 0.851 × 1.028 m**, including handles, inside the previous case/handle envelope. Its local ground contact is Y=0. Cases keep their original positions at deck heights 8.83, 12.43 and 16.03 m. Two cases turn 180 degrees so their latches face the internal aisle. They remain closed environmental cargo, not additional usable storage stations.

The middle-deck case sits close to an existing pressure vessel. An exact triangle-projection check against that vessel's measured elliptical envelope gives a minimum normalized distance of **0.8915** for the old case and **1.1091** for the new one; values above 1 clear the envelope. Clipped corners provide that clearance without moving either object. This checks the measured vessel envelope, not every possible neighbouring accessory.

The retained pressure-accumulator batch contains 220 triangles. All source coordinates remain exact; Godot's imported vertex compression introduces at most **0.397 mm** of difference, below the 1 mm check. Original material resources are reused. Existing collider geometry stays conservative around the newly clipped case corners; no new collision shapes or bodies are introduced.

Runtime props have no per-frame callbacks, lights or particles. Tests verify that all parts remain fixed through machine gait. The original Three.js masters and frozen machine GLB are untouched; only the native presentation uses the derivatives.

## Rendering comparison

RTX 3070, 1920×1080, high Forward+/Vulkan, 4× MSAA, VSync off. Same native seed, surrounding assets, lighting and camera. Each view warms for 2.5 seconds and samples for 5 seconds; eight frames after image readback are excluded. The baseline restores the preceding two visible case batches and their original handles/material. The refined drums, access geometry and physics stay identical.

Both resource sets remain resident during the baseline, so this does not measure asset-memory differences. Gameplay is frozen; these timings are **not overall gameplay FPS**. Final measurements are recorded in `results/lockers-before.json` and `results/lockers-after.json`.

| View | GPU median before → after | Frame median before → after | Frame p95 before → after | Draw calls before → after |
|---|---:|---:|---:|---:|
| Upper starboard case | 2.576 → 2.820 ms | 3.098 → 3.361 ms | 3.972 → 4.182 ms | 236 → 242 |
| Upper port case | 3.234 → 3.456 ms | 3.767 → 3.969 ms | 4.662 → 4.885 ms | 884 → 903 |
| Middle-deck case | 1.993 → 2.157 ms | 2.452 → 2.624 ms | 2.930 → 3.317 ms | 159 → 161 |
| Lower-deck case | 2.415 → 2.590 ms | 2.913 → 3.087 ms | 3.569 → 3.788 ms | 256 → 260 |

The final measured median GPU addition is **0.164–0.244 ms** in these close views. Both final runs contain approximately 30 ms maximum frames. An earlier after-run also produced 46–48 ms maximum frames; that variation is not established as asset-related, and is not claimed fixed by the stencil adjustment. Small differences and rare stalls require longer controlled profiling before causal conclusions.

This is an art-quality improvement with a measured rendering cost, not a performance optimization. Shared resources limit duplication but do not establish a whole-game memory saving. Isolated long frames remain a separate investigation; this pass does not resolve or explain them.

## Verification

**513 selected assertions passed**, counting each final suite once:

- 56 focused case checks: four original placements, inward orientation, grounding and footprint, portable materials, nondegenerate triangles, four shared mesh/material resources, unchanged near-face physics, actual player walking, pressure-vessel clearance and static attachment.
- 37 dressing checks, including unchanged retained pressure fittings/material and all three previously refined service drums.
- 42 imported-collision regression checks.
- 108 integration, 132 audit parity, 58 play parity, 13 machine-access, 13 traversal and 54 rendered camera-clearance checks.

All 20 sampled case surfaces retain their physical positions. The real player stops approximately 0.850 m from each case centre when walking in from its clear approach, including capsule clearance. Access checks retain the 366 stair torso/head samples and 400 deck-height samples.

An initial geometry run found 240 near-zero triangles per case, introduced by limiting bevels and float precision. The final export removes faces below 0.001 mm² in the editable source before batching. All four imported instances now have zero degenerate triangles under the native check. Initial orientation, lid and lettering mistakes were also corrected before final capture.

Final selected import/test logs contain no script errors or resource-leak warnings. Test campaigns and settings are isolated. The full gameplay regressions passed before the final stencil colour adjustment; focused asset checks and the rendered camera suite passed again with that final material. This is not a full manual campaign playthrough.

Run from the repository root:

```powershell
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script tests/cargo_lockers.gd
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script tests/deck_dressing.gd
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script tests/locker_review.gd -- --legacy --label=before
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script tests/locker_review.gd -- --label=after
```

Evidence lives in `results/cargo-lockers.json`, `results/lockers-*.json` and `previews/lockers-*.png`. Raw logs remain in ignored `test-results/godot-native/`.

The full enhancement goal remains active. The native middle-deck views now make the neighbouring low-detail valve, pressure gauge and switchgear the next concrete presentation targets. Full-campaign feel and the independent frame-stall investigation remain open.
