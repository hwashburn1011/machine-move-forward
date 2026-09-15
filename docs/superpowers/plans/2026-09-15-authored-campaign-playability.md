# Authored campaign playability

Base: PR #17, `c39167cf2e4adbad9cfb76681a76a402a1d59237`.
PR validation (`34971487340`) passed 1,474 tests; the main build and Pages
deployment (`34971813435`) succeeded. The live page returned HTTP 200 and
served `index-vyJQQKdA.js`, matching the tested build. The public normal-input
New Game → built-in opening skip → Save & Quit → cold Continue smoke passed
14 checks with no browser/asset errors in
`test-results/public-continuity/run-1789477376976`.
Sol prioritized these three slices after the original-seed campaign lineage
reached Wreck One departure. Existing chapters and mechanics remain the scope.

## 1. Full-detail deck and expedition usability

**AP-01 — measure the radio obstruction (Luna tooling, root diagnosis).**
Cold Continue from `test-results/continuity-radio/run-1789475135178/browser-profile`
at origin 5205, with models/textures enabled. Clone the source into a flat path.
Record the saved capsule, authored triangles near it, camera anchor/boom and
normal WASD displacement. Do not teleport, disable colliders or inject facts.
The initial diagnostic `test-results/radio-clearance/run-1789476883411` starts
at approximately (1.315, 15.805, -4.464). One second of backward input barely
moves; a sideways correction then permits backward movement to z=-0.313.
The camera initially sits nearly inside the player and later regains its boom.
This establishes a local authored-space problem, not general input failure.
Blender MCP inspection of the editable gameplay scene identifies `Command
house lower structure` at game bounds x=1.5..5.25, y=14.83..16.663,
z=-6.60..-2.36. The saved center is only 0.185 m from that box, while the
production capsule radius is 0.34 m. Its adjacent side plate begins at x=1.455.
Confirm evaluated triangle contact and shared/procedural collision parity
before deciding whether the error is the radio approach, collision coverage,
or restoration of a save made with procedural fallback visuals.

**AP-02 — repair the measured clearance (root/Astra).**
Identify the actual obstruction before selecting a fix. Keep the visible
Blender model and its collision export aligned. If the radio's interaction
mount invites standing inside authored machinery, give it an accessible mount
and approach consistent with the machine design. If geometry is clear and only
the camera fails, correct the camera's obstruction behavior instead. Avoid
teleport-based acceptance or reducing the whole machine's collision fidelity.

**AP-03 — cross the authored Wreck (Luna normal-input runner, Sol review).**
Continue the original campaign, operate the radio, accept the trace, dock,
cross the visible gangway, recover one gyro, return and depart with full art.
Handle the normal next-route chooser. Verify cold Continue, inventory,
structures, health, seed, and collision/gangway cleanup. Preserve both
successful and failed runs; procedural-path evidence is supplementary here.

Acceptance: a clear radio approach and readable camera, no trapped capsule,
authored Wreck traversed both ways through normal input, exact gyro ownership,
no destination collision left behind and no new asset failures.

**Procedural predecessor (passed):**
The canonical `mmf-dev-seed` parent/child runs
`2026-09-15T12-39-52-916Z` and `2026-09-15T12-43-44-604Z` accepted the trace,
docked and crossed Wreck One, recovered one Course Gyro, returned aboard,
departed through the route chooser, and cold-restored the resulting route
selection state. Health, inventory/resources, seed, structures, machine damage,
story and destination cleanup matched; live clocks were allowed to advance.
The compact evidence is in `docs/campaign/continuity-validation/wreck-summary.md`.

AP-01/02 measured and repaired the actual 0.21744 m authored-trimesh overlap.
The Blender/runtime collision contract now shares seven command-cabin solids;
Continue checks placement after restoring the journey's hull pose. The first
updated diagnostic, `test-results/authored-radio-clearance/run-1789479094309`,
shows positive cabin clearance and ordinary backward movement on the first
attempt. Detailed implementation/evidence is tracked in
`docs/campaign/authored-playability-delivery.md`.

**AP-03 full-art gate (passed):** `2026-09-15T13-39-44-061Z` completed the
entire radio/trace/dock/gyro/return/depart/cold-Continue loop with authored
Nomad, S-07 and Wreck models enabled. The source was the same original radio
checkpoint. 216/9/4 resources, 78 HP, eight structures and exactly one gyro
survived; the destination and gangway released correctly. Subsequent MID work
should prefer this full-art run's `browser-profile` as its parent.

## 2. Wreck departure through earned limited steering

**MID-01 — map real required interactions (Sol).** Use the current chapter
definitions to list Foundry and Quiet Array entry, records, uniques, route
consequences, departure and safe save boundaries. Distinguish optional reading
from progression requirements; no guessed UI or interactable IDs.

**MID-02 — reach and complete Relay Foundry (Luna, root fixes).** Start from
`test-results/continuity-wreck/run-2026-09-15T12-43-44-604Z/browser-profile`:
216 scrap, 9 components, 4 fuel items, eight built pieces, 78 HP, one Course
Gyro. Choose a route through the visible UI, resolve its actual encounter,
explore, recover required parts/records and return. Save at normal admissible
boundaries; use the real fuel and salvage economy during travel.

**MID-03 — reach Quiet Array and operate the Helm (Luna, Sol audit).** Continue
from the Foundry's committed save, obtain its required calibration records and
actuator, then prove the powered Helm accepts earned tier-one steering.
Record every resource delta, required unique, encounter and chapter transition.

Acceptance: one real lineage earns limited steering, the selected route's
consequence occurs once, rewards and machine equipment survive cold Continue,
and each destination cleanly releases the Nomad. Fix observed blockers in their
owning production systems; do not create additional chapters to evade them.

## 3. Survival ammunition and recovery as a complete loop

**SURV-01 — start a separate real Survival campaign (Luna).** Complete the
rooftop, salvage, refinery/workbench/defense and ordinary opening boarding.
Do not reuse a Story save with a changed profile flag.

**SURV-02 — spend, manufacture and reload (Luna, Sol ledger).** Expend both
weapon types in ordinary combat, craft their matching ammunition through the
workbench and account for crafting inputs, inventory ammunition, reserve,
magazine, shots and reloads. Record low-ammunition guidance and recovery.

**SURV-03 — prove a sustainable checkpoint (root fixes, Luna validation).**
Use discoverable existing salvage/needs/repair systems, then Save & Quit and
cold Continue. Adjust guidance or costs only for a demonstrated recovery
deadlock. Keep Story infinite-reserve behavior unchanged.

Acceptance: Survival remains finite across Continue, every round and crafting
input reconciles, and low ammunition can be recovered through ordinary play.

**Sol's refined execution contract:** Create a new isolated browser profile,
click New Game then `[data-profile="survival"]`, and complete the opening and
existing first-run loop. Assert fresh profile `survival`, finite ammunition,
rifle 30 magazine/150 reserve, shotgun 6/48, no inventory ammo, and 260 scrap.
Never convert the existing Story checkpoint into Survival.

Use ordinary build rows `[data-piece="refinery"]` and
`[data-piece="workbench"]`, and `[data-recipe="refine-components"]`. Fire at
least 35 rifle rounds across a real reload, then craft rifle ammunition while
the shotgun is equipped using `[data-recipe="craft-rifle-ammo"]`: spend 2 scrap
and 1 component, gain 30 rifle rounds, and leave shotgun state unchanged.
While the rifle is equipped, `[data-recipe="craft-shotgun-ammo"]` spends 3
scrap and adds 8 shotgun shells. Equip with Digit1/Digit2, reload with R, and
open nearby stations with E. Capture immediate before/after snapshots so
unrelated loot and building do not contaminate the ledger.

For each weapon, `final magazine + reserve + inventory ammo = initial total
- shots fired + batch size * crafts`. Reload alone conserves the total;
crafting routes directly to the matching weapon regardless of the held weapon.
To prove recovery, expend the shotgun's initial 54 shells, confirm a dry trigger
creates none, craft one shell batch, reload, and expect exactly 6 magazine/2
reserve. Commit an ordinary safe Save & Quit, cold Continue, then compare the
actual committed profile, both weapon states, inventory, resources, structures,
health and campaign facts. Record real encounter interruptions rather than
suppressing enemies to finish the test.

Source review found no established economy deadlock: drifting salvage supplies
scrap without ammo, and shells need no components. Exhausting both weapons
during a forced encounter remains a hypothesis to observe, not grounds for an
untested balance change. The recovery guide currently warns on the selected
weapon's empty reserve and names its matching workbench recipe.

## Execution and release

AP shipped in PR #18. MID-02/03 and SURV-01/02/03 now have accepted normal-input
lineages, including the observed idle repair-price fix. See
[the delivery and exact evidence](../../campaign/midgame-survival-notes.md) for
boundaries, resource/weapon ledgers, failed tooling attempts and graphics modes.

AP runs first because authored collision affects all later full-detail claims.
Luna handles bounded tooling and routine implementation; Sol plans and reviews;
root owns art, camera, shared Game integration and release. One browser/GPU
driver runs at a time. Each release includes only observed fixes, appropriate
regressions, source/art parity checks where changed, and honest limitations.
