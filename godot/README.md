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

The UI is rebuilt as native Control nodes. The original browser CSS is not used. Rendering, physical contacts, navigation, particles, and camera interpolation are engine-specific implementations and may differ from the browser version. See the port review and measured results in `../docs/godot-port/` for the acceptance status and remaining differences.

## Saves and testing

Native saves live under Godot's user data directory in `campaigns/`, with checksums, atomic writes, and backups. The Campaign Library opens that folder and supports native JSON import/export. **Browser saves are not compatible with the native schema yet.** No existing browser save is overwritten. Tests use a separate `native-test-campaigns/` directory and do not write personal settings.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -Test -Headless
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -Test
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -ParityTest
powershell -NoProfile -ExecutionPolicy Bypass -File tools/godot/launch.ps1 -Benchmark
```

Test/benchmark reports and screenshots are written under `test-results/godot-native/`. The benchmark uses the actual GPU, 1080p, full assets, and eight active enemies; it refuses headless rendering. It disables VSync for headroom measurement. These results are developer measurements, not a guarantee on every PC. A Windows export can be made from Godot after installing matching export templates; the current launcher runs the native project directly.
