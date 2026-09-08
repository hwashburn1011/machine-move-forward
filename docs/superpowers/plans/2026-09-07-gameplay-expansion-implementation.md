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
- [ ] First-wave contracts and pure systems reviewed.
- [ ] Gunboat and combat presentation integrated.
- [ ] Powered helm and both routes reach and leave Relay Foundry.
- [ ] Collector and automatic turret work, save and restore without duplication.
- [x] Five original Blender assets validated and installed.
- [ ] Authored and fallback paths, existing opening and Wreck One pass.
- [ ] Uninterrupted direct/detour acceptance and lifecycle checks recorded.
- [ ] Fresh hardware measurements and final delivery.

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

## Integration review in progress

Five assets are installed and their Blender sources preserved. See
[art evidence](../../art/expansion-v1/README.md): 112,904 triangles, 6.36 MiB,
actual browser decoding and bounds/marker checks, zero Khronos validation errors.

Review corrected several implementation defects before release: duplicate partial
salvage deposits, occluded target ranking, invalid campaign serialization,
pre-launch gunboat warnings, moving-target shell misses, and repeated geometry
allocation during combat. Root's combat contract tests exercise real Rapier
shotgun hits and empty-world impacts; shell and tracer tests verify fixed pools.

An intermediate full unit run passed 1,031 of 1,032 tests. The failure exposed an
overfull build-menu category after adding the devices and remains assigned to
automation integration. These intermediate results are not final release approval.
Luna is completing combined route/Foundry/device composition and a browser flow
harness before full acceptance and fresh hardware measurements.
