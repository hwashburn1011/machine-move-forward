# V1 release findings — 2026-10-04

**Completed:** fresh Windows build `0.3.0-beta.1-38aedaeaf106` exported, audited, packaged and verified from an independent extraction. Source: `38aedaeaf106a20a39137140a4f5c4fbda724e9536317573522429de12d7198c`. Portable receipts: [release](results/v1-release-2026-10-04.json), [performance](results/v1-performance-2026-10-04.json), [earned campaign](results/v1-campaign-2026-10-04.json).

## Download and verification

- ZIP: `test-results/windows-v1-20261004/distribution/MachineMoveForward-0.3.0-beta.1-windows-x86_64.zip` — 951,012,436 bytes.
- SHA-256: `6a81fca400314e97b15dbd36682ebe257b74220564549414c64165a2d5b055b7`.
- PCK audit: **4,493 checks**, including **729 collision resources**, passed. All three story WAVs and their catalog are present.
- Clean extraction: all **9 payload checksums** verified; release EXE normal startup passed. Matching-engine checks against the unchanged extracted PCK passed **34 New Game + 25 Continue checks**, with no diagnostics.
- Inspected captures show readable title/letter/settings, matching wrist housing and restored campaign aboard the machine. This is rendered inspection, not uncoached player feedback.
- Personal saves and preferences were isolated. Temporary extraction remains recorded in the receipt; nothing was deleted. Free disk after release: **47.76 GiB**.

## Current-PC performance

Intel i9-11900KF, 16 GB RAM, RTX 3070 8 GB, driver 581.80; **1920×1080 High Forward+ / 4x MSAA**, VSync off, uncapped. Sequential exclusive tests used prepared/invulnerable fixtures, separately from the earned campaign.

All **17 workloads** passed source/asset stability and coverage. Across workloads, worst frame **p95 10.829 ms / p99 12.785 ms**, both in combat. All five sites, berth, construction, crane, drone, Guardian and connected freight were covered.

The initial 18-second travel sample had three **127–149 ms hitches within its first 0.65 seconds**. These are real isolated stalls, not sustained low performance. A 90-second travel follow-up had **p95 5.945 ms / p99 8.494 ms / max 15.199 ms**, with no >33 ms frames. A specific cause was not established; the follow-up does not erase the first result.

The 180-second home stress contained **50 furnishings, 52 painted pieces and three powered drone docks**, recovered at least **506 items**, and entered scheduled music twice. Two docks delivered; the third stayed idle in this crate pattern. Frame p95/p99 were **6.364/9.291 ms**, max **18.512 ms**, with no >33 ms frames. Peak reported VRAM was **2.329 GB**, static allocation **318 MB**; later samples did not show continuous growth. Guardian stress observed a live cross salvo; freight stress delivered real grounded loads.

Exclusive 2/300/900-piece saves restored successfully with customization retained. At 900 pieces, worker request median/max were **3.737/5.423 ms**, completion harvest **0.965/1.205 ms**, and time to durable save **48.317/48.358 ms**. Synchronous manual save median/max were **35.747/37.178 ms**. These are serialization/I/O timings, not frame times.

## Regression and tooling findings

- Post-import headless checks passed: autosave **31**, construction **41**, salvage edges **8**, personalization **7,472**. After clearer post-combat save wording, the root reran extended autosave checks: **33/33**. Story author verified **29 rendered reader/layout + 50 lifecycle checks**. Exact source scopes remain in their receipts.
- Windows credits now identify locally generated Qwen3-TTS VoiceDesign originals and Base continuity; no model or speech engine ships. **7 packaging tests** passed.
- Failed performance attempt 01 exposed an overly long isolated APPDATA shader-cache path; the harness now uses a short dedicated temp profile. Attempt 02 rejected the obsolete exterior furnishing fixture at **0/50**. Current permanent-deck fixtures already wait for placement checks and passed all 50. No placement guard or game behavior was bypassed; failed evidence is retained.
- Historical fixed-path reports were preserved, and new evidence is under `test-results/v1-release-audit-2026-10-04/`. No unrelated directories were edited. Release provenance separates historical checks from this build's evidence.

## Remaining limits

Physical lower-spec hardware and uncoached first-player feedback are still unverified. The release EXE itself was tested for normal startup; official templates require the matching engine for instrumented New Game/Continue. Initial travel hitching remains disclosed. The owner will create the itch.io account/project later; no upload, commit or push was performed by this work.
