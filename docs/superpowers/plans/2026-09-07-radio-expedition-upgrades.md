# Radio, First Expedition, Upgrades, and Thirty-Minute Polish

> **Status:** Implemented on 2026-09-07; resumed and verified after the power outage.
> See [verification evidence](../../art/chapter-verification.md) for results
> and the distinction between normal gameplay paths and staged fixtures.
> The user approved all three parts: early-game polish and balance, a six-item
> machine research system, and a radio-led expedition to one complete wreck.
> The project remains Three.js, Rapier, TypeScript, and Vite.

## Outcome

A new player finds a working salvaged radio by reeling in a chest during the
first five minutes of playable deck time, provided they engage with the chest
objective. That find is guaranteed on the first eligible chest opened, is not
an RNG roll or a crafting result, remains available after missed chests, and
survives saves without duplication. The radio starts a signal and exposes six
small machine retrofits with visible hardware and explicit tradeoffs.

The existing refinery, eight-component, workbench, manual-gun, boarding-skiff,
and repair guide remains intact. When its tutorial defense is safely over, the
signal leads to one compact wreck. The machine brakes beside it, deploys a
physical gangway, and lets the player walk through the wreck without a
teleport. The player can read optional logs, must retrieve one unique course
gyro, must walk back to the machine, and departs through the recovered radio.
Departure resumes the scrolling world and reveals one next signal. This pass
does not build a second destination.

The first thirty minutes should now have less starting-resource excess, fewer
crafting clicks, a dependable fuel recovery, a fairer tutorial skiff, clearer
impact feedback, consistent authored visuals, grounded player feet, and cable
motion that stays attached to its endpoints.

The verified incoming baseline is the intentional uncommitted playable-loop
work described in `docs/superpowers/plans/2026-09-07-playable-loop.md`: 925 unit
tests and 74 files, with build and lint green at handoff. Implementers must
preserve that work and must not reset or traverse `.claude`.

## Scope boundaries

This pass adds exactly one recovered radio, one compact wreck, one unique story
component, one next-signal tease, and six machine upgrades. It does not add a
large world map, steering, a second destination, research tiers, randomized
upgrade rolls, an upgrade tree, automated defenses, new enemy archetypes,
inventory rarity, voice acting, or an engine migration.

The wreck is a sanctuary. No infantry or skiff starts while it approaches,
while the machine brakes, or while the player is docked. The director enters
this sequence only after the tutorial boarding encounter and any landed
boarders are gone, so entering sanctuary never deletes combat.

All new geometry and appearance are Astra/root work made in Blender. Luna may
wire nullable model factories, state, DOM behavior, and existing materials,
but must not create substitute models, procedural visual stand-ins, textures,
or presentation styling. Existing `nomodel=1` and missing-asset paths must
remain functional.

## Player sequence and timing

Playable deck time begins when `opening:phase` first becomes `done`. That edge
arms the radio guarantee and records `armedAtSimTime`.

1. A salvage chest becomes available no more than 45 metres after that edge.
   The existing salvage objective names the prize: **Recover the radio — reel
   in a salvage chest**. The cue points from the actual reel muzzle to the
   actual chest.
2. The first salvage chest the player successfully opens after arming awards
   the radio outside the normal loot roll. It also contains a fixed 12 scrap
   and 4 fuel cache bonus, then receives its normal seeded contents. The
   unique radio consumes no inventory slot, so a full bag cannot erase it.
3. If the player misses a chest, every later opened salvage chest is still
   eligible until the radio is found. Normal chests appear every 180 metres.
   There is no promise for a player who ignores all chests; the measurable
   promise is that opening any eligible chest within 300 simulated seconds
   awards the radio immediately.
4. The radio model appears at its checked fixed machine mount, registers as a
   1-power station-priority consumer, and starts the signal UI and radio bed.
   Its interaction opens signal/research information. When unpowered it shows
   static and research controls explain that power is required.
5. The refinery/workbench/manual-gun/tutorial-skiff/repair guide continues.
   Finding the radio does not skip or complete any of those actions. Entering
   `survive-boarding` must arm the tutorial if a gun was already crewed; live
   facts are refreshed after loot and after load/teleport so acting early
   cannot wedge the guide.
6. The radio signal begins immediately, but the wreck is not scheduled until
   `firstRun.isComplete` and the ordinary stable boundary are both true. The
   story then sets `arrivalDistance = currentDistance + 700` metres.
7. At 180 metres remaining the threat director enters sanctuary and the story
   applies a distance-aware speed limit. It must not set throttle to zero at
   the start of braking. The machine reaches the docking epsilon, settles,
   and only then deploys the gangway and enables destination colliders.
8. The player walks across, explores two connected spaces and an open cargo
   niche, may read three logs, and retrieves the **Course Gyro**. Logs are
   optional. The gyro is a one-shot story fact rather than an inventory slot.
9. Departure is available only from the recovered radio on the machine. This
   requires the player to walk back across the gangway. The gangway retracts,
   destination colliders disable, the speed limit clears, and the machine
   resumes its stored player throttle. The chapter completes and one weak next
   signal appears.

## Thirty-minute economy and combat tune

These numbers are one coherent tuning set and must remain in data modules.

| System | Final value | Reason and acceptance consequence |
| --- | --- | --- |
| Starting scrap | 260, down from 400 | The first build sequence is affordable with the guaranteed cache and minimum normal salvage, but the player cannot buy the whole deck without salvaging. |
| First radio cache | radio + 12 scrap + 4 fuel, then normal roll | Makes the story find and a modest fuel recovery deterministic without replacing ordinary loot. |
| Normal salvage cadence | first within 45m after playable deck; then 180m | One useful target at a time instead of overlapping crates every ~12 seconds. Missed-radio recovery remains frequent. |
| Normal crate table | scrap 22–46 always; components 1–3 at 0.75; fuel 3–4 at 0.75 | Keeps salvage valuable and makes fuel recoverable without making every chest a fuel refill. |
| Refine Components | 8 scrap -> 2 components | Same 4-scrap-per-component economy, four deliberate actions instead of eight identical clicks. |
| Infinite-ammo UI | hide ammo recipes while `INFINITE_AMMO` | Removes dead choices while preserving the finite-ammo data and tests. |
| Tutorial skiff | 220 hull; hook 45; two 8-damage shots per volley; crossing stagger 2.25s; at least 1.0s telegraph | Teaches hull, hook, and boarder counterplay before demanding regular values. |
| Regular skiff | 260 hull; hook 60; three 12-damage shots per volley; current two boarders | Preserves the existing later threat. The 30 scrap + 2 component bounty remains route-independent and pays once. |

`craft:completed` must include concrete outputs, for example
`{ recipeId, outputs: [{ id: 'components', count: 2 }] }`. The first-run guide
counts produced component units rather than button presses. Four successful
refines satisfy the existing eight-component requirement.

The radio's four fuel units are inventory canisters, not four tank points
silently inserted into `MachinePower`. The player still uses the existing
generator refuel interaction and sees the resource move.

## Guaranteed radio contract

The guarantee is a pure monotonic ledger, separate from the salvage RNG:

```ts
export type RadioStatus = 'unarmed' | 'pending' | 'found';

export interface RadioSave {
  status: RadioStatus;
  armedAtSimTime: number | null;
  foundAtSimTime: number | null;
  foundAtDistance: number | null;
  eligibleChestsOpened: number;
}

export type RadioAward = {
  granted: true;
  cache: { scrap: 12; fuel: 4 };
} | { granted: false };

export class EarlyRadioDrop {
  arm(simTime: number): boolean;
  onSalvageChestOpened(simTime: number, distance: number): RadioAward;
  toSave(): RadioSave;
  restore(save?: RadioSave): void;
}
```

`arm` and `onSalvageChestOpened` are idempotent. An old save with no radio
field restores to `pending` when its opening is already done; the next opened
chest awards it. A save containing `found` never awards it again. The game
emits `radio:found`, requests an immediate autosave, and still honors the
existing stable-save boundary. A crash before IndexedDB confirms a write is
not represented as saved progress; the implementation must not claim otherwise.

The salvage field owns spawn timing and normal drop rolls. It receives the
one-shot award result and appends the fixed cache to the same collection
transaction. It does not decide story progression. Pause must stop crate drift
and reeling simulation; opening a panel must follow the current simulation
policy consistently rather than moving only half of the salvage chain.

## Six machine upgrades

The recovered radio decodes six retrofit schematics. Research is permanent;
the player may research all six. There is one active slot in each branch, so
the two modules in a branch are mutually exclusive while installed. Switching
an already researched module is free at a powered radio, but only at a stable
world state while aboard the machine. Uninstalling remains free and available
without radio power in that safe state, so an overloaded loadout can be removed.

| Branch | Upgrade and cost | Benefit | Cost / downside | Required visible change |
| --- | --- | --- | --- | --- |
| Propulsion | **Longstride Actuators**, 60 scrap + 8 components | max speed ×1.18 | fuel burn ×1.25 | long external ram cylinders on leg drive housings |
| Propulsion | **Torque Coupling**, 45 scrap + 10 components | effective added payload weight ×0.65 | max speed ×0.97 and acceleration ×0.70 | large gearbox and load braces |
| Power | **Overwound Generator**, 55 scrap + 8 components | total generation +6 | fuel burn ×1.50 | exposed copper coil bank with restrained amber activity |
| Power | **Economy Governor**, 40 scrap + 8 components | fuel burn ×0.55 | total generation -2 | governor flywheel and closed shroud |
| Defense | **Heavy Breech**, 50 scrap + 6 components | turret damage 42 -> 60 | fire rate 1.2 -> 0.8/s and draw +1 | extended breech and rear counterweight |
| Defense | **Fast Cycler**, 45 scrap + 8 components | fire rate 1.2 -> 1.8/s | damage 42 -> 30 and draw +2 | side drum/hopper and feed linkage |

Power capacity bonuses apply once to the machine total if it has at least one
live generator; they are not multiplied by generator count and cannot make a
destroyed generator produce power. Fuel multipliers from active propulsion and
power upgrades multiply together. Defense modifiers are read at fire time.
Changing a defense module refreshes registered turret consumer draws. Because
swaps require a stable state, an old cooldown cannot be exploited mid-fight.

```ts
export type UpgradeBranch = 'propulsion' | 'power' | 'defense';
export type UpgradeId =
  | 'longstride-rams' | 'torque-clutch'
  | 'overwound-dynamo' | 'lean-governor'
  | 'heavy-breech' | 'cycler-feed';

export interface UpgradeSave {
  researched: UpgradeId[];
  active: Partial<Record<UpgradeBranch, UpgradeId>>;
}

export interface MachineModifiers {
  speedMultiplier: number;
  effectiveWeightMultiplier: number;
  accelerationMultiplier: number;
  fuelBurnMultiplier: number;
  generationBonus: number;
  turretDamageMultiplier: number;
  turretRateMultiplier: number;
  turretPowerBonus: number;
}

export class UpgradeSystem {
  research(id: UpgradeId, resources: ResourceAccess): ResearchResult;
  setActive(branch: UpgradeBranch, id: UpgradeId | null): SetActiveResult;
  modifiers(): MachineModifiers;
  toSave(): UpgradeSave;
  restore(save?: UpgradeSave): void;
}
```

`UpgradeSystem` has no DOM, Three.js, Rapier, audio, or event bus dependency.
The game validates `radioFound`, radio power, and stable state before invoking
research or activation, then emits typed edges. Failed research consumes
nothing. Restore filters unknown IDs, rejects an active ID in the wrong branch,
and never charges saved research again.

Runtime adapters are deliberately narrow:

```ts
machine.movement.setModifiers({
  speedMultiplier,
  effectiveWeightMultiplier,
  accelerationMultiplier,
});

machine.movement.setScriptedSpeedLimit(mps: number | null);
machine.power.setModifiers({ fuelBurnMultiplier, generationBonus });
defense.setModifiers({ damageMultiplier, fireRateMultiplier });
```

The story speed limit caps the normal player target; it never overwrites the
stored throttle. During braking use a distance curve such as
`remaining > 0.75 ? max(0.12, min(maxSpeed, remaining * 0.16)) : 0`. Dock at
`remaining <= 0.75 && currentSpeed <= 0.15`. A pure simulation test must prove
the machine reaches that condition instead of stopping 60 metres short or
approaching zero forever.

## Story and destination contracts

```ts
export type StoryPhase =
  | 'locked' | 'signal' | 'approach' | 'braking'
  | 'docked' | 'departing' | 'complete';

export interface StorySave {
  chapterId: 'wreck-one';
  phase: StoryPhase;
  arrivalDistance: number | null;
  journalsRead: string[];
  uniqueCollected: boolean;
  nextSignal: boolean;
}

export interface StoryInput {
  distance: number;
  radioFound: boolean;
  firstRunComplete: boolean;
  stable: boolean;
  speed: number;
  playerOnMachine: boolean;
}

export type StoryEffect =
  | { type: 'begin-signal' }
  | { type: 'begin-approach'; arrivalDistance: number }
  | { type: 'request-sanctuary'; active: boolean }
  | { type: 'request-speed-limit'; mps: number | null }
  | { type: 'deploy-gangway' }
  | { type: 'retract-gangway' }
  | { type: 'chapter-complete' }
  | { type: 'next-signal' };

export class StoryDirector {
  update(input: StoryInput): StoryEffect[];
  readJournal(id: string): boolean;
  collectUnique(): boolean;
  requestDepart(playerOnMachine: boolean): StoryEffect[];
  snapshot(distance: number): StoryView;
  toSave(): StorySave;
  restore(save?: StorySave): void;
}
```

The director is pure. Effects are one-shot edges. `requestDepart` succeeds only
when docked, the Course Gyro has been collected, and the player is back inside
the machine bounds. A blocked request returns a specific view/reason and makes
no state change. Journals never gate the unique component or departure.

`ThreatDirector.setSanctuary(true, distance)` prevents future queue/release
operations but does not clear live enemies. Story can request it only after
`stable` is true. Releasing sanctuary enters ordinary recovery through
`distance + 300`, instead of immediately rolling a threat beside the departing
wreck.

### Coordinate and collision contract

The fixed machine stays at the origin and the wreck scrolls. Before docking:

```ts
wreckZ = WORLD_Z_PER_METRE * (distanceTraveled - arrivalDistance);
```

At dock the wreck root is pinned to world `(12, 3.69, 0)`, unrotated, with
local forward `-Z`. Blender floor surfaces use local `Y=0`. The main machine
deck ends at world `X=5`; the wreck's inner edge is world `X=6`, leaving a
one-metre gap bridged by the gangway.

The model and explicit Rapier boxes share these local dimensions:

| Collider | Center | Half extents | Notes |
| --- | --- | --- | --- |
| floor | `(0,-0.10,0)` | `(6,0.10,9)` | top face exactly Y=0 |
| port wall fore | `(-5.9,1.25,-5)` | `(0.1,1.25,4)` | entry gap Z -1..1 |
| port wall aft | `(-5.9,1.25,5)` | `(0.1,1.25,4)` | entry gap Z -1..1 |
| outer starboard wall | `(5.9,1.25,0)` | `(0.1,1.25,9)` | full length |
| fore end | `(0,1.25,-8.9)` | `(6,1.25,0.1)` | 2.5m high |
| aft end | `(0,1.25,8.9)` | `(6,1.25,0.1)` | 2.5m high |
| bulkhead fore | `(2,1.25,-5)` | `(0.1,1.25,4)` | internal door Z -1..1 |
| bulkhead aft | `(2,1.25,5)` | `(0.1,1.25,4)` | internal door Z -1..1 |
| gangway | `(-6.5,-0.08,0)` | `(0.5,0.08,1)` | enabled only once docked |
| gyro pedestal | `(4.5,0.45,3)` | `(0.45,0.45,0.45)` | leaves central corridor clear |
| cargo A | `(-1,0.55,-5.8)` | `(1.1,0.55,1.1)` | explicit clutter |
| cargo B | `(-2,0.40,5.8)` | `(1.4,0.40,0.8)` | explicit clutter |

Both doorways are at least 2.0 metres wide and 2.2 metres high. The entire
`abs(z) < 1` route from gangway through the inner room remains free of clutter.
This clears the 0.34-metre player capsule plus 0.02-metre skin. There is no
triangle-mesh collision. The optional third area is a roofless cargo niche
without another separating collider.

Destination colliders do not move through the live physics world. They are
created/enabled at the final dock transform after the machine has settled.
They are disabled before departure motion. A docked save reconstructs the
wreck group, floor, walls, and gangway synchronously before teleporting the
restored player. A save in `approach`, `braking`, or `departing` is unsafe and
is deferred. `signal`, fully `docked`, and `complete` may save when the existing
enemy/boarding/player conditions are also safe.

The runtime destination surface is:

```ts
export class Destination {
  fixedUpdate(distance: number): void;
  setDocked(docked: boolean): void;
  get interactables(): readonly Interactable[];
  containsPlayer(position: Vec3Like): boolean;
  playerOnMachine(position: Vec3Like): boolean;
  dispose(): void;
}
```

`containsPlayer` is an XZ/Y volume check used for UI and save diagnostics, not
a teleport or a replacement for collision. `playerOnMachine` uses the actual
machine deck/engine-room bounds supplied by `Game`.

## Radio and art integration contracts

The radio is fixed machine equipment, not a build piece. Its model is hidden
until found and then attached to `machine.group`. The integration owner must
check the final mount against `Machine.equipmentCells`, the stairwell, starting
generator, player capsule, and interaction reach before freezing its transform.
The provisional mount is machine-local `(3.6, 3.69, -5.4)`, facing inward;
the checked transform wins and must be recorded in the data module and tests.

Astra/root supplies `salvaged-radio.glb`, about 0.68 metres wide, pedestal at
model Y=0, total antenna height about 1.85 metres, front toward model `-Z`, and
a named `SignalLamp` node. The found state changes visibility; powered signal,
unpowered static, and next-signal state drive the named lamp. Luna wires those
states but does not author its material.

Astra/root also supplies `expedition-wreck.glb` to the coordinate contract and
six upgrade add-ons with stable named roots. The functional scene uses a
single nullable interface:

```ts
export interface MachineUpgradeVisuals {
  apply(active: Partial<Record<UpgradeBranch, UpgradeId>>): void;
  dispose(): void;
}
```

Missing GLBs leave gameplay working and must not create procedural replacement
art. The same is true under `nomodel=1`.

The visual polish owner additionally completes:

- a consistent palette/material pass across the machine, player, skiff, radio,
  and wreck, preserving gameplay warning colors;
- a new original player GLB with locomotion that keeps feet close to the deck,
  plus grounded-foot/stride blending in `PlayerVisual.ts`;
- salvage and boarding cables whose endpoints come from the real muzzle/hook
  and chest/skiff/deck anchors every frame, with a readable pull/catenary or
  taut state and no detached endpoint during crossing;
- metal/organic hit differentiation, short target flash, impact particles,
  recoil, and damage-direction feedback without per-frame DOM or new damage
  rules; and
- upgrade geometry whose silhouettes show which one of each branch is active.

No visual effect may report damage or collection before the underlying gameplay
event succeeds.

## Typed events and save fields

Extend `GameEvents` with these edges:

```ts
'radio:found': {
  source: 'salvage-crate';
  distance: number;
  elapsedSincePlayable: number;
};
'radio:power': { powered: boolean };
'upgrade:researched': { id: UpgradeId };
'upgrade:active-changed': { branch: UpgradeBranch; id: UpgradeId | null };
'story:phase': { chapterId: 'wreck-one'; phase: StoryPhase };
'story:signal': { strength: number; remainingM: number | null; text: string };
'story:journal-read': { id: string };
'story:unique-collected': { id: 'course-gyro' };
'story:docked': { chapterId: 'wreck-one' };
'story:departed': { chapterId: 'wreck-one' };
'story:next-signal': { id: 'signal-two' };
```

Keep save version 1 because these are optional additions with one safe default:

```ts
progression: {
  // existing fields
  radio?: RadioSave;
  upgrades?: UpgradeSave;
};
world: {
  // existing fields
  story?: StorySave;
};
```

Defaults are: missing radio means pending once opening is done, missing
upgrades means none researched/active, and missing story means `signal` if the
radio was already found or `locked` otherwise. Unknown upgrade IDs and journal
IDs are ignored. An impossible active upgrade is removed. A docked save with
`uniqueCollected` remains docked until the player explicitly returns and
departs. No active infantry, skiff, projectile, thrown reel, or transition
snapshot is added.

Restore order in `Game` is mandatory:

1. clear current reel, combat, vehicle, destination, interactions, and panels;
2. restore progression, radio, upgrades, and story pure state;
3. restore machine damage/fuel and structures, then apply upgrade modifiers and
   refresh generator/turret registrations;
4. synchronously rebuild a docked wreck and its colliders if required;
5. restore and teleport the player;
6. refresh first-run facts and objective, radio/story UI, and safe-save state;
7. emit one restored snapshot per UI surface, not reward/unlock edges.

The stable-save predicate becomes:

```ts
opening.done &&
enemies.activeCount === 0 &&
!boarding.active &&
!hookInFlight &&
!playerDead &&
['locked', 'signal', 'docked', 'complete'].includes(story.phase)
```

Manual Save & Quit during braking or departure queues just like combat and
shows a specific “Wait until the machine is safely moored” message. It must
save at dock, or after departure reaches `complete`; storage failure keeps the
game open as the current implementation already requires.

## Exact ownership and integration order

The following file ownership is exclusive during parallel implementation.
Workers may request a narrow hook from another owner; they must not edit across
the boundary to save a round trip.

### Luna A — progression, pacing, and runtime modifiers

Owns:

- `src/data/upgrades.ts`
- `src/progression/UpgradeSystem.ts`
- `src/progression/EarlyRadioDrop.ts`
- `src/progression/Progression.ts`
- `src/game/FirstRunDirector.ts`
- `src/salvage/SalvageField.ts`
- `src/data/items.ts`, `src/data/recipes.ts`, `src/data/vehicles.ts`,
  `src/data/turrets.ts`, and balance-only changes in `src/data/power.ts`
- `src/machine/MachinePower.ts`
- `src/defense/DefenseSystem.ts`
- corresponding focused unit tests

This owner does not edit `Game.ts`, save/event/UI files, `VehicleScene.ts`, or
any art/asset/CSS file.

### Luna B — expedition domain and collision runtime

Owns:

- `src/data/story.ts`
- `src/story/StoryDirector.ts`
- `src/story/Destination.ts`
- `src/story/destinations/wreckOne.ts`
- `src/machine/MachineMovement.ts`, including both upgrade modifiers and the
  story speed-limit seam
- `src/enemies/ThreatDirector.ts` sanctuary seam
- `tests/unit/storydirector.test.ts`, `destination.test.ts`, and focused threat
  and movement tests

This owner does not edit `Game.ts`, save/event/UI files, `VehicleScene.ts`, or
any art/asset/CSS file.

### Luna C — composition, save, functional UI, and browser evidence

Owns:

- `src/game/Game.ts`
- `src/core/events/GameEvents.ts`
- `src/save/SaveSchema.ts`, `src/save/migrations/index.ts`
- `src/interaction/InteractionSystem.ts`
- `src/ui/RadioUI.ts`, `src/ui/ResearchUI.ts`, `src/ui/ExpeditionUI.ts`, and
  functional wiring in `src/ui/HUD.ts`
- ammo-recipe visibility in the UI layer
- `tests/unit/savemigrations.test.ts` and event/integration tests
- `tests/e2e/radio-expedition.spec.ts`, `tools/radio-expedition.mjs`, and
  updates to existing gameplay harnesses

This owner does not create models, textures, procedural meshes, CSS appearance,
or domain rules already owned by Luna A/B.

### Astra/root — all visual authorship and final integration review

Owns:

- `public/models/authored/**`, `assets/blender/**`, `tools/art/**`,
  `docs/art/**`, `ASSETS.md`
- `src/art/**`, `src/art/interface.css`, and appearance rules in UI CSS
- `src/player/PlayerVisual.ts` and the authored player model
- `src/vehicles/VehicleScene.ts` for visual-only cable/crossing interpolation
- any agreed visual-only edits to `MachineLegs.ts`, `HookModel.ts`, `ImpactFX.ts`,
  `HitFlash.ts`, and `DamageDirection.ts`

Astra does not change reward timing, hit damage, story transitions, collision
dimensions, or research modifiers while doing visual work.

Integration order is: shared types/data; radio guarantee and balance; upgrade
pure system and adapters; story director/destination; Game/save/event wiring;
functional UI; authored models and appearance; browser harnesses; full
regression and visual review.

## Bounded implementation slices

### Slice 1 — pin pacing and radio semantics

Add pure tests before integration for arming, first eligible open, duplicate
opens, missed-spawn recovery, old-save recovery, and found-save idempotence.
Change spawn distances and crate loot data. Change refining output and make the
first-run counter consume actual output quantity. Fix the already-crewed
tutorial transition and fact refresh seams. Hide infinite-ammo recipes in UI.

Acceptance: with normal inventory capacity and no debug grant, a real spawned
crate can be hooked, reeled, and opened; it gives the radio exactly once plus
the fixed cache and seeded normal loot. A second chest never gives another
radio. Missing a spawned chest does not disarm the reward.

### Slice 2 — research and all six live modifiers

Implement the data and pure `UpgradeSystem`, then apply each modifier through
the narrow machine/power/defense adapters. Add the powered-radio interaction
and functional research panel. Wire active-change edges to refresh visuals and
power registration.

Acceptance: all six can be researched with normal costs; insufficient
resources and unpowered radio consume nothing; only one per branch is active;
save/load preserves research and active choices; every displayed numeric
effect changes the real runtime measurement in the expected direction.

### Slice 3 — signal, approach, and safe docking

Implement the pure story state machine, scrolling transform, distance-aware
speed limit, sanctuary, model loading seam, and explicit collision boxes.
Integrate with safe-save boundaries and restore order before adding journals.

Acceptance: the sequence cannot start over live combat, reaches the dock from
700 metres without stopping short, reaches actual speed zero, and does not
enable the gangway early. The player walks from deck to wreck through both
openings under Rapier collision with no teleport. Falling does not leave an
invisible collision bridge after departure.

### Slice 4 — complete the wreck loop

Add three optional journal interactables, Course Gyro pickup, machine-radio
return requirement, departure ordering, next-signal state, audio/UI feedback,
and docked save/load.

Acceptance: Course Gyro is collected exactly once even with a full inventory;
journals can all be skipped; departure is blocked while the player is on the
wreck or before the gyro; return and radio interaction retract the gangway,
disable colliders, resume world scroll, begin a 300-metre threat recovery, and
emit the next signal once.

### Slice 5 — authored visual and feedback pass

Load and verify the radio, wreck, player, and six upgrade add-ons. Align the
models to the frozen coordinate contracts. Improve feet, cables, hit flashes,
impacts, recoil, damage direction, and palette consistency. Record assets and
capture representative art-review frames.

Acceptance: `tools/art/verify-assets.mjs` validates node names, dimensions, and
required models; `nomodel=1` remains playable; visual nodes never change
physics or progression; screenshots show each active upgrade distinctly at
ordinary gameplay distance.

### Slice 6 — evidence and regression

Add instrumentation and browser coverage, then run the full existing suite.
Fix regressions in the owning module rather than weakening checks.

## Required automated evidence

Unit tests must cover:

- radio arming, award, recovery, exact cache, idempotence, and optional save
  defaults;
- salvage cadence and minimum first target distance;
- 8 scrap -> 2 components and first-run advancing after four real crafts;
- already-crewed turret arming the tutorial on entering its step;
- tutorial and regular skiff stats, hook health, crossing stagger, telegraph,
  route-independent one-shot reward;
- every research refusal and success path, branch exclusivity, modifier
  composition, malformed save filtering, and restore without recharging;
- measured movement speed/acceleration, power capacity/burn, and turret
  damage/rate/draw for all six upgrades;
- complete story transitions, early-action idempotence, journal optionality,
  blocked departure, signal strength monotonicity, and next-signal one-shot;
- wreck scroll direction, braking convergence, dock epsilon, exact collider
  openings, gangway enable/disable, and sanctuary recovery;
- v1 saves missing all new fields, radio-found saves, researched-upgrade saves,
  signal saves, and docked player-on-wreck saves.

The browser test and `tools/radio-expedition.mjs` must use a real new game and
normal costs. They may accelerate simulated time and set deterministic camera
aim, but may not deposit resources, emit progression/story events, mark
director facts complete, write save internals, directly set `radioFound`,
directly set story phase, or claim a gameplay action succeeded without using
the runtime action that a player uses.

The end-to-end run must demonstrate:

1. opening reaches playable deck;
2. a naturally scheduled chest is targeted, hooked, reeled, and opened;
3. radio is found within 300 simulated seconds and is mounted/powered;
4. four paid refinery crafts produce eight components;
5. the existing workbench, gun, skiff, and repair loop completes;
6. at least one upgrade is researched with earned/starting resources and its
   measured runtime effect changes;
7. the signal schedules the wreck only after tutorial completion;
8. the machine brakes, reaches zero, and deploys a collidable gangway;
9. keyboard movement crosses the gangway and both doorways;
10. a journal opens and closes through interaction;
11. the Course Gyro is taken through interaction;
12. a docked save reloads with the player still supported on the wreck;
13. movement returns to the machine before radio departure succeeds;
14. world distance increases again and the next signal fires once; and
15. console/page errors stay empty in normal-model and `nomodel=1` runs.

Existing playable-loop, boarding, navigation, combat-regression, build,
opening, power, damage, and save tests remain required. Run `npm test`,
`npm run build`, and `npm run lint`, plus the documented browser harnesses.

## Playtest metrics and limits

Add a development-only `RunMetrics` collector that records event timestamps
and counters without changing gameplay:

- seconds from `opening.done` to first salvage target, first hook, and radio;
- chests spawned, missed, opened, and radio-eligible opens;
- scrap/fuel/components at guide steps and first upgrade;
- refinery attempts/successes and repeated clicks;
- tutorial skiff outcome, time to terminal state, damage taken, hook cut time,
  and repairs completed;
- signal start, expedition scheduling, braking start, dock, wreck entry, gyro,
  return, and departure times;
- gangway crossing failures/falls and save deferral duration; and
- chosen researched/active upgrades.

Expose one immutable debug snapshot under the existing development game
handle and print one compact JSON record at run end in the harness. Do not add
production telemetry, networking, identifiers, or per-frame logging.

Automated evidence proves transitions, timing under a deterministic driver,
collision reachability, save round-trips, and numeric effects. It does not
prove that aiming feels good, the skiff is subjectively fair, the radio is easy
to notice, feet look planted to a human, or the wreck is enjoyable to explore.
Those remain explicit human playtest questions; no agent or harness may report
them as completed without a person playing the build.

## Final review and follow-up

### Delivery and validation

Sol refined the plan and audited balance; Luna subagents implemented gameplay
and acceptance harnesses; Astra authored the Blender assets, integrated the
physical dock gate, reviewed presentation, and completed regression checks.
The result passes 974 unit tests, build and lint, all 38 existing browser checks
(37 in the full suite plus the corrected weapon test's targeted rerun), 37
chapter checks, and 33 guided first-run checks. Authored and fallback art views
and real GLTFLoader geometry/animation checks also passed.

The strict uninterrupted acceptance run proposed above was not performed.
Delivered evidence is split across a real keyboard opening/radio path, a
guided-loop harness using normal costs, and explicitly staged research,
expedition and save fixtures in `tools/chapter-flow.mjs`. The report records
their setup and limits; these results do not claim a human thirty-minute
playtest or a single untouched new-game-to-departure run.

### Final balance review, 2026-09-07

Sol's data audit priced the refinery, four component batches, workbench and
gun at 184 scrap. Each new station also requires its own 8-scrap floor; the
bare hull does not count as a built floor. The minimum three-floor route is
therefore 208 scrap, leaving 52 of the 260 starting scrap before salvage.
The first radio chest adds at least 34 scrap and 4 carried fuel; the tutorial
skiff bounty adds 30 scrap and 2 components. Further platforms and repairs
still have their ordinary costs.

The final Torque speed factor is 0.97: its reduced payload penalty overtakes
stock cruise speed at about 2,438 kg of added load, while acceleration remains
30% lower. The Governor's final capacity penalty is 2, so a healthy starting
generator retains exactly 14 capacity for the refinery, radio and base gun.
Additional load or generator damage can still shed stations. Safe emergency
uninstallation works without power and restores the removed module's effects.

Normal fuel loot averages 2.625 units per caught chest. At 7.5 m/s and the
180 m cadence, sustainable base fuel use requires about 55% of chest
opportunities to be caught; at the roughly 7.04 m/s tutorial load, about 58%.
The initial 60-unit tank provides a buffer. Fuel remains a manual deposit,
and the high-output generator still burns 50% more fuel. These figures are an
analytical audit of the game data, not a human thirty-minute playtest.

### Deferred features

Defer the second signal's destination, navigation/steering, more story
chapters, research tiers, additional upgrade slots, respec costs, automated
turrets, new wreck enemies, dock combat, procedural destinations, voice acting,
item rarity, and online telemetry. The Course Gyro and `signal-two` save facts
are the only contracts this pass leaves for the next chapter.
