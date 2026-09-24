# Autosave stalls and movement audit

Continues the [enhancement goal](enhancement-goal.md) from `83a7631`. A 65-second native travel trace reproduced a periodic main-thread stall at the first autosave. The same trace now records frame callbacks, render-stage timestamps, CPU/GPU render timings and pipeline counters in test-owned scripts only.

## Saving without stopping gameplay

The main thread captures a detached campaign snapshot. A worker serializes, checksums, writes, flushes, reads back and commits it using the existing native format. One write and one latest pending snapshot bound memory and prevent same-file races. The worker never accesses scene nodes, UI, mutable session state or mutable save-directory configuration. Completion/failure is handled on the main thread, including while paused.

Manual saves and named campaign checkpoints retain their durable-success semantics. Load, library/title entry and orderly teardown drain accepted work first. Autosave acceptance means queued; its durable completion follows later. Failure retains the last checkpoint, notifies the player and retries on the normal interval. The backup writer now validates the old primary before rotating it, so an already-corrupt primary cannot replace a healthy recovery backup. Malformed JSON falls back cleanly.

## Measurements

RTX 3070, 1920×1080, high Forward+/Vulkan, 4x MSAA, VSync off; matching travel/camera workload. The first 60-second save occurred at 439.92 m in each run.

| Trace | Autosave main tick | Autosave frame |
| --- | ---: | ---: |
| Before | 26.138 ms | 30.750 ms |
| Background save | 2.659 ms | 7.153 ms |
| Final, including backup validation | 3.717 ms | 7.602 ms |

The baseline's inline save branch was not individually stamped: its time falls into the next stage label. A separately instrumented world callback rules out world update; the complete main-tick/frame measurements are valid. The first after trace preceded the extra backup-validation check; the final trace includes it. [Compact trace evidence](results/autosave-travel.json) retains these distinctions. The final run also contains an unrelated 190 ms frame; this pass does **not** claim all stalls resolved. Initial rendering stalls remain visible in the evidence too.

An eight-write synthetic comparison uses the same final verified writer in synchronous and background modes. With 300 structures, median main-thread cost drops from 16.04 ms to 1.24 ms to capture/enqueue, plus 0.40 ms to harvest completion. With 900 structures it drops from 39.17 ms to 4.37 ms plus 0.96 ms. The 900-piece file becomes durable after about 55.45 ms wall time. This moves blocking work off gameplay; it does not make disk I/O faster, and headless timings are not rendering FPS. [Full synthetic results](results/autosave-profile.json).

## Validation

31 focused checks cover blocked I/O with continuing frames, immutable snapshots, coalescing, ordered writes, paused completion, directory isolation, write failures, checksum/JSON corruption, backup retention, manual saves, immediate Continue and teardown. Integration (108), parity/navigation audit (132), story polish (58), and native GPU physical-input gameplay parity (57) also pass: 386 assertions. Final import and runtime logs have no Godot errors/warnings. All fixtures use isolated save locations and protect personal settings.

Run `tools/godot/launch.ps1 -AutosaveTest -Headless` and `-AutosaveProfile -Headless`. A longer GPU trace can be run directly with `--script tests/travel_profile.gd -- --seconds=65 --output=res://../test-results/godot-native/travel-autosave-final.json`. `tools/godot/summarize-autosave.py` extracts compact evidence from the three local traces.

## Next verified defect

The actual 60 Hz player controller on a supported test deck still walks when blocked by a wall. Native playback remains at 1× regardless of displacement. Median stance-foot drift is 1.86 m/s forward, 2.60 m/s strafing, 3.46 m/s diagonally and 3.50 m/s sprinting. These are skeleton-contact observations, not an overall perceptual score. [Audit evidence](results/player-motion-audit.json) and `-MotionAudit -Headless` reproduce it. Refine the Blender gait's feasible leg reach, match animation to real movement, preserve phase across direction changes and verify combat/cinematic/terminal compatibility. No story or progression has been added, and the overall goal remains active.
