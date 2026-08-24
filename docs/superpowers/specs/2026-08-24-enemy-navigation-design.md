# Machine Move Forward — Enemy Navigation Over Player Structure

**Date:** 2026-08-24
**Status:** Approved
**Source design:** `machine-move-forward-game-handoff.md` sections 11, 32, pillar 3.4
**Builds on:** Milestones 0–4, the basic enemy spawner, salvage

---

## 1. Purpose

The build system works and means nothing in a fight.

Scavengers reach the player by `steerAround()` — a probe fan that samples nine
directions and takes the best-scoring one each tick. It is explicitly local
avoidance, not pathfinding, and its own header says so. Against the handful of
fixed equipment blocks it was written for, it is enough. Against a player-built
room it is not: an enemy on the far side of a wall presses into that wall
forever, because no sampled direction is both open and pointed at the player.

The result is that a wall is a thing enemies bump into, not a thing that shapes
where they go. Design pillar 3.4 — "the player's custom base becomes the combat
level" — is unrealised, and it is the pillar that justifies the entire build
system existing.

This makes enemies path over the structure the player built, so that walls
route them, doorways funnel them, and stairs let them follow upward.

Walls are **not** destructible and nothing here makes them so. See section 9.

---

## 2. Constraints

Inherited and still binding:

- **No asset files.**
- **The machine never moves.** It sits at the world origin, the world scrolls.
- **Definition and runtime instance stay separate types.**
- **No React, no Zustand, no audio.**
- **Enemies live in machine-space**, so grid cells and enemy positions share one
  coordinate frame with no scroll correction between them.

New and load-bearing:

- **Structure is permanent.** No piece takes damage, no piece is destroyed by
  an enemy. A wall the player places is a wall until the player demolishes it.
- **Navigation logic stays pure.** Cells and edges in, waypoints out. No
  Three.js, no Rapier — the same rule `RoomDetector`, `EnemySteering`, and
  `EnemySpawner` already follow, and the reason they are exhaustively testable
  in node.
- **Existing suites must keep passing:** 449 unit, 11 e2e, 116 harness checks
  (9 drive, 57 combat, 21 build, 29 craft).

---

## 3. The Model

Two layers, kept separate because they answer different questions.

| Layer | Question | Scale | Module |
| --- | --- | --- | --- |
| Navigation | Which way round the building? | The whole deck | `NavGraph` (new) |
| Steering | How do I not walk into that generator? | The next 1.6 m | `EnemySteering` (unchanged) |

A* answers the first. The existing probe fan keeps answering the second, with
one change: the heading it is asked to steer toward becomes the current
waypoint rather than the player. Every local-avoidance rule already tuned —
the ±115° fan, the three-point body-width probing, the corner-escape
behaviour — survives untouched, because none of it was ever wrong. It was
solving the wrong scale of problem.

---

## 4. The Navigation Graph

New module `src/enemies/NavGraph.ts`.

### 4.1 Nodes

A cell is a node when it is **walkable**:

- it holds a `floor` piece, **or** it is a level-0 cell over the machine's own
  deck slab, **and**
- ~~it is not in the grid's blocked set (machine equipment).~~

> **Amendment, post-implementation.** This last condition was overruled
> during execution and the shipped code deliberately does the opposite:
> navigation **ignores** the grid's blocked set entirely. The reasoning above
> was wrong, and is left struck through rather than deleted so the record
> shows what was believed going in.
>
> Section 3 already drew the line this section then crossed: equipment
> avoidance belongs to the steering layer ("how do I not walk into that
> generator"), not the navigation layer ("which way round the building").
> Section 4.1 as originally written contradicted section 3 by folding
> equipment into node selection anyway. Where the two disagree, section 3
> governs.
>
> The blocked set is a build-**placement** rule — it rounds each piece of
> equipment's collider bounds outward to whole 2m grid cells so nothing gets
> placed overlapping it. That rounding is far too coarse to describe where a
> body can actually walk. Measured on the running game with the blocked set
> consulted for walkability, as originally specified: **14 of 45 deck cells
> fell into three disconnected islands**, with most of the deck perimeter
> gone. Arrivals land 0.6m in from the deck lip, which is exactly the
> perimeter this reduction destroys, so a freshly spawned enemy would
> typically have no start node, `findPath` would return empty, and
> pathfinding would have been inert in the real game — while the unit suite,
> which never builds a grid dense enough to expose the fragmentation, stayed
> green throughout. See improvement log 006 for the full account.
>
> The corrected rule: a cell is walkable if it holds a `floor` piece, or it is
> a level-0 cell over the bare deck — full stop. Equipment is avoided by
> `EnemySteering`'s probe fan, which was already doing that job.

The deck footprint is **derived, not hardcoded**. `projectEquipmentCells` in
`Machine.ts` already projects colliders onto grid cells and deliberately skips
the deck slab; the same projection selecting the slab yields the walkable bare
deck. Hardcoding a cell range would be quietly wrong: the deck is 16 m long
against a 2 m grid whose Z origin does not divide it evenly, so one edge row
would be misclassified and nobody would notice until an enemy walked through
open air.

### 4.2 Edges

Two orthogonally adjacent walkable cells connect **unless the canonical edge
between them holds a navigation-blocking piece**.

This is a **new predicate, `blocksNavigation`, in `src/data/build-pieces.ts` —
not `boundsRoom`.** The two answer different questions and genuinely disagree:

| Piece | `boundsRoom` | `blocksNavigation` | Collider |
| --- | --- | --- | --- |
| `wall` | yes | **yes** | solid, full height |
| `doorway` | yes | **no** | jambs and a lintel, deliberately nothing across the opening |
| `railing` | no | **yes** | 2 m wide × 1.1 m tall solid box |

The railing row is why this cannot reuse `boundsRoom`. A railing is correctly
*not* room-bounding — a railed platform is fenced, not enclosed, and room
detection is right to say so. But its collider is a 1.1 m barrier against a
0.45 m autostep, so it is physically impassable. A graph that called it
walkable would route enemies into something they cannot cross and jam them
against it — precisely the wedging failure this whole feature exists to remove.

The predicate must therefore track **what the colliders actually do**, not what
the room model means. Each value is justified against `pieceColliders()` in
`BuildPieceGeometry.ts`, and any future piece has to be checked the same way.

The design consequence is a good one and worth keeping: a railing costs 5 scrap
and 25 kg against a wall's 12 scrap and 90 kg, so it becomes the cheap, light
way to close a route without building a room, at the price of giving no cover
and no enclosure.

### 4.3 Vertical links

Stairs are the only vertical link **in the graph**. It offers no jump, no drop,
and no path off an edge. Physics is unchanged and still applies — an enemy
shoved off a ledge falls as it always did — but nothing will ever *plan* a
route that way.

`stairsCells(cell, rotation)` already returns `base`, `run`, and `landing`, and
`BuildSystem` stores `'stairs'` in the run cell. Each staircase contributes two
links:

- `base` ↔ `run`, within level *y*
- `run` ↔ `landing`, crossing into level *y+1*

The consequence is a rule the player can actually learn: **if there is no
staircase to where you are standing, nothing can reach you there.** That is a
legible piece of tactical information rather than an emergent accident, and it
makes a stair-head a position worth defending.

### 4.4 Rebuild policy

The graph is rebuilt wholesale, never patched. The envelope is 9 × 12 × 3 =
324 cells, so a full rebuild is trivial next to the room re-detection that
already happens at the same call site in `BuildSystem`.

---

## 5. Pathing

`findPath(graph, from: Cell, to: Cell): Cell[]`

A* with a grid-distance heuristic plus a small constant per level change, so an
enemy on the player's floor prefers staying on it over a pointless stair
detour.

### 5.1 When the player cannot be reached

The player who seals themselves in completely is the case that decides whether
this feature is fun or broken. It needs **no separate system**.

When A* exhausts the open set without reaching the goal, the closed set *is*
every cell the enemy can reach. Take the reached cell whose world position is
closest to the player's, and return the path to that instead.

So an enemy that cannot get in walks to the inside face of the wall nearest the
player and holds there, still hunting. That is exactly the requested behaviour
— they follow and keep trying to kill you — and it costs one fallback branch
rather than a siege state machine.

A player who seals themselves in is therefore safe and also not playing: they
cannot reel salvage, use exterior stations, or collect anything. The design
does not need to punish that, because it already does not reward it.

### 5.2 Following

Each enemy holds a waypoint list and an index. It steers toward
`cellCenter(path[i])`, advancing when within a tolerance of that waypoint in
XZ. On the final waypoint it steers at the player directly, which is what hands
the last metre back to the existing probe fan and the attack state.

An enemy's level is derived from its world Y against `DECK_HEIGHT` and
`LEVEL_HEIGHT`; the same derivation locates the player.

### 5.3 Repath triggers

- the build grid changed
- the player's cell changed
- a catch-all timer expires (~0.5 s)

Staggered across enemies by index. Four enemies over 324 nodes is negligible
either way; staggering costs nothing and removes a whole class of frame-spike
question before it can be asked.

---

## 6. Components

### 6.1 `src/enemies/NavGraph.ts` (new)

Pure. `buildNavGraph(grid, deckCells)` and `findPath(graph, from, to)`. No
Three.js, no Rapier, no enemy types.

### 6.2 `src/machine/Machine.ts`

Expose `deckCells` beside the existing `equipmentCells`, from the same
projection.

### 6.3 `src/building/BuildSystem.ts`

Rebuild and expose the nav graph wherever room re-detection already runs.

### 6.4 `src/enemies/Enemy.ts`

Hold a path and index, follow waypoints, feed `steerAround()` the waypoint
heading instead of the player heading.

### 6.5 `src/enemies/EnemyManager.ts`, `src/game/Game.ts`

Pass the graph down; stagger repaths.

---

## 7. Persistence

Nothing new is saved. The graph is derived entirely from the build grid, which
is already persisted, so it rebuilds on load. Enemies are not persisted today
and that does not change.

---

## 8. Testing

### 8.1 Unit — `tests/unit/navgraph.test.ts`

- a straight path across bare deck
- a wall pushes the path around it
- adding a doorway to that wall restores the short route
- a railing blocks, and a cell fenced on all four sides by railings is
  unreachable — the case that would have been wrong under `boundsRoom`
- stairs link two levels, and a level is unreachable without them
- equipment cells are excluded
- a sealed room returns a path to the nearest reachable cell, never an empty
  path
- the same grid yields the same path (deterministic)

### 8.2 Browser — `tools/combat.mjs`

The checks that actually prove the feature:

- **Funnel.** Build a four-wall room with one doorway, put the player inside,
  spawn a scavenger outside. Assert it reaches the player, **and that its
  track passes through the doorway cell** — reaching the player is not proof
  it went the intended way.
- **Sealed.** Seal the doorway. Assert it ends up adjacent to the wall nearest
  the player and never gets inside.
- **Vertical.** Build stairs to level 1, stand on it. Assert the scavenger
  reaches the player. Remove the stairs, assert it does not.

Every check is verified to go **red before it goes green**. Improvement log 005
is the standing argument for this: a scavenger rendered at 0.06 m passed every
check that existed, because nothing asserted the thing that was actually wrong.

> **Amendment, post-implementation.** Writing this harness surfaced a
> pre-existing bug, not a navigation one: a kinematic capsule — enemy or
> player, reproduced under held WASD input as well as AI — cannot currently
> complete a crossing through a doorway opening or up a stairs run; it
> freezes dead mid-step or mid-climb. `maxSlopeClimbAngle` is ruled out for
> the stairs symptom (50° against the ramp's 36.87°); the
> `enableAutostep(..., 0.2, ...)` minimum-step-width parameter is a lead, not
> a conclusion. See improvement log 006.
>
> Because of that bug, "assert it reaches the player" inside a walled room and
> "assert it reaches level 1" cannot be honestly asserted right now — they
> would fail against correct navigation code exactly as they fail against
> broken code, for a reason navigation does not control. Both checks were
> **dropped from the shipped harness** rather than left permanently red. What
> the harness demonstrates instead, and does prove:
>
> - the scavenger's track passes through the doorway cell before it reaches
>   the near side of the room — i.e. it took the doorway, not the wall —
>   watched red before green;
> - a sealed room (no doorway) keeps the scavenger out and holds it hunting
>   rather than idle;
> - the nav graph itself links a stairs run to the landing above it, checked
>   directly against the graph rather than by observing a climb.
>
> Routing is proven. Arrival is not, until the character-controller bug is
> root-caused.

---

## 9. Deliberately Not In Scope

- **Destructible structure.** Walls are permanent. Per-piece health exists in
  `BuildSystem` and is saved, but nothing reduces it and nothing here will.
- **Siege behaviour.** No looting of exterior crates, no disabling stations.
  Unreachable enemies simply keep hunting.
- **Doors that open and close.** A doorway is an open gap.
- **Enemies breaching, vaulting, or climbing.** Stairs only.
- **Queue management at chokepoints.** See section 10.
- **The threat director, enemy vehicles, and boarding.** Separate work.

---

## 10. Known Risk

Four enemies funnelling through one 2 m doorway will bunch and shove. The probe
fan handles enemy-vs-enemy separation in the open; a queue at a chokepoint is
the classic place that breaks down.

This is deliberately left to be measured rather than pre-solved. Inventing a
queueing system before seeing the actual failure risks building the wrong fix
for a problem that may present as something else entirely — and the project has
a precedent for exactly that, in the three-whisker steering that was replaced
only once the wedging was measured at half of all scavengers.

---

## 11. Success Criteria

1. ~~A scavenger outside a walled room with one doorway reaches the player by
   going through the doorway, not by pressing into a wall.~~
   **Not currently demonstrable** — see the amendment below.
2. A scavenger cannot enter a room with no doorway, and does not give up — it
   holds against the nearest wall.
3. ~~A scavenger follows the player up a staircase to level 1 or 2, and cannot
   reach a level with no staircase.~~
   **Not currently demonstrable** — see the amendment below.
4. Local avoidance is not regressed: scavengers still cross the bare deck past
   the engine and cargo without wedging.
5. All existing suites pass unchanged.

> **Amendment, post-implementation.** Criteria 1 and 3 both describe
> *completing* a crossing — actually standing inside the room, actually
> standing on level 1 — and neither is demonstrable today, for a reason
> outside navigation's control: a pre-existing character-controller bug means
> no kinematic capsule can currently finish crossing a doorway opening or a
> stairs run (see 8.2's amendment and improvement log 006). Struck through
> rather than deleted, because they were the intended bar and still are once
> the controller bug is fixed.
>
> What **is** demonstrated in their place, watched red before green in
> `tools/combat.mjs`: a scavenger outside a walled room with one doorway
> routes to the doorway side of the wall and its track passes through the
> doorway cell, rather than pressing into the wall nearest the player. That is
> criterion 1 minus the last step — it proves A* and the doorway link are
> correct; it does not prove the enemy ever gets inside. Criterion 2 needed no
> amendment: holding outside a sealed room is unaffected by the controller
> bug, since nothing is meant to cross in that case. Criterion 3 has no
> partial substitute beyond what 4.3's unit coverage already proves (the graph
> links a stairs run to its landing); reaching the landing itself is the part
> that is blocked.
>
> Criteria 1 and 3 are not blocked equally. Criterion 1 (the doorway) is
> blocked only by the controller bug — once that is fixed, the doorway
> crossing should work. Criterion 3 (stairs) is blocked by the controller bug
> *and* by a second, independent problem: the landing waypoint shares its x
> and z with the stairs run cell it links from (4.3), so once an enemy holds
> that waypoint the steering target's XZ is its own XZ and `Enemy.ts`'s
> movement gate drives it with zero velocity — it parks at the foot of the
> ramp rather than climbing. Fixing the controller bug alone will not make
> stairs work; this second blocker needs its own fix (see improvement log
> 006).
