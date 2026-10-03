# Detailed helm and aligned interaction

Starting revision: `d78eb84`. Scope: refine the existing upper-deck helm, align its interaction with its visible position and make its hardware reflect existing progress. No new story, rewards, navigation range, power draw or collision rules.

## Findings and implemented tasks

1. Inspect the original console in Blender and native views. Its simple casing and controls lack the detail of the surrounding refined equipment. The actual helm is at `(-3, 16.03, -9)` while its interaction used `(0, 16.03, -10)`, leaving a dead zone at the visible operator approach and a phantom trigger nearer the receiver.
2. Author an original sealed helm with grounded plinth/anchors, fitted skins, rear hinges/latch, screened ventilation, terminated conduit, seated sloping fascia, machined selectors, readable labels and a guarded bearing pod. Keep the original footprint and upgrade mounting coordinates.
3. Inspect studio/MCP/native output. Close the top-panel gap, move its label clear of the dial and fit the rear maintenance plate flush to its door. The fully upgraded view revealed the Meridian attachment covering the permanent identification: move that plate to the side and verify its contact and complete triangle clearance against the earned hardware. Flatten static export batches while keeping the Blender source editable and the dynamic/upgrade roots independent.
4. Remove the complete old dedicated helm subtree, including the baked earned dial. Show cartridge/cover variants and the live needle according to the existing course-gyro reward. Read existing power state for a restrained dark/green/amber status lens; add no light source or new consumption.
5. Derive interaction distance from the real helm position and compare the receiver against that same position. Preserve interaction priorities, reach thresholds, menu behavior and physical key bindings.
6. Recompile the finished native machine. Verify unchanged collider 73, physical walking/ray contact, imported mesh bounds, original earned actuator/governor/Meridian hardware, bearing motion, save/load, power loss/recovery, menu pause and broader gameplay regressions.
7. Compare native GPU cost in matching views and retain model, physics and test evidence. A fully upgraded close-up cropped the base; final review framing includes the complete assembly.

## Art and fit

[Editable source and rebuild instructions](../../assets/native-helm/README.md). The Blender assembly contains **259 mesh parts**, exported as **17 material batches / 63,110 triangles** across fitted and unfitted variants. Two original 512-pixel PBR sets provide restrained wear. Godot generates imported LODs and shadow meshes. The final GLB is **4,788,196 bytes** and passes Khronos validation with zero errors or warnings; remaining informational messages concern unused attributes and named empty anchors.

The rendered geometry stays within the original 1.2 m × 1.35 m × 0.75 m solid envelope. The deck seal touches the floor; nine fascia samples show approximately 0.57–1.01 mm of gasket compression, with no open gap. Full exported triangle comparison finds no intersections with surrounding machine geometry above the floor-contact plane. The test uses actual transformed vertices: a conservative AABB around merged angled controls overestimates their envelope and initially produced false failures.

[JRC's console brochure](https://www.jrc.co.jp/hubfs/jrc-corp/assets/pdf/product/j_sbj-9200.pdf) informed sloping operator surfaces, accessible service panels and concentrated cable entry. The model, textures and lettering are original game art. It retains the game's industrial wear and compact single-console form.

The bearing pivot remains `(-0.17, 1.276, 0.01)` with 0.41 radians of inclination. Original earned hardware retains its prior geometry and coordinates. Unrecovered gyros no longer appear installed merely because the browser export captured them; this is presentation of the existing unlock state, not new progression. Empty progress does not load the optional hardware library.

## Behavior and validation

The focused suite exercises the real physical E input at the previously missed operator position, the receiver at the old phantom trigger, vertical separation from the lower deck, actual walking/ray collision, original upgrade nodes, real fuel/power transitions and native save/load. Its **36 checks pass**. Geometry import has no collapsed triangles. The status lamp has independent material state per game and updates at four Hz of simulation time.

All **584 assertions pass** across ten suites: compiled-source equivalence (20), helm (36), integration (108), progression/navigation parity (132), remapped controls and interaction priority (66), physical play parity (58), camera clearance (55), desert/weather (28), existing story polish (59) and opening framing (22). Per-suite results accompany this review under `results/helm-regressions.json`. The compiled-source comparison covers 902 nodes, 520 resource uses and 404 shared resources, with no differences or stale sources. After the final identification-plate adjustment, the affected model/compiled checks and desert/weather suite were repeated successfully.

An older control-test fixture reported an intermittent resource warning after only four shutdown frames. It now uses the existing weak-reference audio drain and includes release in its result. Gameplay code is unchanged by that fixture correction. An independent verbose rerun did not reproduce the original warning; the final drain assertion verifies release directly.

During rebuilding, a transient Windows write failure left the offline compiler running after an assertion. The bake now returns failure explicitly. A real read-sharing lock test confirms exit code 1 and an unchanged previous scene; after releasing the lock, the normal bake succeeds. This tests build-tool failure handling, not player save behavior.

## Cost and review

RTX 3070, 1920×1080, high Forward+/Vulkan, 4× MSAA, VSync off. Four fixed native views, two-second warmup/four-second sample each. Physics is frozen and screenshots occur after timings. Both comparison modes load the reference and refined assemblies; only visibility differs. The final view includes all existing earned hardware. Runs are sequential without another game or Blender render.

| View | Before median GPU | After median GPU | Before median frame | After median frame | Draw calls before → after |
|---|---:|---:|---:|---:|---:|
| Operator approach | 3.735 ms | 3.741 ms | 4.287 ms | 4.239 ms | 1010 → 1025 |
| Rear service access | 3.019 ms | 3.087 ms | 3.567 ms | 3.582 ms | 614 → 620 |
| Opposite side | 2.907 ms | 2.852 ms | 3.412 ms | 3.325 ms | 470 → 476 |
| Fully fitted console | 3.600 ms | 3.607 ms | 4.118 ms | 4.079 ms | 930 → 940 |

Median GPU differences range from −0.055 to +0.068 ms in these fixed views, within small host/timing variation. Final timing is retained under `results/helm-before.json` and `results/helm-after.json`; selected native images are in `previews/helm-*.png`. These measurements isolate the console's presentation cost. They do not establish an improvement in gameplay FPS or resolution of older startup/intermittent stalls.

```powershell
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script res://tests/helm.gd
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script res://tests/helm_review.gd -- --legacy --label=before
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script res://tests/helm_review.gd -- --label=after
```

Tests use isolated native saves and preserve personal settings. Reimport and rebuild the compiled machine after art/assembly changes, as documented in the native README. The wider goal remains active: other plain fixtures, full-campaign human play feel and independently observed startup/intermittent stalls still need inspection.
