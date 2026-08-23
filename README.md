# Machine Move Forward

A PvE survival shooter-looter set on a continuously moving land machine crossing
a hostile desert. Inspired by *Raft* and *SAND*.

This repository currently contains **Milestones 0–2** of the design handoff: the
technical foundation, the art direction, and a playable third-person shooter
core.

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

### Debug keys

| Key | Action |
| --- | --- |
| `F1` / `F2` | Quicksave / quickload |
| `F3` | Toggle debug overlay |
| `F4` | Spawn an enemy ahead |
| `F5` | Give ammo |
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
- One hostile with a navigate/attack/pursue AI
- HUD, debug overlay, versioned IndexedDB save/load

## Not built yet

Build mode, rooms, inventory, crafting, resource collection, enemy vehicles,
boarding, turrets, localized machine damage, repair, the threat director, loot,
navigation unlocks, and audio. These are Milestones 3–12 in the handoff.

## Constraints

**No asset files.** No models, textures, audio, or fonts. Every visual is
generated in code at build or boot time. This is a deliberate project
constraint, not a temporary state — see
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
  combat/     Weapons, damage
  core/       Renderer, physics, input, events, math, debug
  data/       Weapon and enemy definitions (data only)
  enemies/    Enemy entity, AI, pooled manager
  fx/         Particle system, sand, impacts
  game/       Game orchestrator, fixed-timestep loop, constants
  machine/    Machine geometry, colliders, speed model
  player/     Player, controller, camera, combat
  save/       Versioned IndexedDB saves and migrations
  ui/         DOM HUD
  world/      Chunk recycling, terrain, props, seeding
```

## Testing

```bash
npm test             # 161 unit tests (deterministic logic)
npm run test:e2e     # 9 Playwright smoke tests
npm run lint
npm run build        # includes tsc --noEmit
```

Deterministic logic is unit-tested: seeded RNG and noise, the event bus, the
fixed-timestep accumulator, chunk recycling and save-restore equivalence,
damage falloff, weapon state, enemy AI transitions, and save migrations.

Rendering and feel cannot be meaningfully unit-tested, so there are three
browser harnesses in `tools/` that drive the real game:

```bash
node tools/shoot.mjs out.png [waitMs] ["?params"]   # screenshot + console errors
node tools/drive.mjs                                # 9 movement/physics checks
node tools/combat.mjs                               # 12 combat checks
```

These wait on **simulated** time, not wall time. Under a software renderer the
loop's step clamp deliberately lets simulated time lag wall time, and
wall-clock assertions would measure the GPU rather than the game.

## Documents

- `machine-move-forward-game-handoff.md` — the full game design
- `docs/superpowers/specs/` — the approved spec for this pass
- `docs/superpowers/plans/` — the 19-task implementation plan
