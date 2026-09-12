# Performance and camera smoothness pass

The mouse now applies each movement exactly once, including rendered frames between 60 Hz simulation ticks. Camera translation and the aim transition interpolate alongside the character. Rapid turns no longer multiply mouse input when a slow frame needs several simulation updates, and high refresh rates no longer discard movements between those updates.

## Implementation

- `InputManager.consumeLook()` transfers pending mouse input to its current consumer. The player camera responds during rendering when no simulation tick ran; the mounted gun retains pending input until its next tick. Pause and cinematic views discard unused movement so control returns without a jump.
- Camera rotation retains raw input, the original sensitivity, recoil, offsets and collision ray. Position interpolation uses the previous/current simulation camera positions. Character body rotation uses elapsed render time with the same response as before at 60 FPS.
- The animation loop clamps stale or invalid timestamps. A browser animation frame queued before a long asset load can otherwise leave a negative time accumulator, making the world appear frozen after loading.
- Post-processing updates scene transforms and the sun shadow once per frame, then reuses them across color, ambient-occlusion and depth passes. It restores renderer flags even if a pass throws.
- Eight reusable mech rigs, their health bars and warning beams are prepared during loading. Normal scene shaders are exercised in six directions. This moves construction and first-visible shader costs into loading; it also retains those rigs in memory earlier.
- Inactive pooled enemies and the inactive signal battle are detached from the scene graph. They return when used. Machine leg joints, turbine, helm controls and radio lamp use cached node references.
- Final teardown disposes the enemy pool, including rigs that were prepared but never spawned.

Movement speeds, gravity, collision geometry, enemy limits, AI, damage, weapon timing, encounter progression and save data are unchanged. High still uses the same resolution, models, textures, shadows, ambient occlusion, bloom and other quality settings.

## Measurement

The recorded tests use hardware-accelerated Chrome on an RTX 3070 / i9-11900KF, 1920×1080, DPR 1, High. Each scenario runs for 15 seconds with CPU profiling enabled:

1. Normal view from the deck.
2. Continuous fast mouse turns at 1,800 input pixels/second.
3. The same turns with eight active mechs, two of each archetype, placed along the usable boarding perimeter.

The harness drives the real fixed-step/render loop from animation frames, leaves combat and physics active, and checks simulated time as well as rendered frames. The test player is invulnerable, scripted encounter spawning is disabled, and browser storage is isolated. The baseline is commit `f64b572`. The original loop's initial time accumulator is reset before measurements so the comparison measures an active simulation. Other code runs as shipped.

Frame times vary with active AI, view direction, browser scheduling and other applications. Profiling also adds overhead. Draw-call counts demonstrate reduced repeated rendering, while frame-rate numbers describe these runs rather than a guaranteed hardware target. No software-rendered/SwiftShader result is included.

The final sequential comparison is recorded in [baseline-repeat.json](baseline-repeat.json) and [after-repeat.json](after-repeat.json):

| Scenario | Baseline FPS | Updated FPS | Baseline / updated p95 frame (ms) | Baseline / updated peak draw calls |
| --- | ---: | ---: | ---: | ---: |
| Deck | 56.9 | 60.0 | 16.8 / 16.8 | 1,037 / 783 |
| Rapid turns | 56.8 | 60.0 | 16.8 / 16.7 | 1,098 / 834 |
| Eight mechs + rapid turns | 54.4 | 55.7 | 33.4 / 33.3 | 1,478 / 1,146 |

Peak draw calls fell 22–25%. In that paired run, average render CPU time during the crowd scenario fell from 11.89 to 8.46 ms. The worst rapid-turn frame fell from 366.7 to 16.8 ms; the updated normal-view/turn scenarios recorded no frames over 25 ms and no new shader programs during the turn.

The earlier valid samples are retained in [baseline.json](baseline.json) and [after.json](after.json). Across these two measurements of the final implementation, crowded combat averaged **52.2–55.7 FPS**, compared with **54.4–55.7 FPS** across the baseline samples. The crowded FPS ranges overlap, and the slower updated sample is included: this pass has not established a reliable improvement in sustained eight-enemy FPS or a locked 60 FPS in heavy combat. Its consistent results are reduced rendering work, correct input at changing frame rates, smoother normal movement and removal of first-visible stalls in these tests. CPU collision/AI work remains significant in the crowded case. An intermediate development run reached a 16.8 ms crowd p95, but that did not hold across the final repeated tests.

## Regression checks

- 1,093 unit tests across 102 files, ESLint and the TypeScript/production build passed.
- Mouse sensitivity checked at 30, 60, 120 and 144 rendered FPS; catch-up ticks, zero-tick frames, focus loss and camera interpolation covered by regression tests.
- Stale startup animation-frame timestamps covered by a loop regression test.
- Enemy prewarming verified to create no encounters or physics bodies and to reuse the same rigs after despawning.
- Real W/S movement with repeated camera corrections stayed grounded for the full 10.4-second walk; p95 frame time was 16.8 ms. Aim returned to its original hip/aim FOV. Pause and cinematic handoffs added zero unwanted rotation. See [movement results](movement-qa.json).
- All four stair directions, cabin collision, dock crossing and closed gate checks passed. See [traversal results](traversal/initial-qa.json).
- The 100% signal scene, camera/lighting restoration, mixed-mech grapple boarding, enemy health carryover, hook cutting, save/load, skip cleanup and legacy expedition route passed. See [cinematic results](cinematic/visual-review.json).
- Deck, exterior and cinematic captures were visually reviewed. No browser page errors occurred in these checks.

## Reproduce

Run the target checkout's Vite server on port 5201 (or override `MMF_PORT`). These scripts use the installed Windows Chrome executable and fresh temporary browser profiles.

```powershell
$env:MMF_PORT = '5201'
node tools/performance-smoothness.mjs --label=after --seconds=15
node tools/performance-movement-qa.mjs

$env:MMF_QA_OUT = 'docs/performance-smoothness/traversal'
node tools/art/iron_nomad/gameplay_qa.mjs
$env:MMF_QA_OUT = 'docs/performance-smoothness/cinematic'
node tools/signal-battle-qa.mjs
```

Use a separate checkout/server of `f64b572` with the same public assets and dependency versions for the baseline. Run the benchmarks sequentially so they do not compete for the GPU.
