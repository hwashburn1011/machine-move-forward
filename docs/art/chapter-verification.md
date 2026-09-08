# Radio chapter verification

Implementation date: September 7, 2026. The work resumed after a power outage;
source, editable Blender files and generated assets survived.

## Delivered

- Guaranteed radio equipment from the first successfully reeled chest after
  the opening. Missing a chest leaves it available; the find is saved once and
  does not require an inventory slot. The receiver includes a signal cue and
  an interactive deck console.
- Six researched upgrades in three mutually exclusive branches, with visible
  hardware, permanent unlocks, explicit tradeoffs, and free safe swapping.
  Emergency uninstallation remains possible if a loadout shuts off the radio.
- A complete first relay wreck: protected approach, physical braking,
  retracting machine gate and gangway, three logs, one Course Gyro, on-foot
  return, radio departure, and a saved next-signal flag.
- Rebalanced starting resources, component batches, fuel loot and tutorial
  skiff; original radio, wreck, engineer and weapon models; grounded character
  animation, cable crossing poses, impact feedback and radio audio.

The subsequent signal's destination is intentionally outside this chapter.

## Automated evidence

| Check | Result |
| --- | --- |
| Unit suite | 974 tests in 82 files passed |
| TypeScript and production build | Passed |
| ESLint, zero warnings | Passed |
| Radio/chapter browser harness | 37/37 checks, no console/page errors |
| Existing Playwright browser suite | All 38 checks covered: 37 passed in the full run, and the weapon check passed its targeted rerun after updating the test's production-preview import and authored-rig measurements |
| Guided first-run browser harness | 33/33 checks passed, no console/page errors |
| Authored/fallback in-game presentation | 14 views rendered without page errors; four focused dock/radio views repeated after moving the receiver |
| GLB validation | Real Three.js loaders, geometry budgets, doorway/floor rays, animation samples and weapon hand frame passed |

`tools/chapter-flow.mjs` writes the detailed evidence to
`docs/art/chapter-validation.json`. Its normal opening path uses the real F
key and live hook/reel. In the recorded deterministic run the radio was found
at **6.21 seconds of playable simulation**, after the chest drifted into reach.
This demonstrates the five-minute target under the automated driver; it is not
a measurement of how quickly a new human player learns to aim.

The research, expedition and save checks are explicitly staged fixtures.
They use actual costs and modifiers after setting up their resource budgets,
real keyboard capsule traversal, proximity interaction for the gyro, real UI
clicks for emergency uninstall and departure, and actual save storage. They
verify supported position and health on a wreck reload, then fresh-game reset
of the generator, fuel, upgrades, radio and wreck.

`tools/first-run.mjs` separately completes the existing guided loop with its
normal starting purse and paid floors, stations and four component batches.
It stages salvage collection, travel/aim and hull damage through runtime
actions. It does not grant extra scrap or mark the guide complete. Its 33
checks include the fifteen-second ready window, repair, Save & Continue,
no repeated tutorial, queued combat saving, and visible storage failure.
There was no single uninterrupted, unstaged new-game-to-departure playthrough;
the separate harnesses above are the evidence for this delivery.

The final source also has a regression test preserving the 180m salvage
cadence when loading a run that already found its radio. This was checked
after the chapter harness and does not alter its early-radio or route flow.

The weapon check measures both current GLBs in idle and walking poses. It
requires correct barrel alignment and size, and places each authored grip
within 8cm of the right hand. Its old helper depended on a development-only
Three.js URL, Mixamo finger names, and the previous weapons' bounds centre;
the updated check uses live math objects, the engineer's actual hand frame,
and the authored grip origin.

## Balance and art review

Sol's final numerical review is recorded in the implementation plan. The
refinery/refining/workbench/gun chain costs 184 scrap plus 24 for its three
required floor plates: 208 scrap before extra platforms and repairs. Torque
becomes beneficial at about 2.44 tonnes of added payload. The Governor supports
the healthy baseline 14-unit load while leaving
no spare capacity. The fuel analysis is a calculation from game data, not a
human thirty-minute playtest.

Astra created the new art with Blender and original Three.js geometry. No
downloaded meshes or paid asset tools were needed. See `ASSETS.md` and
`docs/art/expedition.md` for editable sources, rebuilding and provenance.

The radio's final mount is `(3.9, 3.69, -3.3)`, clear of the existing hardpoint
and prow. The machine gate retracts only at the supported dock. Its regression
test uses the complete machine geometry with Rapier, including the original
side rail, and walks through both wreck doorways.

Art screenshots are staged presentation fixtures. Subjective aiming feel,
combat difficulty and how enjoyable the wreck is to explore remain human
playtest questions.
