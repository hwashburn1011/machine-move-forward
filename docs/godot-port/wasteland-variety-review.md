# Wasteland models and scenery variety

Completed September 25, 2026; final travel profiling and handoff recovered after the machine reboot.

Ten new original Blender models are integrated into the native desert: a ruined diner, greenhouse, service station, observatory, passenger coach, excavator, fallen wind turbine, breached cooling tower, broken tunnel, and damaged solar farm. Their two libraries total 29,030 triangles. Editable sources, contact sheets, and reproducible builders are documented in the [places kit](../../assets/native-wasteland/places/README.md) and [industry kit](../../assets/native-wasteland/industry/README.md).

## What changes during travel

Eight scenery themes now last for unequal stretches of 4–12 chunks. Denser groups alternate with open desert. Positions, rotations, scale, burial, and tint vary while retaining the existing eleven-landmark limit. The closest roadside model does not repeat in consecutive chunks. Large landmark models have two complete intervening chunks before they may repeat along the same lateral band. The same model is never placed twice within one chunk. Recognizable wreck and container scatter also appears less frequently.

The placement is deterministic for a seed and chunk, including reverse travel, lateral bands, eviction, and reload. Cosmetic generation uses separate random streams. Real imported bounds remain available to cinematic avoidance, and the machine and right docking corridor stay clear. The new layout replaces native cosmetic scenery around existing campaigns; it does not require a campaign reset. These additions are background scenery, not new explorable destinations.

The importer required explicit vertex-color enablement for the industry's baked weathering. The runtime loader applies this to surfaces containing vertex colors and frees both prototype libraries when the world closes.

## Verification

Recovered results were checked against the final source and asset timestamps. All **477 focused checks** passed, alongside **109 campaign integration checks**:

| Suite | Passing checks | Evidence |
| --- | ---: | --- |
| Seeded layout variety, spacing, reverse/reload, RNG isolation | 167 | [Results](results/wasteland-variety.json) |
| Ten imported models, materials, actual bounds, lifetime | 76 | [Results](results/wasteland-assets.json) |
| Rendered scenery reconstruction and reload | 109 | [Results](results/wasteland-scenery-contract.json) |
| Prepared scenery streaming | 18 | [Results](results/wasteland-streaming-checks.json) |
| Battle hull and camera clearance | 107 | [Results](results/wasteland-crossfire-clearance.json) |
| Existing campaign integration | 109 | [Results](results/wasteland-integration.json) |

Across four seeds and 2,048 chunks (131 km of generated route), average model overlap between adjacent chunks fell from 0.263–0.267 to 0.127–0.133 using Jaccard similarity: approximately 50–52% lower. Same-position repeats fell from 31–32% to 5.7–6.4%. There were zero consecutive repeats at the nearest roadside position and zero large-model repeats at either of the two following chunk distances. These are placement statistics, not a guarantee that every distant visible object is unique.

Native captures inspected all ten models and three generated route positions. The contact sheets show the complete kits; the [aboard-machine capture](previews/wasteland-route-896.png) shows their integration with the existing desert.

## Performance and limits

The recovered [streaming profile](results/wasteland-streaming-profile.json) completed 40 accelerated forward/lateral boundary crossings at 1920×1080 on the RTX 3070. Forward-boundary CPU time was 1.786 ms median / 2.003 ms p95; lateral time was 0.619 / 0.777 ms. All 795 later chunk activations used prepared chunks, with no extra synchronous builds after initial setup and no recorded preparation step above 4 ms. This measures streaming work with gameplay paused, not gameplay FPS.

After the reboot, the remaining [30-second rendered travel profile](results/wasteland-travel-profile.json) completed with exit code 0 and empty stderr using Godot 4.7.2, Vulkan Forward+, high quality, and 4× MSAA. Across 7,992 samples and approximately 218 metres, frame intervals were 3.706 ms median / 4.626 ms p95 / 5.474 ms p99. Nine frames exceeded 16.67 ms, including a 283.707 ms startup frame and a later 146.519 ms pause. No main-loop tick or scenery preparation step above 4 ms was recorded; the later pause's cause is not established by this check. This short instrumented sample is not proof of stutter-free play or broader hardware performance. The full trace remains locally under `test-results/godot-native/wasteland-travel-profile.json`.

## Play and reproduce

Launch [Play Godot.cmd](../../godot/Play%20Godot.cmd) and start or continue a native campaign. The varied scenery appears as the Nomad travels.

Run `tests/wasteland_variety.gd` and `tests/wasteland_assets.gd` through Godot with `--headless --path godot --script`. Rendered review uses `tests/wasteland_review.gd`; scenery reconstruction uses `tests/scenery_contract.gd`. Boundary profiling uses `tests/scenery_streaming.gd -- --prepared --profile`, and the travel sample uses `tests/travel_profile.gd -- --seconds=30 --output=res://../test-results/godot-native/wasteland-travel-profile.json`. Omit `--headless` for rendered checks. These checks isolate their campaign saves and avoid writing player settings.
