# Machine Move Forward — native Godot edition

A separate native implementation of the Three.js game at commit `5d9f596`. The browser game, its assets, build scripts, and browser saves are retained. Godot renders the meshes and runs GDScript gameplay, native collision/navigation, animation, particles, audio, and UI; this is not a browser wrapper.

## Play on this computer

Double-click **Play Godot.cmd** in this directory. It uses the separately downloaded Godot **4.7.2** under `test-results/godot-tools`, leaving the existing Godot 4.1 installation alone. New Campaign plays the rooftop opening. The normal launch has damage enabled and VSync on.

Open `project.godot` in Godot 4.7.2 to edit the project. Alternatively:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -Editor
```

Controls: WASD move; mouse look; Shift sprint; Ctrl crouch; Space jump; left/right mouse fire/aim; R reload; 1/2 weapons; E interact/refuel/mount/cut grapple; F salvage reel; Tab terminal; Esc pause. V swaps shoulders outside construction. B opens construction, G the catalog, Q/E rotate, Page Up/Down choose a deck, Home follows the current deck, V relocates equipment, and hold X to dismantle. Rebind keys and adjust FOV, sensitivity, ambient volume, and VSync in Settings.

F throws a visible hook and cable even when it misses, with the browser game's 34 m reach. Aim toward a cargo chest and reel it back to recover supplies and the receiver. C is also a crouch shortcut. The wrist terminal pauses the simulation while aboard; starting the scanner closes it so scanning can proceed. Falling toward radioactive sand returns the player to the last valid elevated platform, matching the current browser build. Combat death retains the three-second recovery and two-second protection.

## Rebuild native assets from a fresh checkout

Use Node 22+ with the repository dependencies (`npm ci`), Chrome, and Godot 4.7.2. Set `MMF_GODOT` to its executable or pass `-Godot` below. Chrome defaults to the normal Windows installation; `MMF_CHROME` overrides its executable.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/setup.ps1 -Godot 'C:\Tools\Godot_v4.7.2-stable_win64_console.exe'
```

The setup temporarily runs the original game locally to bake its procedural geometry and audio; the finished Godot game does not need Node, Chrome, Vite, or a network connection. Initial texture/shader import is substantially slower than subsequent launches. Allow several GB for converted full-resolution assets and the Godot import cache.

The conversion copies **all 55 source GLBs**, losslessly expands meshopt-compressed geometry for Godot, and copies original textures. Source hashes and asset inventory are in `data/assets.json`. It exports all gameplay definitions, campaign text, animation/collision data, the opening timeline, the complete machine, 24 construction pieces, both battle ships, rooftop, and desert scatter. All 27 sound files are baked from the original synthesizer recipes. Generated `assets/` and `.godot/` caches are intentionally ignored by Git; rebuild them from the retained source assets. Original asset attribution and licenses are documented in [ASSETS.md](../ASSETS.md) and apply to this edition too.

## Native implementation

- `scripts/session.gd`: resources, recipes, power, fuel/crawl, progression, research, and save state.
- `scripts/player*.gd`, `equipment.gd`: movement, swept camera obstruction, aiming, reload/feet/terminal poses, weapons, and attachments.
- `scripts/building.gd`, `home.gd`, `caretaker.gd`: construction, preservation of contents, support cascades, shelter, producers, keepsakes, and L-12.
- `scripts/combat.gd`, `enemy.gd`, `raid_mission.gd`: six enemy types, navigation, turrets, skiff/boarding, gunboat subsystems, raid objectives, and loot.
- `scripts/campaign.gd`, `opportunities.gd`, `cinematics.gd`: all five original destinations, routes, optional stops, journals, scanner battle, opening, and ending.
- `scripts/world.gd`, `desert_layout.gd`, `gait.gd`: original machine and desert models, deterministic districts/scatter, dune/sky shaders, four-leg gait, streaming, and weather presentation.
- `scripts/journey.gd`, `destination_activity.gd`: prioritised radio captions, load recap, optional idle guidance and persistent local machinery activities at the five existing destinations.
- `scripts/terminal_pages.gd`, `deck_map.gd`, `instrument_display.gd`: three-deck equipment selection/repair/location, build categories and favourites, upgrade comparisons and live console traces.
- `scripts/story_art.gd`, `art/story-instruments.glb`: seven original Blender instrument assemblies, including physical wrist hardware and earned archive/seed displays on the receiver. Editable source and the contact sheet live in `../assets/native-story/`; rebuild with `../tools/art/native_story/build.py` in Blender.
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
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -WorkloadTest -Headless
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -SessionBenchmark -Headless
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -Benchmark
```

Test/benchmark reports and screenshots are written under `test-results/godot-native/`. The benchmark uses the actual GPU, 1080p, full assets, and eight active enemies; it refuses headless rendering. It disables VSync for headroom measurement. These results are developer measurements, not a guarantee on every PC. A Windows export can be made from Godot after installing matching export templates; the current launcher runs the native project directly.

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

The [desert refinement review](../docs/godot-port/desert-life-review.md) covers seven original Blender ground details, sparse wind movement, quieter sand colours and removal of the storm's extra water drain. Storm visibility, room comfort and ordinary consumption remain. `-DesertTest -Headless` verifies weather, saved storms and placement; `-DesertProfile` compares native deck views on the GPU; `-DesertReview` captures the models, actual placement and full storm. Each uses isolated test saves/settings.
