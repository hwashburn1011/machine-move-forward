# Machine Move Forward

Keep your home alive as it walks through a hostile desert. **Machine Move Forward** is a third-person survival shooter about salvaging supplies, building a mobile base, defending its machinery, and following radio signals into abandoned industrial outposts.

[**Play the prototype**](https://hwashburn1011.github.io/machine-move-forward/) · [**Watch the 46-second trailer**](https://hwashburn1011.github.io/machine-move-forward/trailer/)

[![Watch the Machine Move Forward gameplay trailer](docs/media/trailer-poster.jpg)](https://hwashburn1011.github.io/machine-move-forward/trailer/)

The trailer opens in a browser player with playback controls. [Download the MP4](https://hwashburn1011.github.io/machine-move-forward/trailer/media/machine-move-forward-trailer.mp4). This is an in-development desktop browser game; use a keyboard and mouse.

## Playable features

- Salvage reel, inventory, storage, crafting, refinery, workbench, power and fuel.
- Empty fuel tanks engage a smooth 20% emergency crawl so salvage remains reachable. Reel crates with **F**, then take their fuel to a generator and press **E** to refuel.
- Seeded desert districts with 14 original ruin and wreck models: buried houses, exposed apartment towers, factories, broken overpasses, hollow cars and buses, ruptured tankers, torn billboards, pylons and water towers.
- Buildable floors, walls, doorways, rails, roofs, stairs, stations and equipment on a 2m grid.
- Localized engine and leg damage, repair, weight, gait, rooms and enemy pathfinding over player construction.
- Play as the detailed S-07 gunner with directional armed walking, running and crouching, visible rifle/shotgun reloads, upper-body aiming and bounded foot contact on stairs.
- Rifle and shotgun combat against scavengers, raiders and four random mech archetypes: Warden, Revenant, Bastion and Sovereign.
- A boarding skiff with hull, crew and hook damage targets.
- At 100% radio reception, a passing human/robot ship battle leads into the Revenant's face reveal and recurring mixed-mech grapple raids.
- Manual deck gun with power draw, aim, damage, repair and persistence.
- A ranged raider gunboat with separate hull, weapon and engine damage, visible shell warnings and disable outcomes.
- Earned automatic salvage collectors with persistent storage, and powered defense turrets that track exposed enemies.
- Original Blender characters, machine, weapons, skiff and expedition models with procedural fallbacks.
- Radio-led Wreck One followed by Relay Foundry: route choice, direct gunboat hazard, detour, sanctuary hold, gangway exploration, journals, required uniques and departure.
- Local saves with safe Save & Quit boundaries and persistent inventory, construction, upgrades and expedition progress.
- A searchable build catalog opened with **B**, with direct piece selection and **G** returning to the catalog from placement.
- Reach-aware placement up to 12 m from the player across all three decks; **Q**/**E** rotate, **Page Up**/**Page Down** select a deck, and **Home** returns to automatic deck selection.
- Equipment relocation with **V** in build placement, camera shoulder swap with **V** during normal play, **RMB** to cancel placement or relocation, and **hold X** to demolish with a refund preview.
- Building keeps the world running and closes automatically when combat threatens the Nomad. If the catalog owns the cursor, the whole game pauses until Resume successfully recaptures mouse control.
- Storage panels provide **Take All**, **Deposit Matching** and **Sort** operations with truthful overflow feedback.
- Volume-based camera collision, smooth close-player fading, shoulder swap and remappable controls make cramped decks easier to navigate.
- A compact maintenance view combines fuel, emergency crawl, power shortages and service-deck repair needs.

## Current campaign iteration

The radio progression continues from Wreck One through Relay Foundry and Quiet Array to **Glass Orchard**. Quiet Array's two calibration records unlock the course actuator and limited steering (+/-12 degrees). At the Orchard, choose a caretaker approach with a boarding skiff or a cold-vault approach with a gunboat. Each preserves a different testimony. Restore the damaged isolator, recover the human seed bank and ANNIKA memory core, and secure the vector governor to earn wider steering (+/-28 degrees).

The seed bank unlocks a buildable **Seed Garden**: add up to two water, grow three greens per 180 simulation seconds, and harvest into available storage. Growth, water and uncollected greens survive saves and equipment moves. Existing planters remain unchanged.

Optional water caches, salvage wrecks and memorials continue appearing while an unanswered story offer waits. Wider steering opens distant **Linekeeper repair depots**, with a repair kit and a persistent service record. Plot or cancel approaches at the powered Helm; leftover supplies stay until explicit departure. Raids pause while docked.

S-07 preserves human names, seeds and memories; the fate of humanity remains uncertain. Last Garden at Meridian is the next planned chapter. The full campaign is not complete. See the [campaign notes](docs/campaign/README.md) and [Orchard Blender/Unreal delivery](assets/glass-orchard/README.md) for current scope and evidence.

## Run the game

```bash
npm install
npm run dev                 # http://localhost:5173
npm test                    # deterministic unit tests
npm run build               # TypeScript and production build
npm run lint
npm run test:e2e            # Playwright browser suite
```

The main vehicle is now the **Iron Nomad**: a four-legged industrial walker with three accessible decks, workshop bays, a command cabin, twin furnaces, a cargo crane, lights, and animated exhaust. [Model and gameplay details](docs/art/iron-nomad-playable/README.md).

The title screen offers New Game, Continue and Settings. Click the canvas for pointer lock. `Esc` opens the pause menu; Save & Quit waits for a safe boundary during an encounter.

Settings includes **Machine & ambience**, independent of master volume. Set it to zero to silence engine rumble, mechanical footsteps and the calm atmosphere while keeping combat, radio and warning cues. The default mix is deliberately faint, uses smooth fades and quiet musical intervals, and fades out in menus or background tabs.

Mouse look now handles changing frame rates consistently, and the camera interpolates movement between simulation ticks. The renderer shares shadow and transform work across passes and prepares mech rigs during loading. See the [performance measurements and regression checks](docs/performance-smoothness/README.md).

The roadside art uses shared PBR textures, distance detail levels and one geometry batch across the visible world. See the [Blender/Unreal scenery library and review](docs/art/desert-ruins/README.md).

Editable Blender masters, textures and optimized game models are versioned alongside their rebuild tools. Full portable GLB/FBX collections and the standalone viewers are also available in the [Iron Nomad release downloads](https://github.com/hwashburn1011/machine-move-forward/releases/tag/v0.2.0). Large interchangeable exports and Unreal caches are kept out of normal source checkouts.

## Controls

| Key | Action |
| --- | --- |
| `WASD` | Move |
| Mouse | Look |
| `Shift` | Sprint |
| `Ctrl` / `C` | Crouch |
| `Space` | Jump |
| LMB | Fire |
| RMB | Aim |
| `R` | Reload |
| `1` / `2` | Rifle / shotgun |
| `F` | Fire salvage reel |
| `E` | Use stations, radio, journals, uniques and deck gun |
| Hold `E` | Repair or cut a boarding hook |
| `B` | Enter build catalog / exit building |
| `Tab` | Inventory |
| `M` | Mute |
| `V` | Swap camera shoulder |
| `Esc` | Close panel, leave gun or pause |

Build placement uses `G` to reopen the searchable catalog, `Q`/`E` to rotate, `Page Up`/`Page Down` for manual deck selection, `Home` for automatic selection, LMB to place, RMB to cancel, `V` to select equipment for relocation, and hold `X` for demolition and its refund preview. Out-of-range targets remain visible as invalid; valid placement reaches 12 m from the player and supports all three decks.

Settings preserve existing audio and quality preferences and add look sensitivity, hip FOV (50–80 degrees, default 55 with the original 38-degree aim ratio), shoulder preference, and context-aware keyboard/mouse remapping. Conflicting bindings require an explicit replacement choice; Escape remains available for recovery.

The [gameplay polish implementation and acceptance record](docs/gameplay-polish/README.md) covers these controls, preserved combat rules, Blender animation sources and validation evidence.

## Radio encounter loop

The first eligible salvage chest after the opening contains the radio. Reception builds as the Nomad travels. At 100%, after the guided defense is complete and the deck is safe, a 17-second cinematic looks off the starboard bow: human and robot ships exchange fire, then the sword-wielding Revenant turns toward the Nomad. Hold **Esc** to skip.

Control returns with a short breather. Random boarding ships approach from either side, launch a grapple, and hoist two different mechs over the rail. Shoot the hull, crew or hook, or hold **E** near the attached hook to cut it. Survivors retain their health on deck. Attacks have a 75–115 second recovery interval. After your first successful defense, the powered radio offers **Trace Wreck One**. You can accept it when safe or keep surviving aboard the machine.

Mechs now have distinct counters: dodge the Revenant's marked lunge, shoot the Bastion's glowing cooling vent after its burst, watch the Warden reposition around cover, and destroy the Sovereign's armored support orb to remove nearby allies' damage protection. Later raids can assault the player, sabotage a machine service panel, or steal a small stack from built storage. Supply carriers are marked; kill them to recover the cargo, or cut their ship's grapple to block extraction. Recovered supplies that cannot fit remain available at the radio and survive saving and loading.

## First expedition chapter

The optional radio trace leads to Wreck One, a physical dock: slow at the safe boundary, cross the authored gangway, read its three logs and recover the Course Gyro. Returning to the radio enables departure. Saves already committed to either expedition retain their progression; older saves with a completed radio raid gain the trace offer.

The Course Gyro unlocks the Navigation Helm. Choose a shorter direct route with a gunboat encounter or a longer detour. The machine holds outside the Foundry until nearby fighting ends, then docks for exploration. Recover the Salvage Controller and Tracking Servo and read the Foundry's records before returning aboard. These components unlock the automatic collector and defense turret.

Collectors reel in nearby salvage and store it in six slots for later transfer. Automatic turrets consume power, turn toward visible infantry or gunboat components, and fire only with a clear shot. Position and power both matter.

Departing the Foundry completes the first chapter and resumes recurring mech raids. [Chapter and tactical encounter implementation, plans and validation](docs/chapter-tactics/README.md).

## Developer harnesses

All browser harnesses use the real game. Run them one at a time when using the software renderer, and set `MMF_PORT` when another checkout already owns port 5173.

```bash
node tools/first-run.mjs
node tools/chapter-flow.mjs
node tools/expansion-flow.mjs
node tools/automation-acceptance.mjs
node tools/shoot.mjs out.png [waitMs] ["?params"]
node tools/drive.mjs
node tools/combat.mjs [out.png]
node tools/combat-regression.mjs
node tools/build.mjs
node tools/craft.mjs [out.png]
node tools/opening.mjs [out.png]
node tools/deck.mjs
node tools/boarding.mjs
node tools/boarding-navigation.mjs
node tools/stairs.mjs
node tools/art/verify-assets.mjs
node tools/art/verify-expedition-assets.mjs
node tools/art/review-game.mjs
node tools/art/review-chapter.mjs
```

Harnesses can use `?nomenu=1` for a controlled start, `?nospawn=1` to suppress encounters, `?nolock=1` to skip pointer lock, `?quality=low|medium|high|ultra`, `?seed=name`, `?nosound=1`, and `?cam=far|front|side|sky`. `?opening=1` forces the rooftop opening. `?notex=1` and `?nomodel=1` force procedural compatibility paths.

Set `MMF_HARDWARE=1` to use hardware-accelerated Chrome on Windows. The expansion performance harness is `node tools/art/expansion_v1/performance.mjs --seconds=20 --cycles=24`; it measures frame times and repeated device rebuilds. Capture and trailer reproduction instructions are in [docs/media/README.md](docs/media/README.md).

### Debug keys

| Key | Action |
| --- | --- |
| `F1` / `F2` | Quicksave / quickload |
| `F3` | Debug overlay |
| `F4` | Spawn an enemy |
| `F5` | Give ammo and scrap |
| `F6` | God mode |
| `F7` | Jump 500m |
| `F8` | Cycle quality |
| `F9` | Bypass post-processing |
| `F10` | Cycle time of day |

## Architecture

The simulation keeps the machine at the world origin while the desert scrolls around it. This keeps Rapier physics stable and lets the same procedural geometry drive the build grid, navigation cells and colliders. Rendering uses Three.js, TypeScript and Vite; Blender supplies the original authored art.

`src/game` owns orchestration and the fixed 60Hz loop. `src/core` provides renderer, physics, input and events. `src/data` holds definitions. `src/machine` owns geometry, movement and power. `src/building` owns grid placement, rooms and colliders. `src/combat`, `src/enemies`, `src/vehicles` and `src/defense` implement encounters. `src/story`, `src/data/routes.ts`, `src/save` and `src/ui` implement the campaign and expedition presentation. `src/art` contains loaders, authored model validation and procedural fallbacks.

The machine and build pieces remain procedural where collision fidelity matters. Authored models are used where silhouette, animation or surface detail earns the load path. Missing or invalid assets fall back without preventing boot. See [ASSETS.md](ASSETS.md), [the art README](docs/art/README.md), [graphics-v3 delivery](docs/art/graphics-v3/README.md), and [expedition art notes](docs/art/expedition.md).

## Licences

Third-party models and textures retain their individual licences and provenance in [ASSETS.md](ASSETS.md). Original project code, Blender artwork and trailer music are identified separately there; public repository access does not grant an additional licence to those works.
