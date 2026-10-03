# Survivor feature implementation

Implemented in the native Godot edition after approval of the [25 September plan](../superpowers/plans/2026-09-25-survivor-combat-and-wrist-terminal-plan.md). Three parallel work packages covered the wrist terminal, encounters, and salvage/destinations; shared shooting, controls, save migration and integration were handled centrally. The browser edition and personal saves were preserved. No commit or release was created.

| Package | Owner | Status | Validation |
| --- | --- | --- | --- |
| A1–A3, A5: shooting, opening, owned damage | Main agent | Implemented | 31 combat/save checks; 68 weapon checks; opening review |
| A4, D1–D6: reticle and physical wrist terminal | Wrist terminal agent | Implemented | 45 rendered checks; native page/aspect captures; measured display cost |
| B1–B4: salvage tool | Salvage and destinations agent | Implemented | 39 focused checks, headless and Vulkan |
| C1–C7: carrier interception and boarding | Raids and escape agent | Implemented | 69 boarding, 87 craft, 20 defenses checks; rendered interception and sight-camera review |
| E1–E2: friendly survivor | Salvage and destinations agent | Implemented | Exchange, reward, acknowledgment and save checks |
| F1–F2: connected workshop expedition | Salvage and destinations agent | Implemented | Normal-input bridge crossing; relocation and return-route checks |
| G1–G2: scout detection and escape | Raids and escape agent | Implemented | Disable, decoy, actual steering and grapple-cut escape checks |
| Shared state, input, save migration, integration | Main agent | Implemented | 109 campaign and 66 controls checks; full new-content restore |

## What is playable

S-07 turns toward the shot before it is released. A quick rear-facing click is buffered long enough to bring the body and weapon around. Camera aiming selects the intended target, while actual muzzle and chest-to-muzzle collision prevent shooting through nearby cover. The opening's weapon turn now blends with the body instead of snapping behind it. The reticle confirms positive player damage once per attack, including a multi-pellet shell. Owned pieces still stop bullets but cannot be demolished by player weapons or owned defenses; hostile damage remains effective.

Recover the cutter with **E** at the onboard tool locker. Select it with **3**, aim at reachable construction, and hold **X** to dismantle. It previews dependent pieces and refunds, protects contents and active return routes, and turns S-07 toward the work. **1/2** return to weapons. These bindings are remappable. Acquisition and selection survive native saves, and older campaigns receive an accessible unclaimed locker.

**Tab** raises the actual original Blender forearm device. Inventory, storage, build catalog, workshop, machine, signals and records use its live green display. Mouse input is projected onto the screen; wheel scrolling, keyboard selection and focused sliders remain functional. Text size, reduced motion, subtle glow and scanlines are configurable. Pause, title, library and settings also work without a live character.

Carriers approach visibly from the front or rear, with either-side routes and matching crossfire vehicle geometry. Their hulls and components can be targeted by manual and automatic defenses. Grapples launch before crew travel; sword Revenants prepare and commit to a visible leap. Fatal hull damage produces a bounded breakup, defeats crew still aboard, and preserves already transferred enemies. Rewards cannot repeat. Mounted guns now have an elevated view over their receiver and a reticle projected onto the actual barrel impact.

The optional **A light still on** contact offers R-9's three-component relay exchange, supplies, a water ledger and a later acknowledgment. **Shared workshop** offers a machinery sequence, salvage, evidence of human/machine cooperation and a raised cache reached by a supported boarding extension. Both remain optional and use existing navigation and safe docking. A searching scout can be disabled, diverted with a workbench-crafted signal decoy, or avoided by actually steering out of its search lane after steering is unlocked. A decoy plus cleared grapples can break pursuit.

## Verification and evidence

The [baseline diagnostic](results/player-feedback-2026-09-25.json) records the original defects. [Combat and save results](results/survivor-combat.json) record **31 passing checks**, including a real captured-pointer rear click, shotgun confirmation, close-cover deck-gun obstruction, old-save migration and full live-game restoration of the cutter, decoys, new destination and partial rewards. The solved muzzle matched its rendered marker within 0.000002 m in that controlled run. The seven opening turn/shot samples remained within the intended forward cone.

The opening also ran at its normal timeline rate through the existing handoff; [capture timing](results/survivor-opening-review.json), [coordinated turn](previews/survivor-opening-turn-2026-09-25.png) and [aligned return shot](previews/survivor-opening-shot-2026-09-25.png) are retained. Screenshots are encoded after playback to avoid introducing compression stalls into the turn. These captures are for visual continuity, not a frame-rate benchmark.

[Existing regression results](results/survivor-existing-regressions.json): campaign integration **109**, weapon presentation **68**, controls/interactions **66**, story polish **59**, traversal **13**, opening handoff **32**, and opening framing **22** checks passed. The framing suite sampled 2,631 views and 6,188 corridor rays. Updated encounter fixtures wait for real approach/launch completion instead of the former Z-coordinate shortcut; semantic assertions were retained.

See the [salvage/destination review](survivor-content-review.md) for **39 focused checks**, **132 existing audit checks**, original Blender sources and native screenshots. See the [interception review](interception-review.md) for route, damage, destruction, scout, timing and rendering evidence. Final native checks use Godot 4.7.2, Vulkan Forward+ and the local RTX 3070; headless checks use the same gameplay objects. Test saves/settings are isolated.

The [wrist-terminal review](wrist-terminal.md) records **45 passing rendered checks** for mouse/keyboard transactions, scrolling, screen projection at four aspect ratios, arm/camera restoration and closed display behavior. Its isolated 1120×792 redraw measured 0.019 ms median GPU / 0.055 ms median CPU; this measures the display alone. The native screenshot shows the physical forearm device and surrounding world.

Rendered interception with a three-second mounting allowance and scripted hull tracking destroyed the normal carrier in **8 hits at 8.83 seconds**, ahead of 18-second contact, and the heavy craft in **12 hits at 13 seconds**, ahead of 23-second contact. These use the real held-fire mounted-gun handler and actual obstruction. They establish an interception window, not human aiming accuracy. Performance measurements and their fixed-scene limits are in the encounter review.

Original editable models and reproducible builders are included in `assets/native-story/wrist-terminal/`, `assets/native-survivor/`, `assets/native-raiders/interception/` and their corresponding `tools/art/` directories. Runtime GLBs have been imported in the local project.

## Playtest scope still open

The features are implemented and checked in controlled scenes, including normal input for shooting, screen transactions, interaction and bridge traversal. A complete uninterrupted, unassisted campaign playthrough has not been performed. The workshop's first-time five-to-ten-minute pacing target, encounter difficulty across arbitrary player builds, and broader hardware performance remain playtest work. Existing campaign/ending text remains provisional under the survivor-focused story direction; these additions do not establish a new ending.

Launch the updated project through `godot/Play Godot.cmd`. Start a new campaign to review the opening, or load an existing native campaign to verify the accessible tool recovery. Continue to optional contacts after unlocking steering. The original detailed checklist retains the broader delivery gates so those remaining playtests are visible.
