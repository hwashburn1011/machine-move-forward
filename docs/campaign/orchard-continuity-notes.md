# Glass Orchard continuity

This slice continues the accepted recovery checkpoint
`run-2026-09-15T15-52-49-854Z`, retaining its real structures, supplies,
condition, needs and campaign records. It uses the full authored models,
normal game speed and ordinary keyboard, mouse and UI input. Failed attempts
retain their browser profiles and recorded parentage.

## Radio-to-route cursor correction

Accepting a cached expedition transmission could leave the cursor captured
by the game while the route-selection panel was visible. Closing the radio
requested control asynchronously; the replacement panel released the mouse
before that pending request was granted. The delayed grant then captured
the cursor again. Route buttons looked normal but could not receive clicks.

`beginWreckTrace` now retains the radio's free cursor when its effects open
route selection. Transmissions that return directly to gameplay keep the
existing control-reclaim behavior. No CSS, route costs, combat rules or
progression gates change.

The initial normal-input attempt `run-2026-09-15T16-04-03-293Z` retained the
failure. A separate UI review at `run-2026-09-15T16-16-39-881Z` recorded the
open expedition panel with `pointerLockElement=CANVAS`; button rectangles
and hit-test stacks confirmed their layout was clear. After the correction,
the next attempt selected and confirmed Caretaker Approach through normal
clicks, recording the actual eight-fuel route estimate and the transition
to approach. This identifies a control-ownership race rather than a layout
or CSS problem.

## Accepted continuation

`run-2026-09-15T16-37-16-944Z` selected the route, defeated the real patrol,
docked, crossed the gangway, restored the starboard isolator, read the
caretaker and common records, and recovered the seed bank. It then stopped
between the common-record and memory-core prompts. Interaction chooses the
nearest object; aiming at the core does not override that choice. The driver
now approaches within 0.75 m of the core before pressing E.

`run-2026-09-15T16-42-56-295Z` continued that durable checkpoint, recovered
the memory core and vector governor, physically returned aboard, departed
through the radio, and passed a paused Save & Quit followed by a cold
browser restart. Both runs used the `index-tv9aKn5k.js` production build,
full authored models and ordinary input at normal simulation speed.

The restored save has all four completed expeditions through Glass Orchard,
eight unique facts, five journal records, and navigation tier 2. The three
Orchard facts occur exactly once. The alternate Cold Vault testimony remains
unknown. Inventory, structure identity and condition, subsystem health,
campaign records, ending state and course persist; fuel, needs, producer
progress and distance change only within their normal elapsed-time bounds.

The checkpoint has 749 scrap, 38 components, 12.079 tank fuel, 51 health,
45.97 hydration and 50.97 nourishment. Ten structures remain: the patrol
destroyed the manual gun and its supporting floor. Their loss is preserved,
not repaired or replaced by the validation script. The final two attempts
recorded no player deaths, but earlier failed driving attempts include real
deaths and normal respawns. This is a continuous save lineage with retries,
not an uninterrupted or death-free playthrough.

## Driver corrections and remaining work

Earlier attempts mounted the nearby gun when trying to cut a grapple, fired
into the command cabin, or tried to walk through that cabin. These were test
input errors. The successful firing route goes around the bow to the open
starboard aisle; no combat timing, enemy health, collision or spawn rules
were relaxed. Compact attempt records and accepted checkpoint evidence are
in [orchard-continuity-validation](orchard-continuity-validation/).

The route card's eight-fuel estimate assumes full-speed travel. Scripted
encounter holding and docking consume additional powered time. The verified
continuation retained a reserve; Meridian needs normal salvage and refueling
before its longer journey. An improved presentation of this estimate is
separate work, not part of the cursor correction.

All **1,489 tests across 169 files**, lint, TypeScript and the production build
pass. The new regression exercises actual radio/route panel transitions and
a deferred pointer-lock grant, including the direct-to-gameplay case.
Meridian and the ending remain unvalidated in this save lineage.
