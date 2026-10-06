# Full-playthrough findings: implementation and acceptance

Source: `docs/godot-port/v1-full-playthrough-review-2026-10-05.md`.
Scope: address all nineteen findings, including reproducing uncertain findings before assigning a cause. Preserve the approved intro choreography, selected Qwen B voice, existing saves and earned progression.

| Finding | Work | Acceptance |
|---|---|---|
| FP01 | Device housing for remaining station interfaces | Consistent with wrist styling; station controls remain usable |
| FP02 | Muted shared backpack light material | Less dominant violet, preserved character identification and blue swords |
| FP03 | Player-controlled completion of silent letter | Default reading pace unchanged; early completion still holds two seconds and burns before memories |
| FP04 | Worn manual-gun material treatment | Preserve authored texture detail and geometry without extra draw calls |
| FP05 | Actionable quiet preparation guidance | Receiver explains autonomous scan and optional deck-gun/cargo activities; no extra alarms or loot |
| FP06 | Reproduce construction hitch and fix measured cause | Capture-free, navigation-free A/B for catalog opening and actual placement |
| FP07 | Remove unavailable mounted salvage hint | Footer reflects usable mounted actions |
| FP08 | Read-only note controls | Show Close rather than nonexistent selection/confirmation actions |
| FP09 | Recording UI hierarchy | Speaker and transcript appear once; preserve spoken text |
| FP10 | Mounted-gun presentation | Deliberate sight framing, holstered handheld rifle, restored normal view on exit |
| FP11 | Hook throw and reel performance | Body/hand animation and cable origin agree, authoritative trajectory unchanged |
| FP12 | Wrist-camera transition | Reproduce downward dip, verify stable approach at multiple moments |
| FP13 | Completed comparison label | Action reflects confirmed result |
| FP14 | Neutral gangway label | Arrival does not immediately imply the player should leave |
| FP15 | Canopy/pitch obstruction | Reproduce with ordinary input; improve clearance without breaking collision or aiming |
| FP16 | Fuel source/destination wording | Distinguish direct tank purchase from carried-fuel transfer |
| FP17 | Task-specific mechanism help | Nonmoving verification does not display moving-machine clearance text |
| FP18 | Passed optional contacts | True range and behind/window-closed labels; no misleading zero-distance forward radar dot |
| FP19 | Relay ending prose | Human-readable consequences; unchanged policy mechanics and recorded lines |

Ownership: root handles pacing, scan guidance, contact display and integration; onboarding agent handles player/material/camera presentation; story agent handles interface/prose; release agent handles measured construction performance, gun finish and final packaging. Native rendering/profiling is serialized. Personal save profiles are never used for fixtures.

Validation: focused state/input regressions, rendered inspection of affected views, final capture-free performance workloads, resource/package audits and Windows smoke. Create a new `test-results/windows-v1-playthrough-fixes-20261005` package; retain historical receipts and findings. Findings are not automatically nineteen proven bugs. Record measurement limits and any remaining concerns in the completion journal.

Implementation/visual acceptance completed: all nineteen findings have dispositions in `docs/godot-port/v1-playthrough-fixes-2026-10-05.md`; 1,207 focused checks pass. Final performance/package acceptance follows in the linked receipts. FP15 required verification rather than a speculative collision change.

Final acceptance complete: five performance workloads, ordinary-construction trace, Windows export/resource audit, extraction integrity, EXE boot and New Game/Continue package checks passed. Build `0.3.0-beta.1-6076494f06c0`; final journal and release receipts contain the download path and identity.
