# Full-playthrough refinement follow-up

Work requested: address every finding in `v1-full-playthrough-review-2026-10-05.md`, regardless of size. This document records the dispositions; the original journal remains the historical observation of the prior build.

Status: **complete - implementation, focused acceptance, performance and Windows package checks passed**.

| Finding | Disposition |
|---|---|
| FP01 | Station interfaces use the same device design language, with clear station-link identity. Physical inventory remains attached to the forearm. |
| FP02 | S-07's violet backpack material is shared, dimmer and desaturated. Original geometry/textures and blue sword pulses remain. |
| FP03 | Enter offers **Finished reading** after the letter is visible. It finishes the ink, preserves the two-second hold and full burn, then runs the approved memory/escape sequence. Default 38-second ink reading is unchanged; Escape still skips the complete intro. |
| FP04 | Manual deck-gun finish preserves authored maps and geometry while reducing pedestal glare and bringing its metal/paint into the machine palette. |
| FP05 | The receiver now displays actionable scan guidance: it works autonomously while powered and aboard, with optional construction, sight practice or cargo collection. No scan-duration, reward or encounter changes. |
| FP06 | Capture-free reproduction isolated the hitch to creating the entire Build catalog. Eighteen-item pages retain full filters, favorites, details and keyboard access. Actual aimed placement was already inexpensive. Final frozen measurement is recorded separately. |
| FP07 | Mounted footer advertises firing/dismounting, and the held-weapon HUD identifies the deck gun. |
| FP08 | Read-only notes show Close instead of nonexistent selection/confirmation actions. |
| FP09 | Recording identity/status and full transcript have separate roles without duplicate speaker/excerpt blocks. Recorded speech remains unchanged. |
| FP10 | Mounted sight framing hides the contradictory exterior rifle pose and holsters personal firearms. Dismount restores the regular camera and equipment without moving the player capsule. |
| FP11 | Free-hand release and reel strokes accompany the existing hook; the rendered cable follows the hand. Combat keeps priority and hook/reward authority remains unchanged. |
| FP12 | Reproduced camera dip during wrist opening; forearm raising now precedes a continuous focus-point approach. Reduced-motion behavior and closing restoration remain supported. |
| FP13 | Successful Array comparison changes to a review action while preserving access to the result. |
| FP14 | Gangway/Nomad wording replaces the premature instruction to return when first arriving. |
| FP15 | Recreated the steep canopy view through ordinary mouse handling. Spring-arm clearance stayed on the player's side of the canopy and the central view remained clear. No collision defect reproduced; no camera/canopy change warranted by this finding. |
| FP16 | Fuel controls distinguish purchasing fuel directly into the tank from transferring carried fuel. Prices and quantities remain the same. |
| FP17 | Verification and readback steps use task-specific guidance; moving mechanisms retain clearance instructions. |
| FP18 | Optional contacts show true spatial range, behind-the-Nomad/window-closed status, and no forward radar dot for passed/expired sites. Accepted stops separately show Approaching, Docked or Clearing site; expiry wording applies to unaccepted signals. No encounter or save authority changes. |
| FP19 | Relay policy explains reach, privacy and independent operation in natural language. Choice mechanics and recorded lines remain unchanged. |

## Validation and limits

Focused evidence is under `test-results/v1-playthrough-fixes-20261005/`. Tests use isolated local profiles, not personal saves. Native visual inspection and performance workloads are serialized. Historical playthrough, release and performance receipts remain intact.

The prior 32m45s full campaign established main-route completion for the preceding build. This follow-up uses affected input/state regressions, native visual checks and performance/package acceptance; it is not a claim of another uncoached human playthrough, continuous audio review or coverage of every optional branch.

Focused acceptance: **1,207 checks passed** across state/input, UI, catalog/material, action/camera, letter and existing movement/weapon/wrist suites. Native UI component review passed an additional 280 checks with 24 captures. Supplementary records and exact source identities are in `results/v1-playthrough-fixes-2026-10-05.json`; repeated versions are not counted twice in the 1,207 total.

Final runtime fingerprint: `6076494f06c0976fb2005eaf4642b9f6d0bb3c236a02579ff98a9f35e986a975`. Some unaffected component checks precede the last pager-width and optional-stop label changes. Their actual fingerprints remain recorded; affected suites were repeated after each correction. No continuous human play or listening is claimed.

Performance: five affected workloads passed on this PC at 1080p/high, with a maximum frame of 21.478 ms and no frames over 33 ms. The separate ordinary construction trace peaked at 19.958 ms; catalog opening dropped from 21.5-25.9 ms to 9.9-11.4 ms. See `results/v1-playthrough-fixes-performance-2026-10-05.json` for workload lengths, hardware, source lineage and fixture limits.

Windows build **0.3.0-beta.1-6076494f06c0** is ready at `test-results/windows-v1-playthrough-fixes-20261005/distribution/MachineMoveForward-0.3.0-beta.1-windows-x86_64.zip` (951,406,335 bytes). SHA-256: `07ead5144f104ca3237b83325409a74e8cdf50cd5d5ec82a50b855bca1991da3`. Export audit passed 4,503 checks including 729 collision resources; nine extracted payload checksums matched. Actual release EXE boot passed. Matching-engine, unchanged-PCK scripted smoke passed 34 New Game and 25 Continue checks. See `v1-playthrough-fixes-release-findings-2026-10-05.md` and its portable receipt for exact release scopes.

Work remains local. No commit, push, merge or itch.io upload was performed. The earlier request to defer itch.io account/project setup still applies.
