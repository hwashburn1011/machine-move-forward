# V1 release findings — 2026-10-05

**Completed:** local Windows build `0.3.0-beta.1-a17d6c7ec6d6` exported, audited, packaged and verified from an independent extraction. It includes the Docked guidance/intentional-shutdown diagnosis and cargo-capacity feedback. Source: `a17d6c7ec6d64581c704f1708485f87051065bdec9c50c33f1d4970e91e7ddd3`.

## Package

ZIP: `test-results/windows-v1-20261005/distribution/MachineMoveForward-0.3.0-beta.1-windows-x86_64.zip` — **951,019,202 bytes**. SHA-256: `756cae02b3b4a68b9d173257a769d09cc6e0969a6e93dcb5777460ff02fee542`.

- Resource audit: **4,494 checks**, including **729 collision resources**, passed.
- Clean extraction: **9 payload checksums** verified; actual release EXE normal startup passed.
- Unchanged extracted PCK: **34 New Game + 25 Continue checks** passed with the matching engine, no diagnostics. Official release templates do not allow external test scripts, so these are labeled separately from actual EXE startup.
- Personal saves/settings were isolated. Temporary extraction is recorded in the [release receipt](results/v1-release-2026-10-05.json). No old artifacts were deleted; free disk after release: **43.98 GiB**.

## Final frozen performance

Exclusive sequential rendering on i9-11900KF / 16 GB RAM / RTX 3070 8 GB, driver 581.80; 1920×1080 High Forward+ / 4x MSAA, VSync off. Prepared synthetic fixtures, not campaign or human-play evidence. All four affected workloads passed with stable source/assets and no frame over 33 ms.

| Workload | Frame p95 ms | p99 ms | Maximum ms |
| --- | ---: | ---: | ---: |
| deck-audio/travel | 5.693 | 7.109 | 9.076 |
| deck-audio/crane | 4.739 | 6.294 | 8.102 |
| deck-audio/drone | 5.024 | 5.670 | 8.415 |
| painted-home/furnished | 5.850 | 6.937 | 13.641 |

The 180-second home contained **50 furnishings, 52 painted pieces and three powered drone docks**. Two docks recovered at least **506 items**; the third remained idle in this deterministic crate pattern. Two scheduled music starts occurred. Peak reported video memory was **2.662 GB**, static allocation **319 MB**.

The benchmark now honors the existing New Game title-preparation gate and reports that startup time separately. Prior initial travel stalls were traced to skipped preparation in the old fixture; no production rendering workaround was added. The [hitch findings](v1-hitch-findings-2026-10-05.md) preserve the original stalls and cache/source limitations. The [current performance receipt](results/v1-performance-2026-10-05.json) contains exact timings, title costs and hashes.

## Integration evidence and scope

Final integration checks: **49 campaign-flow + 98 recovery + 24 cargo-capacity + 32 automation + 75 salvage-feedback = 278** passed. Final Docked UI review passed **235 checks**. Cargo UI review passed **18 checks** before the last Engineering-only diagnosis correction; its original source attribution is retained. The [floor review](results/v1-floor-review-2026-10-05.json) likewise distinguishes its original captures from the final Orchard recapture. No new geometry fix is claimed by this release.

October 4's full earned campaign, 17-workload suite, save stress and earlier ZIP remain unchanged historical evidence for source `38aedaeaf106…`. **The full campaign was not rerun on this build.** Current acceptance covers affected regressions, four focused rendering workloads and the new exported package/smoke.

Physical lower-spec hardware and uncoached player feedback remain outstanding. Fresh Godot shader profiles do not clear OS/driver caches; immediate unprepared Continue was not separately profiled. The owner will set up itch.io later. No publishing, commit or push was performed.
