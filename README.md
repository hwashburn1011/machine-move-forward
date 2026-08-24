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
`?seed=name` picks a world seed, and `?cam=far|front|side|sky` switches to a
fixed free camera for screenshots.

## What works

- Endless procedurally generated dune field that recycles chunks around a
  machine pinned to the world origin
- Fully code-generated art: scattering sky, sky-derived IBL, dune shader with
  wind ripples, procedural textures, height fog, post-processing chain
- A 10×16m crawler built from code with deck, treads, prow, and equipment
- Third-person controller on Rapier's kinematic character controller
- Rifle and shotgun with hitscan, spread, recoil, reload, and damage falloff
- One hostile with a navigate/attack/pursue AI, boarding the deck every 250m of
  travel and capped at four at once
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
- Enemies plan and travel routes across the build grid the player creates:
  A* routes around walls, with doorways and stairs as the graph's only
  connections through a wall or between storeys, and a fallback to the
  nearest reachable cell when you have sealed yourself in. This is route
  *planning and travel toward* a doorway or stairs run, proven in the browser
  harness — not completing a crossing through either, which no enemy (or
  player) can currently do; see the known gap below.

## Not built yet

Resource collection, enemy vehicles, boarding, turrets, localized machine
damage, repair, the threat director, loot, navigation unlocks, and audio. These
are Milestones 5–12 in the handoff.

Three known gaps in what is built:

- **A kinematic capsule can freeze dead crossing certain build-piece
  geometry.** Two symptoms, reproduced independently with the *player* under
  held WASD input (not just a scavenger's AI), so this is a
  character-controller/collider issue, not anything specific to enemy
  steering:
  - A doorway opening (1.1m wide, no collider across it, only jambs and a
    lintel — 0.34m of clearance either side of the widest capsule in the
    game) freezes movement dead mid-step.
  - A stairs ramp (1.92m wide, no aperture at all) freezes movement dead
    mid-climb. `maxSlopeClimbAngle` is ruled out as the cause: it is 50°
    (`PhysicsWorld.ts:144`) against this ramp's 36.87° incline, comfortably
    climbable.

  Surfaced while writing the navigation harness (Task 7). Whether these are
  one root cause or two is not established — treat them as separate symptoms
  rather than assuming a single fix closes both. One lead, not a conclusion:
  `PhysicsWorld.addCharacter` configures
  `controller.enableAutostep(AUTOSTEP_HEIGHT, 0.2, true)`, and that `0.2`
  minimum-step-width parameter is worth checking against both. The two checks
  that would need a working crossing (a scavenger actually arriving inside a
  walled room, and actually climbing a stairs run) are left out of that
  harness until this is fixed.
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
npm test             # 490 unit tests (deterministic logic)
npm run test:e2e     # 11 Playwright smoke tests
npm run lint
npm run build        # includes tsc --noEmit
```

Deterministic logic is unit-tested: seeded RNG and noise, the event bus, the
fixed-timestep accumulator, chunk recycling and save-restore equivalence,
damage falloff, weapon state, enemy AI transitions, save migrations, grid edge
canonicalisation, every build placement rule, room flood fill, container
stacking and slot exhaustion, aggregate resource access, and recipe execution.

Rendering and feel cannot be meaningfully unit-tested, so there are five
browser harnesses in `tools/` that drive the real game:

```bash
node tools/shoot.mjs out.png [waitMs] ["?params"]   # screenshot + console errors
node tools/drive.mjs                                # 9 movement/physics checks
node tools/combat.mjs [out.png]                     # 62 combat, spawner, arrival, death, loot, salvage, navigation, and visual checks
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
