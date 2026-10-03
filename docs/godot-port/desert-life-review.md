# Restrained desert refinement

Starting revision: `83304e4`. Scope: make the native desert feel less static and more plausible, retain the dust storm, and remove its water/shelter penalty. No new story, exploration rules or encounters.

## Implemented tasks

1. Remove the exposed-storm multiplier from native water consumption. Replace the forecast's shelter instruction with a clear visibility warning. Keep ordinary consumption, room comfort, enclosed-space audio and the full forecast/front/clearing cycle. Existing storm saves require no migration.
2. Inspect matched upper/lower deck views. Tone down the doubly warm orange sand, strong grain and glint; introduce broad mineral variation through existing stable world-space noise. Preserve the terrain height function and all CPU/GPU grounding contracts.
3. Author seven original Blender assemblies with smooth tapered branches, curved weathered deadwood, scoured stone geometry and painted vertex colours. Retain editable source, export and studio render; append a review scene through the connected Blender MCP without replacing existing scenes.
4. Place details in sparse deterministic clusters, with two near-road and two more distant opportunities in the central band. Keep travel/docking corridors and existing scenery footprints clear. Fit the root orientation to the dune slope and partially bury the bases. A maximum of 20 accepted props per central chunk and 10 per outlying chunk keeps the landscape open; actual placement is usually lower.
5. Use shared MultiMeshes/materials, automatic imported mesh LODs, 160 m detail visibility and shader-only wind with fixed roots. Add at most one small, terrain-conforming airborne sand sheet per central chunk, visible within 125 m. No per-prop process callbacks, new lights, collisions, gameplay RNG or particle allocation.
6. Inspect both staged native close-ups and naturally spawned clusters. Correct the importer ignoring vertex colours, account for glTF's flipped V coordinates in wind pinning, and soften an overly regular deadwood silhouette. Verify the old scenery contract, weather saves, gameplay and streaming.

## Art and reference

[Editable source and rebuild instructions](../../assets/native-desert/README.md). Seven assemblies total **26,660 triangles**, exported GLB **757,980 bytes**. The 30,000-triangle whole-kit budget is checked automatically. Models are reused across instances; they do not each create a new asset or material.

[NPS wind landforms](https://home.nps.gov/subjects/geology/aeolian-landforms.htm) informed erosion/scouring; [White Sands shrubs](https://www.nps.gov/whsa/learn/nature/treesandshrubs.htm) and [Mojave spacing](https://home.nps.gov/jotr/learn/nature/deserts.htm) informed the slender, sparse vegetation. These are design references, not borrowed geometry or images. No biological/species simulation is claimed.

The natural details are visual. The radioactive ground stays unsafe, and saved player-built machinery, old ruins, contacts and story timing are unchanged. The retained browser implementation is unchanged; this request applies to the native Godot game.

## Rendered cost

RTX 3070, 1920×1080, high Forward+/Vulkan, 4× MSAA, VSync off. Same native seed, assets, lighting and deck cameras before/after. Each view warms for 2.5 seconds and samples for 5 seconds. Gameplay/travel is frozen to isolate presentation; these are **not overall gameplay FPS**. The third view uses maximum storm fog/wind with a fixed clear sky for comparison; the separate native storm image exercises the real weather sky transition.

| View | Before median GPU | After median GPU | Before median frame | After median frame | Draw calls before → after |
|---|---:|---:|---:|---:|---:|
| Upper deck | 3.372 ms | 3.402 ms | 3.885 ms | 3.974 ms | 941 → 959 |
| Lower deck | 2.846 ms | 2.876 ms | 3.317 ms | 3.383 ms | 1127 → 1145 |
| Maximum fog | 2.843 ms | 2.874 ms | 3.310 ms | 3.337 ms | 1127 → 1145 |

Observed median GPU addition is about **0.03 ms** in these views. This is a visual refinement, not a performance optimization. Roughly 30 ms isolated frame stalls remain in both before/after data and must not be attributed as fixed by this pass. Small timing differences are subject to normal host variation.

A separate 40-step accelerated streaming run retained 27 visible chunks and 13 prepared chunks. All **795 activations** reused prepared geometry; synchronous builds remained at the 27 startup chunks. Forward-boundary CPU cost was 1.452 ms median / 2.234 ms maximum; lateral cost was 0.633 / 1.084 ms. No individual builder stage exceeded the profiler's 4 ms reporting threshold. This checks streaming behavior under the added scenery, not a matched before/after speedup.

## Verification and review artifacts

- 27 focused weather/art/placement checks: normal water consumption in all storm/shelter combinations, mid-storm restore, complete weather cycle, pinned roots, vertex colours, deterministic seeds, lane clearance, actual dune height across negative/distant coordinates, occluder avoidance and bounded density.
- Original scenery signatures must continue matching their existing fixtures; new detail lives in a separate child group.
- Streaming coverage, prefetch, cancellation and seed reload remain tested. Replaced a flaky one-microsecond test setup with one deterministic real builder step: the old timing slice sometimes expired before starting work on a busy host.
- Broader integration and atmosphere checks plus GPU dune parity cover existing gameplay/effects and terrain height.
- Test directories: `native-desert-tests`, `native-desert-review`, `native-desert-close`; `test_mode` prevents personal settings writes.

Final result: **233 assertions passed** (27 focused, 54 scenery signatures, 18 streaming, 108 integration, 26 atmosphere), plus **4,096 GPU/CPU terrain samples** with a maximum 0.002609 m difference, including positions 50 km out. Import and final run logs contain no script/shader errors or resource-leak warnings. The initial flaky streaming setup was reproduced, corrected and rerun successfully; the initial material and UV issues were also fixed before these results.

Committed review images and measured JSON are under `previews/desert-*.png` and `results/desert-*.json`. Raw logs stay in ignored `test-results/godot-native/`. The model close-up stages the real kit on native sand for inspection; it is not a playable sand-level area. The cluster image shows an actual generated placement.

Run from PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -DesertTest -Headless
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -DesertProfile
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -DesertReview
```

The wider enhancement goal remains active. Long-session play feel, held-weapon/model cohesion and intermittent rendering stalls are still separate review targets.
