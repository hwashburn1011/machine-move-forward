# Playthrough-fixes Windows release — 5 October 2026

Completed local build `0.3.0-beta.1-6076494f06c0`, runtime `6076494f06c0976fb2005eaf4642b9f6d0bb3c236a02579ff98a9f35e986a975`. The nineteen findings have individual dispositions in the [root findings](v1-playthrough-fixes-2026-10-05.md); this release records the final validation and package.

ZIP: `test-results/windows-v1-playthrough-fixes-20261005/distribution/MachineMoveForward-0.3.0-beta.1-windows-x86_64.zip` — **951,406,335 bytes**. SHA-256: `07ead5144f104ca3237b83325409a74e8cdf50cd5d5ec82a50b855bca1991da3`.

Resource audit passed **4,503 checks**, including **729 collision resources**. Clean extraction verified **9 payload checksums**. The actual release EXE booted without diagnostics. Separate matching-engine instrumentation against the unchanged extracted PCK passed **34 New Game + 25 Continue checks**. Official release templates disable external scripts; the scripted checks are distinct from normal EXE boot.

## Performance

Sequential exclusive native rendering on i9-11900KF, 16 GB RAM, RTX 3070 8 GB, driver 581.80; 1920×1080 High Forward+ / 4x MSAA, VSync off. Real title preparation precedes checkpoints and the existing three-second warmup. These are scripted workloads with test resources/invulnerability, not an earned playthrough. OS and driver caches remain uncontrolled.

| Workload | Frame p95 ms | p99 ms | Maximum ms |
| --- | ---: | ---: | ---: |
| deck-audio/travel (90s) | 5.377 | 6.850 | 10.623 |
| deck-audio/construction (18s) | 7.315 | 8.426 | 21.478 |
| deck-audio/combat (18s) | 8.660 | 9.553 | 13.372 |
| deck-audio/foundry (18s) | 7.476 | 8.095 | 11.407 |
| painted-home/furnished (180s) | 6.339 | 7.426 | 11.946 |

Stock workloads recorded **0 frames above 33 ms** and **0 above 50 ms**. The separate 36-second ordinary construction trace recorded p95 **6.398 ms**, p99 **7.368 ms**, maximum **19.958 ms** and **0 frames above 33 ms**. Four catalog openings took **9.929–11.439 ms**; the baseline diagnostic took 21.513–25.929 ms. No screenshot or route-planning work runs within that action sample. Prior 39.513 ms presentation and full-playthrough actor outliers are not retroactively attributed by this reproduction.

The 180-second furnished home exercised **50 furnishings, 52 painted pieces, 3 powered drone docks**, 506 recorded recovered items and 2 music starts. Per-dock counts: `{'bp-6': 0, 'bp-7': 196, 'bp-8': 338}`. Three docks present does not imply each delivered. Peak reported video memory **2.663 GB**, static allocation **330.6 MB**.

## Scope and lineage

Travel90 and the ordinary construction trace were stable at `e6d35e6c27a8…`. A subsequent display-only correction distinguishes approaching, docked and clearing optional sites from expired offers. Construction/combat/Foundry/home benchmarks and this package use final `6076494f06c0…`. No physics, rendering material or construction logic changed between those identities. Per-workload identities, raw report hashes and all slow-frame records are in the [performance receipt](results/v1-playthrough-fixes-performance-2026-10-05.json).

The root validation receipt contains **1,207 checks** with precise per-suite hashes. Some unchanged component checks/visual captures precede only the final bounded label or pager corrections. Accepted native gun/catalog images include a corrected pager after an initial collapsed-button review; rejected evidence remains available. Earlier benchmark launch was intentionally held and stopped before the next Godot process while the final label correction was applied. This was orchestration, not a game failure.

The latest full earned main-route campaign belongs to the prior `dc384f8eeec2` presentation build. **No new complete campaign is claimed here.** Physical lower-spec hardware, uncoached player comprehension and universal smoothness remain unverified. Personal saves/preferences are isolated. Prior release roots remain untouched.

The [portable release receipt](results/v1-playthrough-fixes-release-2026-10-05.json) contains exact archive/executable/PCK hashes and gate results. Free disk after release: **38.64 GiB**. No itch.io upload, commit, push or deletion was performed.
