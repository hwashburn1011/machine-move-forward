# Gameplay expansion execution

The user approved implementation after the graphics-v3 delivery. This ledger
tracks execution of [the approved detailed plan](2026-09-07-next-gameplay-expansion.md).
The original art-round scope has ended; all three gameplay features and their
five supporting asset briefs are now authorized.

## Ownership

| Worker | First wave | Later integration |
| --- | --- | --- |
| Luna campaign | NAV-01, NAV-02, NAV-03 | NAV-04 after gunboat composition |
| Luna combat | COM-01, COM-02, GUN-01 | GUN-02, first Game.ts writer |
| Luna automation | SPEC-01, SAL-01, AUT-01, pure collector | SAL-02 then AUT-02 after campaign composition |
| Astra | FA01–FA05 Blender assets, contract review | Asset promotion, combined review and release verification |

Only combat owns GameEvents.ts in the first wave. Campaign owns SaveSchema.ts
campaign changes. Automation owns build data and only the minimal build-system
exhaustive additions until integration. Game.ts ownership is sequential:
combat → campaign → automation → assigned QA fixes. Workers preserve the existing
dirty checkout and do not commit or reset unrelated work.

## Checkpoints

- [x] User authorized all three feature implementations with Luna subagents.
- [x] COL-00 physical prerequisite delivered in graphics-v3.
- [x] First-wave contracts and pure systems reviewed.
- [x] Gunboat and combat presentation integrated.
- [x] Powered helm and both routes reach and leave Relay Foundry.
- [x] Collector and automatic turret work, save and restore without duplication.
- [x] Five original Blender assets validated and installed.
- [x] Authored and fallback paths, existing opening and Wreck One pass.
- [x] Direct/detour acceptance and lifecycle checks recorded with documented fixtures.
- [x] Fresh hardware measurements.
- [x] Final trailer, release documentation, and publication workflow.

## Acceptance rules

The approved plan supplies mechanics, costs, dimensions, save rules and tests.
Read-only save snapshots do not release live collector claims; loading/reset does.
No reward or state transition may be manufactured by presentation. Existing rifle,
shotgun, manual turret, radio guarantee and Wreck One behavior remain compatible.
Continuous steering, extra destinations, enemy boarding/capture, finite ammunition,
and device upgrade trees remain outside this release.

New art sources and staged/optimized exports use an `expansion-v1` directory.
Existing graphics-v3 files stay intact. Root alone controls live Blender MCP and
schedules browser/GPU review. Measured acceptance will be appended as work lands.

## Integration review

Five assets are installed and their Blender sources preserved. See
[art evidence](../../art/expansion-v1/README.md): 112,904 triangles, 6.36 MiB,
actual browser decoding and bounds/marker checks, zero Khronos validation errors.

Review corrected several implementation defects before release: duplicate partial
salvage deposits, occluded target ranking, invalid campaign serialization,
pre-launch gunboat warnings, moving-target shell misses, and repeated geometry
allocation during combat. Root's combat contract tests exercise real Rapier
shotgun hits and empty-world impacts; shell and tracer tests verify fixed pools.

The final unit run passes 1,053 tests across 96 files. Lint and the production
build pass. Review also fixed the overfull build-menu category, the collector
transfer UI's container binding, authored helm installation, shared destination
resource ownership, and automatic turret rotation across the rear yaw seam.
The yaw regression was reproduced in both directions before the fix.

The live automation browser acceptance passes all 13 checks: blueprint gating,
ordinary build costs, power draw, real salvage claims and collection, actual UI
stack transfer, infantry and gunboat damage, power loss, and save/load. The
campaign browser flow passes 23 checks with authored assets, including the
direct route fight, physical Foundry traversal and specialist collection,
departure, detour commitment, and save/load.

At 1920×1080 High on the RTX 3070 through Chrome/D3D11, the 20-second travel
sample averaged 60.06 FPS; the authored expansion fixture averaged 59.64 FPS.
Its median/p95/p99 frame times were 16.7/16.8/16.8 ms. Across 24 device
remove/rebuild cycles, resources remained at 243 geometries and 278 textures.
These are measurements of the documented fixtures, not a guarantee for every
possible construction or computer. The actual runtime roots of all five new
assets were verified, including the helm's 7,072 triangles and Foundry's 40,524.

Evidence: [automation acceptance](../../art/expansion-validation/automation-acceptance.json),
[authored campaign flow](../../art/expansion-validation/expansion-flow-authored.json),
[hardware and lifecycle report](../../art/expansion-validation/expansion-performance.json).

The final static-build regression window passes 38/38 Playwright tests,
33/33 first-run checks, 37/37 earlier radio/Wreck One checks, and 23/23 fallback
expansion checks. Browser page/console error checks are clear. The earlier
chapter harness now captures arrival distance before campaign completion clears
the active chapter, and waits for an actual salvage target before pause checks.
Those are harness updates to the current save format and timing, not relaxed
gameplay assertions.

Trailer review additionally corrected the stationary player's visual facing
while aiming or firing. The recaptured combat sequence confirms the character
faces its real shot direction; existing weapon-grip and movement browser tests
pass after the change. The 40-second H.264/AAC trailer includes actual gameplay,
title and text overlays, original synthesized music and a final title card.
Browser playback and seeking both pass at 1280×720/30 FPS, with no page errors.
The README links to its GitHub Pages player and the playable prototype.
