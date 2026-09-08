# Playable Loop: Guided Start, Manual Turret, and Boarding Skiff

> **Status:** Authorized for execution on 2026-09-07. The user explicitly
> authorized all work in this plan. No design or implementation approval gate
> remains.

## Outcome

A new player can reach the core promise of *Machine Move Forward* without
outside instructions. During the first fifteen minutes they salvage a crate,
build and power a refinery, refine components, build a workbench, install and
crew a powered manual turret, survive a single skiff boarding attempt, and
repair the damage. The same systems remain useful after onboarding: the turret
is a normal saved build piece, skiffs enter the ordinary threat rotation, and
the pause menu offers a dependable **Save & Quit** action.

This is a refinement and implementation pass over the current Three.js 0.185 /
Rapier 0.20 browser game. There is no engine migration.

## Current seams verified at HEAD `4df55fa`

- `Game.fixedUpdate` is the composition root. Its current order is player and
  combat, enemies, machine, power/producers, world, threat arrivals, physics.
- `OpeningDirector` already provides a pure state-machine precedent. New games
  reach normal play at `opening.phase === 'done'`; loaded games skip the
  rooftop sequence.
- `SalvageField` emits `loot:collected` after a successfully reeled crate. The
  first natural crate appears at 90 metres, roughly twelve seconds at cruise.
- `BuildSystem` already owns placement, resource charging, health, demolition,
  repair, save/restore, colliders, stations, and nav-graph rebuilds.
- `BuildPieceInstance.state` is the reserved per-instance save payload. A
  turret's facing/cooldown can use it without creating a parallel device save.
- `MachinePower` registers build devices from `build:placed` and removes them
  from `build:removed`; it already has the `defense` priority class.
- `InteractionSystem` selects the nearest contextual `E` target. Repair is a
  hold action and already handles damaged build pieces.
- `PlayerCombat` damages anything recognized by `Damageable` through a Rapier
  raycast. Vehicle, crew, and hook targets should join that route.
- `EnemyManager` owns the pooled deck enemies and routes them through
  `BuildSystem.navGraph`, including rooms and stairs. Boarders become ordinary
  enemies only when their crossing reaches the deck.
- `ThreatDirector` guarantees `RECOVERY_M` plus `CALM_MIN`, a minimum 650 metres
  of quiet between completed encounters. Vehicle scheduling must retain that
  invariant.
- `SaveManager` writes versioned IndexedDB saves. `TitleScreen` already owns
  boot and pause menus through callbacks, so **Save & Quit** belongs there.
- The baseline has 903 passing tests. Existing harnesses boot with
  `nomenu=1&notex=1&nomodel=1`; every new visual needs a procedural/null path.

## Product decisions

### The guided sequence is an objective rail, not a modal tutorial

`FirstRunDirector` displays one objective and one contextual control at a time.
It observes real game events and never completes an action on a timer. The
player remains free to move, build, salvage, and fight. An action performed
before its prompt counts from the persisted facts, so an experienced player
cannot get stuck for being fast.

The required steps are:

1. **Salvage:** “Aim at a drifting crate · `F` fire salvage reel.” The first
   collected salvage crate grants the `manual-turret` blueprint exactly once.
2. **Refinery:** “`B` build · `G` Stations · place a Refinery.” Its ordinary
   floor/support and resource rules still apply.
3. **Components:** “At the Refinery press `E` · Refine Components.” Complete
   after eight components have been produced during the run, or when the
   available inventory already satisfies the downstream builds. The workbench
   spends four and the turret spends four, so the guide cannot advance into a
   material dead end.
4. **Station:** “Build a Workbench.” The prompt explains that the refinery
   turns scrap into the components used by advanced stations and defenses.
5. **Defense:** The objective card becomes a visible upgrade goal with the
   blueprint name, material shortfall, power draw, and placement arc. The
   player builds a Manual Deck Turret and enters it with `E`.
6. **Survive:** After a fifteen-second ready window, one tutorial skiff is
   forced through the same encounter controller used later by the director.
   Prompts update at real transitions: shoot hull/crew during approach, shoot
   or hold `E` to cut the hook, then hold the deck against landed boarders.
7. **Repair:** If anything is damaged, the existing repair prompt and hold
   progress guide the player to one damaged piece or subsystem. If the player
   prevents all damage, the step reads “Machine secure — no repairs needed”
   and completes after the encounter ends.
8. **Complete:** The objective collapses to the optional standing goal
   “Upgrade the moving fortress,” while ordinary threat pacing begins in a
   full recovery phase.

The fifteen-minute target is a ceiling, not a forced wait. A browser harness
must complete the sequence in under fifteen simulated minutes using normal
game APIs and inputs. The default resource economy must make every required
piece affordable without debug grants.

### One manual turret, with its mount integrated

This pass does not add hardpoint tiers or an automated turret. `manual-turret`
is one ordinary build piece containing the mounting plate and articulated gun.
It occupies a station/device cell on a floor or bare permitted deck cell, uses
the piece's build rotation as its forward direction, and has a fixed 240° yaw
arc (±120°), pitch from −30° to +35°. The deeper depression is required by the
actual geometry: a deck muzzle at about Y=4.89 must reach the skiff hull around
Y=0.78 from roughly nine metres away. The preview and crewed HUD show the arc.

The blueprint is earned by collecting the first salvage crate. The piece costs
42 scrap plus 4 refined components, draws 3 defense-priority power, stops firing when
unpowered, takes structure damage, cascades with its support, and is repaired
through `RepairSystem`. `E` enters or exits; mouse look traverses inside the
arc; LMB fires. `Esc` exits the turret before opening the pause menu. The player
cannot walk or fire a held weapon while crewing it.

### One skiff archetype and one active vehicle encounter

The skiff is authored as choreography in machine space. The machine remains at
the origin while the skiff moves through:

`approach -> firing-pass -> alongside -> hook-flight -> attached -> boarding -> retreat`

`destroyed` may be entered from any live phase. Port/starboard is selected by
the seeded encounter RNG. The hull approaches from ahead, makes one telegraphed
firing pass, pulls alongside outside the machine legs, fires one hook, and
releases two boarders at staggered intervals. The skiff has separate raycast
damage targets for hull, each visible crew member, and the hook.

Counterplay has four complete outcomes:

- Destroy hull: the skiff wrecks, attached hook is removed, unlanded crew are
  lost, and landed boarders remain.
- Kill all crew before boarding: the skiff cannot fire or launch more
  boarders and retreats; already-landed boarders remain.
- Destroy/cut hook: the cable detaches, any boarder in transit is lost, crew
  still aboard retreat, landed boarders remain. Shooting and hold-`E` cutting
  both damage the same hook health.
- Defend: boarders land at the selected deck edge and become ordinary raiders.
  They use the existing nav graph through player-built rooms and stairs. When
  all landed boarders are gone, the skiff retreats and recovery begins.

Every successful terminal route pays the same 30-scrap, 2-component defense
bounty exactly once. This makes hull, crew, hook, and deck defense equally valid
counterplay; landed-enemy drops remain separate. Store the bounty in one vehicle
data source so runtime reward code and tests cannot drift.

The tutorial skiff is forced once after the turret is crewed. Choose port or
starboard from the crewed turret's placed forward direction so the tutorial
target begins inside its ±120° arc; fore/aft mounts may use the seeded side.
After onboarding,
the threat director may choose the same one-skiff encounter after two survived
infantry waves. Infantry and vehicle encounters remain exclusive, only one
skiff may be active, and the existing 650-metre minimum quiet interval remains
mandatory after either kind.

### Save only stable world states

The current save does not persist active infantry, projectiles, a thrown reel,
or partial encounters. Adding a partial vehicle snapshot would imply safety
that the rest of the combat world does not provide. This pass defines a stable
save boundary:

`opening.done && enemies.activeCount === 0 && !boarding.active && !hookInFlight && !playerDead`

Autosave becomes due every 60 simulated seconds after the opening. If the
boundary is unsafe, it stays pending and writes immediately on the first safe
recovery tick. Multiple pending ticks coalesce into one write.

**Save & Quit** is always visible in the pause menu. At a stable boundary it
awaits `SaveManager.save`, then enters the title screen. During combat it closes
the menu, shows “Finish the attack to save & quit,” remembers the request, and
automatically saves and enters the title screen on the first stable tick. If
IndexedDB fails, the game stays open/paused, clears the pending quit, and shows
“Save failed — progress is still open.” It must never enter the title screen
after a failed write.

`progression.firstRun` and `progression.unlocks` are persisted. Turrets persist
through normal structures. Because saves occur only at stable boundaries,
vehicle and boarder runtime state is deliberately absent and cannot disappear
silently.

## Shared contracts

The two Luna workers should agree on these shapes before editing integration
call sites. Equivalent naming is acceptable; behavior is not.

```ts
export type UnlockId = 'manual-turret';

export interface ProgressionSave { unlocks: UnlockId[] }
export class ProgressionState {
  has(id: UnlockId): boolean;
  grant(id: UnlockId): boolean; // true only on the first grant
  toSave(): ProgressionSave;
  restore(save?: ProgressionSave): void;
}

export type FirstRunStep =
  | 'salvage' | 'build-refinery' | 'refine-components'
  | 'build-workbench' | 'build-defense' | 'survive-boarding'
  | 'repair' | 'complete';

export interface FirstRunSave {
  step: FirstRunStep;
  facts: {
    salvageCollected: boolean;
    componentsRefined: number;
    refineryBuilt: boolean;
    workbenchBuilt: boolean;
    turretBuilt: boolean;
    turretCrewed: boolean;
    tutorialSkiffStarted: boolean;
    tutorialSkiffEnded: boolean;
    repairCompleted: boolean;
  };
}

export interface ObjectiveView {
  title: string;
  instruction: string;
  control?: string;
  progress?: string;
  optional: boolean;
}
```

`FirstRunDirector.observe(event)` updates facts, advances through every already
satisfied step, and returns one-shot effects such as `grant-manual-turret`,
`start-tutorial-skiff`, and `enter-threat-recovery`. It imports no Three.js,
Rapier, or DOM.

```ts
export interface TurretInput {
  dt: number;
  lookX: number;
  lookY: number;
  fireHeld: boolean;
  powered: boolean;
  occupied: boolean;
}

export interface TurretView {
  instanceId: string;
  powered: boolean;
  occupied: boolean;
  yaw: number;
  pitch: number;
  cooldownFraction: number;
}
```

The turret controller owns traverse clamps and fire cadence. The entity owns
the yaw/pitch scene nodes, muzzle transform, Rapier raycast, and damage event.
Health stays on the associated `BuildPieceInstance`.

```ts
export type BoardingPhase =
  | 'idle' | 'approach' | 'firing-pass' | 'alongside'
  | 'hook-flight' | 'attached' | 'boarding' | 'retreat' | 'destroyed';

export interface BoardingUpdate {
  dt: number;
  distance: number;
  landedBoardersAlive: number;
}

export type BoardingEffect =
  | { type: 'volley'; targetId: string; damage: number }
  | { type: 'hook-attached'; side: 'port' | 'starboard' }
  | { type: 'spawn-boarder'; crewId: string; position: Vec3Like }
  | { type: 'transit-lost'; crewId: string }
  | { type: 'drop-salvage'; position: Vec3Like }
  | { type: 'ended'; outcome: 'hull' | 'crew' | 'hook' | 'defended' };
```

`BoardingEncounter` is the entity boundary: it may own Three/Rapier objects but
its phase advancement, firing target choice, crossing schedule, and attach-cell
choice live in pure helpers. `Game` consumes effects, uses `EnemyManager.spawn`
for landed raiders, applies structure/subsystem damage, and announces events.

New typed events:

```ts
'progression:unlocked': { id: UnlockId };
'objective:changed': { view: ObjectiveView };
'turret:entered': { instanceId: string };
'turret:exited': { instanceId: string };
'turret:fired': { instanceId: string; targetId: string | null };
'vehicle:phase': { id: string; phase: BoardingPhase; side: 'port' | 'starboard' };
'vehicle:damaged': { id: string; part: 'hull' | 'crew' | 'hook'; health: number };
'boarding:hook-attached': { side: 'port' | 'starboard' };
'boarding:crossed': { enemyId: string };
'boarding:ended': { outcome: 'hull' | 'crew' | 'hook' | 'defended'; tutorial: boolean };
'game:autosave-pending': Record<string, never>;
'game:save-failed': { message: string };
```

## Ownership and merge order

| Owner | Exclusive implementation surface | May coordinate on |
| --- | --- | --- |
| Luna integration | `src/game/Game.ts`, `src/game/FirstRunDirector.ts`, `src/ui/HUD.ts`, `src/ui/BuildUI.ts`, `src/ui/TitleScreen.ts`, `src/ui/hud.css`, save coordination, browser/e2e orchestration | Save schema and event types after gameplay contracts land |
| Luna gameplay | `src/progression/**`, `src/data/turrets.ts`, build/data changes, `src/machine/Turret*.ts`, `src/vehicles/**`, `src/enemies/ThreatDirector.ts`, pure/unit tests | Minimal hooks in `Game.ts` requested from integration owner |
| Astra/root | `public/models/authored/**`, `tools/art/**`, `src/art/**`, `ASSETS.md`, visual/material integration and final review | Supplies nullable visual factories and authored GLBs |

Merge in this dependency order: shared event/save types and progression;
turret/build rules; first-run/UI/save; skiff/boarding; Game composition; authored
visuals; harnesses and final regression. Preserve unrelated user changes.

## Execution tasks

### 1. Pin progression and onboarding behavior with pure tests — Luna integration

**Create:** `src/game/FirstRunDirector.ts`,
`tests/unit/firstrundirector.test.ts`  
**Modify:** `src/core/events/GameEvents.ts`, `src/save/SaveSchema.ts`

- Write failing tests for the exact step order, early actions counting, duplicate
  events remaining idempotent, the blueprint effect firing once, the tutorial
  skiff effect firing once after turret entry, perfect-defense skipping repair,
  damage requiring one repair, and restore resuming the same objective.
- Add optional `progression.firstRun?: FirstRunSave` and keep old v1 saves legal.
- Missing first-run state on an existing save means `complete`; a fresh New Game
  receives a new director at `salvage`. This prevents old players from being
  forced through onboarding.
- Expose an `ObjectiveView`; do not put display strings in `Game.ts`.

**Acceptance:** the state machine is fully node-testable, reload cannot repeat a
blueprint or forced skiff, and a player who built ahead always advances.

### 2. Add the earned manual-turret build definition — Luna gameplay

**Create:** `src/progression/ProgressionState.ts`, `src/data/turrets.ts`,
`tests/unit/progression.test.ts`, `tests/unit/turrets.test.ts`  
**Modify:** `src/data/build-pieces.ts`, `src/data/power.ts`,
`src/building/BuildValidation.ts`, `src/building/BuildSystem.ts`,
`tests/unit/buildvalidation.test.ts`, `tests/unit/power-data.test.ts`

- Add only `manual-turret`; do not add automatic turrets or hardpoint tiers.
- Define positive damage, range, cadence, defense power draw, 240° yaw arc,
  −30°..+35° pitch limits, weight, max health, armor, and a cost containing components.
- Register it as a defense-priority consumer through `powerRoleOf`.
- Add a build authorization predicate/context. Locked placement returns a
  specific `locked` validation reason even if called directly; UI hiding alone
  is insufficient.
- Require valid support and an unoccupied device/station layer. Rotation selects
  the center of the permitted firing arc.
- Verify demolition/refund/cascade and normal serialise/restore behavior.

**Acceptance:** a fresh progression state cannot place the piece, the first
grant unlocks it, a loaded unlock restores it, unpowered placement remains
valid, and damaged turret health round-trips inside the structure save.

### 3. Implement turret simulation and raycast entity — Luna gameplay

**Create:** `src/machine/TurretController.ts`, `src/machine/Turret.ts`,
`src/machine/TurretManager.ts`, `tests/unit/turretcontroller.test.ts`,
`tests/unit/turretmanager.test.ts`  
**Modify:** `src/combat/Damageable.ts`, `src/interaction/InteractionSystem.ts`

- Test pure clamp behavior at both yaw/pitch limits, rotation-relative arc,
  cadence at fixed 60Hz, no fire while unpowered/unoccupied/destroyed, and no
  accumulated burst after power returns.
- Track build instances from `build:placed`, `build:removed`, and restore.
- Expose each live turret as an `Interactable` of kind `turret`.
- Use the existing hitscan/`computeDamage` route, ignoring the turret's own
  collider and attributing the event to its instance id.
- Keep health and repair in `BuildSystem`; do not add a second turret health
  store. Removal must dispose colliders/visuals and unregister via existing
  build removal power wiring.
- Persist only runtime values that matter after a stable save. A firing
  cooldown may safely reset; rotation must restore.

**Acceptance:** entering, aiming, firing, power loss, taking player/skiff fire,
repair, demolition, and save/load all operate on the same build instance.

### 4. Integrate turret controls, preview, and player-visible upgrade — Luna integration

**Modify:** `src/game/Game.ts`, `src/player/PlayerCamera.ts`, `src/ui/BuildUI.ts`,
`src/ui/HUD.ts`, `src/ui/hud.css`, `tests/unit/hudcondition.test.ts`

- Hide or visibly lock the turret slot until progression grants it; after grant,
  show its name, cost, power draw, and shortfall.
- Add a rotation-relative arc indicator to build preview or HUD using gameplay
  constants, not duplicated angles.
- `E` near the turret enters it. Suppress player movement, held weapon, build
  mode, reel, and station interaction while occupied. Mouse and LMB feed
  `TurretInput`; `E` or first `Esc` exits.
- Camera uses a stable turret anchor and does not inherit deck gait buzz.
- HUD shows reticle, arc-edge feedback, `NO POWER`, exit control, and cooldown.
- Feed build/loot/craft/turret events into `FirstRunDirector` and publish its
  objective only when it changes.

**Acceptance:** every required control is visible at the moment it becomes
relevant, and no single input performs both turret and ordinary-player actions.

### 5. Add autosave and dependable Save & Quit — Luna integration

**Create:** `src/save/SaveCoordinator.ts`, `tests/unit/savecoordinator.test.ts`  
**Modify:** `src/game/Game.ts`, `src/ui/TitleScreen.ts`, `src/ui/hud.css`,
`tests/unit/savemigrations.test.ts`, `tests/e2e/title.spec.ts`

- Test the 60-second due time, coalescing, unsafe deferral, first safe-tick
  write, a queued quit, successful quit only after awaited write, and failure
  returning control without title transition.
- The coordinator receives `now`, `safe`, and an async writer callback. Keep
  IndexedDB and DOM out of its unit tests.
- Add **Save & Quit** to pause mode. Disable repeat activation while writing and
  expose status text to the player.
- Save `ProgressionState` and `FirstRunDirector`; restore before BuildUI chooses
  its active selection.
- On New Game, reset progression, onboarding, build/turrets, director, enemies,
  and pending-save state together.

**Acceptance:** a test that requests Save & Quit during boarding sees no write
and no title transition until the encounter ends; a rejected writer never
quits; Continue resumes the saved objective and turret unlock.

### 6. Implement pure skiff choreography and target selection — Luna gameplay

**Create:** `src/data/vehicles.ts`, `src/vehicles/SkiffChoreography.ts`,
`src/vehicles/BoardingPlan.ts`, `tests/unit/skiffchoreography.test.ts`,
`tests/unit/boardingplan.test.ts`

- Define one `boarding-skiff`: hull health/armor, two crew, lane ≥12m from
  center, approach speed, firing telegraph and flight time, hook health/range,
  crossing stagger, retreat timing, and the fixed defense bounty.
- Test every legal phase edge and destroyed as absorbing; a seeded port/starboard
  selection; no volley without living crew; one telegraph before each damage
  effect; hook launch only alongside and within range; exact crossing count from
  living crew; and counterplay outcomes.
- `pickAttachCell` prefers an open deck edge, otherwise the weakest railing or
  wall on the selected side as the volley/breach target. Tie-break by stable
  cell/instance id.
- Target priority for the firing pass is occupied turret, exposed structure,
  then a machine subsystem. A missing target cancels the shot safely.

**Acceptance:** identical seed and inputs produce identical side, timings,
targets, and crossing order without Three.js or Rapier.

### 7. Build the skiff, crew, hook, cable, and damage targets — Luna gameplay

**Create:** `src/vehicles/BoardingEncounter.ts`,
`tests/unit/boardingencounter.test.ts`  
**Modify:** `src/combat/Damageable.ts`, `src/core/events/GameEvents.ts`

- Instantiate one skiff visual, hull collider, two crew hit colliders, hook
  collider, and cable. Every collider carries a valid `Damageable` callback.
- Keep the skiff in machine coordinates and sample/render at dune height; do
  not turn it into a wheel or rigid-body driving simulation.
- Crew deaths update the schedule immediately. Crossing removes that crew
  target; reaching deck emits `spawn-boarder` and only `Game` calls
  `EnemyManager.spawn('raider', landing)`.
- Hook shooting and hold-`E` cutting share health. Detach/dispose is idempotent
  from hull death, crew retreat, hook death, encounter reset, and New Game.
- Damage effects target existing build/subsystem APIs. The opening volley is
  allowed to miss if the player destroys the threat during its telegraph.
- Emit one terminal outcome and one defense bounty at most.

**Acceptance:** each of hull, crew, hook, and defend routes reaches a clean
terminal state with no leaked collider, cable, boarder spawn, or duplicate loot.

### 8. Extend threat scheduling without losing quiet time — Luna gameplay

**Modify:** `src/enemies/ThreatDirector.ts`, `src/game/Game.ts`,
`tests/unit/threatdirector.test.ts`

- Generalize the spawn decision to an encounter request while preserving the
  current infantry member behavior and old-save restoration.
- Make skiffs eligible only after onboarding is complete and at least two
  infantry waves have been survived. Do not schedule one if any infantry,
  skiff, hook, or boarder is active.
- Add a public recovery entry used after the forced tutorial encounter. It
  clears pending contact and ends at `distance + RECOVERY_M`; the following
  calm still adds at least `CALM_MIN`.
- During onboarding before the tutorial skiff, hold ordinary threat scheduling.
  After onboarding, restore the standard distance-driven loop.
- Add tests showing infantry composition has not changed for its existing
  seeds, old save fields still restore, vehicle engagement waits for the full
  encounter (including landed boarders), and the minimum end-to-next-buildup
  distance remains 650m.

**Acceptance:** no overlap occurs, no debug distance jump skips a telegraph,
and both infantry and skiff outcomes lead to real recovery.

### 9. Compose the guided skiff encounter and contextual counterplay — Luna integration

**Modify:** `src/game/Game.ts`, `src/ui/HUD.ts`, `src/ui/hud.css`,
`src/audio/SoundBank.ts`, `src/audio/GameSounds.ts`

- Start the forced skiff only from the director's one-shot effect and after its
  ready window. Route normal director vehicle requests through the same call.
- Update fixed-step order so the turret/player may damage skiff parts, the
  encounter advances, landed boarders spawn, normal enemy AI runs, and physics
  resolves without a one-tick stale target.
- Register hook cutting as the nearest contextual interactable while attached;
  show cut progress using the repair hold pattern without charging resources.
- HUD/audio beats: distant dust/engine warning, firing-pass cue, side-specific
  “BOARDING HOOK — PORT/STARBOARD,” counterplay prompt, crossing count, recovery.
- Feed the terminal outcome and repair result to onboarding. Complete repair
  immediately only when all structure/subsystem health is already full.
- On dispose, New Game, Continue, or title reset, clear encounter state safely.

**Acceptance:** the same entity and event path drives tutorial and later skiffs;
HUD instructions correspond to the encounter's current possible actions.

### 10. Author and integrate graphics/models — Astra/root

**Create/own:** `public/models/authored/manual-turret.glb`,
`public/models/authored/boarding-skiff.glb`, `tools/art/**`,
`src/art/DefenseModels.ts`  
**Modify/own:** `ASSETS.md`, material/palette files as needed

- Use Blender 5.1 CLI and free/open-source tooling. Search for CC0/CC-BY assets
  only when they improve on an authored low-poly model; record source URL,
  author, license, modifications, and destination in `ASSETS.md`.
- Turret contract: Y-up, forward −Z, 2m footprint, base at Y=0, named nodes
  `TurretYaw`, `TurretPitch`, and `Muzzle`.
- Skiff contract: Y-up, forward −Z, approximately 3m wide × 6m long, platform
  top at Y=1.15, visible hull damage silhouette, two crew seats, obvious hook
  launcher and readable port/starboard profile.
- `DefenseModels` validates/fetches named nodes and returns the existing
  procedural factory when an asset is missing, invalid, or models are disabled.
- Keep collision dimensions in gameplay data; visuals must fit those dimensions
  and never define physics.
- Capture review renders for idle turret, arc extremes, skiff approach,
  alongside/hook, and damaged/destruction silhouettes.

**Acceptance:** authored and `nomodel=1` paths both boot; named pivots animate;
no unrecorded asset enters the repository; model failure costs only fidelity.

### 11. Prove rooms and stairs with landed boarders — Luna gameplay/integration

**Modify:** `tools/combat.mjs` or create `tools/boarding.mjs`  
**Modify if needed:** `tests/e2e/damage.spec.ts`

- Build a lower room with one doorway and an upper floor reached by rotated
  stairs. Prove the player can walk the complete flight, and prove a normal
  player-seeking scavenger can use the same live graph to reach the upper floor.
- Force a hook on the open side and let two raiders land. Assert each landed
  actor is registered as an ordinary `EnemyManager` raider and uses the same
  rebuilt room/doorway/stair graph. Raiders intentionally prioritize the engine,
  so this check follows their route to the engine rather than changing them to
  pursue an upstairs player.
- Seal the engine route in a second run and assert a boarder routes to and
  damages the blocking wall rather than parking or teleporting.
- Assert the hook landing never spawns a body inside a wall, machine equipment,
  or outside the nav graph.

**Acceptance:** a real browser walk closes the player stairs gap; a normal
player-seeking enemy proves the rotated vertical link; landed raiders prove
shared navigation, doorway/wall behavior, and engine priority without a special
boarding AI.

### 12. End-to-end first fifteen minutes and counterplay matrix — Luna integration

**Create:** `tests/e2e/first-run.spec.ts`  
**Create or modify:** `tools/boarding.mjs`, `tools/build.mjs`,
`tools/craft.mjs`, `README.md`

- Start through **New Game**, complete/skip the rooftop opening, and use normal
  controls or public gameplay calls to salvage, build refinery, refine eight
  components, build workbench, unlock/place/power/crew turret, survive skiff,
  and repair. Assert simulated time <900 seconds and no debug resource grants.
- Verify every objective/control string appears before the required input, the
  upgrade card shows costs/power/arc, and completion persists through reload.
- Run isolated skiff outcomes: hull killed before hook; crew killed; hook shot;
  hook cut during transit; full boarding defended. Assert exact outcome, landed
  count, remaining threats, loot count, and recovery phase.
- Drain generator fuel: turret stops and shows `NO POWER`; refuel: it resumes
  without a stored burst. Damage and repair turret through the ordinary repair
  interaction.
- Request Save & Quit in calm and during boarding; assert calm quits after a
  successful write, boarding queues visibly, and failure does not quit.
- Update README controls and playable-loop description. Do not document debug
  keys as required gameplay.

**Acceptance:** all five counterplay paths, first-run completion, power loss,
repair, stable save/continue, and quiet recovery are browser-proven.

### 13. Final regression and visual review — all, root owns sign-off

Run once after integrations settle:

```powershell
npx tsc --noEmit
npx eslint src tests
npx vitest run
npx playwright test
node tools/build.mjs
node tools/craft.mjs
node tools/combat.mjs
node tools/boarding.mjs
```

Then run the graphical harness with models/textures enabled and inspect the
five required review frames. Repeat the relevant check only when a fix changes
its surface.

## Release acceptance checklist

### Evidence ledger

Updated during execution; a unit-only implementation does not close a runtime
item.

- **2026-09-07 baseline:** clean `4df55fa`, 903 tests passing before this pass.
- **Plan and interfaces:** complete; Luna ownership and root visual boundaries
  dispatched.
- **Implementation:** authored and integrated. The first-run director,
  progression/unlock, normal-cost refinery chain, manual turret, stable-save
  policy, Save & Quit UI, one-skiff choreography, per-part damage actors, cable,
  delayed/occluded volley, crossing, landed raiders, recurring pacing, and
  recovery APIs are present in the runtime. This records source completion, not
  final acceptance.
- **Build and automated logic:** the production build, lint, and the full
  74-file/925-test unit suite pass. The pacing subset
  includes recurring-skiff exclusivity and the full 650m recovery-plus-calm
  floor.
- **Playwright browser suite:** the full run passed 35/38 tests. After correcting
  three fixtures and the exposed turret volley aim point, all three failed
  cases passed their focused rerun. All 38 tests are therefore covered by green
  results across these runs. Evidence includes clear/covered/dodged delayed
  volleys, scheduled structure targeting, gun destruction/dismount, all four
  placement rotations, power loss, and autosave stability/failure backoff.
- **First-run browser:** 33/33 checks pass against the production build with
  normal starting stock and normal build/crafting costs. Evidence includes the
  full objective sequence, nonzero turret aim and fuel across Continue, tutorial
  recovery without a duplicate encounter, held-E repair, calm Save & Quit,
  queued combat Save & Quit, and failed-write behavior. The restore path
  preserves valid saved instance IDs while advancing future allocation.
  This is an accelerated integration run using public gameplay calls and fixed
  simulation; it proves the normal-cost sequence, not a timed human playtest.
- **Boarding browser:** 16/16 checks pass. The live harness covers hull, crew,
  hook, hold-to-cut, exact reward emission, cleanup, one-survivor crossing and
  landing, the landed-boarder terminal hold, and defended completion.
- **Boarder navigation:** 15/15 production-browser checks pass. Both approach
  sides land on usable level-zero nav cells outside equipment and stations;
  landed raiders retain engine priority, take a real path, and damage a real
  blocking wall. Staggered crew share the visible hook endpoint. The stair
  graph now links both ramp cells to the upper exit, leaving its opening clear
  and preventing repathing back downhill. `tools/stairs.mjs` passes 7/7 checks:
  actual keyboard player movement reaches the upper floor, and an ordinary
  player-seeking scavenger follows to level one and attacks. Live testing also
  fixed quarter-turn collider composition and made enemy probes follow the
  walkable ground slope. The AI portion advances the real fixed game loop
  without rendering; it does not alter enemy targets, paths or positions.
- **Existing browser systems:** the building harness passes 21/21 and crafting
  passes 49/49 against the integrated production build. The full legacy combat
  run passed 82/86; its four failures were fixture issues involving skiff-era
  arrival timing, wall-breach observation timing, and a missing room roof.
  Corrected fixtures pass the focused `tools/combat-regression.mjs` runner
  (8/8), including real recurring-skiff cleanup, new infantry movement, real
  enemy wall destruction followed by entry, and a sealed room. Its 2m room uses
  a local 0.6m melee-reach override so the enemy must enter to attack; normal
  combat reach otherwise permits attacking from outside after the wall falls.
  This focused rerun uses the real fixed game loop and replaces repeating the
  already-green weapon, model, engine-room, and audio sections. The legacy
  helper also distinguishes tracked boarders from ordinary raiders.
  Following the stair changes, the relevant Playwright stair and wall checks
  pass 2/2; boarding and boarding-navigation reruns pass 16/16 and 15/15.
- **Visual assets:** four original authored GLBs, editable Blender sources, and
  six animation clips are present. Actual gun/hull/hook/crew colliders, cable,
  tracer, authored-model frames, and procedural-fallback frames have been
  rendered. GLTFLoader verification passes for dimensions, triangle budgets,
  independent animated skeletons, six clips and live muzzle alignment. All ten
  final in-game review frames (five each with authored and fallback models)
  render without page errors; runtime assertions verify the requested model
  path was actually selected. Visual inspection confirms a clear mounted view
  and legible READY/NO POWER states.
- **Robustness review resolved:** the tutorial registers an external encounter
  and ends in normal recovery. Its side is selected inside the first crewed
  gun's placed arc, including when the player dismounts before arrival. Turret
  volleys aim within the exposed upper collider to clear the floor lip while
  preserving exact first-hit cover validation. Every successful defense uses
  the same fixed 30-scrap, 2-component bounty from vehicle data, exactly once.

- [x] A first-time player receives the first actionable instruction only after
      the rooftop opening and can finish the guided loop in <15 simulated min.
- [x] First collected salvage grants the manual-turret blueprint once; save/load
      cannot lose or duplicate it.
- [x] Refinery, components, workbench, powered turret, skiff, defense, and repair
      are all actual game systems rather than tutorial substitutions.
- [x] Manual turret placement rotation defines a visible arc; it can be crewed,
      fired, power-shed, damaged, repaired, demolished, saved, and restored.
- [x] Hull, each crew member, and hook are independently shootable; the hook is
      also cuttable by hold interaction.
- [x] Boarders use normal room, doorway, wall-damage, and staircase navigation.
- [x] Destroy-hull, kill-crew, break-hook, cut-hook, and defend outcomes clean up
      correctly and lead to recovery.
- [x] Infantry and skiff encounters never overlap; 650m minimum quiet is intact.
- [x] Autosave waits for a stable state and writes on the first safe tick.
- [x] Save & Quit is visible, awaits success, queues visibly during threats, and
      never quits after a failed write.
- [x] Authored and procedural/no-model visual paths work; asset provenance is in
      `ASSETS.md`.
- [x] Typecheck, lint, all unit tests, and required browser acceptance pass,
      including focused reruns of corrected fixtures as recorded above.

## Explicitly deferred

Automated turrets, ammo logistics, hardpoint tiers, vehicle capture, player
boarding of enemy machines, multiple vehicle classes, vehicle part inventories,
free steering, and an engine migration are outside this pass.
