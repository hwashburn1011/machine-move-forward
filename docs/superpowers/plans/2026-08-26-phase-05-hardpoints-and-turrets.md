# Phase 5: Hardpoints & Turrets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** The machine fights back — light hardpoints on the build grid, one
manual turret the player crews, one automated turret that picks its own
targets, both drawing power.

**Architecture:** Hardpoints and turrets are build pieces, not a parallel
placement system — they ride the existing `BuildSystem` for cost, weight,
validation, cascade demolition, save/restore, and (from Phase 1) damage. The
turret's decision-making is a pure state machine (`TurretBrain`) that runs in
node with no Three.js or Rapier, mirroring `stepEnemyAI`; the entity layer
around it does raycasts and rendering. Power is consumed through the Phase 3
power API.

**Tech Stack:** TypeScript, Three.js 0.185, Rapier 0.20, Vitest (node, no
DOM), Playwright browser harnesses in `tools/`.

**Spec:** `docs/superpowers/specs/2026-08-26-roadmap-to-1.0.md` (Act II,
Phase 5); handoff §17 (hardpoints), §21 (machine weapon system).

**Status:** PROVISIONAL — final design pass required before execution (per
roadmap §7). Written before Phases 1 and 3 landed; re-verify every interface
consumed from them.

**Depends on:** Phase 1 (Damageable union, `BuildSystem.damagePiece`),
Phase 3 (power grid).

## Global Constraints

- Every task ends green: `npx tsc --noEmit && npx vitest run && npx eslint
  src tests`.
- Pure where it can be: targeting, traverse limits, and fire discipline take
  plain numbers and return plain numbers. No Three.js and no Rapier in
  `src/data/` or `TurretBrain`.
- Stats live in `src/data/`, definitions separated from runtime instances.
- Fixed 60Hz sim; turret behaviour must be deterministic given the same
  enemy positions (no `Math.random()` in the brain — seeded RNG only, and
  only if spread needs it).
- Grid tile is 2m; deck is `x ∈ [-5, 5]`, `z ∈ [-8, 8]`, deck plane at
  `DECK_HEIGHT = 3.6`.
- Commit style: narrative subjects (`feat: the machine grows a gun`).
- Art: free open-source web assets, CC0 preferred, recorded in `ASSETS.md`;
  procedural fallback mandatory (harnesses boot with `?nomodel=1`).

## Design Decisions

1. **Turrets are build pieces.** `workbench` and `refinery` already prove
   the pattern: a station-like piece with placement rules, cost, weight and
   a collider. A turret follows it, so Phase 1's `damagePiece` makes turrets
   destroyable for free and the save schema needs no new table — instance
   `state` carries turret runtime (heat, ammo mode, target filter).
2. **The hardpoint is a piece too** (`hardpoint`, LIGHT class only this
   phase). It mounts on a floor/deck cell like a station; a turret may only
   be placed on a cell occupied by a hardpoint. This is one new
   `BuildValidation` rule, not a new system. MEDIUM/HEAVY classes are data
   headroom, deferred to Phase 8.
3. **One brain, two turrets.** `TurretBrain` implements the handoff §21
   states — `idle → tracking → firing → cooldown`, plus `disabled`
   (unpowered) and `destroyed`. The manual turret bypasses the brain's
   target selection but shares traverse limits and the weapon stats.
4. **Manual turret is an `Interactable`.** `kind: 'turret'` joins the union
   widened in Phase 1 (`'crate' | 'workbench' | 'refinery' | 'repair'`).
   `E` enters, camera locks to the turret pivot, LMB fires, `E`/`Esc`
   exits. The player's own weapon is holstered while crewing.
5. **Auto turret target selection is pure.** It is handed an array of
   `{ id, position, kind }` candidates plus the turret's own pose and
   returns a target id or null; the entity layer does the one LOS raycast
   for the chosen candidate only (raycasting every candidate every tick is
   the obvious perf trap).
6. **Power gates firing, not existence.** An unpowered turret parks at
   `disabled` and shows it (drooped barrel); it never fires. Manual turret
   also requires power — a crank-operated exception is not worth its UI.

## Open Questions (with recommended defaults)

- **Does the manual turret share ammo with the player's reserve?**
  Default: no — turrets consume no ammo item this phase (`INFINITE_AMMO`
  is still on for the player too). Ammo economy for turrets arrives with
  Phase 8's loot pressure.
- **Traverse limits per mount?** Default: 360° yaw, pitch −10°..+35°, with
  a no-fire cone toward the machine's own superstructure computed from the
  build grid at placement time. If that cone proves fiddly, ship with a
  fixed forward-biased 270° arc and revisit.
- **Auto turret filter UI?** Default: cycle on interact —
  `all → infantry-only → off` — shown on the HUD. A full priority panel is
  Phase 8 material.

## Phase 3 power API this phase consumes (verify before execution)

Phase 3's plan defines `MachinePower` (`src/machine/MachinePower.ts`) with
priority *classes* shed lowest-first (`light < station < defense`); the
defense class is created there precisely so turrets slot in without
reshaping the model:

```ts
machinePower.registerConsumer({ id, draw, priority: 'defense' }): void
machinePower.unregisterConsumer(id: string): void
machinePower.isPowered(id: string): boolean   // after shedding
```

Draws: manual turret 3, auto turret 5 (handoff §13 pricing scale).

## Asset Needs

| Asset | Candidate source | Licence rule | Fallback |
| --- | --- | --- | --- |
| Turret model (base + yaw head + barrel) | Kenney (via poly.pizza), Quaternius weapon/sci-fi packs | CC0 only, recorded in `ASSETS.md`; reject anything that reads as bright plastic (see the Blaster Kit rejection there) | Procedural: `bevelledBox` base + cylinder barrel from the machine's own material set — likely the SHIPPING look, since the model must split at the yaw/pitch pivots and found models rarely do |
| Hardpoint ring/plate | none needed | — | Procedural flat octagonal plate, `Materials.deckPlate` |
| Turret fire/servo sounds | none — repo rule is synthesis | — | New `SoundBank` recipes: `turret-fire`, `turret-servo`, `turret-dry` |

Note: a turret needs articulated yaw/pitch nodes. Prefer building it
procedurally like the hook (`HookModel`) and treating a found model as a
later skin.

## File Structure

**Create:**
- `src/data/turrets.ts` — turret + hardpoint stats. Data only.
- `src/machine/TurretBrain.ts` — pure state machine + target selection.
- `src/machine/Turret.ts` — entity: pose, raycast fire, visual, power.
- `src/machine/TurretManager.ts` — owns instances, syncs with BuildSystem
  placements, ticks brains.
- `src/machine/TurretModel.ts` — procedural model with named pivots.
- Tests: `tests/unit/turrets.test.ts`, `tests/unit/turretbrain.test.ts`,
  `tests/unit/turrettargeting.test.ts`.

**Modify:**
- `src/data/build-pieces.ts` — `hardpoint`, `turret-manual`, `turret-auto`
  pieces; extend `PieceId`.
- `src/building/BuildValidation.ts` — turret-requires-hardpoint rule;
  hardpoint-requires-floor rule.
- `src/interaction/InteractionSystem.ts` — `kind: 'turret'`.
- `src/player/PlayerCamera.ts` — crewed-turret camera mode.
- `src/core/events/GameEvents.ts` — `turret:fired`, `turret:target-acquired`,
  `turret:entered`, `turret:exited`.
- `src/audio/SoundBank.ts`, `src/audio/GameSounds.ts` — turret voices.
- `src/game/Game.ts` — wiring; `src/ui/HUD.ts` — crewed reticle + filter
  readout.

## Tasks

### Task 1: Turret and hardpoint data

**Files:**
- Create: `src/data/turrets.ts`
- Modify: `src/data/build-pieces.ts`
- Test: `tests/unit/turrets.test.ts`

**Interfaces:**
- Consumes: `BuildPieceDefinition`, `ItemCost`.
- Produces: `type TurretId = 'turret-manual' | 'turret-auto'`;
  `interface TurretDefinition { id; name; damage; fireRate; range; spread;
  traverse: { yawDeg; pitchMinDeg; pitchMaxDeg }; powerDraw; trackingSpeed;
  pieceId: PieceId }`; `const TURRETS: Record<TurretId, TurretDefinition>`;
  `type HardpointClass = 'light'` (widened later);
  new `PieceId` members `'hardpoint' | 'turret-manual' | 'turret-auto'`.

- [ ] Write failing tests: every turret has positive damage/range/draw; the
      auto turret's range exceeds every enemy `attackRange` in
      `ENEMIES` (a turret outranged by a melee scavenger is a decoration);
      each turret's `pieceId` exists in `BUILD_PIECES`; hardpoint and
      turrets carry weight > 0 (weight is the machine-speed tradeoff).
- [ ] Add the three pieces to `BUILD_PIECES` with cost/weight/maxHealth/
      armor; add `TURRETS`.
- [ ] Full suite green, commit
      (`feat: the machine has somewhere to bolt a gun`).

### Task 2: Placement rules

**Files:**
- Modify: `src/building/BuildValidation.ts`, `src/building/BuildSystem.ts`
- Test: `tests/unit/buildvalidation.test.ts` (extend)

**Interfaces:**
- Consumes: existing validation context (grid occupancy per cell/level).
- Produces: validation reasons `'needs-hardpoint'` and
  `'hardpoint-occupied'`; hardpoints placeable only on floor/deck cells;
  turret placeable only on a hardpoint cell; demolishing a hardpoint
  cascades its turret (existing cascade path, verify it).

- [ ] Extend the validation table tests: hardpoint on bare deck OK, on
      floor OK, floating rejected; turret without hardpoint rejected;
      second turret on one hardpoint rejected; demolish hardpoint removes
      turret and refunds both at 60%.
- [ ] Implement rules following the existing rule style in
      `BuildValidation`.
- [ ] Extend `tools/build.mjs` with a hardpoint→turret place/demolish
      check.
- [ ] Full suite + `node tools/build.mjs` green, commit.

### Task 3: TurretBrain — the pure state machine

**Files:**
- Create: `src/machine/TurretBrain.ts`
- Test: `tests/unit/turretbrain.test.ts`

**Interfaces:**
- Consumes: `TurretDefinition` (Task 1).
- Produces: `type TurretState = 'idle' | 'tracking' | 'firing' | 'cooldown'
  | 'disabled' | 'destroyed'`;
  `interface TurretInput { powered: boolean; health: number; candidates:
  TargetCandidate[]; currentYaw; currentPitch; dt }`;
  `stepTurretBrain(state, def, input): TurretDecision` where
  `TurretDecision = { state; targetId: string | null; yawRate; pitchRate;
  shouldFire: boolean }`;
  `selectTarget(candidates, pose, def, filter): string | null` (pure —
  nearest hostile inside range and traverse, sticky to current target
  until it dies or leaves range, so the turret does not flicker between
  two equidistant enemies).

- [ ] Write failing tests: unpowered → `disabled`, never fires; acquires
      nearest in range; sticks to an engaged target when a nearer one
      appears (stickiness asserted explicitly); respects fireRate cooldown;
      will not fire until aimed within a tolerance cone; `destroyed` is
      absorbing; filter `infantry-only` ignores non-infantry kinds (field
      exists now, matters in Phase 6); traverse clamps respected.
- [ ] Implement. No randomness, no vectors beyond `{x,y,z}` maths.
- [ ] Full suite green, commit
      (`feat: a turret that knows what it is looking at`).

### Task 4: Procedural turret model

**Files:**
- Create: `src/machine/TurretModel.ts`
- Test: covered by `tools/shoot.mjs` screenshot + existing model-fit
  conventions (no node test — pure Three.js).

**Interfaces:**
- Produces: `buildTurretModel(materials): { root: Group; yaw: Object3D;
  pitch: Object3D; muzzle: Object3D }` — named pivots the entity animates;
  a `disabled` droop pose.

- [ ] Build base/head/barrel from `bevelledBox` + cylinder, machine
      materials; verify silhouette in `node tools/shoot.mjs turret.png`.
- [ ] Commit.

### Task 5: Turret entity and manager

**Files:**
- Create: `src/machine/Turret.ts`, `src/machine/TurretManager.ts`
- Modify: `src/game/Game.ts`, `src/core/events/GameEvents.ts`
- Test: `tests/unit/turrettargeting.test.ts` (the pure sync logic:
  build-placed → turret exists; build-removed → gone; save round-trip of
  turret `state`).

**Interfaces:**
- Consumes: `stepTurretBrain`, Phase 3 power API (assumed above), Phase 1
  `damagePiece` path (turret health lives on its build instance),
  `EnemyManager` enemy list, `PhysicsWorld` raycast.
- Produces: `TurretManager.fixedUpdate(dt)`;
  events `turret:fired { turretId; targetId }`, `turret:target-acquired`,
  `turret:entered`, `turret:exited`.

- [ ] Sync turret instances from `build:placed`/`build:removed` events.
- [ ] Tick brains; chosen target gets one LOS raycast; hit applies
      `computeDamage` through the existing `Damageable` on the enemy
      collider.
- [ ] Register/unregister power draw with the grid; reflect `disabled`.
- [ ] Wire muzzle flash via existing FX particles + `turret-fire` sound.
- [ ] Full suite green, commit.

### Task 6: Crewing the manual turret

**Files:**
- Modify: `src/interaction/InteractionSystem.ts`,
  `src/player/PlayerCamera.ts`, `src/player/Player.ts`, `src/ui/HUD.ts`
- Test: extend `tests/unit/` where logic is pure (enter/exit state
  machine); feel is harness work.

**Interfaces:**
- Consumes: `Interactable` union, turret pivots (Task 4).
- Produces: `kind: 'turret'`; player `crewing: string | null`; camera mode
  `'turret'`.

- [ ] `E` at turret enters (event `turret:entered`); movement keys ignored
      while crewed; mouse drives yaw/pitch through the brain's clamps; LMB
      fires with the turret's stats; `E`/`Esc` exits.
- [ ] HUD: turret reticle, `disabled` warning when unpowered.
- [ ] Full suite green, commit
      (`feat: you can get behind the gun yourself`).

### Task 7: Browser-harness proof

**Files:**
- Modify: `tools/combat.mjs`, `tools/build.mjs`
- Test: the harness IS the test.

- [ ] `combat.mjs`: build hardpoint + auto turret via debug grant, force a
      spawn (`F4` path), assert the enemy dies to `turret:fired` events
      without player input; assert an unpowered turret holds fire (cut
      generator fuel via debug).
- [ ] `combat.mjs`: crew the manual turret, fire, assert enemy damage
      events attribute to the turret.
- [ ] Audio checks: `turret-fire` voice present, positional.
- [ ] All harnesses + full suite green, commit.

## Interfaces other phases rely on

- Phase 6/7 (vehicles, boarding): `TargetCandidate.kind` includes
  `'vehicle'` headroom; `selectTarget` filter values
  `'all' | 'infantry-only' | 'off'` will widen to include vehicles.
- Phase 8 (loot): `TurretDefinition` is the slot better turret drops fill;
  `HardpointClass` widens to `'light' | 'medium' | 'heavy'`.
- Phase 3 (power): draws registered as `turret:<instanceId>`.
- Save: turret runtime state rides `BuildPieceInstance.state` — no schema
  change beyond what Phase 1 already added.
