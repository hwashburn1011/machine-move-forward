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

The game opens on a title screen over the machine walking the dunes: **New
Game**, **Continue** (when there is a save), **Settings**. New Game starts the
rooftop opening — you are chased across a ruined roof, backed onto a ledge,
and the jump onto the deck is what starts the machine walking. Hold `Esc` for
a second to skip it. `Esc` in play opens the same menu with Resume.

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
| Hold `E` | Repair the damaged subsystem or piece you are standing at |
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

`?nomenu=1` boots straight into gameplay — no title screen, no opening —
which is what every harness and Playwright test uses, and what makes them
independent of the front door. `?opening=1` forces the rooftop opening
regardless, for `tools/opening.mjs`.

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
- Two hostiles with a navigate/attack/pursue AI, arriving in waves the threat
  director schedules and capped at four aboard at once. A scavenger is slower
  than a walk, so you can back away and shoot it down; a raider is faster than
  one, so you cannot, and it turns up from the third wave onward to say so.
  They share a rig until a second model lands and are told apart by colour
- A front door: a title screen over the live machine walking the dunes — the
  simulation runs behind the menu, so the background is the game rather than a
  render of it — with New Game, Continue, and a small Settings panel. `Esc` in
  play is the same component with Resume in place of New Game, and the world
  genuinely stops behind it
- An opening: chased across a ruined rooftop by two scavengers, backed onto a
  ledge, and the leap onto the deck is what starts the machine walking. Placeholder
  for a fuller authored one, and skippable by holding `Esc`. The machine idles
  at throttle 0 alongside a static building for the length of it, which is how
  a game whose machine never moves gets a jump ONTO a moving machine without
  making anything a moving platform
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
- A salvage reel with a real grappling hook — shank, three swept flukes with
  barbs, and an eye for the cable — built in code and tumbling as it flies
- Synthesised audio: no sample files, every sound built out of oscillators and
  filtered noise at runtime. Weapons, impacts, damage, footfalls under the
  machine's feet, building, looting, crafting, the reel, the director's warning
  and all-clear, and a continuous engine drone whose pitch and volume follow the
  machine's speed. Positional, in the listener's own frame.
- Localized machine damage and repair: five subsystems — the engine and the
  four legs — each with their own health, and no global HP bar anywhere. A hurt
  engine scales the machine's top speed continuously and at zero stops it dead;
  hurt legs slow it and make the hull list toward the damaged side. Being
  stopped is a state you play through and repair, never a reloaded save. Every
  piece the player builds can be shot or chewed down, and falls through the same
  cascade demolition the hammer uses, with no refund. A wall now genuinely stops
  a hit — an enemy one 2m cell away used to reach through it — and an enemy that
  cannot get past one attacks the wall instead, so sealing yourself in is not
  permanent safety. The raider is told apart from the scavenger by what it does:
  it crosses the deck for the engine while the scavenger comes for you. Repair
  is hold-`E` at a deck access panel, priced at 20% of build cost pro rata, held
  strictly under the 40% that demolishing and rebuilding nets so that mending is
  always the right move. One HUD row stays quiet until something is wrong.
- Enemies path over the structure the player builds: A* across the build grid,
  routing around walls, funnelling through doorways, and falling back to the
  nearest reachable cell when you have sealed yourself in. A scavenger crossing
  the deck, rounding a walled room, coming through its doorway and reaching the
  player inside is proven in the browser harness. Stairs are in the graph but
  cannot yet be climbed — see the known gap below.

## Not built yet

Enemy vehicles, boarding, turrets, and navigation unlocks. These are
Milestones 6–12 in the handoff; 5 (procedural resources, as the salvage field
and the reel), 10 (the threat director) and the damage and repair half of 6 are
done.

Three known gaps in what is built:

- **Stairs: both diagnosed causes are fixed; the scripted proof is not.**
  The flight was built rising toward +Z while `rotationDelta` puts the run and
  the landing the other way, so every staircase was back to front — walking
  into the base cell you met the TOP of the flight, and what stopped you was
  its underside, which is why the recorded contact normal was `(0, -0.8, 0.6)`
  and why the diagnosis ("a 0.63m step against a 0.45m autostep") was true but
  unactionable. And the nav graph linked the run cell to the cell directly
  above it — same x, same z — so an enemy holding that waypoint steered at its
  own position, found a heading of length zero, and parked at the foot of the
  ramp. Vertical links now come in through `fixedLinks` only, computed by
  `BuildSystem`, which is the one place that knows a staircase's rotation.

  Measured against the running game, a player walking at a flight climbs it end
  to end: 4.67 to 7.43, the full storey. What is NOT yet in the harness is that
  walk — driving one reliably needs the approach surface, the camera yaw and
  the entry edge all agreed, and getting it wrong measures the harness rather
  than the game. `combat.mjs` asserts the property the fix turned on instead: a
  body dropped over the middle of a flight lands on it, at the height the slope
  puts it. Back to front, the same drop lands on the deck three metres lower.

- **Light does not respect walls.** The lamp pool is shadowless — eight
  shadow-casting point lights would be forty-eight render passes — so a lamp
  close to a wall spills a little through it. Accepted for now; the polish
  phase owns it.

Both of the gaps that used to be listed here are closed:

- **Enclosed interiors are lit.** Sealing a room still blocks the sun, and now
  a `lamp` hangs on any wall or doorway to answer it. Every lit lamp glows;
  the nearest few to the camera — two to eight by quality tier — get real
  point lights. Measured in a sealed room under the software renderer, mean
  interior brightness goes 8.2 unlit, 30.5 lit, and back to 8.2 when the
  generator sheds.
- **Fuel burns.** A `generator` build piece — one is already placed on a new
  machine — draws from `machine.fuel` while anything is powered. Devices
  register with `MachinePower` by priority (`light` < `station` < `defense`),
  and when capacity falls below draw, whole classes shed lowest-first: a deck
  going dark reads as a decision where a flickering subset of lamps would read
  as a fault. A damaged generator makes proportionally less power; a refinery
  with none shows `NO POWER` and refuses to run. The workbench is never gated,
  so a dead generator is always recoverable.

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
npm test             # 818 unit tests (deterministic logic)
npm run test:e2e     # 30 Playwright tests (smoke, what-is-seen, damage, title, power)
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
encounters by, the arithmetic half of the audio layer, and every rule of
machine damage — subsystem health and its effects, what a repair costs against
what replacing costs, what an enemy swings at when a wall is in the way, and
the condition row's wording.

`npm run test:e2e` reuses whatever dev server is already answering on 5173. If
a second checkout of this repo has one running, set `PORT` to give this one a
lane of its own — otherwise the suite silently measures the other checkout.

Rendering and feel cannot be meaningfully unit-tested, so there are six
browser harnesses in `tools/` that drive the real game:

```bash
node tools/shoot.mjs out.png [waitMs] ["?params"]   # screenshot + console errors
node tools/drive.mjs                                # 17 movement, physics, and footfall checks
node tools/combat.mjs [out.png]                     # 84 combat, pacing, arrival, death, loot, salvage, navigation, audio, and visual checks
node tools/build.mjs                                # 21 build system checks
node tools/craft.mjs [out.png]                      # 29 inventory/crafting checks
node tools/opening.mjs [out.png]                    # 27 checks on the opening: the chase, the leap, the miss, the skip
node tools/deck.mjs                                 # 7 deck-carry checks under a heaving body
```

Every one of them boots with `?nomenu=1` — the game has a front door now, and
a harness that has to click through it would be measuring the menu. Set
`MMF_PORT` to point a run at a dev server on another port; `playwright.config.ts`
reads the same variable, which is what stops two checkouts of this repo from
silently testing each other.

`opening.mjs` is the exception that boots `?opening=1`, since the opening is
the thing it measures. Its central claim is the leap: the plan asserts the
ledge is clearable from a running jump, and this drives a real sprint off a
real ledge and reads where the player lands. The arithmetic half of the same
claim — the ballistics of the jump against the width of the gap — is a unit
test, so a change to `PLAYER_JUMP_HEIGHT` or the building's position fails in
milliseconds rather than in a browser.

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
