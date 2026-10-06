# Machine Move Forward — native Godot edition

A separate native implementation of the Three.js game at commit `5d9f596`. The browser game, its assets, build scripts, and browser saves are retained. Godot renders the meshes and runs GDScript gameplay, native collision/navigation, animation, particles, audio, and UI; this is not a browser wrapper.

## Play on this computer

Double-click **Play Godot.cmd** in this directory. It uses the separately downloaded Godot **4.7.2** under `test-results/godot-tools`, leaving the existing Godot 4.1 installation alone. New Campaign plays the rooftop opening. The normal launch has damage enabled and VSync on.

The 4 October source update changes the factory memory to a forward sword lunge: the defender crosses into the attack lane, stops the blade at the front of its torso, and the worker turns and escapes afterward. Both Revenant swords carry animated blue pulses in the memory, rooftop chase, ship scene and gameplay. Original combat timing, collision and character fitting are retained. Launch the source with **Play Godot.cmd** to see this update; previously exported beta executables do not include it.

The pursuer now uses the chosen original **Qwen VoiceDesign B** performance, with subtle metallic processing: “There. On the roof.” It enters at the existing cue, retains its natural pause, and has a subtitle timed to the imported clip. The clean reference, prompts, seeds and local generation workflow are retained in [the voice tools](../tools/audio/qwen_voice/README.md). `assets/opening-memory/audio/voice-selection.json` records the accepted sources and restrained mix gain. Rebuild the edit using `test-results/qwen3-tts/venv/Scripts/python.exe tools/audio/opening/build.py`; the previous Microsoft David source is retained but unused. This source update is not yet in older exported beta executables.

Validation for this update: 233 passing checks across the opening, handoff/framing, pulse attachment, combat and crossfire suites; 51 passing checks in the native rendered review. Local logs and captured frames are under `test-results/pulse-interception/`.

Open `project.godot` in Godot 4.7.2 to edit the project. Alternatively:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -Editor
```

**Playtest checkpoints** on the title or pause screen offers 34 prepared starting points, with inventory and progression previews, independent saves, restart, and return to your campaign. See the [checkpoint and equipment menu guide](../docs/godot-port/playtest-checkpoints.md).

The [machine spaces and quiet information iteration](../docs/godot-port/machine-spaces-audio.md) organizes the three decks, opens their permanent floors for ordinary construction, guides major machinery to physical connections, protects walking/drone clearance, and adds restrained gunfire, intermittent original music, and a quieter wrist-centered interface.

The [roof and floor refinement](../docs/godot-port/roofs-and-stable-floors.md) repairs competing floor surfaces, seats constructed plates, adds supported high roofs and credible damaged sections, and corrects mirrored or floating site lettering. Matching motion captures, native walking/roof checks and nine performance workloads are recorded in the guide.

The [preceding progression, ownership, and combat iteration](../docs/godot-port/beta-progression-ownership-combat.md) adds inventory-aware opening guidance, fuel-endurance advice, salvage-funded Patchcoat tool restoration, fourteen muted paint finishes, three cosmetic keepsake projects, clearer enemy intent, and distinctive Gatekeeper hardware and escalation. The guide records controls, save compatibility, earned-supply testing, and the remaining V1 acceptance gates.

The [1 October recovery and guardian iteration](../docs/godot-port/beta-recovery-and-guardian.md) adds a repairable left-side recovery claw, earned Mender salvage drones, and Gatekeeper G-01 on Meridian's Cordon Gap route. Checkpoints **32–34** isolate them. It also corrects floating berth equipment, pass-through recovery hardware and the old crane's invisible collision. Editable Blender sources, native captures, combined test evidence and remaining V1 acceptance work are linked in the guide.

The [100-model art iteration](../docs/art/art100/README.md) adds **59 new assemblies and 41 refinements**: desert scenery, 25 buildable cosmetic furnishings, 19 story fixtures, and six existing character refinements. It improves material finish, connected hardware, scale, grounding, and compound collision; furnishing placement now rejects overlap with machine equipment. The guide links the searchable catalog, all model renders, editable Blender gallery, and native regression evidence.

The [story, missions and playable finale update](../docs/godot-port/story-missions-and-finale.md) links the five expeditions through recovered evidence, adds three optional requests with later consequences, and extends Meridian into a receiving berth you restore on foot. Checkpoints **24–31** cover the new story, each mission and both supported/unsupported finale setups. Existing committed endings keep their original outcome; the new sequence is available through an isolated replay checkpoint.

The wrist contains personal pack and log pages. Interact with a receiver, helm, workbench, refinery or other equipment to open its own interface. B opens a separate construction catalog; select a part and press Place to return immediately to world placement.

The [engineering and recovery update](../docs/godot-port/recovery-and-operations.md) adds physical service-deck cabinets, generator switches, operating modes, repairs and emergency recovery. Foundry and Orchard return stations offer optional fuel service. Checkpoints **20–23** isolate empty supplies, destroyed machinery, stopped generators and mode comparisons.

The [five-priority update](../docs/godot-port/five-priority-update.md) adds objective markers and material pins, **Z** recent-build undo and **Y** blueprint copy during construction, clearer impact feedback, physical controls at all five expeditions, and optional local playtest recording. The wrist housing is 15% smaller. The guide explains undo eligibility, checkpoint exercises, native verification and remaining human pacing checks.

Controls: WASD move; mouse look; Shift sprint; Ctrl crouch; Space jump; left/right mouse fire/aim; R reload; 1/2 weapons; E interact/refuel/mount/cut grapple; F salvage reel; Tab terminal; Esc pause. V swaps shoulders outside construction. B opens construction, G the catalog, Q/E rotate, Page Up/Down choose a deck, Home follows the current deck, and V relocates equipment. Recover the salvage cutter from the onboard tool locker, press 3 to select it, then hold X on reachable construction to dismantle. Player gunfire cannot demolish owned structures. Rebind keys and adjust FOV, sensitivity, ambient volume, and VSync in Settings.

The physical green-screen wrist terminal supports mouse clicks, wheel scrolling and keyboard selection. Its settings include larger text, reduced motion, glow and scanlines. The [compact menu update](../docs/godot-port/compact-terminal.md) replaces simultaneous descriptions with item/count rows, meters, line drawings, and selected-entry details. Incoming craft approach from ahead or behind; deck guns can destroy them before boarding, while surviving crew use grapples or a Revenant leap. Optional radio contacts now include R-9's refuge and a workshop with a buildable upper connection. A craftable signal decoy, gunfire or unlocked steering can defeat a scout search. See the [survivor implementation and playtest notes](../docs/godot-port/survivor-implementation.md) for tasks, evidence and remaining pacing checks.

The [optional survivor task list](../docs/godot-port/survivor-encounter-tasks.md) tracks the latest playable slice: helping R-9 marks a real workshop signal, an optional construction projection guides the raised entrance, and pursuit escape waits for genuine contact to clear. Signals can be passed by; progress, supplies, and the later personal acknowledgment persist.

The [later expedition update](../docs/godot-port/later-expeditions.md) adds three-contact radar after Quiet Array and optional recoverable crane, battery and quiet-running equipment at later milestones. S-07 now uses health, repairs and fuel without food or water mechanics. Older supplies migrate without loss; retired producers remain salvageable and L-12 remains a companion. The guide explains discovery gates, fitting costs, controls and native validation.

The [wasteland variety update](../docs/godot-port/wasteland-variety-review.md) adds ten original ruined buildings, transport and industrial models. Unequal themed stretches, open desert, varied placements and spacing between repeated landmarks make passing scenery less repetitive. It applies to new and existing native campaigns. The review includes model previews, placement comparisons and final streaming/travel measurements.

F throws a visible hook and cable even when it misses, with the browser game's 34 m reach. Aim toward a cargo chest and reel it back to recover supplies and the receiver. Nearby cargo has a bracket and lead diamond; cyan READY predicts a physical catch. Crates follow the dunes, and overflow remains in a supported crate aboard. See the [salvage review](../docs/godot-port/salvage-review.md) for checks and measured costs. C is also a crouch shortcut. The wrist terminal pauses the simulation while aboard; starting the scanner closes it so scanning can proceed. Falling toward radioactive sand returns the player to the last valid elevated platform, matching the current browser build. Combat death retains the three-second recovery and two-second protection.

## Rebuild native assets from a fresh checkout

Use Node 22+ with the repository dependencies (`npm ci`), Chrome, and Godot 4.7.2. Set `MMF_GODOT` to its executable or pass `-Godot` below. Chrome defaults to the normal Windows installation; `MMF_CHROME` overrides its executable.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/setup.ps1 -Godot 'C:\Tools\Godot_v4.7.2-stable_win64_console.exe'
```

The setup temporarily runs the original game locally to bake its procedural geometry and audio; the finished Godot game does not need Node, Chrome, Vite, or a network connection. Initial texture/shader import is substantially slower than subsequent launches. Allow several GB for converted full-resolution assets and the Godot import cache.

The conversion copies **all 55 source GLBs**, losslessly expands meshopt-compressed geometry for Godot, and copies original textures. Source hashes and asset inventory are in `data/assets.json`. It exports all gameplay definitions, campaign text, animation/collision data, the opening timeline, the complete machine, 24 construction pieces, both battle ships, rooftop, and desert scatter. All 27 original sound files are baked from the original synthesizer recipes. Converted models, runtime geometry, textures, original synthesized audio, and the `.godot/` import cache are intentionally ignored by Git; rebuild them from the retained source assets. Native-only opening animation, licensed fonts, and deck/opening audio under `assets/` are tracked and included in a fresh checkout. Original asset attribution and licenses are documented in [ASSETS.md](../ASSETS.md) and apply to this edition too.

The final machine is compiled into `art/nomad-native.scn` so normal launches do not load obsolete model containers, repeat geometry trimming or parse the full static collision JSON. The editable Blender sources and `world.gd` assembly recipe remain authoritative. After changing any machine art, import settings, assembly script or collision manifest, import and rebuild the compiled scene before testing:

```powershell
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --editor --import
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script res://tools/bake_machine.gd
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script res://tests/compiled_machine.gd
```

Run these commands from the repository root with Godot 4.7.2. The full setup script also performs the bake. Commit the generated scene, its source/hash manifest and `data/runtime-play.json` together with the changed sources. The focused test rejects stale sources and compares the complete finished render/physics assembly, including resource sharing and animation bindings. The [compiled machine review](../docs/godot-port/compiled-machine-review.md) records memory measurements, native image comparisons and startup limits.

The [helm review](../docs/godot-port/helm-review.md) covers its detailed Blender model, interaction at the actual console and hardware that reflects existing rewards. Its gyro lens is dark when unfitted, green when powered and amber during a supply shortage. Physical E still opens the existing Helm menu; nearby receiver prompts use the real station positions. The model retains the original collision and earned upgrade coordinates.

The [receiver review](../docs/godot-port/receiver-review.md) covers the aisle-facing Blender receiver, grounded pedestal, fitted service hardware and physical scanner readout. It displays actual coherence, power loss and scan pauses while preserving the original discovery, replacement module, scan duration and battle trigger. Earned archive/seed instruments retain their original sites and face the same aisle. Run its focused check with Godot `--headless --path godot --script res://tests/receiver.gd`; editable sources are in `../assets/native-receiver/`.

## Native implementation

Enemy rewards now use grounded Blender scrap, electronics and fuel models. Approach to recover them; nearby labels show the remaining contents and full storage, while a brief receipt reports actual transfers. Uncollected rewards survive manual saves and autosaves, including partial stacks. Older native saves remain valid. The [recovered supplies review](../docs/godot-port/loot-review.md) documents checks, editable models and measured rendering cost.

- `scripts/session.gd`: resources, recipes, power, fuel/crawl, progression, research, and save state.
- `scripts/player*.gd`, `equipment.gd`: movement, swept camera obstruction, aiming, reload/feet/terminal poses, weapons, and attachments.
- `scripts/building.gd`, `home.gd`, `caretaker.gd`: construction, preservation of contents, support cascades, shelter, producers, keepsakes, and L-12.
- `scripts/combat.gd`, `enemy.gd`, `raid_mission.gd`: six enemy types, navigation, turrets, skiff/boarding, gunboat subsystems, raid objectives, and loot.
- `scripts/enemy_animation.gd`, `enemy_hit_pose.gd`: cached aliases for both imported rig conventions, protected strike/death playback, displacement-based movement presentation and additive chest/head reactions. Recoil starts on actual shot ticks. The [enemy animation review](../docs/godot-port/enemy-animation-review.md) includes evaluated-pose checks and a 1,680-tick comparison with the preceding combat controller.
- `scripts/campaign.gd`, `opportunities.gd`, `cinematics.gd`: all five original destinations, routes, optional stops, journals, scanner battle, opening, and ending.
- `scripts/crossfire_stage.gd`: prepares the existing battle set during scanning and releases it on completion/cancellation; cinematic entry and return blend the player's camera pose and FOV. See the [crossfire review](../docs/godot-port/crossfire-review.md) for timings and save-resume checks.
- `scripts/world.gd`, `desert_layout.gd`, `gait.gd`: original machine and desert models, deterministic districts/scatter, dune/sky shaders, four-leg gait, streaming, and weather presentation.
- `scripts/journey.gd`, `destination_activity.gd`: prioritised radio captions, load recap, optional idle guidance and persistent local machinery activities at the five existing destinations.
- `scripts/terminal_pages.gd`, `deck_map.gd`, `instrument_display.gd`: three-deck equipment selection/repair/location, build categories and favourites, upgrade comparisons and live console traces.
- `scripts/story_art.gd`, `art/story-instruments.glb`: seven original Blender instrument assemblies, including physical wrist hardware. Editable source and the contact sheet live in `../assets/native-story/`; rebuild with `../tools/art/native_story/build.py` in Blender. The archive/seed assemblies now load from the cleaned `art/nomad-receiver-rewards.glb`; its reproducible cleanup and assembled source are documented in `../assets/native-receiver/README.md`.
- `scripts/world_atmosphere.gd`, `art/wind-worn-props.glb`: three original Blender assemblies with torn wind-driven canvas, a bearing-mounted ventilation rotor and a pulsing solar beacon. Sparse placements avoid the machine corridor and existing wreckage; source and renders are in `../assets/native-atmosphere/`.
- `scripts/effects.gd`: shared spark/tracer render batches preserve effect geometry and fade, with explicit per-particle interpolation. Exhaust and dust respond to speed; four contact bursts follow the machine's feet.
- `scripts/scenery_chunk.gd`, `scenery_stream.gd`: prepare unchanged scenery before travel boundaries in small time slices. At most 13 ready/unfinished chunks supplement the 27 visible chunks; prepared nodes remain outside the rendered scene. Reversals reuse retired chunks, and abrupt relocations/loads fill the full visible range immediately.

The UI is rebuilt as native Control nodes. The original browser CSS is not used. Rendering, physical contacts, navigation, particles, and camera interpolation are engine-specific implementations and may differ from the browser version. See the port review and measured results in `../docs/godot-port/` for the acceptance status and remaining differences.

## Saves and testing

Native saves live under Godot's user data directory in `campaigns/`, with checksums, atomic writes, and backups. The Campaign Library opens that folder and supports native JSON import/export. **Browser saves are not compatible with the native schema yet.** No existing browser save is overwritten. Tests use a separate `native-test-campaigns/` directory and do not write personal settings.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -Test -Headless
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -Test
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -ParityTest
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -AuditTest
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -StoryTest
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -ControlsTest
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -AudioTest
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -AudioProfile
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -PacingTest
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -AtmosphereTest
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -TerrainTest
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -EffectBenchmark
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -StreamTest -Headless
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -SceneryTest
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -StreamBenchmark
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -StreamBenchmark -Stress
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -CameraTest
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -AccessTest -Headless
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -AccessBenchmark
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -CaretakerTest
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -ConstructionProfile
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -DriveProfile
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -TravelProfile
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -AutosaveTest -Headless
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -AutosaveProfile -Headless
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -MotionAudit -Headless
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -LocomotionTest -Headless
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -LocomotionProfile
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -WeaponTest -Headless
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -WeaponReview
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -WeaponProfile
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -SalvageTest -Headless
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -SalvageReview
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -SalvageProfile -Headless
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -CrossfireTest -Headless
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -CrossfireReview
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -CrossfireProfile
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -CrossfireClearance
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -ShipTest -Headless
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -ShipProfile
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -WorkloadTest -Headless
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -SessionBenchmark -Headless
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -Benchmark
```

Test/benchmark reports and screenshots are written under `test-results/godot-native/`. The benchmark uses the actual GPU, 1080p, full assets, and eight active enemies; it refuses headless rendering. It disables VSync for headroom measurement. These results are developer measurements, not a guarantee on every PC. A Windows export can be made from Godot after installing matching export templates; the current launcher runs the native project directly.

The [controls and interaction review](../docs/godot-port/controls-interaction-review.md) covers remapped hints, safe key capture, default restoration and shared interaction priority. `-ControlsTest` sends real keyboard events through the native game, checks uninterrupted grapple/service holds, and captures Settings and placement hints with GPU rendering. It also supports `-Headless` and uses isolated `native-controls-tests/` saves without writing personal settings.

The [audio contact and lifetime review](../docs/godot-port/audio-contact-review.md) covers footsteps synchronized to the authored gait, bounded synthesized-effect voices, prewarmed sounds, consistent pause/mute/volume handling and verified stream release. `-AudioTest` supports `-Headless`; `-AudioProfile` measures the actual native movement and an intentionally overloaded cue burst. The separate engine-only shutdown probe deliberately reproduces a warning unless run with its documented drain option. Tests use isolated saves and preserve personal audio preferences.

The broader [parity audit](../docs/godot-port/PARITY-AUDIT.md) covers production, research, attachments, construction transactions, save recovery, defenses and navigation. Regenerate its controller expectations from the retained browser code with `node tools/godot/audit-fixtures.mjs`. Machine research now unlocks instantly at a powered receiver, with separate free fitting/removal. Weapon attachments require Relay Foundry, a functional workbench and powered terminal tools. Already-paid research from earlier native saves is preserved.

The [campaign polish plan](../docs/godot-port/story-polish-plan.md) and [delivery review](../docs/godot-port/story-polish-review.md) describe the native enhancements. Console progress, transmission history and build favourites are saved in an optional `polish` section; native saves from before this update remain supported, and earned story objectives remain earned. Radio lines are captioned with a quiet cue, not recorded voice acting. Story tests use `native-story-polish-tests/`; the 65-second pacing sample uses `native-journey-pacing-tests/`.

The [atmosphere/effect review](../docs/godot-port/atmosphere-review.md) records current measurements and the terrain grounding fix. CPU and GPU dune calculations now agree, removing a several-metre placement mismatch. This corrects the native dune contours without moving saved machinery or changing campaign objectives. Terrain parity and effect benchmarks require GPU rendering; atmosphere tests use `native-atmosphere-tests/`.

The [scenery streaming review](../docs/godot-port/streaming-review.md) records boundary-specific timing and resource measurements. Scenery contract checks and streaming benchmarks need the real GPU; the headless renderer does not retain the same MultiMesh buffers. Streaming samples use isolated `native-streaming-tests/` saves and accelerated travel, so their timings are streaming costs rather than normal gameplay FPS.

The [camera and machine simulation review](../docs/godot-port/camera-workload-review.md) covers close-wall framing, complete character/equipment fading, and reduced power/room bookkeeping. Camera tests capture native views and use isolated `native-camera-tests/` saves. The session benchmark measures synthetic 30/300/900-piece CPU workloads without rendering; its timings are not gameplay FPS.

The [native machine access review](../docs/godot-port/machine-access-review.md) covers rebuilt stair-bay supports, 96 detailed treads, grounded cable routes and exact reuse of the machine's materials. The geometry test checks real mesh clearance and deck heights; the GPU benchmark measures the visual-detail cost in one fixed view with both old/new variants resident. Native code installs the replacement module from `art/` while preserving the frozen machine bake and browser assets.

The [construction and caretaker review](../docs/godot-port/caretaker-workload-review.md) covers a rendered 369-piece workload, reduced L-12 job-search stalls, body clearance at service positions, and grounded companion motion. The caretaker suite compares 512 layouts with the original selector and drives real service visits and transfers. It supports `-Headless`; the rendered version also captures service poses. The construction profile requires native GPU rendering and uses isolated `native-construction-tests/` saves.

The [articulated drive review](../docs/godot-port/caretaker-drive-review.md) covers Blender-authored L-12 track shoes, instanced belts, independent turning/reversing motion, grounding and measured visual cost. Source and renders live in `../assets/native-fieldwork/`; the original fieldwork master remains unchanged. `-DriveProfile` compares both assemblies in a fixed native view at 60 Hz physics. `-TravelProfile` instruments test-owned copies of the current main/player/world/UI/audio callbacks to trace intermittent frame stalls without adding profiling overhead to the shipping scripts. Both profiles require GPU rendering and isolated test saves.

The [autosave and motion audit](../docs/godot-port/autosave-motion-review.md) records the bounded background save queue, corrupt-primary recovery and measured save-frame improvement. Manual saves remain synchronous verified commits; autosaves finish asynchronously and drain before load or orderly exit. Focused save tests and the synthetic profile use their own isolated directories. The motion audit quantifies stance-foot drift using the real controller.

The [native locomotion review](../docs/godot-port/locomotion-review.md) covers 24 Blender-authored directional clips, displacement-matched cadence, blocked movement, phase-preserving blends and render-rate skeletal interpolation. The native library reuses the original character geometry/textures and original jump/reload/cinematic clips. `-LocomotionTest -Headless` exercises the actual controller on a supported fixture; `-LocomotionProfile` compares the old presentation logic and the new controller with real GPU rendering on an unobstructed diagnostic platform in the native world. Saves/settings stay isolated.

The [desert refinement review](../docs/godot-port/desert-life-review.md) covers seven original Blender ground details, sparse wind movement, quieter sand colours and removal of the storm's extra water drain. Storm visibility and room comfort remain; the later robot survival update also removes ordinary food and water consumption. `-DesertTest -Headless` verifies weather, saved storms and placement; `-DesertProfile` compares native deck views on the GPU; `-DesertReview` captures the models, actual placement and full storm. Each uses isolated test saves/settings.

The [weapon presentation review](../docs/godot-port/weapon-presentation-review.md) covers two detailed Blender weapon models, reachable support-hand placement, pitch/recoil alignment and real muzzle/attachment origins. Gameplay weapon definitions and camera hitscan remain unchanged. `-WeaponTest -Headless` exercises the final skeletal pose and shot behavior, `-WeaponReview` captures native close-ups and `-WeaponProfile` compares the old/new presentation in the real rendered scene. Saves/settings remain isolated.

The [opposing ship review](../docs/godot-port/ship-refinement-review.md) covers two detailed Blender hulls integrated into the existing scanner scene. `-ShipTest -Headless` checks imported material/geometry budgets and actual triangle support/crew clearance; `-ShipProfile` compares original/refined models in matching native GPU views. `-CrossfireTest -Headless` verifies background preparation and story handoffs, while `-CrossfireReview` captures the scene with its original cast/effects. The source ships and materials remain editable under `../assets/native-ships/`.

The [battle clearance review](../docs/godot-port/crossfire-clearance-review.md) covers a background-planned route around existing ruins, hull clearance above dunes and short concealed cuts between the player and battle cameras. `-CrossfireClearance` requires GPU rendering to compare against real MultiMesh transforms; it exercises multiple landscapes, all three decks and preparation/cancellation. The original 17-second scene and subsequent raid timing remain unchanged. No desert objects are removed for the encounter.

The [enemy equipment review](../docs/godot-port/enemy-equipment-review.md) replaces the commander's duplicate orbs with one detailed Blender drone attached to its authored pose and aligned with its hit target. Drone and commander death remove it correctly; ranged tracers originate at visible weapons and stop at cover. Existing combat timing/damage and shield rules remain verified. Source/rebuild instructions are under `../assets/native-drone/`; the offline body separation is included in native setup.

The [boarding review](../docs/godot-port/boarding-review.md) covers grounded skiff crew, clear routes around both staircases, supported hoist poses, Blender clamp/ascender hardware and persistent attached cables. Interrupted climbers fall against real decks and clean up normally; obstructed approaches use another clear lane or retreat. Run `tests/boarding.gd` for current focused physical checks. The stored `tests/boarding_contract.gd` fixture and earlier capture scripts document the original timing; the new interception lifecycle is covered below. Sources are under `../assets/native-boarding/`.

The [raider craft review](../docs/godot-port/raider-craft-review.md) covers the original detailed Blender hover craft, supported crew decks, gun aiming/recoil and grounded idle feet on all six original enemy rigs. Native setup regenerates the hashed footing manifest offline. Run `tests/raider_craft.gd` for current geometry, gameplay-region and presentation checks. Editable sources are under `../assets/native-raiders/`.

The [interception and scout review](../docs/godot-port/interception-review.md) describes the current 18/23-second front/rear approaches, crossfire-derived gameplay hulls, grapple launch, Revenant leap, turret interception, bounded ship destruction and scout/decoy/escape loop. Current fixtures are `../tools/godot/interception-regression.gd`, `interception-defenses.gd`, and the rendered `interception-review.gd` (pass their paths with `--script`). They use isolated saves. New editable carrier assemblies and their reproducible builder are documented under `../assets/native-raiders/interception/`.


The [encounter loading review](../docs/godot-port/encounter-loading-review.md) covers bounded background enemy-resource preparation and shared warning meshes/materials. Immediate New Game finishes that work at the title before starting the original opening. `tests/encounter_loading.gd` checks real worker ownership, cancellation, fallback, geometry and independent warning states; `tests/encounter_loading_profile.gd` compares preceding/current first-use costs with native rendering. The warning bake runs during setup. No enemy definitions, story events or visual-detail settings change.

The [legacy enemy review](../docs/godot-port/legacy-enemy-review.md) covers Blender refinements of the existing Dust Raider and Wasteland Scavenger: worn materials, fitted respiratory/optical equipment, supported armor, connected cables and grounded footwear. Native compilation retains the exact original skeleton, skin bindings, animation keys and character scale. Run `tests/legacy_enemies.gd` for focused checks and `tests/legacy_enemy_review.gd -- --poses` for native animation/boarding views; `--original --profile` and `--profile` compare rendering costs. Editable sources are under `../assets/native-legacy-enemies/`; setup compiles both models before rebuilding their footing data.

The [cinematic opening review](../docs/godot-port/grounded-sites-and-outposts.md#cinematic-new-game-opening) covers the 22-second memory/pursuit lead-in and existing 10.2-second rooftop escape. `tests/opening_prelude_review.gd` checks native framing, skip and audio controls; `tests/opening_handoff.gd` covers preparation and save compatibility. `tests/opening_profile.gd -- --out=ABSOLUTE_OUTPUT_DIRECTORY --cap=0` measures actual playback at 1080p High. `tests/opening_movie.gd` is a separate fixed-30-FPS capture driver for Godot Movie Maker, not a benchmark. Tests isolate campaign data. Editable Blender and sound recipes live under `../tools/art/opening_memory/` and `../tools/audio/opening/`. The current downloadable build and recorded preview are linked in the review.
