# Wreck One Slice 3 validation

The canonical `mmf-dev-seed` lineage is recorded by parent run
`2026-09-15T12-39-52-916Z` and child run `2026-09-15T12-43-44-604Z`. The parent
accepted the radio trace through physical approach, docking, gangway crossing
and one Course Gyro recovery. Its return walk circled at the doorway; an older
`12-34-29` attempt reached departure but timed out waiting for pointer lock
while the correct next-route menu was already open. Both raw runs remain in
`test-results/continuity-wreck`.

The child cloned the parent's actual docked, gyro-bearing autosave, walked back
aboard, departed through the real UI, closed the legitimate next-route menu,
then completed paused Save & Quit and cold Continue. The restored checkpoint
matched seed `mmf-dev-seed`, health 78, inventory/resources 216 scrap / 9
components / 4 fuel, all eight structures, machine damage, story completion
with exactly one `course-gyro`, destination inactive, and destination colliders
disabled. Live clocks and needs were allowed to advance and are not claimed
byte-identical. The post-departure state was route selection with the player
aboard Iron Nomad.

Compact event records are [`wreck-parent-events.jsonl`](wreck-parent-events.jsonl)
and [`wreck-child-events.jsonl`](wreck-child-events.jsonl); the committed child
payload is [`wreck-committed-save.json`](wreck-committed-save.json). The shipped
Wreck art also required correcting the model lookup from `relay-wreck` to the
actual `expedition-wreck` asset ID. Full unit count reached 1,471, with two
focused asset checks and TypeScript passing.

Broader Foundry, ending and Survival continuity runs remain future coverage.
