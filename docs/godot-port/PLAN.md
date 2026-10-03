# Native Godot port

Source baseline: `5d9f596`. The existing Three.js game stays runnable and is the acceptance reference. The native game lives under `godot/`; no browser renderer or embedded browser substitutes for Godot rendering/physics.

## Delivery checklist

1. Asset/data pipeline: all 55 runtime GLBs, full-resolution PBR textures, animation clips, authored machine placement and colliders, gameplay definitions and campaign text. Generated copies are reproducible from the existing repository.
2. Native foundation: fixed 60 Hz simulation, character controller, camera obstruction/shoulder/fade, directional movement/reload animations, three decks and stairs, moving world, four-leg gait, lighting, dunes, scenery, audio and controls/settings.
3. Resource loop: inventory and storage, salvage reel/chests, crafting, generator fuel/emergency crawl, power priorities, local damage/repairs, needs, producers/gardens, construction/preview/relocation/demolition and room detection.
4. Combat: both weapons/attachments, four mech archetypes plus legacy enemies, navigation across decks/builds, damage/loot, skiff/hook/boarding, gunboat, manual/automatic turrets, encounter pacing and raid objectives.
5. Campaign: cinematic opening, exact first-run/scanner requirements, 100% battle/reveal, recurring radio raids, all five expeditions and route choices, objectives/journals/uniques, navigation unlocks, optional contacts, home life, L-12, Meridian ending/Keep Walking.
6. Persistence/UI: native dystopian terminal and HUD, inventory/build/workshop/machine/records/settings pages, title/pause, safe saves, campaign library and JSON exchange; validate legacy browser saves before claiming compatibility.
7. Acceptance: traceable tests for rules/transactions/save round trips, native playthrough checkpoints, stairs/camera/combat/build interaction checks, screenshots, all-assets validation, and hardware benchmark with equivalent camera/resolution/scene load. Record remaining differences honestly; a booting scene is not full parity.

## Performance comparison

Use RTX 3070 at 1920×1080, full assets, player plus eight mechs, deck/rapid-look/crowded-look scenarios. Capture frame percentiles, CPU/GPU timing where available, draw/primitive/resource counts, and graphics settings. Separate first-run import/shader work from steady-state timings. Retain the Three.js benchmark reports. Do not claim an engine win from unequal quality or a partial gameplay implementation.

## Progress

- [x] Baseline and isolated branch established.
- [x] Portable Godot 4.7.2 obtained separately from the user's older installation.
- [x] Asset/data pipeline implemented; all 55 models instantiated and source hashes verified.
- [x] Native foundation implemented; rendered checks and real-input side-stair/gangway traversal passed.
- [x] Resource loop implemented, including atomic crafting/storage, power classes, cargo retention, construction support cascades, home life, and L-12.
- [x] Native combat implemented: weapons, enemy tactics, turret tracking, guided skiff, recurring boarding, mission objectives, and gunboat subsystems.
- [x] Five-destination campaign implemented; checkpoint-based progression reaches the original ending and Keep Walking.
- [x] Native terminal, settings, save library and native JSON exchange implemented. Browser-save migration is not implemented.
- [x] 108 integration checks, traversal checks, 55-model audit, and GPU benchmarks completed.
- [ ] Exhaustive manual playthrough of every route/build layout and pixel/feel parity sign-off. The native edition is a playable port candidate, not a certified identical replacement.
