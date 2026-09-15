# Glass Orchard traversal reference

Coordinates here are destination-local `(x, z)`. Add the live destination root
to obtain world coordinates. The definition currently places that root at
`(17, 14.83, 0)` when docked. Read live interactable positions when approaching
them; the player capsule radius is 0.34 m and interaction reach is 3 m in 3D.

## Anchors

| Interaction | Local `(x, z)` | Required action |
| --- | --- | --- |
| `orchard-port-isolator` | `(-7.1, 0)` | Restore port bus if damaged on this route |
| `orchard-starboard-isolator` | `(5, 0)` | Restore starboard bus if damaged on this route |
| `orchard-caretaker-record` | `(-5, 5)` | Caretaker-route testimony |
| `orchard-evacuation-record` | `(0, -7)` | Cold-vault-route testimony |
| `orchard-memory-record` | `(3.8, -3)` | Common testimony |
| `orchard-human-seed-bank` | `(-4, -5)` | Recover seed bank after port bus restoration |
| `orchard-memory-core` | `(5, -5)` | Recover memory core after starboard bus restoration |
| `orchard-vector-governor` | `(5, 5)` | Recover governor after required objectives and records |
| `orchard-departure` | `(-9.5, 0)` | Return aboard and depart |

Blender stores these positions as `(gameX, -gameZ, gameY)`. The rebuilt
`PortIsolator` anchor is `(-7.1, 0, 1.1)` in the Blender export report and
`(-7.1, 1.1, 0)` in game coordinates. All interaction IDs remain unchanged.

## Verified entrance correction

The old port cabinet at `(-5, 1.45)` occupied the greenhouse entrance. The
remaining side slot was only about 0.19 m wide after expanding the cabinet
and adjacent end-glass bounds by the capsule radius. Moving the cabinet to
`(-7.1, 1.45)` places it beside the doorway. The Blender cabinet, marker,
procedural fallback and gameplay collider now agree.

`tools/campaign/orchard-doorway-review.mjs` loads the full authored model in an
isolated docked fixture, then uses normal-speed forward input through the
central `x=-5` entrance. The player moved from local z=-0.015 to z=3.147,
with less than 0.01 m lateral drift. The two checks passed with no runtime
errors. The screenshots are in `orchard-clearance-validation/`.

This validates the doorway and rebuilt anchor. Fixture setup supplies the
docked chapter; it is **not** evidence of earning or completing the expedition
through the campaign.

## Candidate routes for the continuous playthrough

Use the west gangway and the open `z=0` aisle. Visit the port and starboard
switches from that aisle. Greenhouse approaches should stay near `x=-5`,
between the beds. Stop near `(-5,3.3)` for the caretaker record, or
`(-5,-3.3)` for the seed-bank terminal, then let the live prompt select the
interaction. Do not walk into the terminal itself.

Approach the common record from `(2.3,-3)`. For the memory core, avoid that
record's pedestal: use `(1.5,-1)` → `(1.5,-4)` → `(5,-4)` and stop before the
core terminal. The cold archive extends to z=-5.1, so do not approach through
the building. Approach the governor from `(5,3.5)`; its workbench occupies
z=5..8 and blocks an approach from beyond it.

These remaining routes are planning guidance, not accepted runtime traversal
evidence. Log player position and nearby enabled colliders if movement stalls,
then adjust the walking route without disabling collision. Preserve the
route-selected testimony; the other route's record must remain unknown.
Return physically across the gangway and verify `playerOnMachine` before
departure and the subsequent save/load checkpoint.
