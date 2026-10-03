# Camera clearance and machine simulation review

Continues the [enhancement goal](enhancement-goal.md) from `d0a6bcb`. Blender MCP was rechecked on port 9876 and returned the existing wind-worn prop review scene successfully. This iteration changes native camera behavior and CPU bookkeeping; it creates no new model assets or story content.

## Close camera

The original camera kept a 0.55 m shoulder offset even when an obstacle shortened its backwards distance. In the reproduced corner, the character's chest projected almost at the left edge (x = 4.3 on a 1920-wide logical viewport). The initial fade list was collected before weapons and equipment were mounted, leaving those parts opaque when the body faded.

The spring arm now starts at the character's eye pivot and sweeps diagonally to the desired shoulder position. A collision retracts both horizontal and backwards displacement. Counter-rotating the camera preserves its original viewing/aiming direction; unobstructed positions, shoulder swapping, aim distance and FOV are unchanged. The existing sphere sweep, collision mask and player exclusion remain. This follows the engine's documented [spring-arm origin and shape-sweep behavior](https://docs.godotengine.org/en/stable/tutorials/3d/spring_arm.html).

Body, helmet, backpack, both weapons, wrist housing, held fuel canister and runtime weapon attachments now share close-camera transparency. New attachments inherit the current value and removed ones leave the cache. The character becomes fully hidden at very close distances and fully opaque when space is restored. Cinematics and the mounted deck gun explicitly restore opacity. Unchanged opacity values avoid repeated mesh-property writes.

Four original corner samples had normalized chest x positions of approximately 0.123, 0.872, 0.038 and 0.002. The corresponding updated samples are 0.426, 0.574, 0.342 and 0.425. These are specific fixtures, not a guarantee that the complete character remains visible at every pitch or inside every decorative model.

## Power and room processing

Power calculation previously allocated one consumer dictionary per station on every tick, then scanned those records for each shedding tier. It now accumulates three tier totals and resolves priorities in the existing output dictionary. Generator health, fuel, upgrade modifiers, fixed services and whole-tier shedding retain their results. No stale power cache is introduced.

Room monitoring previously formatted every cell and edge into a concatenated string every tick. A compact snapshot now compares IDs, definitions, cells and edges directly. Snapshot cells/edges are deep copies, so in-place mutations and same-sized replacement layouts remain detectable. Save loading explicitly invalidates the snapshot, including when only displayed keepsakes changed. Live layout checking remains every tick.

## Measurements

i9-11900KF, Godot 4.7.2, headless CPU microbenchmark. Identical synthetic mixtures of floors, generators, lights, industry, defenses and production devices; 20 warmup ticks and 40 blocks of 100 calls per operation. Each block resets fuel to 60. No geometry is instantiated and the fixture is not intended as a playable construction layout. These are subsystem costs, not rendered gameplay FPS.

| Piece count | Power before / after | Session tick before / after | Home update before / after |
| --- | ---: | ---: | ---: |
| 30 | 0.035 / 0.020 ms | 0.067 / 0.051 ms | 0.063 / 0.022 ms |
| 300 | 0.299 / 0.169 ms | 0.540 / 0.413 ms | 0.624 / 0.184 ms |
| 900 | 0.923 / 0.521 ms | 1.646 / 1.223 ms | 2.343 / 0.549 ms |

Values are medians. Power is already included in session tick: do not add it twice. Combined session/home work at 300 pieces fell from 1.164 to 0.598 ms per tick (about 49%); at 900 pieces, from 3.989 to 1.773 ms (about 56%). Full raw distributions are retained below. Scheduling noise affected some upper percentiles; no overall frame-rate or worst-case latency guarantee is inferred.

## Verification

438 checks passed: 108 integration, 57 input/play parity, 132 broader parity, 58 story-polish, 13 traversal, 54 native GPU camera checks, and 16 focused simulation checks. The latter include differential comparison against the previous power algorithm across 700 seeded combinations of damage, fuel, upgrades and fixed consumers. Camera coverage includes tight corners, side-wall penetration, both shoulders, FOV limits, aim, extreme pitch, stairs, station views, rapid turns, runtime attachment replacement, refueling, deck-gun transitions and cinematics. Generated native views were inspected.

Traversal teardown now waits 0.1 seconds after freeing the scene for the audio mixer to release its final playback references, matching the other recent native fixtures. Final runs have no script errors or failed assertions.

Evidence:

- [Original camera samples](results/camera-before.json)
- [Updated camera checks and samples](results/camera-clearance.json)
- [Original CPU workload timings](results/session-before.json)
- [Updated CPU workload timings](results/session-after.json)
- [Power/layout behavior checks](results/session-workload.json)

Run `tools/godot/launch.ps1 -CameraTest`, `-WorkloadTest -Headless`, or `-SessionBenchmark -Headless`. Personal saves/settings and the original Three.js implementation remain intact.

## Remaining review

The broader goal remains active. Decorative machine struts can still cross stair views even when the camera is clear of simplified collision bodies; the native lower-stair capture identifies a useful follow-up art/collision review. Dense construction still needs a representative rendered play session beyond this synthetic CPU test. Normal-speed campaign pacing and longer player-driven camera/animation review also remain worthwhile.
