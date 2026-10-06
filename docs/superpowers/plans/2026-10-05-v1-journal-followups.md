# V1 journal follow-up plan — 5 October 2026

Status: **complete locally**, authorized by the owner. New build: `0.3.0-beta.1-a17d6c7ec6d6`. Baseline: build `0.3.0-beta.1-38aedaeaf106` and the [October 4 playthrough journal](../../godot-port/v1-playthrough-journal-2026-10-04.md). Its completed-run evidence and the existing uncommitted intro, voice and release work are preserved. This pass addresses demonstrated usability gaps and unresolved visual/performance observations within the existing V1 scope.

| ID | Owner | Work | Acceptance | Status |
| --- | --- | --- | --- | --- |
| JF01 | Performance agent | Identify the cause of the initial travel hitches; apply a bounded fix if measurements support one | Isolated before/after traces distinguish CPU work, rendering and initial resource setup. Keep failed/negative evidence and disclose uncontrolled caches. No speculative broad optimization. | Complete: benchmark bypassed normal preparation. Corrected benchmark and four final-source affected workloads passed; no runtime optimization justified. |
| JF02 | Onboarding agent | Clarify Docked power mode where players plan exploration and departure | Existing helm/wrist/engineering surfaces explain selection, battery/equipment tradeoffs and automatic travel-mode restoration truthfully. No unsolicited alerts or automatic mode changes. | Implemented; 147 focused checks and 235 final rendered checks passed. Intentional shutdown no longer prompts a restart; actual faults retained. |
| JF03 | Cargo agent | Improve full-cargo feedback and avoid futile recovery of known cargo | Partial/mixed loads retain every unaccepted item; readout distinguishes capacity from blocked approach; collectors consider actual known cargo. Clear local held-load/store status. Preserve capacity, rewards and randomness. | Implemented; 131 focused checks passed again on final source; 18 rendered checks passed before the Engineering-only correction. |
| JF04 | Root | Review machine/site floor stability during camera movement | Render bounded motion sequences for permanent and constructed decks and docked-site floors; inspect temporal changes with source geometry checks. Fix reproduced overlap only. Record coverage and remaining limits. | Complete: 16 camera clips, 4 actual walking paths, Orchard recapture and mesh audit. No additional overlap reproduced in inspected temporal samples. |
| JF05 | Root / release agent | Integrate and verify the changed paths, update findings and rebuild the Windows beta | Focused affected regressions, native UI review, sequential performance comparison, final source/asset identity, export/resource audit and isolated clean-package smoke. | Complete: final runtime a17d6c7ec6d6; four performance workloads, 4,494 resource checks, EXE boot and 59 packaged New Game/Continue checks passed. New Windows ZIP produced. |

## Coordination and scope

Performance agent has the first exclusive GPU window. Other agents run source/headless work and coordinate edits to shared files. Root waits for that window to close before rendered floor/UI captures. Runtime edits are allowed during diagnosis but invalidate source-stamped acceptance; final verification follows a new freeze. Use short isolated user-profile paths and current permanent-deck-aware fixtures; retain prior evidence and personal saves.

The journal does not justify reducing loot or increasing combat difficulty from the efficient, perfectly aimed actor. An idle third collector alone is not a defect. Human comprehension, voice reception, ordinary aiming difficulty and physical weaker-PC performance remain external observations. No new region, boss, progression tree or economy expansion is planned.

## Evidence record

Keep each task's findings beside the existing journal and append a dated follow-up entry linking them. Mark source hypotheses, rendered observations, fixtures and human feedback separately. A previous passing full campaign describes its original frozen build; focused tests on this pass must not be presented as another uninterrupted full campaign.

Completed findings and exact artifact identity: [release findings](../../godot-port/v1-release-findings-2026-10-05.md) and [portable release receipt](../../godot-port/results/v1-release-2026-10-05.json). New archive: `test-results/windows-v1-20261005/distribution/MachineMoveForward-0.3.0-beta.1-windows-x86_64.zip`. No commit, push, publish or deletion was performed during this follow-up.
