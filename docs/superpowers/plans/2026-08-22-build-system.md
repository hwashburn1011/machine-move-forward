# Grid Build System Implementation Plan (Milestone 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the player place, pay for, and demolish floors, walls, doorways, stairs, roofs, and railings on a 2m grid aboard the moving machine, and have the game detect which spaces are enclosed rooms.

**Architecture:** Floors occupy grid cells; walls occupy canonicalised edges between cells. Grid state, placement validation, and room flood fill are pure modules with no Three.js or Rapier dependency, so the logic that can actually be wrong is testable in node. A thin `BuildSystem` binds them to meshes, colliders, weight, and events.

**Tech Stack:** TypeScript, Three.js 0.185.1, @dimforge/rapier3d-compat 0.20.0, Vite 8.2.2, Vitest, Playwright.

## Global Constraints

- **No asset files.** Piece geometry is built in code. No models, textures, audio, or fonts.
- **The machine never moves.** Build pieces are children of the machine group at the world origin.
- **Machine structures are `fixed` Rapier colliders.** Never dynamic.
- **Definition and runtime instance stay separate types.** Piece stats live in `src/data/build-pieces.ts`.
- **No React, no Zustand, no audio.**
- **Grid envelope:** `x: -4..4`, `z: -6..5`, `y: 0..2`. `GRID_TILE = 2`, level height `3`.
- **Existing deck occupies** `x: -2..2, z: -4..3` at level 0.
- **Materials that inject shader code must pass a distinct `cacheTag` to `applyHeightFog`.** Three's default `customProgramCacheKey()` returns `onBeforeCompile.toString()`, identical across every fog-wrapped material; colliding keys make materials silently share one compiled program.
- All existing tests must continue to pass: 161 unit, 9 e2e, 21 live harness checks.

## Plan Format Note

Executed inline by the session that wrote it, as with the foundation plan.
Tasks specify exact files, interfaces, verification commands, and observable
criteria. Inline code is reserved for non-obvious approaches. Test code IS
given in full for TDD tasks, because the test defines the contract.

---

## File Structure

```
src/building/
  BuildGrid.ts            Cell/edge occupancy, canonical keys, queries. Pure.
  BuildValidation.ts      Placement rules, typed rejection reasons. Pure.
  RoomDetector.ts         Flood fill + enclosure test. Pure.
  BuildPieceGeometry.ts   Code-built geometry per piece type.
  BuildSystem.ts          Orchestration: place/demolish, meshes, colliders, weight.
  BuildPreview.ts         Targeting raycast + ghost mesh.

src/data/build-pieces.ts  Definitions. Data only.
src/progression/Resources.ts  Scrap counter.
src/ui/BuildUI.ts         Build-mode HUD panel.

Modified:
  src/game/constants.ts   Grid envelope + level height constants
  src/core/events/GameEvents.ts  build:* and resources:* events
  src/core/input/InputManager.ts 'demolish' action (RMB in build mode)
  src/machine/Machine.ts  Expose equipment cells for the blocked set
  src/game/Game.ts        Own BuildSystem, route build-mode input
  src/save/SaveSchema.ts  Type machine.structures
  src/ui/hud.css          Build panel styles

tests/unit/buildgrid.test.ts
tests/unit/buildvalidation.test.ts
tests/unit/roomdetector.test.ts
tests/unit/resources.test.ts
tools/build.mjs           Live build harness
```

---

## Task 1: Grid Constants and Cell/Edge Addressing

The canonicalisation here is the single most important thing in the milestone.
Get it wrong and two walls can occupy one space while room detection sees a
boundary that flickers in and out of existence.

**Files:**
- Modify: `src/game/constants.ts`
- Create: `src/building/BuildGrid.ts`
- Test: `tests/unit/buildgrid.test.ts`

**Interfaces:**
- Consumes: `GRID_TILE` from `@/game/constants`
- Produces:
  - Constants `GRID_MIN_X = -4`, `GRID_MAX_X = 4`, `GRID_MIN_Z = -6`, `GRID_MAX_Z = 5`, `GRID_LEVELS = 3`, `LEVEL_HEIGHT = 3`
  - `type Axis = 'x' | 'z'`
  - `interface Cell { x: number; y: number; z: number }`
  - `interface Edge { x: number; y: number; z: number; axis: Axis }`
  - `cellKey(c: Cell): string` — `"x,y,z"`
  - `edgeKey(e: Edge): string` — `"x,y,z,axis"`
  - `canonicalEdge(cell: Cell, side: 'north'|'south'|'east'|'west'): Edge`
  - `edgeBetween(a: Cell, b: Cell): Edge | null` — null if not orthogonally adjacent
  - `cellsOfEdge(e: Edge): [Cell, Cell]`
  - `inEnvelope(c: Cell): boolean`
  - `cellCenter(c: Cell): { x: number; y: number; z: number }` — world metres, y is the FLOOR plane of that level
  - `class BuildGrid` with `setCell/getCell/clearCell`, `setEdge/getEdge/clearEdge`, `blockCell`, `isBlocked`, `cellEntries()`, `edgeEntries()`, `clear()`

`BuildGrid` stores `unknown`-typed payloads (the instance ids); it does not
know what a piece is. That keeps it a pure spatial index.

- [ ] **Step 1: Write the failing test**

`tests/unit/buildgrid.test.ts` covering:

- `cellKey` and `edgeKey` are stable and distinct for distinct inputs
- **`canonicalEdge` collapses both approaches to one key**: the `west` side of
  `(3,0,1)` and the `east` side of `(2,0,1)` produce the same `edgeKey`; the
  `north` side of `(0,0,2)` and the `south` side of `(0,0,1)` likewise
- `edgeBetween` returns the same edge regardless of argument order, and `null`
  for diagonal or non-adjacent or same cells
- `cellsOfEdge` round-trips: for any edge, both returned cells produce that
  edge via `edgeBetween`
- `inEnvelope` accepts the corners `(-4,0,-6)` and `(4,2,5)` and rejects
  `(-5,0,0)`, `(5,0,0)`, `(0,0,-7)`, `(0,0,6)`, `(0,-1,0)`, `(0,3,0)`
- `cellCenter` maps `(0,0,0)` to the deck plane and steps by `LEVEL_HEIGHT`
  per level and `GRID_TILE` per cell
- Grid set/get/clear for cells and edges, including that clearing one does not
  disturb a neighbour
- `blockCell`/`isBlocked` independent of occupancy
- `cellEntries()` and `edgeEntries()` return everything set and nothing cleared

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/buildgrid.test.ts`
Expected: FAIL — cannot resolve `@/building/BuildGrid`.

- [ ] **Step 3: Implement**

Canonicalisation rule, stated once and obeyed everywhere:

```ts
// An edge is always addressed from the cell on its -X or -Z side.
export function canonicalEdge(cell: Cell, side: Side): Edge {
  switch (side) {
    case 'east':  return { x: cell.x,     y: cell.y, z: cell.z,     axis: 'x' };
    case 'west':  return { x: cell.x - 1, y: cell.y, z: cell.z,     axis: 'x' };
    case 'south': return { x: cell.x,     y: cell.y, z: cell.z,     axis: 'z' };
    case 'north': return { x: cell.x,     y: cell.y, z: cell.z - 1, axis: 'z' };
  }
}
```

`cellCenter` places level `y` floor plane at `DECK_HEIGHT + y * LEVEL_HEIGHT`
so level 0 sits exactly on the existing deck surface.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/buildgrid.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/constants.ts src/building/BuildGrid.ts tests/unit/buildgrid.test.ts
git commit -m "feat: add build grid with canonical cell and edge addressing"
```

---

## Task 2: Piece Definitions and Resources

**Files:**
- Create: `src/data/build-pieces.ts`, `src/progression/Resources.ts`
- Modify: `src/core/events/GameEvents.ts`
- Test: `tests/unit/resources.test.ts`

**Interfaces:**
- Consumes: `EventBus`
- Produces:
  - `type PieceId = 'floor' | 'wall' | 'doorway' | 'railing' | 'roof' | 'stairs'`
  - `type PieceAnchor = 'cell' | 'edge' | 'double-cell'`
  - `interface BuildPieceDefinition { id: PieceId; name: string; anchor: PieceAnchor; cost: number; weight: number; maxHealth: number; armor: number; boundsRoom: boolean; rotatable: boolean }`
  - `BUILD_PIECES: Record<PieceId, BuildPieceDefinition>`
  - `BUILD_PIECE_ORDER: readonly PieceId[]` — the `1`–`6` selection order
  - `REFUND_FRACTION = 0.6`
  - `class Resources { constructor(bus, startingScrap?); get scrap(): number; canAfford(n): boolean; spend(n): boolean; grant(n): void; refund(n): number; reset(n?): void }`

Exact values from spec section 4: floor 8/120, wall 12/90, doorway 20/110,
railing 5/25, roof 10/80, stairs 18/160 (cost/weight). `maxHealth` 120 for
floor/roof, 150 wall/doorway, 60 railing, 140 stairs; `armor` 2 except railing 0.
New events: `build:placed`, `build:removed`, `build:rooms-changed`,
`resources:changed`.

- [ ] **Step 1: Write the failing test**

`tests/unit/resources.test.ts` covering: starts at the given amount;
`canAfford` boundary is inclusive at exactly the balance; `spend` deducts and
returns true; `spend` refuses and leaves the balance untouched when short;
`spend(0)` succeeds; negative spend is rejected rather than granting scrap;
`grant` adds; `refund` adds `floor(cost * 0.6)` and returns the amount added;
`refund` of 12 yields 7 (proves flooring, not rounding); every mutation emits
`resources:changed` with the new total; a refused spend emits nothing;
`reset` restores the starting amount.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/resources.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement both files**

`Resources` guards against negative arguments explicitly — a `spend(-50)` that
silently credits the player is the kind of bug that only shows up once someone
wires a UI to it.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/resources.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/build-pieces.ts src/progression/Resources.ts src/core/events/GameEvents.ts tests/unit/resources.test.ts
git commit -m "feat: add build piece definitions and scrap resource counter"
```

---

## Task 3: Placement Validation

Pure rules, typed rejection reasons. The reasons are not decoration — the build
HUD shows them, so a vague reason becomes a vague UI.

**Files:**
- Create: `src/building/BuildValidation.ts`
- Test: `tests/unit/buildvalidation.test.ts`

**Interfaces:**
- Consumes: `BuildGrid`, `Cell`, `Edge`, `BUILD_PIECES`
- Produces:
  - `type RejectReason = 'out-of-bounds' | 'occupied' | 'blocked' | 'needs-support' | 'needs-floor' | 'needs-clearance' | 'cannot-afford'`
  - `interface Validation { ok: boolean; reason?: RejectReason }`
  - `interface Placement { piece: PieceId; cell: Cell; edge?: Edge; rotation: number }`
  - `validatePlacement(grid: BuildGrid, p: Placement, scrap: number): Validation`
  - `stairsCells(cell: Cell, rotation: number): { base: Cell; run: Cell; landing: Cell }`
  - `REASON_TEXT: Record<RejectReason, string>` — human strings for the HUD

Rotation is `0..3`, mapping to `-Z, +X, +Z, -X`.

- [ ] **Step 1: Write the failing test**

`tests/unit/buildvalidation.test.ts` covering every rule and every reason:

- Out of envelope in each of the six directions → `out-of-bounds`
- Cell already holding a floor → `occupied`; edge already holding a wall → `occupied`
- Blocked equipment cell → `blocked`
- Insufficient scrap → `cannot-afford`, checked even when everything else is valid
- Floor at level 0 anywhere in the envelope → ok
- Floor at level 1 with nothing below → `needs-support`
- Floor at level 1 with a wall on the level below touching one of its edges → ok
- Floor at level 1 orthogonally adjacent to an existing level-1 floor → ok
- Floor at level 1 *diagonally* adjacent to a level-1 floor → `needs-support`
  (diagonals must not count, or structures grow in unsupported checkerboards)
- Wall / doorway / railing with a floor on either one of the two cells → ok
- Wall with a floor on neither cell → `needs-floor`
- Roof with a floor in the same cell → ok; without → `needs-floor`
- Stairs with a floor in the base cell, free run cell, free landing → ok
- Stairs with the run cell occupied → `needs-clearance`
- Stairs with the landing cell occupied → `needs-clearance`
- Stairs with no floor in the base cell → `needs-floor`
- `stairsCells` returns the correct run and landing cells for all four rotations
- Validation never mutates the grid (assert the grid's entry counts are
  unchanged after a batch of failing and succeeding validations)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/buildvalidation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Order the checks so the most specific reason wins: bounds, then occupancy, then
blocked, then support, then affordability. Affordability last means the player
sees "needs support" rather than "cannot afford" when the spot was never legal.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/buildvalidation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/building/BuildValidation.ts tests/unit/buildvalidation.test.ts
git commit -m "feat: add build placement validation with typed rejection reasons"
```

---

## Task 4: Room Detection

The acceptance criterion for the whole milestone lives here.

**Files:**
- Create: `src/building/RoomDetector.ts`
- Test: `tests/unit/roomdetector.test.ts`

**Interfaces:**
- Consumes: `BuildGrid`, `Cell`, `Edge`, `BUILD_PIECES`
- Produces:
  - `interface Room { id: number; level: number; cells: Cell[]; interiorVolume: number; enclosed: boolean; boundaryEdges: Edge[]; doorways: Edge[] }`
  - `interface RoomGraph { rooms: Room[]; byCell: Map<string, number>; links: { doorway: Edge; rooms: [number, number] }[] }`
  - `detectRooms(grid: BuildGrid): RoomGraph`

`interiorVolume` is `cells.length * GRID_TILE * GRID_TILE * LEVEL_HEIGHT`.

- [ ] **Step 1: Write the failing test**

`tests/unit/roomdetector.test.ts`. Build grids by hand and assert:

- Empty grid → no rooms
- A single floor tile with no walls → one room, `enclosed: false`
- A 2×2 floor fully walled with a roof over every cell → one room,
  `enclosed: true`, `interiorVolume` = 4 × 2 × 2 × 3 = 48
- Same but with one wall missing → `enclosed: false`
- Same but with one roof tile missing → `enclosed: false`
- Same but roofed by floors on the level above instead of roof pieces →
  `enclosed: true` (a second storey is a valid ceiling)
- A 4×2 floor split down the middle by a wall → **two** rooms
- The same split by a doorway instead → two rooms, and `links` contains one
  entry naming both room ids
- Railings on a boundary do **not** split a room and do **not** count toward
  enclosure (a railed, roofed platform is still not enclosed)
- Removing a wall from an enclosed room and re-running → that room is no longer
  enclosed (the breach case Milestone 9 depends on)
- Two separate structures at the same level → two rooms with distinct ids
- Rooms at different levels never merge, even directly stacked
- `byCell` maps every floored cell to its room id and nothing else
- Detection is deterministic: two runs over the same grid give identical ids
- Detection does not mutate the grid

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/roomdetector.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Flood fill per level over floored cells. Two adjacent cells connect only when
the edge between them carries neither a wall nor a doorway — that is,
`piece.boundsRoom` is false or absent. Railings have `boundsRoom: false`, which
is what keeps them out of the topology.

Enclosure runs after the fill, per room:

```
for each cell in room:
  for each of 4 sides:
    neighbour = cell + side
    if neighbour is in this room: continue      // interior edge
    // boundary: needs a room-bounding piece
    if edge has no wall and no doorway: return not enclosed
  if no roof at cell and no floor at (cell.x, cell.y+1, cell.z): return not enclosed
```

Assign room ids by iterating cells in sorted key order, so ids are stable
across runs rather than depending on Map insertion order.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/roomdetector.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/building/RoomDetector.ts tests/unit/roomdetector.test.ts
git commit -m "feat: add room flood fill with enclosure and doorway connectivity"
```

---

## Task 5: Piece Geometry

**Files:**
- Create: `src/building/BuildPieceGeometry.ts`
- Modify: `src/art/Materials.ts` (add a `buildPlate` material)

**Interfaces:**
- Consumes: `bevelledBox` from `@/machine/MachineGeometry`, `Materials`
- Produces:
  - `buildPieceGeometry(piece: PieceId): THREE.BufferGeometry` — origin-centred, ready to be positioned
  - `pieceMaterial(piece: PieceId, materials: Materials): THREE.Material`
  - `pieceColliders(piece: PieceId): { half: THREE.Vector3; offset: THREE.Vector3; rotX?: number }[]`

All geometry reuses `bevelledBox`, which is what makes player-built structures
match the machine's manufactured look rather than reading as programmer boxes.

- [ ] **Step 1: Implement the geometry**

- **floor** — a 2×0.16×2 bevelled plate, one collider.
- **roof** — a 2×0.14×2 plate, slightly inset, one collider.
- **wall** — 2×3×0.16 bevelled panel with a subtle inset centre panel so it is
  not a flat slab. One collider.
- **doorway** — the same footprint as a wall, built as two 0.45-wide jambs plus
  a lintel above a 2.1m-high opening. **Two colliders, one per jamb, and none
  across the opening** — the gap must be genuinely walkable.
- **railing** — a top rail plus four uprights, 1.05m tall, thin. One low collider.
- **stairs** — twelve visible steps rising `LEVEL_HEIGHT` over two tiles, plus
  **one ramp collider**: a box rotated about X to match the 36.9° slope.
  Stepped colliders make the kinematic controller judder and catch.

Add a `buildPlate` material to `Materials` — lighter than the machine's deck so
player additions are visually distinguishable from the original hull. It must
pass a distinct `cacheTag` to `applyHeightFog` (`'mmf-build-plate'`).

- [ ] **Step 2: Visual verification**

Add a temporary debug placement of one of each piece and screenshot.

Run: `node tools/shoot.mjs <out>.png 6000 "?nolock=1&cam=far"`
Expected: all six pieces render with bevel highlights, the doorway has a clear
walkable opening, stairs read as steps, and railings read as thin detail.

- [ ] **Step 3: Commit**

```bash
git add src/building/BuildPieceGeometry.ts src/art/Materials.ts
git commit -m "feat: add code-built geometry for the six build pieces"
```

---

## Task 6: BuildSystem — Placement, Demolition, Colliders, Weight

**Files:**
- Create: `src/building/BuildSystem.ts`
- Modify: `src/machine/Machine.ts` (expose equipment cells), `src/save/SaveSchema.ts` (type `structures`)

**Interfaces:**
- Consumes: everything above, `PhysicsWorld`, `EventBus`, `Machine`
- Produces:
  - `interface BuildPieceInstance { instanceId: string; definitionId: PieceId; cell: Cell; edge?: Edge; rotation: number; health: number }`
  - `class BuildSystem { readonly group: THREE.Group; get rooms(): RoomGraph; get pieceCount(): number; get totalWeight(): number; canPlace(p: Placement): Validation; place(p: Placement): BuildPieceInstance | null; demolishAt(p: Placement): number; serialise(): BuildPieceInstance[]; restore(pieces: BuildPieceInstance[]): void; clear(): void }`
  - `Machine.equipmentCells: Cell[]` — derived by projecting existing equipment colliders onto the grid

- [ ] **Step 1: Implement equipment cell projection on `Machine`**

Walk the collider list already built in `MachineGeometry`, project each box's
XZ footprint onto grid cells at level 0, and return the covered set. Derived,
never hardcoded — a hardcoded list rots the moment the machine layout changes.

- [ ] **Step 2: Implement `BuildSystem`**

`place()` validates, spends scrap, creates the mesh, adds fixed colliders,
records the instance, adds weight to `machine.movement.totalWeight`, recomputes
rooms, and emits `build:placed` then `build:rooms-changed`.

`demolishAt()` finds the instance, then **cascades**: removing a floor also
removes the roof in that cell and any edge piece left with a floor on neither
side. Each removal refunds 60%. Returns the total refunded. Emits
`build:removed` per piece and one `build:rooms-changed` at the end.

Rooms are recomputed once per operation, after the cascade completes — not per
removed piece.

`restore()` clears, then replays each stored instance through the same
placement path used at runtime, with cost checking bypassed. Replaying through
the same path means a save can never contain a structure the live rules would
reject.

- [ ] **Step 3: Type the save field**

`SaveGameV1.machine.structures` becomes `BuildPieceInstance[]`. No migration:
the field was reserved as an array in v1 precisely so this would not need one.
Verify by loading a save written before this task — it must still load.

- [ ] **Step 4: Verification**

Run: `npx vitest run` — all existing tests still pass.
Run: `npm run build` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/building/BuildSystem.ts src/machine/Machine.ts src/save/SaveSchema.ts
git commit -m "feat: add build system with placement, cascade demolition, and weight"
```

---

## Task 7: Targeting, Ghost Preview, and Build Mode Input

**Files:**
- Create: `src/building/BuildPreview.ts`
- Modify: `src/core/input/InputManager.ts`, `src/game/Game.ts`

**Interfaces:**
- Consumes: `BuildSystem`, `PhysicsWorld`, `PlayerCamera`, `InputManager`
- Produces:
  - `class BuildPreview { readonly mesh: THREE.Mesh; get placement(): Placement | null; get validation(): Validation; update(camera, physics, grid, level, piece, rotation, scrap): void; setVisible(b): void; dispose(): void }`
  - `InputAction` gains `'demolish'`
  - `Game` gains `buildMode: boolean`, `selectedPiece: PieceId`, `buildLevel: number`, `buildRotation: number`

- [ ] **Step 1: Add the `demolish` action**

RMB currently maps to `aim`. In build mode it must mean demolish. Map RMB to
both actions and let the consumer pick by mode, rather than rebinding at
runtime — rebinding leaves a stuck `aim` if the mode flips mid-press.

- [ ] **Step 2: Implement targeting**

Raycast from the camera through the crosshair, max 9m, excluding the player
collider. Convert the hit point to a cell. For edge pieces, pick the nearest of
the hit cell's four edges by comparing the hit point against the cell centre.
When the ray hits nothing, fall back to a point 5m along the ray so the player
can still place floors out over empty space at the deck edge.

- [ ] **Step 3: Implement the ghost**

Reuse `buildPieceGeometry` with a translucent unlit material — green
`0x5ad86a` when valid, red `0xd6483b` when not. `depthTest: false` so the ghost
is never buried inside existing geometry, and `depthWrite: false`.

- [ ] **Step 4: Wire build mode into `Game`**

`B` toggles. In build mode: suppress `PlayerCombat.fixedUpdate` entirely (no
firing while building), run the preview, LMB places, RMB demolishes, `1`–`6`
select, wheel changes level, `Q`/`E` rotate. Build level follows the player's
current level unless the wheel has overridden it this session.

- [ ] **Step 5: Verification**

Run: `npm run dev`, press `B`.
Expected: ghost appears at the crosshair, tracks smoothly, turns red over
blocked equipment cells and off the envelope, and green on open deck. LMB
places a real piece. RMB removes it. Firing does nothing in build mode.

- [ ] **Step 6: Commit**

```bash
git add src/building/BuildPreview.ts src/core/input/InputManager.ts src/game/Game.ts
git commit -m "feat: add build targeting, ghost preview, and build mode input"
```

---

## Task 8: Build HUD

**Files:**
- Create: `src/ui/BuildUI.ts`
- Modify: `src/ui/hud.css`, `src/game/Game.ts`

**Interfaces:**
- Consumes: `EventBus`, `BUILD_PIECES`, `REASON_TEXT`
- Produces: `class BuildUI { constructor(root, bus); setVisible(b): void; update(state: BuildUIState): void; dispose(): void }`
  with `interface BuildUIState { piece: PieceId; level: number; rotation: number; scrap: number; validation: Validation; roomCount: number; enclosedCount: number }`

- [ ] **Step 1: Implement the panel**

Bottom-centre, visible only in build mode: the six pieces as a numbered row
with the selected one highlighted, its scrap cost, current scrap, target level,
and — when placement is invalid — the reason text in the danger colour. A small
room readout (`rooms: 2 · enclosed: 1`) so the player gets feedback that the
game recognised what they built. Same amber-on-dark treatment as the main HUD,
same cached-write discipline.

- [ ] **Step 2: Verification**

Run: `npm run dev`, press `B`, cycle pieces and levels.
Expected: selection highlight tracks `1`–`6`, cost and scrap update, invalid
placements show a readable reason, room counts update as rooms are completed.

- [ ] **Step 3: Commit**

```bash
git add src/ui/BuildUI.ts src/ui/hud.css src/game/Game.ts
git commit -m "feat: add build mode HUD panel"
```

---

## Task 9: Save/Load, Live Harness, and Acceptance

**Files:**
- Create: `tools/build.mjs`
- Modify: `src/game/Game.ts` (serialise/restore structures), `tests/e2e/smoke.spec.ts`
- Test: extend `tests/unit/buildgrid.test.ts` with a round-trip case

**Interfaces:**
- Consumes: everything above
- Produces: `Game.buildSave()` includes `machine.structures`; `Game.loadFrom()` restores them

- [ ] **Step 1: Wire persistence**

`buildSave()` calls `buildSystem.serialise()`. `loadFrom()` calls
`buildSystem.restore()` before recomputing anything else, so rooms and weight
are correct by the time the rest of the load runs.

- [ ] **Step 2: Write the live harness**

`tools/build.mjs`, following the established pattern — waits on **simulated**
time, never wall time, because the headless renderer runs at a few FPS and the
step clamp deliberately lets simulated time lag.

It drives the real game to assert:
- Entering build mode shows the ghost and suppresses firing
- Placing a floor deducts exactly 8 scrap
- An invalid placement is refused and costs nothing
- Building a 2×2 walled and roofed room reports 1 room, enclosed
- Extending to two rooms joined by a doorway reports 2 rooms, both enclosed,
  with one doorway link
- Removing a wall makes the affected room report not enclosed
- A wall physically blocks the player; a doorway lets them through
- Stairs carry the player from level 0 to level 1
- Demolishing refunds 60%
- Machine speed drops measurably after ~30 pieces are placed
- Save, reload, and the structure and room counts come back identical

- [ ] **Step 3: Extend the e2e suite**

Add one Playwright case: enter build mode, place a floor, save, reload, and
assert the piece count survives.

- [ ] **Step 4: Full verification**

```bash
npm run lint
npm run build
npm test
npm run test:e2e
node tools/drive.mjs
node tools/combat.mjs
node tools/build.mjs
```

All must pass. `drive` and `combat` must still be 9/9 and 12/12 — the build
system must not have disturbed movement or shooting.

- [ ] **Step 5: Manual acceptance against spec section 13**

Walk all nine success criteria and confirm each, including a screenshot of a
finished two-room structure.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: persist built structures and add live build harness"
```

---

## Self-Review Notes

**Spec coverage.** Section 3 grid → Task 1; 3.3 blocked cells → Task 6 step 1;
section 4 pieces → Tasks 2 and 5; section 5 placement rules → Task 3;
section 5 demolition cascade → Task 6; section 6 rooms → Task 4; section 7
resources → Task 2, weight → Task 6; section 8 controls → Task 7; section 9
architecture → all; section 10 persistence → Task 9; section 11 testing →
Tasks 1–4 unit, Task 9 harness; section 13 success criteria → Task 9 step 5.

**Deferred-scope check.** No task implements half-wall, window wall, ladder,
support, platform extension, room labelling, inventory, storage, crafting, or
enemy pathing changes. Confirmed against spec sections 4, 6, and 12.

**Type consistency.** `Cell` and `Edge` have one definition, in `BuildGrid`.
`Placement` is defined in `BuildValidation` and used unchanged by
`BuildPreview` and `BuildSystem`. `PieceId` is defined in `src/data/build-pieces.ts`
and imported everywhere. `Validation` is returned by both `validatePlacement`
and `BuildSystem.canPlace` with the same shape.

**Known risk.** Task 4's enclosure test is the most likely place for a subtle
bug, because "boundary edge" has to include edges facing the void, not just
edges facing another floored cell. Its test list covers that case explicitly.
