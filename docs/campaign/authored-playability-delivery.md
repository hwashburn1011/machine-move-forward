# Authored campaign playability

This iteration follows PR #17 (`c39167c`). The first repair addresses a real
save made with fallback graphics near the radio, then continued with full art.
The character overlapped the command cabin and the camera collapsed against
the same wall. This is a collision/save admission repair; campaign facts,
inventory, combat rules, and art appearance remain unchanged.

## Measured cause

The corrected normal-input diagnostic is
`test-results/authored-radio-clearance/run-1789478027817`. At Continue, the
player was approximately `(1.3151, 15.8043, -4.4642)` and the camera offset
was only `(0.0167, 0.0167, -0.0155)` metres. Rapier's authored machine
trimesh (shape 6) reported **0.21744 m penetration** near the capsule's upper
side. The cuboid deck (shape 1) had a positive 0.00890 m gap. Initial diagnostic
versions filtered by collider origin and therefore missed the large merged
authored shell; those earlier empty-contact results are not clearance proof.

Blender MCP inspection identified the solid bevelled `Command house lower
structure`, with source bounds mapping to x=1.5..5.25, y=14.83..16.66333,
z=-6.6..-2.36 in game coordinates. Its six upper side plates also constrain
the capsule. The visible cabin was present only in the optional detailed
asset; its physical footprint was absent in the fallback layout.

## Implementation

- Seven cabin housings/plates now have a common physical footprint and visible
  fallback proxies. Their bounds live in `src/data/iron-nomad-shared-solids.json`.
  Full art hides those proxy visuals while retaining their collision.
- Blender's collision exporter omits the seven duplicate authored surfaces,
  retaining their build/navigation reservations. It verifies the shared bounds
  against the editable source within 3 mm before exporting. The detailed
  visual GLB and source model are unchanged.
- Continue restores the hull pose from saved journey distance before checking
  the player capsule. Transient enemies are removed first.
- Clear saved positions, including airborne positions, remain exact. Embedded
  positions search for the nearest clear, supported point within 2 m on the
  same horizontal plane. If none exists, checked deck-cell positions provide
  a fallback; an occupied default spawn is never accepted blindly.
- Fit/support queries inspect current Rapier shapes directly, excluding
  disabled colliders and sensors, without advancing physics. Recovery cannot
  use another kinematic actor as its supporting floor.

## Validation status

Blender exported 109,504 collision triangles from 539 authored source objects;
the seven runtime solids own the removed 644 triangles. All four playable/full
GLB validation targets have zero errors and zero warnings. The shipped visual
GLB hash remains `7555e87ddef3868e10c16148d4bf8a9b281198e5b70a496e3497d11bf982216f`.

TypeScript, lint, and all 1,484 tests passed in PR CI (`34976688696`).
Full-detail radio validation passed in
`test-results/authored-radio-clearance/run-1789479094309`. The restored
character starts near `(1.0831,15.8062,-4.4623)` with positive wall clearance;
the first one-second backward input reaches `(0.8450,15.8499,-0.4222)`.
The camera pulls back normally after moving away. There were no browser errors.
Compact before/after contacts are in
`authored-playability-validation/radio-clearance.json`; the departure screenshot
is `authored-playability-validation/radio-departure.png`. Tight wall-adjacent
views still use the existing player fade and shortened boom.
Full-detail Wreck normal-input validation **passed** in
`test-results/continuity-wreck/run-2026-09-15T13-39-44-061Z`: accepted trace,
real travel/docking, crossed the visible gangway, recovered one Course Gyro,
returned, departed, saved, closed the browser, and continued the same profile.
All three authored asset flags were true. Cold Continue retained 216 scrap,
9 components, 4 fuel items, 78 HP, eight structures, full subsystem health,
and exactly one gyro. Destination colliders were all disabled, the gangway
closed, and the player remained aboard. There were no browser errors.
Committed payload, compact events, and computed comparisons are in
`authored-playability-validation/wreck-*`.

Two earlier Wreck runs remain preserved. `13-33-57-768Z` exposed a runner
closure error (`fullArt` was not passed into page evaluation); `13-35-04-135Z`
used an aisle waypoint through the player's turret at (6,-2). The successful
route uses the corridor between the refinery and turret. Neither failure
required removing equipment collision or changing the campaign.

The next independent gates remain one continuous Foundry/Quiet Array journey
to earned steering, and a fresh Survival ammunition/recovery loop. Prior
procedural Wreck continuity evidence does not establish these later gates.
