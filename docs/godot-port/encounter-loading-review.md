# Encounter loading and warning performance

Starting state: `69f07b2`. Continues the existing enhancement goal after the hover-craft/grounding pass. That review measured an approximately 200 ms uncached commander spawn. This pass reduces first-use enemy and repeated artillery-warning stalls without changing combat, art detail or story.

## Implemented tasks

1. Instrument the real enemy setup function in a test-owned subclass, separating resource loading, instantiation, animation, equipment and warning construction. Preserve the preceding setup and shell-warning functions in a revision-labelled fixture for repeatable comparisons.
2. Prepare six existing enemy scenes and the commander's drone through seven bounded engine resource requests. Keep one outstanding request, collect only completed work during normal preparation, reuse shared cached resources and stop processing when finished. Prepare the four immutable warning materials one per frame. Create no actors, consume no gameplay RNG and advance no session state.
3. Gate immediate New Game on the completed preparation. Existing loading-screen cancellation, repeated clicks, Continue and unfinished-opening save fallback remain supported. The actual 10.2-second opening timing is unchanged. A synchronous asset request that arrives early owns and joins a matching engine request; the preparation owner still consumes its own result. Teardown drains its one outstanding request.
4. Bake the two original torus meshes and share them. Preserve exact positions, UVs, indices and bounds; native packed normals/tangents differ by less than 0.012 degrees. Share identical ready/danger/vulnerable/shell materials. Each enemy switches material references independently, and each shell keeps its own node, transform and lifetime. Geometry, glow, warning visibility, offset and shadow behavior remain verified. Add the reproducible mesh bake to native setup.
5. Verify resource ownership with real delayed engine-worker fixtures, overlapping requests, early synchronous use, wrong resource types, cached repeats, cancellation and teardown. Run existing combat, opening, scanner, boarding, animation, saves, audio and desert checks; measure the final native renderer.

Godot's [background-loading guidance](https://docs.godotengine.org/en/stable/tutorials/io/background_loading.html) explains why retrieving unfinished work blocks. The [resource-loader implementation](https://github.com/godotengine/godot/blob/master/core/io/resource_loader.cpp) informs matching ownership for repeated requests. The [material implementation](https://github.com/godotengine/godot/blob/master/scene/resources/material.cpp) confirms that obtaining a StandardMaterial render resource prepares its shader lazily. Actual behavior was tested on installed Godot 4.7.2; current upstream source alone is not treated as runtime proof.

## Native measurements

RTX 3070, 1920×1080, high Forward+/Vulkan, 4× MSAA, VSync off. Separate sequential processes use the same real world, models and frozen camera, with a 1.2-second title preparation window. Measurements concern first resource use in each process, with an already-used OS disk cache. Setup includes the actor node and all original setup statements; through-render includes the next rendered frame. Capture readbacks occur after timing. This is not ordinary travel/combat FPS.

| Enemy | Setup before, ms | Setup after, ms | Through render before, ms | Through render after, ms |
|---|---:|---:|---:|---:|
| Sovereign | 228.284 | 1.259 | 238.961 | 8.271 |
| Bastion | 117.012 | 0.702 | 125.953 | 7.945 |
| Raider | 102.225 | 0.431 | 114.070 | 7.971 |
| Scavenger | 59.414 | 0.438 | 66.367 | 7.937 |
| Warden | 15.557 | 0.674 | 22.478 | 8.192 |
| Revenant | 15.275 | 0.725 | 22.899 | 8.391 |

A three-shell warning burst changed from **14.636 ms to 0.044 ms median CPU creation time** across five bursts. Through-render medians changed from **21.889 to 8.291 ms**. The detailed trace found synchronous enemy/drone loading and first material preparation to be the main costs; the ring mesh itself was a smaller cost. Shared warning materials also remove repeated per-enemy color uniform writes.

[Before measurements](results/encounter-loading-before.json) and [after measurements](results/encounter-loading-after.json) retain individual stages, burst timings and following-frame distributions. Preparation cached 27 entries versus 22; sampled static memory was about 166.9 MB versus 164.2 MB. Those are process static-memory snapshots, not VRAM or peak-memory measurements.

Immediate New Game was separately exercised at a real 60 FPS cap. With no title dwell, first opening frame changed from **669 to 990 ms**; entry-call CPU stayed below 0.5 ms. An intermediate version let asset work overlap the chase and produced a 179 ms mid-opening spike. The final preparation barrier removed that overlap in the measured run. The final run's large frames occurred during preparation or initial handoff, with no further >25 ms intervals after handoff through the original opening and first playable seconds. See [opening before](results/encounter-opening-before.json) and [opening after](results/encounter-opening-after.json).

Title startup is still imperfect: the matched encounter profiles had 121–213 ms maximum preparation-frame intervals, and title-window p95 was higher after the change. This moves unavoidable first-use work earlier and avoids rebuilding warnings; it does not establish an overall startup improvement, a universal stutter fix or a whole-game FPS gain. Direct Continue/incomplete-opening restores retain their synchronous fallback when used before preparation completes.

## Validation

**1,000 assertions pass across 16 suites**, including 36 focused loading/warning checks, 42 stored enemy comparisons over 1,680 ticks, and 18 stored ship comparisons over 4,320 ticks. Combat timing, movement, damage, rewards, shell counts, scanner/cinematic handoffs, controls and save behavior remain unchanged. [Focused evidence](results/encounter-loading-tests.json) and [suite results](results/encounter-regressions.json) retain counts and limitations.

Two headless suites emitted intermittent Godot dummy-texture initialization warnings despite passing their assertions. Both were additionally run on native Vulkan and completed with no script/renderer errors or leak warnings. This pass does not claim to fix the headless engine. The audio suite passes at real elapsed time; its initial accelerated `--fixed-fps` invocation was invalid for the mixer-clock release assertion. Final editor import and both native performance runs were clean. Tests use isolated saves and preserve personal settings.

Desert tests still verify sparse grounded details, restrained wind/sand movement, saved storms, normal water use in clear/exposed/sheltered weather, and removal of shelter advice from storm messaging. See the existing [desert refinement review](desert-life-review.md). Radioactive ground remains unsafe.

## Reproduce

```powershell
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script res://tools/bake_enemy_warning.gd
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script res://tests/encounter_loading.gd --fixed-fps 60
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script res://tests/encounter_loading_profile.gd -- --original --label=before
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script res://tests/encounter_loading_profile.gd -- --label=after
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script res://tests/opening_profile.gd -- --label=fast-start --title-seconds=0
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script res://tests/audio_lifecycle.gd --max-fps 60
```

The `--original` fixture restores preceding enemy setup and shell-warning construction and disables encounter preparation, while retaining the same art and world. `opening_profile.gd --without-encounter-preparation` provides the matching opening comparison. Run GPU profiles sequentially. Raw screenshots/logs/reports remain under `test-results/godot-native/`; compact evidence is committed beside this review.

The broad enhancement goal remains active. Legacy robot/gate surfaces, broader gait and full-campaign human play feel remain useful targets, as do independently observed startup/travel stalls outside these measured encounter paths. No new storyline or progression was added.
