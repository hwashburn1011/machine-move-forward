# Initial travel hitch investigation — 2026-10-05

**Finding:** the old travel benchmark entered its checkpoint before normal title preparation finished. It could count one-time resource packing and render-pipeline setup as travel work. The production New Game flow already waits for that preparation. The bounded correction is to the benchmark; no game runtime workaround or broad optimization was justified.

Portable evidence: [v1-hitch-2026-10-05.json](results/v1-hitch-2026-10-05.json). Full traces and rejected attempts remain under `test-results/v1-hitch-20261005/`.

## Evidence

The original checkpoint/camera sequence reproduced **92.7, 94.8 and 119.4 ms** frames in a fresh isolated Godot shader profile. Two stalls coincided with **78.8–80.4 ms renderer setup** and mesh-pipeline compilation, while GPU time remained about **3 ms**. Frame callbacks separately identified a long process callback. Timing the existing preparation callback then measured **90.3 ms** preparing `roadside-outposts.glb`.

The exact timing varies with preparation completion and caches. In the second unprepared trace, the 90.3 ms callback ended just before the three-second warmup expired; that travel sample was smooth. This explains why earlier short runs sometimes caught the cost and the longer follow-up did not. It does not prove a universal absence of gameplay hitches.

| Diagnostic | Frame p95 / p99 / maximum | Interpretation |
| --- | --- | --- |
| Original cold-profile checkpoint | 9.42 / 11.43 / 119.42 ms | Reproduced stalls with render/callback traces |
| Fresh shader profile, real title gate | 5.83 / 7.27 / 9.22 ms | Preparation completed before travel; title wait 3.07 seconds |
| Reused shader profile, 90-second travel | 8.19 / 10.05 / 15.32 ms | No >16.67 ms frame; runtime files changed during other agents' work, so diagnostic only |
| Revised stock benchmark, 18-second travel | 5.25 / 6.52 / 9.27 ms | Gate completed, no errors or >33 ms frames; source changed during run, correctly rejected as frozen acceptance |

The fresh-profile title-gated test still measured a **109.6 ms preparation callback during the title phase**. Its cost was retained, not made to disappear. The revised stock benchmark recorded **3.73 seconds** of title preparation separately.

## Changes

- `godot/tests/art200_performance.gd` now waits for the same `opening_stage.prepared()` condition used by New Game, with a strict 30-second failure timeout. The report adds `title_prepare_ms` and `title_prepared`. The existing three-second gameplay warmup remains unchanged.
- `godot/tests/v1_travel_hitch_profile.gd` records frame/render events, pipeline counters, scenery traces and preparation callback timing using the normal scene. It supports preparation-gated and immediate-checkpoint comparisons.
- `tools/godot/profile-v1-hitch.py` creates short isolated user/shader profiles, preserves every run and permits explicit profile reuse. It records source hashes and cache conditions.

The first diagnostic attempted an older copied-main instrumentation technique and the engine aborted before gameplay. That rejected attempt is preserved. The retained profiler uses normal scene instantiation. The final profiler passed Godot's parse check, its Python runner passed compilation, and the revised stock gate ran without engine diagnostics.

## Limits and handoff

GPU access was sequential for this investigation; other authorized source/headless work continued. Each run records its source boundaries. The 90-second and final stock runs crossed runtime edits and must not be called final frozen performance acceptance. The root will repeat affected verification after integration.

A fresh Godot shader profile does not clear OS or driver caches. These tests exercise a checkpoint after the real title gate, not a complete fresh opening. Immediate Continue before preparation was not profiled, and no claim of universal hitch elimination is made. Existing personal saves and earlier release evidence were preserved. No package was rebuilt by this investigation.

## Final integration verification

After all agents finished, exclusive checks ran on frozen source `a17d6c7ec6d64581c704f1708485f87051065bdec9c50c33f1d4970e91e7ddd3`. Corrected-gate travel recorded **p95 5.693 ms / p99 7.109 ms / maximum 9.076 ms**, with no >33 ms frames and unchanged source/assets. Crane, drone and a 180-second furnished-home workload also passed. These current-build results are in [v1-performance-2026-10-05.json](results/v1-performance-2026-10-05.json); prior diagnostic attempts remain preserved above.
