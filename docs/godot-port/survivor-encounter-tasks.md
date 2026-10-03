# Optional survivor encounters: implementation tasks

Follow-up to the initial survivor pass, 25 September 2026. These are optional
stops and survival choices for S-07; no hero role, morality score, or new ending.
The current native project already contains first versions. This pass closes
the remaining connections and verifies the actual player paths.

| Task | Work | Acceptance | Status |
| --- | --- | --- | --- |
| S1 | R-9's refuge request and repair/exchange | Brief radio offer; clear three-component cost; persistent partial repair and supplies; skip or depart without a penalty | Implemented |
| S2 | Useful location and later acknowledgment | Repair marks a real optional workshop signal; one later personal transmission after departure; no duplicate supplies or exhausted repeat stops | Implemented |
| X1 | Construction-assisted rooftop expedition | Primary gangway and raised entrance; supported player-built stairs/platform/extension route; clear in-world guidance | Implemented |
| X2 | Workshop activity and safe return | Isolate/fuse/restart; optional shared-shift evidence; independent useful caches; overflow and saves; safe return/departure | Implemented |
| P1 | Search and detection | Visible scout with readable search, lock, and broadcast warning; weapons, workbench decoy, and actual unlocked steering all work | Implemented |
| P2 | Break pursuit | Disrupt tracking, cut grapples, survive remaining contact, and receive a truthful lost-contact outcome | Implemented |
| V1 | Native verification and review | Focused regression checks, rendered route/feedback review, saved evidence; distinguish measured traversal from first-time player pacing | Complete |

R-9 remains the only new living contact in this slice, and is a robot. A later
radio report can mention a rare traveler without spawning a human encounter.
The workshop targets a five-to-ten-minute first visit including construction;
that duration requires a first-time player playtest and must not be inferred
from a scripted route.

## Changes in this pass

The first eligible optional signal introduces R-9 after steering is available.
His relay costs three components supplied individually. Repairing it grants
four water, three fuel, and a real workshop contact in the next eligible
signal slot. Both signals can be passed by. Partial donations, unclaimed
supplies, the marked location, and the acknowledgment survive native saves;
older completed repairs inherit the location reward. R-9 remains available
to talk after the repair. His later message waits for departure, at least
600 metres of travel from the repair, a living operator aboard, and quiet
radio time. It is recorded once, including across chapter changes. Empty
completed stops no longer replace fresh optional destinations.

The workshop provides an optional projection for a valid construction route.
Its eight stages show the next part and remaining ordinary resource costs;
the player still aims and pays for each placement. The guide selects a useful
starting deck and rotation. A real stair-to-floor collision defect was fixed
by checking the capsule's leading edge and full clearance, keeping the
existing 44 cm step limit and preventing wall/ceiling bypass.

Scouts retain their real collision sight tests, 18-second detection buildup,
and five-second broadcast warning. A signal decoy costs four scrap and two
components at a workbench. Choosing a heading alone does not evade a scout;
the machine must move out of its search lane. During pursuit, beacon expiry
no longer falsely credits escape: grapples, carrier departure, and living
boarders remain part of the encounter. Death does not grant evasion credit,
and a broken lock cannot trigger a stale broadcast in the same update.

## Validation

The focused suites cover friendly exchange/radio/save behavior, paid workshop
construction and normal walking in both directions, scout lifecycle and
avoidance, and curb/wall/ceiling clearance. Existing campaign, controls,
story, locomotion, boarding, and turret regressions also pass. Native rendered
content checks cover real interaction, bridge collision, reward overflow,
and return-route protection. The final workshop route and existing content
suite passed with Vulkan on the local RTX 3070 and exited cleanly after the
guide's reference cycle was removed.

| Suite | Passed | Mode |
| --- | ---: | --- |
| Friendly encounter, optionality and persistence | 21 | Headless |
| Survivor content, caches and return-route protection | 40 | Vulkan |
| Guided paid construction and full walk/return | 22 | Headless and Vulkan |
| Scout search, evasion and pursuit escape | 47 | Headless |
| Step, wall and ceiling clearance | 6 | Headless |
| Existing locomotion | 39 | Headless |
| Campaign integration | 109 | Headless |
| Controls and interactions | 66 | Headless |
| Story and terminal integration | 59 | Headless |
| Boarding | 69 | Headless |
| Interception defenses | 20 | Headless |

Total: **498 checks**, counting each suite once. See the
[combined results](results/optional-survival-followup.json),
[construction guide](previews/workshop-build-guide.png), and
[completed route](previews/workshop-built-route.png).

The remaining pacing task is a first-time player visit targeting five to ten
minutes. Scripted construction, controlled camera placement, and ordinary
walking checks establish functionality; they do not establish a novice's
completion time or replace an uninterrupted campaign playthrough.
