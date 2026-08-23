# Machine Move Forward — Foundation & Graphics Core (Milestones 0–2)

**Date:** 2026-08-22
**Status:** Approved
**Source design:** `machine-move-forward-game-handoff.md`
**Scope:** Milestones 0, 1, and 2 of the handoff document, built to a high visual finish.

---

## 1. Purpose

Establish the technical and visual foundation for *Machine Move Forward* — a PvE
survival shooter-looter set on a continuously moving land machine.

This pass delivers a playable, good-looking base that every later system
(building, crafting, enemy vehicles, boarding, turrets, threat director, loot)
is built on top of. It deliberately stops short of those systems.

The handoff document instructs "use placeholder geometry before spending time on
art." **That rule is explicitly overridden for this pass.** The user wants a high
visual bar from the start. Art direction is therefore a first-class deliverable
here, not deferred work.

---

## 2. Constraints

Set by the user, and binding:

- **No downloaded assets.** No model files, no texture files, no audio files, no
  CC0 asset packs. Every visual is generated in code at build or boot time.
- **No Blender.** The Blender MCP pipeline is available but is not used in this
  pass. It remains an option for hero assets in a later iteration.
- **Lean into Three.js.** Where Three.js has a capability that raises the visual
  ceiling, use it. This is a stated goal, not merely permission.
- Desktop browser, WebGL2.

npm packages are not "downloads" in the sense meant above — the dependency list
in section 8 is approved.

---

## 3. Art Direction

Target, per the handoff document: *Raft* readability + *SAND* industrial desert
feeling + chunky modular machinery. Stylized, not photoreal. Strong silhouettes,
readable color, warm palette, atmospheric depth.

### 3.1 The origin advantage

The machine sits permanently at world origin; the world scrolls past it. This is
specced in the handoff for floating-point precision, but it also has a large
rendering consequence:

> The sun's shadow camera can be a tight, fixed box around the machine rather
> than a loose volume chasing a moving player.

That yields crisp, stable, contact-hardening shadows at low cost. Shadow quality
is one of the strongest signals separating a polished game from a browser demo,
and this architecture hands it to us.

### 3.2 Procedural sky

A sky dome driven by a GLSL approximation of Rayleigh and Mie scattering, with a
real sun disc and a dust-laden horizon band. Not a gradient — an atmosphere that
reddens correctly as the sun angle drops.

Sun direction is a single driving parameter, which later supports the day/night
cycle listed in the vertical-slice feature list.

### 3.3 Sky-derived image-based lighting

The sky shader is baked through `PMREMGenerator` into an environment map used by
every PBR material in the scene. Metal panels on the machine reflect the actual
sky; surfaces pick up actual bounced sand light.

This is the highest-leverage visual technique available to us and costs one
render at startup, plus a re-bake when the sun moves far enough to matter
(throttled — not per frame).

### 3.4 Dune terrain

Chunked, vertex-displaced meshes with an fBm sand shader providing:

- wind ripples that drift over time,
- anisotropic sun glints on dune crests,
- sand color shifting by slope and facing direction.

Terrain is **purely visual**. The handoff specifies MVP terrain is mechanically
flat, and nothing can reach the ground, so terrain carries no collider and no
CPU height sampling. Terrain interaction effects (deep sand, rock fields) are
later work.

### 3.5 Atmospheric fog

Height-aware exponential fog injected into every material through
`onBeforeCompile`, tinted from the same constants that drive the sky shader, so
the horizon dissolves into the atmosphere rather than fading to a flat gray.

### 3.6 Post-processing stack

In order:

1. MSAA-backed render target (WebGL2 multisampling)
2. GTAO — contact darkening where geometry meets geometry
3. Selective bloom — emissives and the sun disc only, used sparingly
4. Heat shimmer — screen-space distortion over hot ground, strongest near the
   horizon
5. Color grade — warm ochre highlights, cool violet shadows
6. Grain and vignette, both subtle

Every effect sits behind a quality tier and can be disabled independently.

### 3.7 Machine and props

Bevelled modular panels built from code. Chunky forms, bold color blocking,
strong readable silhouette against the bright sky.

Materials use procedural rust, painted metal, and grime textures rendered to
canvas at boot and uploaded as textures — PBR-quality reads with zero asset
files.

### 3.8 Particles

GPU-instanced points, pooled: sand streaming past the deck, the dust plume
thrown off the treads, weapon impact puffs.

---

## 4. Architecture

The repository layout from section 7 of the handoff document is adopted as-is.

Core rules:

- **Fixed timestep.** Simulation runs at a fixed 60Hz; rendering interpolates
  between simulation states. Per handoff section 46.
- **Typed event bus.** UI, audio, and gameplay systems communicate through it
  and stay decoupled. Per handoff section 45.
- **Data-driven definitions.** Weapon, item, and piece stats live in data
  modules, never in logic. Definition and runtime instance are separate types.
  Per handoff section 44.
- **Small, focused files.** One clear purpose each.

### 4.1 World scroll

The spine of the whole architecture:

- `machine.position` is `(0, 0, 0)` permanently and is never written to.
- `WorldManager` translates chunks along `-Z` and recycles them behind the
  machine.
- `distanceTraveled` is tracked as a plain accumulating number, separate from
  any transform.
- Chunk content is generated deterministically from `worldSeed + chunkIndex`,
  so save/load reproduces the world exactly.

---

## 5. Physics

Rapier (`@dimforge/rapier3d-compat`), per handoff section 9.

- Machine deck and structures are **fixed** colliders. Never dynamic. Per the
  handoff's explicit warning against simulating base components as independent
  rigid bodies.
- Player uses Rapier's `KinematicCharacterController`.
- Enemies use the same controller.
- Weapons are hitscan via Rapier raycasts.
- Terrain has no collider — nothing can reach it. A respawn volume below deck
  level catches falls.

---

## 6. Deliverables

In scope for this pass:

- Full render pipeline and art direction per section 3
- Endless recycled dune world with deterministic seeded generation
- The 5×8-tile starting machine at origin (handoff section 49)
- Third-person over-the-shoulder controller, full control map from handoff
  section 8
- Rifle and shotgun: aim, fire, reload, spread, recoil
- One hostile humanoid with damage and death
- HUD: player HP, ammo, equipped weapon, speed, distance traveled
- Debug overlay: FPS, draw calls, triangles, physics bodies, active chunks,
  world distance
- Debug actions: give weapon, spawn enemy, god mode, teleport
- Typed event bus
- Data-driven definition modules
- Versioned save/load skeleton on IndexedDB (handoff section 38)

### 6.1 Explicitly out of scope

Deferred to later passes: build mode, room detection, inventory, storage,
crafting, resource collection, enemy vehicles, boarding, turrets, hardpoints,
localized machine damage, repair, threat director, loot and rarity, navigation
unlocks, audio.

---

## 7. Testing

- **Vitest** for deterministic systems: chunk recycling math, seeded generation,
  damage calculation, save migrations.
- **Playwright** smoke test: boot the game, move the player, fire a weapon,
  save, reload.

Both are wired up in this pass so later milestones inherit working harnesses.

---

## 8. Stack

| Package | Version |
| --- | --- |
| `three` | 0.185.1 |
| `@dimforge/rapier3d-compat` | 0.20.0 |
| `vite` | 8.2.2 |
| TypeScript, Vitest, Playwright, ESLint, Prettier | current |

### 8.1 Deviations from the handoff stack

Two packages listed in handoff section 5 are deliberately **not** used:

- **React** — the HUD is a plain DOM overlay. Keeps the bundle lean and keeps a
  framework away from the simulation loop, which the handoff also warns about.
- **Zustand** — the event bus plus a plain game-state object covers this scope.

Both can be added later if a real need appears. Carrying them now is cost
without benefit.

**Howler / audio** is deferred. The handoff rates audio highly for encounter
telegraphing, but there are no encounters in Milestones 0–2. Audio lands with
the threat director, where it has something to telegraph.

---

## 9. Success Criteria

This pass succeeds if:

1. The game holds 60 FPS with headroom on target hardware.
2. The player can move and jump on the machine with no physics jitter.
3. The machine appears to travel indefinitely; chunk recycling is invisible.
4. Shooting feels responsive and reliably kills the hostile.
5. A screenshot of the game looks like a real game — the *Raft*-readability and
   *SAND*-desert identity is legible in a still frame.
6. Save and reload restores position, health, and world state exactly.

Criterion 5 is the one this pass exists to prove, and the one the handoff's
default "placeholder geometry" rule was overridden to reach.
