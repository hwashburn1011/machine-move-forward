# Machine Move Forward — Grid Build System (Milestone 3)

**Date:** 2026-08-22
**Status:** Approved
**Source design:** `machine-move-forward-game-handoff.md` sections 10, 11, 14, 44
**Builds on:** `2026-08-22-foundation-graphics-core-design.md` (Milestones 0–2, complete)

---

## 1. Purpose

Let the player reshape their machine: place floors, walls, doorways, stairs,
roofs, and railings on a 2m grid, pay for them in scrap, tear them down again,
and have the game understand which spaces are enclosed rooms.

Milestone 3's acceptance criterion is one sentence:

> The player can create enclosed multi-room structures.

Everything in this spec exists to make that sentence true and verifiable.

---

## 2. Constraints

Inherited from the foundation spec and still binding:

- **No asset files.** Piece geometry is built in code, like everything else.
- **The machine never moves.** Build pieces are children of the machine group at
  the world origin.
- **Machine structures are `fixed` Rapier colliders.** Never dynamic.
- **Definition and runtime instance stay separate types.** Piece stats live in
  `src/data/build-pieces.ts`.
- **No React, no Zustand, no audio.**

---

## 3. Grid Model

### 3.1 Cells

A cell is an integer triple `(x, y, z)`:

- `x: -4..4` — 9 tiles wide
- `z: -6..5` — 12 tiles deep
- `y: 0..2` — 3 levels

At `GRID_TILE = 2`, that is a 18m × 24m envelope. The existing deck occupies
`x: -2..2, z: -4..3` at level 0; anything beyond is player-built extension.

Level height is 3m, giving comfortable headroom over the 1.92m player capsule.

### 3.2 Edges

Walls, doorways, and railings sit on the boundary **between** two cells, not
inside one. An edge is a cell plus an axis:

- `{x, y, z, axis: 'x'}` — the boundary between `(x,y,z)` and `(x+1,y,z)`
- `{x, y, z, axis: 'z'}` — the boundary between `(x,y,z)` and `(x,y,z+1)`

**Canonicalisation is mandatory.** The wall on the `-X` face of cell `(3,0,1)`
and the wall on the `+X` face of cell `(2,0,1)` are the same wall and must
resolve to the same key, `2,0,1,x`. Without this, two walls can occupy the same
physical space and room detection sees a boundary that is sometimes there and
sometimes not.

### 3.3 Blocked cells

Cells occupied by the starting equipment (engine, generator, fuel tank,
workbench, crates, collector, hardpoint) are permanently unbuildable. These are
derived by projecting the machine's existing collider list onto the grid, not
hardcoded — hardcoding them would silently rot the moment the machine layout
changes.

---

## 4. Pieces

Six pieces, per the Milestone 3 acceptance list plus railing.

| id | Occupies | Scrap | Weight (kg) | Bounds a room |
| --- | --- | --- | --- | --- |
| `floor` | cell | 8 | 120 | — |
| `wall` | edge | 12 | 90 | yes |
| `doorway` | edge | 20 | 110 | yes, and links two rooms |
| `railing` | edge | 5 | 25 | no |
| `roof` | cell | 10 | 80 | — |
| `stairs` | 2 cells | 18 | 160 | — |

Railings are waist-high and deliberately do **not** bound a room: a railed open
deck should not become an interior space just because it has a perimeter.

Stairs render as visible steps but collide as a **single smooth ramp**. Stepped
colliders make kinematic character controllers jitter and catch.

Half-wall, window wall, ladder, support, and platform extension from handoff
section 10 are deferred. The piece framework makes them additive.

---

## 5. Placement Rules

A placement is valid when all of these hold:

1. The target cell or edge is inside the envelope.
2. Nothing already occupies that cell or edge.
3. No part of it overlaps a blocked equipment cell.
4. The piece-specific support rule below is satisfied.

Support rules:

- **Floor, level 0** — always supported. The chassis carries it.
- **Floor, level > 0** — requires either a wall on the level below touching one
  of the cell's four edges, or an existing floor on the same level in an
  orthogonally adjacent cell. This single rule is what prevents floating
  islands while still allowing overhangs of one tile.
- **Wall, doorway, railing** — requires a floor on at least one of the two cells
  the edge separates, at the same level.
- **Roof** — requires a floor in the same cell and level.
- **Stairs** — occupy two orthogonally adjacent cells at their own level: the
  *base* cell and the *run* cell in the facing direction. Requires a floor in
  the base cell, the run cell free of other cell pieces, and the *landing* cell
  — directly above the run cell at `level + 1` — free of cell pieces. The
  landing does not need a floor already; the stairs deliver the player to that
  cell so a floor can then be built there.

Demolition is always permitted on a player-placed piece and never on the
original machine. Removing a floor also removes any piece that depended on it
(its roof, and edge pieces left with no floor on either side); those cascade
refunds are paid out too.

---

## 6. Room Detection

Recomputed after every placement and demolition, over the whole grid.

A **room** is a maximal connected set of floored cells at a single level, where
two orthogonally adjacent cells are connected only if the edge between them
carries no wall and no doorway. Railings do not break connectivity.

A room is **enclosed** when both hold:

- every boundary edge of the room carries a wall or a doorway — where a
  boundary edge is any edge between a room cell and a cell outside the room, or
  between a room cell and the void; and
- every cell in the room has a roof piece, or a floor piece directly above it.

Each room records: `id`, `level`, `cells`, `interiorVolume` (cubic metres), `enclosed`, and
`doorways` — the doorway edges on its boundary, each naming the two rooms it
joins.

Because enclosure is recomputed from scratch, destroying a wall later
(Milestone 9) makes a room read as breached with no extra machinery. Room
labelling and typing are explicitly out of scope; handoff section 11 says not
to build them yet.

---

## 7. Resources and Weight

A single scrap counter, starting at 400.

- Placing a piece deducts its cost; placement is refused if scrap is short.
- Demolishing refunds 60%, rounded down.
- Debug key `F5` grants +250.

This is deliberately not an inventory. Milestone 4 brings storage and Milestone
5 brings collection; building a real economy now would mean building it twice.

Every placed piece adds its weight to `MachineMovement.totalWeight`, so a large
base measurably slows the machine. That is the tradeoff handoff section 14 asks
for, and the speed model to consume it already exists.

---

## 8. Controls

| Input | Action |
| --- | --- |
| `B` | Toggle build mode |
| `1`–`6` | Select piece |
| Mouse wheel | Change target level |
| `Q` / `E` | Rotate piece |
| LMB | Place |
| RMB | Demolish |

Build mode suppresses weapon fire. The target level defaults to the level the
player is standing on and follows them as they move between levels, so the
wheel is an override rather than a chore.

Targeting raycasts from the camera through the crosshair, up to 9m, and snaps
the hit point to the nearest cell for cell pieces or the nearest edge for edge
pieces. A ghost preview renders green when valid and red when not, with the
blocking reason shown in the build HUD panel.

---

## 9. Architecture

New directory `src/building/`:

| File | Responsibility |
| --- | --- |
| `BuildGrid.ts` | Grid state: cell and edge occupancy, canonical keys, queries. No Three.js. |
| `BuildValidation.ts` | Pure placement rules. Returns a reason on failure. No Three.js. |
| `RoomDetector.ts` | Pure flood fill and enclosure test. No Three.js. |
| `BuildPieceGeometry.ts` | Code-built geometry per piece type. |
| `BuildSystem.ts` | Orchestration: place, demolish, meshes, colliders, weight, events. |
| `BuildPreview.ts` | Targeting raycast and ghost mesh. |

Supporting:

- `src/data/build-pieces.ts` — definitions, data only.
- `src/progression/Resources.ts` — the scrap counter.
- `src/ui/BuildUI.ts` — build-mode HUD panel.

The first three files hold no rendering or physics dependency on purpose. They
are where the logic that can actually be wrong lives, so they must be testable
without a browser.

New events: `build:placed`, `build:removed`, `build:rooms-changed`,
`resources:changed`.

---

## 10. Persistence

`SaveGameV1.machine.structures` is already an array reserved for exactly this;
it now carries `BuildPieceInstance[]`. **No schema migration is required** — the
field was reserved in the foundation pass precisely so this milestone would not
need one.

Loading a save clears the grid, replays the stored pieces through the same
placement path used at runtime, and recomputes rooms.

---

## 11. Testing

Unit-tested (Vitest), in order of how likely they are to be wrong:

- Edge canonicalisation — both approach directions resolve to one key
- Cell and edge occupancy, envelope bounds, blocked cells
- Every placement rule, including each rejection reason
- Room flood fill: single room, two rooms split by a wall, doorway-linked
  rooms, exposed room missing a roof, exposed room missing a wall, breached
  room after wall removal
- Resource spend, refusal when short, refund rounding
- Demolition cascade — removing a floor removes its dependants
- Save round-trip: place, serialise, clear, restore, identical grid and rooms

Browser harness `tools/build.mjs` drives the running game to place a real
two-room structure with a connecting doorway and asserts both rooms report
enclosed, that the ghost rejects invalid placements, that scrap is deducted and
refunded, and that machine speed drops as weight rises.

Existing suites must continue to pass unchanged.

---

## 12. Known Limitation

Enemies steer directly at the player and will push against newly built walls
rather than path around them. Handoff section 32 explicitly defers navmesh work
to the boarding milestone, and the room connectivity graph produced here is
what that milestone will path over.

---

## 13. Success Criteria

1. The player can build an enclosed room and the game reports it enclosed.
2. The player can build two rooms joined by a doorway, and both report enclosed
   with the doorway linking them.
3. Removing a wall makes the affected room report not enclosed.
4. Walls block the player physically; doorways let them through.
5. Stairs carry the player between levels without jitter or catching.
6. Scrap is deducted on placement, refunded on demolition, and placement is
   refused when short.
7. A large structure measurably reduces machine speed.
8. Build, save, reload — the structure and its rooms come back identical.
9. All existing tests and harnesses still pass.
