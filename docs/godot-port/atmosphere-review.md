# Native atmosphere, grounding and effect allocation

This iteration continues the [enhancement goal](enhancement-goal.md) from `a124e43`. It improves existing presentation and performance; campaign content, ending, damage, attack timing, construction, original Three.js files and personal saves remain intact.

## Changes

- Three original Blender assemblies: supported torn canvas mast, caged wind-driven ventilation rotor, and solar warning beacon. The [source kit](../../assets/native-atmosphere/README.md) includes reproducible build/MCP review scripts, editable source, GLB, manifest and contact sheet. All were inspected in Blender and Godot. Geometry is smooth, bevelled and detailed; named cloth/rotor/lens parts remain independently animated.
- Deterministic sparse placement alongside existing wreckage, with clearance checks and a clear travel/docking corridor. Cloth responds to wind, the fan turns around its bearing, and beacon emission pulses without new dynamic lights. Scenery chunks now enter the scene at their real positions, avoiding an initial pileup at the origin before the first simulation tick.
- Exhaust follows speed and engine state. Travel dust stops with the machine; four landing bursts follow the leg contact positions. Planted feet now target the actual sand height rather than a constant zero height on the central course; the existing stride timing and lift remain unchanged.
- Tracers share one ImmediateMesh surface; sparks share one MultiMesh using the original sphere geometry. The buffers grow as needed without dropping live effects. Movement, growth, lifespan, warm colour and fade are retained. Explicit previous/current transforms prevent expired particle slots from interpolating from another particle's position.
- Corrected the CPU/GPU dune mismatch and removed an extra 0.4 m visual terrain offset. Previously, equivalent-looking floating-point hashes produced different terrain, with a measured maximum height error of 5.146 m and mean 0.764 m across the original 1,024-point grid. Identical integer lattice mixing now keeps placement, rendering and radioactive-ground recovery aligned. Native dune contours change as a result; scenery selection/seed contracts and saved deck equipment do not.

## Performance evidence

Fresh before/after full-game samples on this computer, RTX 3070, Godot 4.7.2 Forward+/Vulkan, 1920×1080, 4× MSAA, SSAO/glow, original full assets and uncapped rendering. Each scenario samples 12 seconds after warmup. The after run includes the new props/atmosphere and terrain correction.

| Scenario | Before FPS | After FPS | Before p95 frame | After p95 frame | Before p99 | After p99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Deck | 293.49 | 295.70 | 4.740 ms | 4.616 ms | 5.207 ms | 4.870 ms |
| Rapid camera rotation | 297.18 | 296.82 | 4.660 ms | 4.706 ms | 4.888 ms | 4.984 ms |
| Eight enemies + camera rotation | 258.67 | 267.44 | 5.880 ms | 5.828 ms | 7.247 ms | 6.261 ms |

Quiet-scene rendering is essentially level; the modest crowded-scene improvement is a single before/after observation, not a hardware-wide claim. The additional scenery increases median draw calls by roughly 13–24. This short run does not establish long-session stability or eliminate rare streaming spikes.

The separate `effect_benchmark.gd` compares the frozen `a124e43` tracer/particle allocation path with the new batches. Five trials each create 750 sparks and 750 tracers, use identical geometry/positions and freeze lifetime after the first update to measure the same visible workload. Shader/pipeline warmup precedes render samples. This deliberately extreme microbenchmark isolates effect cost, not typical gameplay FPS.

| 1,500-effect burst | Previous allocation path | Batched path |
| --- | ---: | ---: |
| Median creation | 50.896 ms | 1.627 ms |
| Median first update | 2.279 ms | 2.776 ms |
| Creation + first update | 53.175 ms | 4.403 ms |
| New scene nodes | 1,500 | 0 |
| Effect draw calls | 1,500 | 2 |
| Median render frame in isolated scene | 1.936 ms | 0.824 ms |

The buffer-writing update itself is slightly more expensive; removing allocation/render submissions yields the large burst improvement. Both output images were inspected, including a correction to instance/vertex colour space. Reports retain the raw values in `results/atmosphere-*`.

## Verification

- 108 integration, 57 input parity, 132 broader parity and 13 traversal assertions pass. The raised-dune fixture now samples an actual high dune at the current distance, avoiding a fixed-coordinate/2 cm timing race as terrain moves between ticks.
- 59 campaign-polish assertions pass with real GPU rendering; existing local objectives, saves, terminal controls, attack durations and feedback remain valid.
- 26 focused atmosphere/effect checks pass with real GPU rendering: correct initial chunk locations, unchanged scene-node count, every particle retained, colour/lifetime/growth/velocity, slot-compaction interpolation, speed-dependent emissions, grounded planted feet on straight/lateral routes, ground boundary alignment, seeded sparse placement, rotor axis, UV pinning and chunk cleanup.
- GPU compute parity uses the actual height functions extracted from the terrain shader. Across 4,096 points spanning 0, 1, 10 and 50 km offsets, the maximum CPU/GPU discrepancy is 0.002609 m. Near the initial route it is 0.0000294 m. This checks the height formula; coarse terrain mesh interpolation still introduces small local surface differences.
- Blender contact sheet, MCP viewport and three native prop views inspected. Initial placement conflicts and buried props were corrected rather than hidden in staged renders.

One initial headless campaign-test exit reported resource cleanup warnings. Its verbose rerun and the subsequent GPU run exited cleanly; this has not established a reproducible live-game leak. Long-session memory/streaming remains an open review item.

## Reproduction and remaining work

Use `tools/godot/launch.ps1 -AtmosphereTest`, `-TerrainTest`, `-EffectBenchmark` and `-Benchmark`; terrain/effect measurements need GPU rendering. The normal gameplay regression switches are in [the native README](../../godot/README.md). Test saves are isolated.

This iteration does not complete the broad enhancement goal. Next review targets are streaming-boundary frame spikes, dense construction/camera workloads, long-session resource behaviour and a normal-speed human campaign feel pass. No new chapters are planned.
