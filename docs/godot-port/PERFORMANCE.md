# Native comparison — 23 September 2026

Hardware: RTX 3070, Intel i9-11900KF, Windows, 1920×1080. Godot 4.7.2 Forward+/Vulkan, 4× MSAA, SSAO, glow, full-resolution original assets, 60 Hz physics. Reference: Three.js High through hardware Chrome/ANGLE D3D11 at device pixel ratio 1.

Each scenario has 2.5 seconds of warm-up and 12 seconds of measurement. Godot also warms the initial scene for five seconds. The fixtures use the same seed, starting deck location and eight-enemy spawn layout. Rotating scenarios request about 1,800 horizontal mouse pixels/second. Both fixtures make the player invulnerable while keeping enemy simulation active.

| Scenario | Three.js FPS / p95 frame | Godot capped FPS / p95 frame | Godot uncapped FPS / p95 frame |
| --- | --- | --- | --- |
| Deck | 60.0 / 16.80 ms | 60.0 / 16.89 ms | 296.4 / 4.08 ms |
| Rapid look | 60.0 / 16.80 ms | 60.0 / 16.76 ms | 298.5 / 4.10 ms |
| Eight enemies + rapid look | 60.0 / 16.80 ms | 60.0 / 16.80 ms | 268.0 / 4.94 ms |

Both editions sustained their 60 FPS target in these samples. The native build has substantial uncapped headroom on this computer. **Do not divide uncapped Godot FPS by the capped browser result and call it an engine speedup.** Native GPU time in the uncapped crowded scene had a median of 3.02 ms. Godot's sampled CPU monitor is not equivalent to JavaScript's per-call instrumentation and cannot establish an engine CPU speedup.

## Workload checks and limitations

| Scenario | Three.js peak draws / triangles | Godot peak draws / primitives |
| --- | --- | --- |
| Deck | 912 / 4.09 M | 563 / 2.81 M |
| Rapid look | 1,055 / 4.89 M | 1,042 / 3.68 M |
| Eight enemies + rapid look | 1,684 / 6.76 M | 1,536 / 5.63 M |

The native world includes all original artifact archetypes, three scenery bands, nine chunks per band, original scatter geometry, full-resolution models, shadows and effects. An early sparse-scene native benchmark was discarded. The retained uncapped native results were rerun without the browser benchmark running alongside them.

These are comparable situations, **not identical rendering workloads**. The engines count passes differently and have different culling/LOD, shadows, particles, post-processing and physics. Camera/player/enemy trajectories diverge during combat. The peak counts expose the remaining workload difference; screenshots show the visual difference. Initial import, shader work and model loading are excluded from steady-state measurements.

Twelve-second samples do not establish long-session stability or worst-case performance on every destination. A large construction stress test and continuous manual campaign playthrough remain acceptance work before selecting the primary release engine. These measurements support trying the native port; they do not prove that migrating is necessary to achieve 60 FPS.

## Reproduce

- Native uncapped: `tools/godot/launch.ps1 -Benchmark`.
- Native capped: run Godot with `--path godot --script tests/benchmark.gd -- --cap60`.
- Three.js: start Vite on 5207, set `MMF_PORT=5207` and `MMF_QA_OUT=test-results/godot-native/threejs-reference`, then run `node tools/performance-smoothness.mjs --label=native-reference --seconds=12 --quality=high --seed=mmf-default-seed`.
- Run GPU tests sequentially with the same resolution, seed, graphics tier and hardware. The ordinary native gameplay launch uses VSync on.

Measurements: [native uncapped](results/native-uncapped.json), [native 60 FPS](results/native-60.json), [Three.js](results/threejs.json). Validation scope and differences: [REVIEW.md](REVIEW.md).
