# Survivor encounters, combat corrections, and the wrist terminal

Status: all seven packages implemented and focused validation complete; the full campaign playtest gate remains open. After reviewing the verified findings, the user requested all packages and explicitly authorized parallel sub-agents. [Implementation tracking and validation](../../godot-port/survivor-implementation.md) records the current work and evidence.

Baseline: native Godot project at `c1facb5`, examined 25 September 2026. The preserved browser edition is a separate implementation; the runtime findings below apply to the native edition. Checked package tasks indicate implemented functionality. Broader delivery and playtest gates remain explicit below.

## Story and player experience

S-07 escapes onto the Nomad because it is his available way out. He initially has no understanding of its destination or purpose. He gradually makes a life aboard, goes with the flow, and helps where he can while protecting himself. Benevolent machines and scarce surviving humans oppose machines that are eliminating resistance and rebuilding the world for themselves. War and indifference to human needs explain the ruined environment.

Encounters should give him practical, optional reasons to act. Humans remain rare. Exploration happens at selected elevated destinations connected to the machine. Existing collectors, navigation upgrades, construction, records, docking, and L-12 provide foundations. Earlier campaign text and the existing Meridian ending are provisional where they conflict with this newly stated direction; a final ending remains undecided. Do not build new content around a chosen-one role or assume the machine had a secret purpose for S-07.

## What was verified

Controlled fixtures ran against actual native game objects in Godot 4.7.2, first headless and then with Vulkan rendering on the local RTX 3070. Final-pose measurements were sampled through the skeleton modifier callback. The rendered opening images were inspected. These checks were not a full manual playthrough or a performance benchmark.

| Finding | Evidence and interpretation |
| --- | --- |
| Stationary backwards firing is reproducible | With an idle, non-aiming character and camera looking behind him, `player.fire()` consumed one round and emitted a shot approximately **179° behind the body**, while the gun and camera differed by approximately **180°**. The controller rotates the visual only when moving or aiming; firing has no equivalent facing requirement. |
| The opening weapon turns before the body | Scripted aim starts at **2.48 s**, when body and gun differ by **161.7°**. The mismatch is **155.0° at 2.55 s**, **127.1° at 2.65 s**, and **66.0° at 2.80 s**. The body catches up at **3.05 s**. This reproduces the awkward weapon-first turn. |
| The exact opening shot timing needs a distinction | At the scheduled **3.65 s** and **5.00 s** shots, the sampled body faces the target. The current native evidence confirms the transition defect, not a body still pointing backwards at those shot instants. |
| Player bullets damage owned construction | A real rifle raycast into an owned wall reduced health from **150 to 128**. `structure_body.gd` forwards damage without identifying the attacker. The manual deck gun also calls the same general damage method. |
| Basic aiming UI exists, but the requested feedback does not | Native play draws a centered `+`; captured gameplay normally hides the OS pointer. Existing combat text reports some hits, but the crosshair does not pulse soft red. Damage feedback is emitted from enemy damage handling, so it needs attribution before becoming player hit confirmation. |
| Raids have an approach, but no front/back variety | The current ship starts at `(side × 30, 5, -55)` and approaches the left or right side. The transition checks a Z coordinate rather than completion of a generalized approach. All boarding crew currently use grapple traversal. |
| Destroying a carrier already defeats unboarded passengers | Applying fatal hull damage to the live skiff defeated both waiting passengers. The ship then entered **retreat** while its model remained visible. Gameplay defeat exists; an actual destruction presentation is missing. |
| Manual deck guns already damage ships | Ship hulls have damageable hit zones. Automatic turrets currently search the enemy actor list rather than ship hulls or components. Expand these existing systems. |
| A wrist model and partial arm gesture already exist | `WristHousing` is attached to the left forearm, and a menu pose bends that arm. The interactive menu is still a large flat `PanelContainer`. A framed, readable view of the arm-mounted screen is not implemented. |

Evidence: [runtime measurements](../../godot-port/results/player-feedback-2026-09-25.json), [weapon ahead of body at 2.55 s](../../godot-port/previews/feedback-opening-turn-2026-09-25.png), [aligned shot pose at 3.65 s](../../godot-port/previews/feedback-opening-shot-2026-09-25.png), and [reproducible diagnostic](../../../tools/godot/player-feedback-diagnostic.gd).

Run from the repository root with the existing native assets:

```powershell
& 'test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe' --headless --path godot --script ../tools/godot/player-feedback-diagnostic.gd
```

Omit `--headless` for native screenshots. The diagnostic uses test mode and an isolated `native-feedback-investigation` save directory. It invokes real gameplay methods with controlled fixtures; it does not simulate an entire physical-input playthrough. Output is written to `test-results/godot-native/`.

## Recommended implementation order

| Order | Package | Completion outcome |
| --- | --- | --- |
| 1 | A — Shooting and opening correctness | Body, weapon, reticle, and actual hit agree; owned construction is protected from player weapons. |
| 2 | B — Salvage tool | Early, deliberate dismantling replaces using gunfire as a demolition method. |
| 3 | C — Incoming ships and boarding | Visible front/rear approaches, meaningful deck-gun interception, grapples, a Revenant leap, and real ship destruction. |
| 4 | D — Physical wrist terminal | Original Blender hardware and a readable green-screen menu on the character's raised arm. |
| 5 | E — Friendly survivor encounter | One optional practical exchange with a benevolent robot and a later acknowledgment. |
| 6 | F — Construction-assisted exploration | One short optional destination with a buildable connection and useful salvage. |
| 7 | G — Scout detection and escape | A readable opportunity to avoid, disrupt, or escape a threat. |

Each package should be reviewable on its own. D's hardware design can be developed independently after the player-pose contract is established. C and G share encounter ownership and cleanup; keep one authoritative encounter state rather than layering separate raid schedulers.

## A — Correct shooting, aiming feedback, and the opening

- [x] **A1: Coordinate gameplay facing and shot release.** Firing, including hip fire and queued bursts, must bring the body toward the camera's intended aim. Use bounded torso/arm rotation for small corrections and a whole-body turn for larger ones. Keep camera look responsive. A rear-facing click can initiate a fast turn, but cannot release a bullet through the character before the weapon can face that direction. Use a brief pending-shot state if necessary; test quick clicks as well as held fire.
- [x] **A2: Resolve the actual shot from the weapon.** Use the camera to choose the intended target, then validate the muzzle-to-target path. Nearby rails, walls, and the machine must block shots. Sample the resolved animation pose at a consistent point so the visible muzzle, tracer, and collision result agree during fast turns. Preserve weapon spread, ammunition, reload, burst, falloff, and shoulder-swap behavior except where correcting the impossible shot requires delaying release.
- [x] **A3: Fix the opening turn as one action.** Coordinate landing, feet, hips, torso, arms, and the rifle. Blend the return-fire pose instead of immediately giving the arms a target behind the body at 2.48 s. Preserve the existing escape, two pursuers, and story beats. Keep the current shot times if a convincing turn fits; any necessary timing revision must update actor, shot, effect, and handoff tracks together. Cover the currently untested 2.48–3.05 s transition.
- [x] **A4: Add a proper aiming reticle and confirmed-hit pulse.** Use a restrained center dot/brackets during weapon play, with aim/recoil states and a brief soft-red pulse only after the player's attack causes valid hostile damage. Include ship hulls/components, passengers, and on-deck enemies. Combine the color pulse with a small shape change. Misses, blocked friendly hits, and automatic-turret or environmental damage must not create false player confirmation. Menus retain a selectable pointer; construction and salvage retain their own cues.
- [x] **A5: Attribute damage and protect owned construction.** Identify player/owned-turret attacks at the damage boundary. Player weapons and owned defenses cannot reduce the Nomad's or owned pieces' health, trigger collapse, or produce demolition refunds. Their shots still collide with that geometry. Hostile weapons, sabotage, and existing legitimate damage continue to work. Share this rule across rifle, shotgun pellets, bursts, manual guns, and automatic turrets.

Acceptance: reproduce the original rear-fire setup through real input and verify sensible body/gun alignment before a shot is released; repeat while moving, crouching, swapping shoulders, reloading, and firing bursts. Check close cover and all owned-weapon damage paths. Verify enemy damage still harms structures. Confirm exactly one hit pulse per player shot with damage, including shotgun multi-pellet hits. Review the full opening at normal speed and slow motion, including both target changes, skip, and return to play.

Primary code: `godot/scripts/player.gd`, `weapon_pose.gd`, `player_pose.gd`, `cinematics.gd`, `opening_presentation.gd`, `main.gd`, `structure_body.gd`, `hit_zone.gd`, `enemy.gd`, `ui.gd`.

## B — Recover an early dismantling tool

- [x] **B1: Guaranteed acquisition.** Place an original salvage wrench/cutter in the first guaranteed recovery crate or an accessible onboard tool locker. It must be obtainable before the player needs to dismantle a mistaken placement. Give existing campaigns the equivalent accessible recovery opportunity without resetting progress.
- [x] **B2: Deliberate use.** Equip/select the tool, highlight a reachable owned piece, show recovered materials and affected supported pieces, and hold to dismantle. Reuse existing demolition, support, inventory, and refund logic. The permanent machine chassis and essential access routes are protected.
- [x] **B3: Physical feedback.** Model the tool in Blender, add a short working pose, and provide progress, mechanical sound, and restrained contact effects. Cancel on range loss, menu opening, damage interruption, or target change as appropriate.
- [x] **B4: Preserve possessions and saves.** Keep the current contents-preservation behavior, storage-capacity rejection, and single refund transaction. Save acquisition and selection; make cancellation and repeated input safe. Keep movement/relocation distinct from dismantling.

Acceptance: new and existing campaigns can access the tool; inaccessible pieces cannot be removed; full storage does not delete contents; support changes are accurately previewed; repeated holds cannot duplicate materials. A rifle hit has no demolition effect.

Primary code: `building.gd`, `equipment.gd`, `session.gd`, `controls.gd`, relevant inventory/item/save definitions, and original Blender tool source.

## C — Visible interception, boarding, and carrier destruction

- [x] **C1: Front and rear approaches.** Add an overtaking route from behind and an intercepting route from ahead, with left/right variants. The craft becomes visible and audible before boarding. Warning text identifies direction and points toward the actual craft. Use path completion/distance for state transitions so a rear approach cannot instantly grapple because its Z coordinate already satisfies the old condition.
- [x] **C2: Match the second cutscene's vehicles.** Build gameplay variants from the existing hostile crossfire ship design: matching hull language, propulsion, markings, crew positions, and visible weapons. Reuse original Blender masters and assemblies, with runtime collision, damage regions, effect anchors, and sensible scale. This task includes adapting the asset, not merely replacing a filename or shrinking a cinematic ship into incompatible colliders.
- [x] **C3: Make deck-gun placement matter.** A powered manual gun placed and oriented at the front, rear, or side must have a usable firing arc into the corresponding approach. Validate elevation against the actual ship height and surrounding rails. Keep meaningful blind spots caused by the player's construction. Add ship hull/component targets to automatic defenses through the same damage and obstruction rules, with crewed deck guns retaining a useful interception advantage.
- [x] **C4: Tune a fair interception window.** Measure warning-to-contact, time to reach/mount a nearby gun, time within range and arc, and time to defeat the hull. Current unmodified manual gun stats are 42 damage at 1.2 shots/s; the normal skiff has 260 health and 5 armor. That is **8 connecting shots**, about **5.83 s from first to eighth shot** under ideal conditions. The gunboat's 420 health and 6 armor require **12 hits**, about **9.17 s**. These are baseline calculations, not proof that current approaches give enough opportunity. Start from them and playtest ordinary versus heavier craft before changing health or cadence.
- [x] **C5: Grapple boarding.** Show launch, cable/hook attachment, tension, passenger traversal, and landing. Preserve each passenger's identity, health, and damageability. Cutting a hook or destroying the ship before transfer must have a visible, consistent outcome. Test added roofs, rails, walls, and equipment; obstructed routes need another valid landing or an aborted attempt.
- [x] **C6: Revenant leap.** Give the sword robot a distinct, readable launch preparation and a physically bounded leap from its carrier to a valid upper-deck landing. Reuse the same enemy instance and health. Provide a warning, a shootable flight, and a brief landing recovery before attacking. Check the full arc against construction. Establish a clear launch-commit moment: passengers still aboard die with their ship; an already detached leaper follows its own visible trajectory and can still be defeated. It cannot teleport through roofs or spawn after carrier destruction.
- [x] **C7: Real destruction state.** Fatal hull damage triggers a staged burst/fire/breakup or collapse, stops weapons and new boarding, clears hooks, defeats passengers still aboard, and removes the wreck after a bounded effect sequence. Enemies already on the Nomad remain active. Rewards are issued once, and the encounter concludes only after surviving threats are resolved. Replace the current intact-model retreat on destruction.

Acceptance: front/rear and both-side routes work with varied player construction; a player at a suitable gun can defeat an ordinary carrier before any transfer; a completely destroyed unboarded carrier produces no deck fight; partial boarding leaves only genuine survivors. Exercise hull destruction during approach, grapple launch, cable travel, leap preparation, committed leap, and retreat. Repeated destruction cannot duplicate rewards. Use real-time measurements and visual review, not accelerated combat alone, to judge fairness. Preserve the existing calm intervals and safe docking behavior.

Primary code: `combat.gd`, `boarding.gd`, `boarding_pose.gd`, `raider_craft.gd`, `hit_zone.gd`, `raid_mission.gd`, manual turret control in `main.gd`, `enemy.gd`, crossfire/native-raider Blender sources.

## D — A green-screen terminal on S-07's arm

Visual target: an original, worn industrial forearm instrument with a recessed phosphor-green display, curved metal housing, visible fasteners, protective bezel, a small selector dial, and tactile keys. Opening inventory lowers the weapon, raises and turns the left forearm, and frames the actual device for reading. The surrounding arm and world remain visible. Layout uses concise lists, selection highlights, instrument readings, and a small set of page labels. Avoid a dashboard of cards and large boxed buttons. Fallout is a reference for the physical interaction, not a shape, logo, character, or layout to reproduce.

- [x] **D1: Refine the hardware in Blender.** Start from the existing original `WristHousing`, checking its current scale, mounting, and rig. Deliver editable `.blend`, reproducible builder, optimized GLB, materials, named screen/controls/mounts, and preview renders. Fit S-07's forearm and retain separate screen geometry suitable for a live display.
- [x] **D2: Arm and camera presentation.** Author a coordinated shoulder/elbow/wrist open-hold-close motion and a short camera transition that makes the display large enough to read. Support standing/crouching, either camera shoulder, cramped spaces, and different FOVs. Opening and closing must work while the world is paused. Restore the weapon, camera, and input ownership cleanly without an accidental shot.
- [x] **D3: Put functional UI on the screen.** Retain existing inventory/crafting/equipment authorities and render the terminal Controls into a viewport texture on the screen surface. Route pointer positions and keyboard focus into that UI accurately. Start with inventory and storage transfers, then migrate workshop, machine, signals, records, and the build catalog. No duplicated inventory or remote bypass of station requirements.
- [x] **D4: Give the display an original terminal style.** Use crisp green text, restrained screen glow, a narrow status line, selected-row highlighting, and tactile page changes. Inventory entries expose quantity and actions clearly; machine information uses readable schematic/instrument views. Keep scanline/grain effects subtle and optional. Text is rendered dynamically, not baked into the Blender model.
- [x] **D5: Handle menu contexts explicitly.** Tab opens the physical gameplay terminal. Escape closes it or opens the pause page when already in play. Style the title, pause, settings, and campaign library consistently, while allowing them to function without an active character. Existing aboard/off-machine pause behavior and combat interruption rules stay authoritative.
- [x] **D6: Readability and performance.** Support text scaling, keyboard selection, scrolling, and accurate mouse clicks at 16:9, 16:10, 4:3, and ultrawide resolutions. Provide reduced-motion opening and restrained glow. Update the display only as needed when visible. Check GPU cost and close-up clipping on the actual machine before migrating all pages.

Acceptance: the native capture clearly shows S-07 consulting his arm; inventory text and action labels are legible; all current transactions still work; camera/weapon controls restore after close, damage, death, reload, and save/load transitions. Review the real rendered screen at intended resolutions and complete tasks through normal mouse/keyboard input. A green tint applied to the old full-screen panel does not complete this package.

Primary code/assets: `equipment.gd`, `player_pose.gd`, `ui.gd`, `terminal_pages.gd`, `main.gd`, `story_art.gd`, `tools/art/native_story/build.py`, and `assets/native-story/`.

Technical basis: Godot supports UI displayed on a 3D surface through a viewport texture; standalone viewports require input handling, so screen interaction is a specific implementation task. See [SubViewport documentation](https://docs.godotengine.org/en/stable/classes/class_subviewport.html) and the [official GUI-in-3D example](https://github.com/godotengine/godot-demo-projects/blob/master/viewport/gui_in_3d/gui_3d.gd). Final-pose checks must sample at the modifier callback as described in [SkeletonModifier3D documentation](https://docs.godotengine.org/en/stable/classes/class_skeletonmodifier3d.html).

## E–G — Retain the three previously accepted additions

- [x] **E1: One optional friendly encounter.** Add a benevolent robot maintaining a small rooftop refuge. Offer a practical component repair/exchange, a modest supply or navigation reward, and one later radio acknowledgment. Persist decisions and partial progress. Declining leaves the survival loop available. Keep living-human encounters exceptional and avoid a global morality score.
- [x] **E2: Integrate naturally.** Reuse radio scheduling, optional contact offers, safe docking, and records. Dialogue describes immediate needs. Show coexistence in the environment and behavior. Avoid mission language that makes S-07 responsible for saving the world.
- [x] **F1: One five-to-ten-minute optional expedition.** Build a rooftop workshop with two supported access points, one machinery activity, useful salvage, and optional evidence of humans and machines working together. A placeable gangway/boarding extension connects to authored compatible docking anchors; a more developed platform reaches the secondary entrance.
- [x] **F2: Safe return and persistence.** Verify bridge reach, support, clearance, player navigation, partial loot, full inventory, return aboard, departure, and save restoration. Exploration remains bounded to the selected elevated site; the machine cannot depart with the player stranded there.
- [x] **G1: One scout encounter.** Introduce a visible searching scout with a readable detection buildup before it broadcasts for attackers. Let the player disable it, deploy a craftable signal decoy, or take a reachable alternative route after steering is unlocked. Each option uses ordinary game resources and feedback.
- [x] **G2: Define escape as a complete outcome.** Integrate search, detection, pursuit, interruption, and lost-contact states with C's raid lifecycle. Breaking grapples and disrupting tracking can lead to escape; distance or cover only count when supported by the actual world simulation. Clear enemies, warnings, and rewards consistently. Avoid constant pursuit that removes the quiet building/scavenging rhythm.

Dependencies: E can ship after A; F follows B and uses the existing docking foundation; G follows C's encounter state changes. The friendly encounter and workshop can share assets, but neither should become a mandatory story gate.

## Delivery checks

- [x] Save migration is exercised for newly acquired tools, encounter progress, and terminal preferences. Preserve existing campaigns and use isolated test saves.
- [x] Add focused regression coverage for the reproduced defects and new transitions; retain native weapon, controls, opening, story, save, and ship checks where affected. Earlier muzzle tests assume a camera-origin hit path and will need intentional updates when A2 adds obstruction checks.
- [x] Capture opening turn/shot continuity, front/rear interception, grapples, Revenant leap, carrier destruction, the salvage tool, and every migrated wrist page. Review normal-speed play as well as automated measurements.
- [x] Measure encounter and terminal costs in representative rendered scenes. Keep effects bounded and asset loading outside contact/boarding transitions where practical. Report observed timings with hardware/context rather than promising a universal frame rate.
- [ ] Finish with a normal-input sequence: escape rooftop → recover supplies/tool → open wrist inventory → build/relocate/dismantle a piece → intercept a carrier → survive a boarding/leap → optional friendly stop → workshop excursion → successful scout avoidance/escape.

These packages were implemented locally. The linked implementation tracker records work and evidence. No separate app tasks, background automations, external tickets, commits, or releases were created.
