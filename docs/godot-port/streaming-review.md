# Scenery streaming without a quality reduction

Continues the [enhancement goal](enhancement-goal.md) from `e8fea34`. The previous implementation built three new chunks at a forward boundary and nine at a lateral boundary inside one world update. Fresh GPU measurements found median costs of 6.87 ms and 18.47 ms respectively, with occasional higher spikes.

## Implementation

`MMFSceneryChunk` creates the existing authored landmarks and instanced scatter in resumable steps. `MMFSceneryStream` prepares the next forward row and, within 40 m of a lateral boundary, the next side band and its corner. Its preparation target is 800 microseconds per world update; an individual native API operation can extend a slice beyond that target.

The existing 27 visible chunks and their visibility ranges are unchanged. At most 13 additional ready/unfinished chunks are retained after each update. Prepared nodes stay outside the scene tree, sharing the existing mesh resources; they add no draw submissions. Complete chunks activate at the original boundaries. Retired side chunks can satisfy an immediate reversal. Obsolete work is freed, and forced loads discard the old seed's cache. Unexpected large relocations still synchronously fill the complete visible range rather than displaying gaps.

Preparation retains CPU-generated scatter bounds for placement clearance, avoiding render-server transform readbacks. Repeated prototype searches are also replaced by a small lookup built at setup.

Profiling found a second problem: the RoadBeacon shader could lose its last reference when all beacons unloaded. A later beacon incurred a repeatable 15–17 ms shader/material reload, even after chunk work was sliced. A world-lifetime material template now retains that shader; each beacon still has its own emission phase. Geometry, lighting quality, density, story, controls and gameplay rules are preserved.

## Measured results

RTX 3070, Godot 4.7.2, Forward+/Vulkan, 1920×1080, full original assets and existing quality settings. The same prepared benchmark performs 80 forward/side crossings, with 60 normal world-update ticks available before each crossing. Main gameplay is frozen to isolate scenery work; original world, gait, atmosphere and GPU rendering remain active. These numbers measure world-update cost, not ordinary gameplay FPS.

| Work | Before median | After median | Before p95 | After p95 | Before maximum | After maximum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Forward boundary | 6.869 ms | 1.356 ms | 7.511 ms | 1.499 ms | 28.847 ms | 1.669 ms |
| Lateral boundary | 18.474 ms | 0.535 ms | 19.454 ms | 0.714 ms | 20.690 ms | 0.919 ms |
| Updates between boundaries | 0.210 ms | 0.207 ms | 0.290 ms | 1.056 ms | 0.536 ms | 1.678 ms |

Preparation intentionally adds small amounts of work to some earlier updates. In the final sample no preparation update exceeded 4 ms. After startup, all 1,590 chunk activations in this workload came from prepared/retained chunks; synchronous builds stayed at the 27 startup chunks. Measurements are from this machine and are not a guarantee against every possible OS/driver hitch.

At the matching 80-crossing checkpoint, CPU static memory was approximately 192.3 MB versus 191.0 MB before; GPU memory was essentially level (about 27 KB additional). The cache held 13 chunks and visible scene-node counts matched the original run. A separate adversarial 240-crossing/15.36 km load/unload soak gave preparation almost no lead time. Counts remained bounded, but synchronous fallback still produced occasional spikes: this verifies complete scenery and resource lifetime under abrupt relocation, not hitch-free teleportation or an hours-long real-time playthrough.

## Validation

- Rendered geometry signatures for 54 chunks across two seeds/positions match the original `e8fea34` generator: mesh identity, transforms, instance transforms, shadow settings, draw distances and ambient root placement. Baseline extraction used the original world script from Git with the actual GPU. The headless renderer does not preserve equivalent MultiMesh buffers, so this visual contract check requires GPU rendering.
- Streaming checks cover initial coverage, hidden preparation, forward travel, negative coordinates, immediate reversals, simultaneous forward/right crossing, cache bounds, partial cancellation, large relocation, different-seed loads, shutdown and removal of stale wind-animation entries.
- 108 integration, 57 input-parity, 132 broader parity, 13 traversal and 26 GPU atmosphere checks pass, alongside the 54 rendered chunk comparisons and 18 streaming lifecycle checks: 408 checks in total. Results are retained under `results/streaming-*` alongside raw measurements. Test campaigns/settings are isolated.
- A short delay after fixture teardown lets the audio mixer release its last playback references. Earlier immediate exits could report audio-stream cleanup warnings; the leak diagnostic identified audio playbacks rather than retained scenery nodes.

## Reproduce

Use `tools/godot/launch.ps1 -StreamTest -Headless`, `-SceneryTest`, `-StreamBenchmark`, or `-StreamBenchmark -Stress`. The latter two require the real GPU. For per-piece diagnosis, invoke `tests/scenery_streaming.gd` directly with `-- --prepared --profile`; profiling is disabled during normal play.

The baseline geometry file is `godot/data/scenery-fixtures.json`. To regenerate it against the old implementation, extract `git show e8fea34:godot/scripts/world.gd` to `test-results/godot-native/world-before.gd`, removing its `class_name MMFWorld` declaration, then run `tests/scenery_contract.gd -- --baseline` with GPU rendering. Review its output before replacing fixtures. Ordinary contract runs compare against the retained fixture and never overwrite it.

Remaining review priorities include dense construction, station-camera readability, material/animation coherence and a normal-speed campaign feel pass. This completes a performance iteration, not the continuing enhancement goal.
