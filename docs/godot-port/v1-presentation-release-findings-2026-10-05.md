# V1 presentation release — 5 October 2026

Completed local Windows build `0.3.0-beta.1-dc384f8eeec2`. Source: `dc384f8eeec234285a71a8fe887cb4e9918d8bd190db6394dbe66b4c7df4abea`. Includes movement weight, clearer intro staging and grounded defender boots, composed roadside scenery, local equipment wear and quieter interaction prompts.

## Package and clean extraction

ZIP: `test-results/windows-v1-presentation-20261005/distribution/MachineMoveForward-0.3.0-beta.1-windows-x86_64.zip` — **951,398,912 bytes**. SHA-256: `2a1a25c28ccdf38a362493ea6a77c34f9d60ba1b685f13754aa654499fa06007`.

The resource audit passed **4,502 checks**, including **729 collision resources**. All **9 packaged file checksums** matched after independent extraction. The actual release executable booted normally. Matching-engine instrumentation against the unchanged extracted PCK passed **34 New Game + 25 Continue checks**. Official release templates disable external scripts; those 59 checks are distinct from the actual EXE startup check. Personal data was isolated.

## Performance on this computer

Sequential exclusive native runs on i9-11900KF / 16 GB RAM / RTX 3070 8 GB, driver 581.80, at 1920×1080 High Forward+ / 4x MSAA, VSync off. These are prepared synthetic workloads; all source/assets remained stable. The real New Game preparation gate was observed before checkpoint loading, followed by the existing 3-second warmup. Startup/title costs are recorded separately in the receipt.

| Workload | Frame p95 ms | p99 ms | Maximum ms |
| --- | ---: | ---: | ---: |
| deck-audio/travel (90s) | 5.519 | 6.336 | 15.716 |
| deck-audio/construction (18s) | 6.694 | 7.899 | 39.513 |
| deck-audio/combat (18s) | 7.317 | 7.867 | 11.950 |
| deck-audio/foundry (18s) | 6.526 | 7.405 | 10.051 |
| painted-home/furnished (180s) | 5.421 | 6.299 | 14.595 |

Across these workloads: **1 frames over33ms**, **0 over50ms**. GPU metrics and any frames above 50 ms are retained in the [performance receipt](results/v1-presentation-performance-2026-10-05.json). The construction workload had one 39.513 ms frame: the existing trace does not timestamp frames below 50 ms, so its location and cause remain unassigned. A passing percentile does not imply every frame is smooth.

The 180-second home exercised **50 furnishings, 52 painted pieces and 3 powered drone docks**, with 506 recorded recovered items and 2 music starts. Per-dock delivery counts: `{'bp-6': 0, 'bp-7': 196, 'bp-8': 338}`. Peak reported video memory: **2.663GB**; static allocation: **331.3MB**. Presence of three docks does not imply each delivered in the scripted cargo pattern.

## Evidence boundaries

Final grounded intro review passed 77 native and 65 headless checks on this source. Movement's 181-frame capture (zero ground recoveries), environment's 25 captures and interaction's 246 checks / 14 captures were stable at `c084dfa83351…`; only the final intro sole-grounding correction followed those component captures. Their original identities and precise scopes are retained in build metadata and the [release receipt](results/v1-presentation-release-2026-10-05.json).

The prior complete earned campaign and 17-workload suite belong to October 4's `38aedaeaf106…` build. **No full campaign rerun is claimed for this presentation build.** Prior October 4 and October 5 release artifacts remain unchanged. Physically weaker hardware and uncoached player comprehension remain untested. Fresh shader profiles do not clear OS/driver caches, and immediate unprepared Continue was not separately profiled.

No itch.io upload, commit, push or cleanup was performed. Free disk after release: **41.67GiB**. The owner will set up itch.io later.
