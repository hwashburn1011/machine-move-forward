# Machine Move Forward

A PvE survival shooter-looter set on a continuously moving land machine crossing
a hostile desert. Inspired by *Raft* and *SAND*.

This repository currently contains **Milestones 0–4** of the design handoff: the
technical foundation, the art direction, a playable third-person shooter core,
the grid build system, and inventory, storage, and crafting.

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

Click the canvas to take control (pointer lock).

| Key | Action |
| --- | --- |
| `WASD` | Move (camera-relative) |
| Mouse | Look |
| `Shift` | Sprint |
| `Ctrl` / `C` | Crouch |
| `Space` | Jump |
| LMB | Fire |
| RMB | Aim (narrows FOV and spread) |
| `R` | Reload |
| `1` / `2` | Rifle / shotgun |
| `Tab` | Inventory |
| `E` | Use the station you are standing at |
| `Esc` | Close a panel |
| `B` | Toggle build mode |
| `M` | Mute |

### Build mode

| Key | Action |
| --- | --- |
| `1`–`6` | Floor / wall / doorway / railing / roof / stairs |
| Mouse wheel | Change target level (follows you between storeys by default) |
| `Q` / `E` | Rotate |
| LMB | Place |
| RMB | Demolish (refunds 60%) |

Pieces cost scrap. You start with 400 and `F5` grants more. Everything you
build adds weight, which measurably slows the machine.

### Debug keys

| Key | Action |
| --- | --- |
| `F1` / `F2` | Quicksave / quickload |
| `F3` | Toggle debug overlay |
| `F4` | Spawn an enemy ahead |
| `F5` | Give ammo and scrap |
| `F6` | Toggle god mode |
| `F7` | Jump 500m forward |
| `F8` | Cycle quality tier |
| `F9` | Bypass post-processing (A/B the grade) |
| `F10` | Cycle time of day |

### URL parameters

`?nolock=1` skips pointer lock, `?quality=low|medium|high|ultra` forces a tier,
`?seed=name` picks a world seed, `?nosound=1` boots silent, and
`?cam=far|front|side|sky` switches to a fixed free camera for screenshots.

## What works

- Endless procedurally generated dune field that recycles chunks around a
  machine pinned to the world origin
- Fully code-generated art: scattering sky, sky-derived IBL, dune shader with
  wind ripples, procedural textures, height fog, post-processing chain
- A 10×16m walker built from code with deck, four articulated legs, prow, and
  equipment, its body heaving and listing with the gait while the deck it
  carries stays solid underfoot
- Third-person controller on Rapier's kinematic character controller
- Rifle and shotgun with hitscan, spread, recoil, reload, and damage falloff,
  each carried as a real model in the player's hand — measured, scaled and
  aimed from the model itself, and parented to the hand bone so it moves with
  the animation
- One hostile with a navigate/attack/pursue AI, arriving in waves the threat
  director schedules and capped at four aboard at once
- HUD, debug overlay, versioned IndexedDB save/load
- Grid build system: floors, walls, doorways, railings, roofs, stairs, storage
  crates, workbenches, and refineries on a 2m grid across a 9×12 envelope and 3
  levels, with placement validation, cascade demolition, itemised costs, and
  weight
- Flood-fill room detection: enclosed vs exposed, interior volume, and doorway
  connectivity between rooms
- Slot-based inventory with storage crates, aggregated so building and crafting
  spend from the bag and from any crate within 6m
- Instant crafting at the workbench and refinery: ammo that lands in the
  weapon's reserve, repair kits, and an extended magazine that raises the
  equipped weapon's magazine by 50%
- Encounter pacing: a threat director running calm, buildup, contact,
  engagement and recovery off distance travelled, with the quiet scheduled
  first — 650m of guaranteed peace between one wave ending and the next being
  telegraphed. Waves grow as they are survived, are staggered rather than
  dropped on one frame, and nothing arrives while the last one is still alive.
  Warned on the HUD and in the audio before it lands.
- Synthesised audio: no sample files, every sound built out of oscillators and
  filtered noise at runtime. Weapons, impacts, damage, footfalls under the
  machine's feet, building, looting, crafting, the reel, the director's warning
  and all-clear, and a continuous engine drone whose pitch and volume follow the
  machine's speed. Positional, in the listener's own frame.
- Enemies path over the structure the player builds: A* across the build grid,
  routing around walls, funnelling through doorways, and falling back to the
  nearest reachable cell when you have sealed yourself in. A scavenger crossing
  the deck, rounding a walled room, coming through its doorway and reaching the
  player inside is proven in the browser harness. Stairs are in the graph but
  cannot yet be climbed — see the known gap below.

## Not built yet

Enemy vehicles, boarding, turrets, localized machine damage, repair,
navigation unlocks, and a second enemy type. These are Milestones 6–12 in the
handoff; 5 (procedural resources, as the salvage field and the reel) and 10
(the threat director) are done.

Three known gaps in what is built:

- **Stairs cannot be climbed.** Two independent causes, both diagnosed, neither
  fixed. The doorway half of this gap is now fixed — see below — but stairs
  need their own pass:
  - *Geometry.* `transformFor` centres the stairs ramp on the midpoint between
    the base and run cells, so the ramp's low end sits at the base cell's near
    edge and climbs 0.75m for every metre travelled. The base cell also carries
    a floor plate 0.16m proud of the floor plane. Within about 0.2m of entering
    the cell a character is standing on that plate with the ramp slab cutting
    through its chest, needing a 0.63m step against a 0.45m `AUTOSTEP_HEIGHT`.
    Measured: the blocking contact normal is `(0, -0.8, 0.6)` — the ramp's
    *underside*. The ramp needs somewhere to begin that is not already floored,
    which is a design decision about how base/run/landing divide up, not a
    constant to nudge.
  - *Navigation.* `NavGraph`'s only vertical link puts the landing directly
    above the run cell, sharing its x and z exactly, so once an enemy holds that
    waypoint the steering target's XZ *is* its own XZ and `Enemy.ts`'s movement
    gate drives it at zero velocity. It parks at the foot of the ramp. Fixing
    the geometry alone will not restore stair-climbing.

- **Enclosed interiors are dark.** Sealing a room genuinely blocks the sun,
  and there is no interior lighting yet. Lamps arrive with the power system.
- **Fuel is storable but inert.** Nothing burns it until the power system.
  It is carried because the save schema and the handoff both call for it, and
  giving it a fabricated sink now would be worse than leaving it idle.

## Constraints

**Procedural by default, assets where they earn their place.** Every visual is
generated in code at build or boot time, and still is — the machine, all nine
build pieces, enemies, dunes, sky and every fallback texture are pure code.

A small set of CC0 PBR textures now sits on top of that for the machine's
surfaces. They are strictly an enhancement: `?notex=1` boots the original
all-procedural path, the loader never rejects, and every browser harness runs
textureless so the suites stay deterministic. Provenance, licences, and the
rule for what may be added live in `ASSETS.md`.

The machine and build pieces stay procedural on purpose — they are bespoke,
grid-aligned, and their colliders derive from the same geometry. The original
zero-asset rationale is in
`docs/superpowers/specs/2026-08-22-foundation-graphics-core-design.md`.

## Architecture

The load-bearing decision is that **the machine never moves**. It sits at the
world origin permanently and the world scrolls past it. This keeps
floating-point coordinates small, makes player physics stable, lets terrain
chunks recycle trivially, and — less obviously — allows the sun's shadow camera
to be a tight fixed box, which is most of why the shadows look good.

Simulation runs on a fixed 60Hz timestep with interpolated rendering. Systems
communicate through a typed event bus. All stats live in `src/data/`.

```
src/
  art/        Palette, sky, fog, procedural textures, materials, shaders
  building/   Grid, validation, rooms, geometry, build system, preview
  combat/     Weapons, damage
  core/       Renderer, physics, input, events, math, debug
  data/       Weapon, enemy, build piece, item, and recipe definitions (data only)
  enemies/    Enemy entity, AI, pooled manager
  fx/         Particle system, sand, impacts
  game/       Game orchestrator, fixed-timestep loop, constants
  crafting/   Recipe evaluation and execution
  interaction/Nearest interactable within reach
  items/      Slotted container, aggregate resource access
  machine/    Machine geometry, colliders, speed model
  player/     Player, controller, camera, combat
  progression/(empty until the tech tree)
  save/       Versioned IndexedDB saves and migrations
  ui/         DOM HUD and panels
  world/      Chunk recycling, terrain, props, seeding
```

## Testing

```bash
npm test             # 621 unit tests (deterministic logic)
npm run test:e2e     # 11 Playwright smoke tests
npm run lint
npm run build        # includes tsc --noEmit
```

Deterministic logic is unit-tested: seeded RNG and noise, the event bus, the
fixed-timestep accumulator, chunk recycling and save-restore equivalence,
damage falloff, weapon state, enemy AI transitions, save migrations, grid edge
canonicalisation, every build placement rule, room flood fill, container
stacking and slot exhaustion, aggregate resource access, recipe execution, the
gait and its IK, deck carrying under a moving body, what the machine's own
steel takes out of the build grid, every rule the threat director paces
encounters by, and the arithmetic half of the audio layer.

Rendering and feel cannot be meaningfully unit-tested, so there are five
browser harnesses in `tools/` that drive the real game:

```bash
node tools/shoot.mjs out.png [waitMs] ["?params"]   # screenshot + console errors
node tools/drive.mjs                                # 17 movement, physics, and footfall checks
node tools/combat.mjs [out.png]                     # 78 combat, pacing, arrival, death, loot, salvage, navigation, audio, and visual checks
node tools/build.mjs                                # 21 build system checks
node tools/craft.mjs [out.png]                      # 29 inventory/crafting checks
```

`drive.mjs`, `build.mjs`, and `craft.mjs` all boot with `?nospawn=1`, since
they travel far enough to attract arrivals and a scavenger wandering into a
wall-containment or save-reload check is a failure that only reproduces
sometimes. `combat.mjs` boots quiet the same way, then arms the spawner
deliberately partway through, once its own checks need arrivals. `shoot.mjs`
and `hero.mjs` take their query string from the caller rather than booting
with one by default, so pass `nospawn=1` yourself for a long wait — or a
`cam=` preset, which puts the game in free camera and suppresses spawning on
its own.

These wait on **simulated** time, not wall time. Under a software renderer the
loop's step clamp deliberately lets simulated time lag wall time, and
wall-clock assertions would measure the GPU rather than the game.

## Documents

- `machine-move-forward-game-handoff.md` — the full game design
- `docs/superpowers/specs/` — the approved spec for each pass
- `docs/superpowers/plans/` — the task-by-task implementation plans
