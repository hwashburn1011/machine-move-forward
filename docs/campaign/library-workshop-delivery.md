# Campaign library and workshop delivery

This work was prepared before the feel, pacing and cohesion iteration and is
included in its release. It adds named campaign snapshots, safe New Game
preservation, JSON export/import, a measured boarding-spawn optimization, and
Blender-authored engine/service details. It adds no campaign chapter.

Campaigns is available from the title and pause menus. Pause snapshots obey the
existing safe-save gate. Imported saves create new UUID slots after bounded
validation; they never replace a snapshot or become the automatic Continue slot.
New Game defaults to preserving the latest readable recovery save. Explicit
replacement and snapshot deletion have named confirmation views. Invalid imports
perform no writes. IndexedDB transaction completion, rather than request success,
controls confirmation of durable saves.

The normal-input save-library run
`test-results/save-library/2026-09-15T21-56-21-638Z/report.json` passed its seven
flow checks without runtime errors. It covers Unicode snapshot naming, paused
simulation, export, cold Continue, New Game preservation, clean-browser import,
duplicate names, malformed import, selected-slot load and deletion confirmation.
The accepted profile and downloaded payload are retained alongside the report.
Unit tests additionally exercise malicious/deep/oversized data, legacy saves,
corrupt latest-save fallback, concurrent naming and transaction aborts.

## Boarding measurements

The bounded crew pool prepares two presentation instances of every mech and both
procedural crew types during boot. Encounter spawn reuses the exact roster;
damage, timing, colliders, rewards and ordinary cleanup remain unchanged.

| Local sample | PR23 construction | Prepared crew construction |
| --- | ---: | ---: |
| Medium | 44.9 ms | 1.1 ms |
| High | 43.0 ms | 1.2 ms |

These are one ordinary boarding sample per build/quality on local D3D11 Chrome,
with the same saved campaign and Bastion/Sovereign roster. They measure the
synchronous `spawnActors` call, not total game frame time or every encounter.
The new samples recorded no frame interval over 33.4 ms in the short measured
windows. Both old and new Medium runs gained 24 renderer geometries over the
complete post-spawn window; the new run's textures stayed at 651 while the old
run grew from 533 to 556. Preparation increases memory held at boot.

Raw reports remain under `test-results/boarding-spawn-profile/`:
`run-2026-09-15T20-05-39-621Z` (Medium baseline),
`run-2026-09-15T21-49-12-592Z` (Medium candidate),
`run-2026-09-15T21-50-48-975Z` (High candidate), and
`run-2026-09-15T21-53-20-987Z` (High baseline).
One hundred actual VehicleScene physics lifecycle cycles and resource-ownership
tests cover reuse/disposal; they are not a hundred rendered GPU encounters.

## Machinery

The [Blender workshop kit](../../assets/workshop/README.md) replaces the engine
housing and adds four flush leg-service markers at existing repair anchors.
Normal-input engine/port-marker views and all-four surface probes are recorded
in `test-results/interior-camera/2026-09-15T21-55-11-256Z/summary.json`.
The markers sit above the existing walking ledge. No collider or repair cost is
changed. All subsystems were healthy in this run; it proves approach and visual
placement, not a new damage/repair transaction or traversal to every marker.

The earlier combined suite passed 1,632 tests across 181 files. The final release
validation and subsequent lifecycle fixes are recorded in the feel/pacing/cohesion
delivery notes; the numbers here describe this bounded earlier checkpoint.
