# Next gameplay expansion: routes, gunboat, and specialist automation

Status: implementation-ready plan. Gameplay code is **not** part of the current
art round. The current shipped baseline is the completed graphics-v3 refinement in
[`docs/art/graphics-v3/README.md`](../../art/graphics-v3/README.md). New Blender
work and the completed lower-room correction are recorded in the companion
[`cohesive Blender refinement plan`](2026-09-07-cohesive-blender-refinement.md).

## Intended release

Recovering the Course Gyro turns the fixed helm into a useful navigation station.
The player chooses a short route with a guaranteed gunboat interception or a
longer route that spends more travel fuel but avoids that scripted contact. Both
routes lead to one second expedition, the Relay Foundry. The machine brakes and
docks through the existing physical gangway loop. The player explores on foot,
recovers two unique specialist components, returns to the machine, and departs.

Combat gains clearer weapon origin, surface, hit, recoil, and shot-resolution
feedback without changing rifle or shotgun damage. The new gunboat is a ranged
enemy vehicle with separately damageable hull, weapon, and engine. Disabling the
weapon stops future volleys. Disabling the engine keeps the gunboat in the
vulnerable broadside lane and prevents a normal escape. The player never boards
or captures it; the 1.0 roadmap explicitly leaves player boarding of enemy
machines outside scope.

The Foundry's Salvage Controller unlocks an automatic salvage collector. Its
limited buffer and continuous station-class power draw keep the manual reel useful.
The Foundry's Tracking Servo unlocks an automatic defensive turret. It has shorter
range, lower damage per second, slower traverse, and twice the base power draw of
the crewed deck gun. It uses no ammunition while `INFINITE_AMMO` is true. Existing
Heavy Breech and Fast Cycler research continues to affect the manual deck gun only.

This is one deliberately narrow release slice: two route cards, one destination,
one ranged vehicle, two specialist facts, one collector, and one automatic turret.
It does not require real-time steering, lateral terrain movement, off-path POIs,
more destinations, mixed fleets, vehicle capture, turret filters, an ammunition
economy, or a new research tree.

## Execution index

These are implementation work packets, not instructions to create separate Codex
tasks. Run independent contract/pure-logic packets in the same wave if workers are
already authorized, then serialize the four composition packets because they share
`Game.ts`. Status describes this planning round only.

| Order | ID | Result | Shared-file rule | Status |
| ---: | --- | --- | --- | --- |
| 0 | COL-00 | Lower-room collision/navigation prerequisite closed | Same owner as companion A08 | Complete; authored and fallback browser checks pass |
| 1A | NAV-01 | Expedition and direct/detour route data locked | No composition files | Planned |
| 1B | COM-01 | Semantic shot/muzzle/surface contract | Coordinates one call-site signature only | Planned |
| 2A | NAV-02 | Campaign state and legacy story conversion | Owns StoryDirector/save types | Planned |
| 2B | GUN-01 | Pure gunboat state and tuning | No scene/Game files | Planned |
| 2C | SPEC-01 | Specialist facts and build gates | No behavior/Game files | Planned |
| 3A | NAV-03 | Definition-driven destination runtime | No Game/story transitions | Planned |
| 3B | COM-02 | Pooled combat presentation | After COM-01 event contract | Planned |
| 3C | SAL-01 | Owner-aware, lossless salvage transfer | No build/Game files | Planned |
| 3D | AUT-01 | Pure automatic defense | No build/Game files | Planned |
| 4A | GUN-02 | Gunboat scene, threat, and encounter composition | First `Game.ts` writer | Planned |
| 4B | NAV-04 | Helm and second-expedition composition | After GUN-02 releases `Game.ts` | Planned |
| 4C | SAL-02 | Collector build/power/composition | After NAV-04; first new BuildSystem writer | Planned |
| 4D | AUT-02 | Automatic turret build/power/composition | After SAL-02 releases shared files | Planned |
| 5 | QA-01 | End-to-end release and save/lifecycle evidence | Defects return to owning packet | Planned |

## Current-source facts the implementation must preserve

- `StoryDirector` is a pure, one-chapter distance state machine. `Destination` is
  one hard-coded Wreck One scene. `Game` owns their effects, a fixed recovered
  radio, and all safe-save boundaries.
- `StorySave` is stored at `world.story`. Top-level save version 1 already uses
  additive optional state and local restore normalization. `machine.navigationTier`
  is written as `0` and has never been authoritative.
- `Progression` already has a monotonic string unlock ledger. `UpgradeSystem` has
  exactly three mutually exclusive branches. Specialist recovery is a story fact,
  not another research branch and not a capacity-limited inventory item.
- `ThreatDirector` schedules quiet first, requests one external `skiff`, and freezes
  while the external controller owns an encounter. `RECOVERY_M` and `CALM_MIN` are
  hard floors. `VehicleManager` and `VehicleScene` are deliberately specific to
  boarding-skiff choreography.
- Player weapons already have deterministic spread, range falloff, armor, recoil,
  hit markers, pooled particles, and sound events. `PlayerCombat` raycasts from the
  camera so the crosshair remains authoritative. Current `combat:hit.onMetal` is
  false for every damageable, including metal vehicle and structure targets.
- The manual deck gun has 42 damage, 1.2 shots/s, 48 m range, and 3 power draw.
  It is mounted through `DefenseSystem`. No automatic target selection exists.
- Power sheds whole classes in the order `light`, `station`, `defense`. A collector
  is a `station` consumer; a turret is a `defense` consumer. One under-supplied
  class turns off as a unit.
- `SalvageField` pools six drifting crates and currently uses one `hooked` boolean.
  Drops are rolled only on `open`, and `ResourceAccess.deposit` returns overflow.
  The current `open` callback discards that return value, so automation must first
  make ownership and partial transfer explicit.
- Build pieces use `structure | station | decor`; both new devices are stations.
  `BuildPieceInstance.state` is the existing persistence bag. Build restore has an
  exhaustive rank table, and manual-turret authorization is currently a one-off
  predicate in `Game`.
- The machine lower room and ramp already have visual geometry, Rapier boxes,
  projected equipment occupancy, deck cells, and a fixed navigation link. The
  companion art task A08 owns the current collision/visual correction.

## Architecture decisions

### Strategic routes before continuous steering

The Course Gyro enables route selection at the helm. It does not rotate the machine
or slide the whole world laterally in this release. The old provisional navigation
plan would require coordinated changes to terrain sampling, props, salvage,
destinations, foot planting, and saves before it produced a second playable place.
Two strategic routes provide an immediate choice through existing distance and
encounter systems:

| Route | Distance to Foundry | Scripted contact | Tradeoff |
| --- | ---: | --- | --- |
| `foundry-direct` | 750 m | one gunboat, requested at 500 m remaining | less fuel and time, forced ranged fight |
| `foundry-detour` | 1,150 m | none | more travel fuel and exposure to ordinary pacing |

Selection requires the Course Gyro, a powered helm, the player aboard, no live
encounter, and a stable story state. It is committed as soon as the player confirms
it and cannot be changed in approach, braking, docking, or departure. The UI shows
distance, the current estimated travel fuel from the machine's live burn rate, and
the direct-route gunboat warning before confirmation.

Continuous heading, fuel-paid turns, lateral POIs, extra routes, and biome routing
remain stretch work after this release proves the helm interaction and campaign
save contract.

### One campaign authority, one active destination

Keep the public `StoryDirector` name to minimize composition churn, but generalize
its pure state from one chapter to a small campaign. `Game` still applies one-shot
effects. Only one `Destination` instance and one active expedition exist at a time.
`Destination` consumes a data definition instead of embedding Wreck One IDs,
coordinates, colliders, and interactables.

```ts
export type ExpeditionId = 'wreck-one' | 'relay-foundry';
export type RouteId = 'foundry-direct' | 'foundry-detour';
export type StoryUniqueId =
  | 'course-gyro'
  | 'salvage-controller'
  | 'tracking-servo';

export interface ExpeditionDefinition {
  id: ExpeditionId;
  title: string;
  modelId: 'relay-wreck' | 'relay-foundry';
  approachDistanceM: number;
  brakingDistanceM: number;
  sanctuaryDistanceM: number;
  objective: string;
  journals: readonly StoryJournal[];
  requiredUniques: readonly StoryUniqueId[];
  placement: DestinationPlacement;
  interactables: readonly DestinationInteractableDefinition[];
  colliders: readonly DestinationColliderDefinition[];
}

export interface RouteDefinition {
  id: RouteId;
  destinationId: 'relay-foundry';
  distanceM: number;
  scriptedVehicle: 'gunboat' | null;
  scriptedVehicleRemainingM: number | null;
}
```

Wreck One remains behaviorally identical. It retains its current early sanctuary
behavior to avoid silently retuning the delivered opening. The Foundry permits
ordinary threats during travel and requests sanctuary only at 180 m remaining,
after all live or scripted encounters are clear. If the direct-route gunboat is
still active at 220 m remaining, the director holds the destination 220 m ahead by
advancing `arrivalDistance` with traveled distance and caps speed at 2 m/s. It does
not delete the encounter, dock through it, or create another one. The hold clears
on the encounter terminal edge.

### Additive, locally versioned saves

Keep top-level `CURRENT_SAVE_VERSION = 1`. The new world field still has exactly one
meaning when absent: restore the current legacy Wreck One state. Version the story
payload itself because its shape changes.

```ts
export interface ActiveExpeditionSave {
  expeditionId: ExpeditionId;
  routeId: RouteId | null;
  phase: Exclude<StoryPhase, 'locked' | 'route-selection' | 'complete'>;
  arrivalDistance: number | null;
  journalsRead: string[];
  scriptedEncounter: 'not-due' | 'queued' | 'resolved';
}

export interface CampaignSave {
  format: 2;
  completed: ExpeditionId[];
  recoveredUniques: StoryUniqueId[];
  active: ActiveExpeditionSave | null;
}

export type StorySave = LegacyWreckOneStorySave | CampaignSave;
```

`StoryDirector.restore` performs the conversion. A legacy `complete` save becomes
completed Wreck One and recovered Course Gyro; route selection is derived from those
facts rather than stored separately. A legacy
docked/approaching save stays in Wreck One with its journal and gyro state. Unknown
expeditions, routes, journals, and uniques are filtered against data. An approach
without a finite arrival distance returns to the preceding safe choice (`signal`
for Wreck One, `route-selection` for Foundry). A malformed completed Wreck One is
normalized to include the Course Gyro because departure could not legitimately
have completed without it.

`machine.navigationTier` is written as a derived compatibility value: 1 when the
Course Gyro is in `recoveredUniques`, otherwise 0. It is never read as campaign
authority because existing shipped saves always wrote 0. The unlock ledger remains
the build authority. On load, a recovered specialist component idempotently grants
its matching blueprint; an existing blueprint without the story fact is preserved
for debug and forward compatibility.

`recoveredUniques` is also the only story authority for pickup progress. The active
expedition does not carry a second copy. Destination presentation filters that global
set through the active definition.

Collector contents use `BuildPieceInstance.state`, and automatic-turret yaw/pitch
use a new optional `progression.automaticTurrets` array. Cooldowns, current targets,
salvage reservations, cable progress, and active encounters are transient. Safe
saves remain forbidden during infantry, skiff, or gunboat encounters and during
approach/braking/departure. On loading malformed data with
`externalEncounterActive: true` but no persisted encounter, clear that flag into a
normal recovery window instead of leaving the threat director frozen forever.

### Separate ranged and boarding vehicle controllers

Extend `VehicleId` to `'skiff' | 'gunboat'`, but do not generalize the existing
boarding state machine into a union of unrelated phases. Add a pure
`GunboatEncounter` and a `GunboatScene`. A small `ExternalEncounterCoordinator` in
`Game` enforces that infantry, skiff, gunboat, and destination sanctuary never
start on top of one another. `ThreatDirector` changes its saved
`vehicleQueued?: boolean` to `queuedVehicle?: VehicleId`; restore maps old `true`
to `'skiff'`.

```ts
export type GunboatPhase =
  | 'approach' | 'telegraph' | 'broadside'
  | 'retreat' | 'destroyed' | 'ended';

export interface GunboatState {
  phase: GunboatPhase;
  side: 'port' | 'starboard';
  lateral: number;
  forward: number;
  hullHealth: number;
  weaponHealth: number;
  engineHealth: number;
  phaseElapsed: number;
  nextVolleyAt: number;
  volleySerial: number;
  outcome: 'hull' | 'weapon-and-engine' | 'escaped' | null;
}
```

Starting gunboat values live in `src/data/vehicles.ts`: hull 420/armor 6, weapon
120/armor 2, engine 160/armor 4, lane 18 m, two 10-damage shells every 4 seconds,
1.2-second visible/audio telegraph, 0.9-second flight, and 45 scrap + 3 components
for destroying the hull. Disabling only the weapon stops new volleys but permits a
three-second retreat. Disabling only the engine keeps it broadside and firing.
Disabling both ends the encounter after a five-second disabled presentation and
awards 30 scrap + 2 components. A shell already launched still resolves after the
weapon is disabled. The gunboat has no crew actors, hook, gangway, or boardable
surface in this slice.

### Preserve crosshair authority while improving presentation

Damage rays remain camera hitscan. `PlayerVisual` exposes a world-space muzzle
marker derived from the held model's authored `Muzzle` node, with the existing fit
axis as fallback. `PlayerCombat` receives that point only for presentation. A tracer
starts at the visible muzzle and ends at the camera ray result, so close obstruction
does not move the crosshair hit.

Keep per-impact events for particles and sound, and add one aggregate result per
trigger pull so the HUD does not treat nine shotgun pellets as nine separate shots.

```ts
export type ImpactSurface = 'flesh' | 'metal' | 'sand';

'weapon:fired': {
  shotId: number;
  weaponId: string;
  ammoRemaining: number;
  visualOrigin: Vec3Like;
  aimEnd: Vec3Like;
};
'combat:hit': {
  shotId: number;
  position: Vec3Like;
  normal: Vec3Like;
  targetId: string | null;
  targetKind: DamageableKind | null;
  surface: ImpactSurface;
  damage: number;
  onMetal: boolean; // derived compatibility field during this slice
};
'combat:shot-resolved': {
  shotId: number;
  weaponId: string;
  pelletsHit: number;
  totalDamage: number;
  targetIds: string[];
};
```

Vehicle, structure, subsystem, hook, and machine colliders classify as metal;
infantry classifies as flesh; non-damageable terrain classifies as sand/metal from
collider metadata with sand as the default world surface. Rifle/shotgun damage,
spread, pellets, range, falloff, magazines, reloads, and fire rates do not change in
the feel pass. Add data-driven camera kick recovery and held-model recoil offsets,
but keep the existing recoil magnitudes as the starting values.

### Specialist facts unlock build blueprints

The two components are unique story facts and consume no inventory slot. They grant:

```ts
export type UnlockId =
  | 'manual-turret'
  | 'automatic-salvage-collector'
  | 'automatic-defense-turret';

export const SPECIALIST_BLUEPRINT: Record<StoryUniqueId, UnlockId | null> = {
  'course-gyro': null,
  'salvage-controller': 'automatic-salvage-collector',
  'tracking-servo': 'automatic-defense-turret',
};
```

Add `requiredUnlockOf(piece)` in build data and replace the manual-turret special
case in the `BuildSystem` authorization callback. Failed/locked placement spends
nothing. Build menu cards show the missing named component.

### Collector ownership and lossless transfer

Replace the crate's `hooked` boolean with `claimedBy: SalvageClaimOwner | null`.
Keep `hook(id)` and `reelIn` as manual compatibility wrappers. The new API is:

```ts
export type SalvageClaimOwner = 'manual' | `collector:${string}`;

claim(id: string, owner: SalvageClaimOwner): boolean;
release(id: string, owner: SalvageClaimOwner): boolean;
pullClaimed(dt: number, id: string, owner: SalvageClaimOwner, toward: Vec3Like): boolean;
transferContents(id: string, deposit: (id: ItemId, count: number) => number):
  { opened: boolean; remaining: readonly ItemStack[] };
```

The first transfer rolls and stores the crate manifest. Deposits return leftover;
the crate retires and emits `loot:collected` only after every item is accepted.
Partial contents stay on the claimed crate. This fixes the current full-inventory
loss case for manual salvage as well as making automatic capture safe.

An automatic collector has a six-slot saved buffer, 32 m scan range, one claim at a
time, 12 m/s pull speed, a four-second reset after a completed crate, and 4 station
power draw. It chooses the nearest reachable unclaimed crate, ties by crate id, and
does not increase spawn cadence or drop values. On buffer-full, it holds the crate
at the intake and reports `BUFFER FULL`. On power loss, demolition, reset, or load,
it releases the transient claim and retracts presentation. The player transfers
buffer contents through the existing inventory UI. Its cost is 55 scrap + 6
components, weight 280, health 130, armor 1.

### Automatic defense is a separate pure system

Do not put autonomous behavior into the mounted-only `DefenseSystem`. Add an
`AutomaticDefenseSystem` with the same callback style and shared `TurretAim` math.
It registers only `turret-auto` pieces. Target selection is deterministic: visible,
alive targets in range, nearest first, stable id as the tie break. It may target
infantry and gunboat hull/weapon/engine colliders; it never targets salvage,
structures, hooks, or the player.

Starting automatic-turret values: 18 damage, 1.0 shot/s, 30 m range, 6 defense power
draw, 90 degrees/s yaw, 60 degrees/s pitch, and 0.35 seconds of continuous line of
sight before the first shot after acquiring/restoring power. Its cost is 65 scrap +
8 components, weight 190, health 120, armor 1. It has no crew interaction and no
ammo consumption while `INFINITE_AMMO` is true. Power loss cancels target lock and
stops fire immediately; power restoration requires a fresh lock delay. Cooldown
never banks multiple shots. Existing manual-gun research modifiers and visible
attachments do not affect it in this release.

### FA01–FA05 are planned asset prerequisites

The companion
[`cohesive Blender refinement plan`](2026-09-07-cohesive-blender-refinement.md#future-gameplay-artwork-packets--planned-not-part-of-this-rounds-exports)
now owns the exact FA01–FA05 packets for the helm, Relay Foundry, gunboat,
automatic salvage collector, and automatic defensive turret. Those packets are
planned later and are not part of the current exports. Logic, data, save, and
`?nomodel=1` work can proceed against their contracts, but QA-01 cannot claim the
authored release path until the matching packet is delivered and reviewed.

| Asset | Required runtime nodes / contract |
| --- | --- |
| Helm (FA01) | `HelmRoot`, `GyroInstalled`, `HelmPowerLamp`, `HelmInteract`; fixed machine-local transform |
| Relay Foundry (FA02) | `FoundryRoot`, `Gangway`, `EntryAnchor`, `ExitSightline`, `SalvageController`, `TrackingServo`, and one marker per agreed journal id; no mesh-derived collision |
| Gunboat (FA03) | `GunboatRoot`, `GunboatGunYaw` -> `GunboatGunPitch` -> `GunboatMuzzle`, `WeaponDamageAnchor`, `EngineDamageAnchor`, `EngineExhaust`, `WeaponDisabled`, `EngineDisabled`; collider envelopes remain runtime data |
| Collector (FA04) | `CollectorRoot`, `DrumPivot`, `GuidePivot`, `HookExit`, `BufferLamp`, `CollectorInteract`, `ControllerInstalled`; one-cell station envelope |
| Automatic turret (FA05) | `AutoTurretRoot`, `TurretYaw`, `TurretPitch`, `Muzzle`, `TrackerHead`, `PowerLamp`, `ServoInstalled`; one-cell station envelope |

Astra owns Blender sources, exports, textures, node names, and look review. Luna owns
nullable factory wiring, fallback-coordinate behavior, and gameplay state. A missing
or invalid authored asset must fail as a whole to the existing functional fallback;
Luna does not improvise a second art direction in runtime code.

## Implementation tasks

Every task below is a bounded Luna handoff. The named owner is the only writer to
its files while the task runs. Shared composition files are deliberately isolated
to sequential integration tasks. A worker returns the changed-file list, named test
results, and any acceptance evidence; passing unrelated tests is not a substitute
for the exit criteria.

### COL-00 — Close the downstairs collision prerequisite

**Owner and files:** the A08 Luna integration owner from the companion art plan;
`src/machine/MachineGeometry.ts`, `src/machine/Machine.ts`, only the minimum needed
`src/machine/MachineLegs.ts` / `src/art/MachineDetailModels.ts`, and new
`tests/unit/machine-lower-room.test.ts`. Do not let a later gameplay worker reopen
these files concurrently.

**Depends on:** companion A06/A08 staging where applicable. Blocks NAV-04, GUN-02,
SAL-02, and AUT-02 because all put more reasons to move through or fight around the
machine.

**Steps:**

1. Export one shared lower-room layout contract from `MachineGeometry`: deck/well
   bounds, ramp center/rotation/width, floor plane, room interior bounds, and coaming
   bounds. Derive render geometry and Rapier boxes from those values. Make
   `Machine.deckCells`, projected equipment cells, and the fixed lower/upper nav
   link consume the same contract instead of repeating `-3..-1`, `-2..2`, and link
   endpoints independently.
2. Remove or relocate visual-only beams that cross the player capsule. Add a simple
   authoritative collider and navigation/build occupancy only for a large obstacle
   that remains in walkable space. Do not box-collide the whole room or add a global
   autostep workaround.
3. Add pure assertions that the ramp top meets the deck opening, the foot meets the
   lower floor, the ramp stays between coamings, the upper/lower nav-link endpoints
   are walkable cells, and projected equipment occupancy does not close the route.
4. Add a fixed-step Rapier capsule probe down and up the ramp at rest and at the two
   largest shipped body-pose offsets. Probe the room perimeter and head clearance.
5. Repeat with authored detail enabled and `?nomodel=1`; visual skins must not change
   collision results.

**Acceptance proof:** one uninterrupted walk deck → ramp → lower floor → perimeter
→ ramp → deck in both visual paths; no snag, fall-through, invisible cross-member,
camera wall lock, or enemy nav dead end. The exact collider count and walkable link
endpoints are asserted. `stair-collider`, `navgraph`, build-grid/validation, machine
legs, and the new lower-room tests pass.

**Save/failure cases:** no save shape changes. A player loaded inside the lower room
remains above the floor; invalid authored roots fall back without collider changes.
If the capsule probe fails, correct local geometry/collider bounds; do not raise
global autostep or teleport the player as a workaround.

**Luna exit:** deliver only the reviewable shared-contract/correction/test diff and
attach the coordinates of any deliberately retained walkable obstruction for
subsequent device placement review.

### NAV-01 — Lock campaign, route, and expedition data contracts

**Owner and files:** Luna navigation-data; `src/data/story.ts`, new
`src/data/routes.ts`, and new/updated unit fixtures in `tests/unit/story-data.test.ts`.

**Depends on:** current completed Wreck One behavior only.

**Steps:**

1. Replace the literal Wreck One-only chapter id types with the unions and
   definitions above. Express Wreck One through data without changing its current
   coordinates, journal text, 700 m approach, or Course Gyro requirement.
2. Add Relay Foundry data: 180 m braking/sanctuary threshold, two optional journals,
   two required unique pickup ids, one return/depart interaction, and a compact
   placement/collider contract. Use named interaction anchors from the companion art
   plan; retain explicit fallback coordinates for model-disabled operation.
3. Add exactly the two route definitions and values above. Validate unique ids,
   journal ids, destination ids, route target, positive distances, hazard threshold,
   and globally unique interaction ids at module load or through a pure validator.
4. Keep narrative text in data. Do not put route labels or Foundry objectives in UI
   conditionals.

**Acceptance proof:** data validation accepts both shipped expeditions and routes;
duplicate ids, unknown destination/unique ids, invalid distances, or a gunboat
threshold inside the 220 m hold boundary are rejected by targeted tests.

**Save/failure cases:** definitions are not serialized. Removed/renamed ids must be
handled by NAV-02 restore aliases before data changes ship.

**Luna exit:** no Three.js, Rapier, DOM, `Game.ts`, or asset edits; deliver the exact
typed data contract NAV-02 and NAV-03 will consume.

### NAV-02 — Generalize StoryDirector and migrate legacy story payloads

**Owner and files:** Luna campaign-state; `src/story/StoryDirector.ts`,
`src/save/SaveSchema.ts` type imports/optional fields only,
`tests/unit/storydirector.test.ts`, and `tests/unit/savemigrations.test.ts`.

**Depends on:** NAV-01.

**Steps:**

1. Retain `StoryDirector` as a pure class and implement `CampaignSave format: 2`.
   Add `route-selection` to the view phase and parameterize journal/unique checks by
   the active `ExpeditionDefinition`.
2. Preserve all current Wreck One transitions and effect order. On Wreck One
   completion, expose route selection instead of only a weak terminal signal.
3. Implement `selectRoute(routeId, context)` with typed refusal results for missing
   gyro, unpowered helm, off-machine, unstable, encounter-active, and already
   committed. Success creates one Foundry approach with the route distance and
   `scriptedEncounter: not-due`.
4. Emit one-shot effects for route availability, commitment, scripted vehicle due,
   holding at 220 m, sanctuary, docking, departure, and expedition completion.
   Effects never reach Three/Rapier or mutate threat state directly.
5. Implement legacy conversion and invariant repair exactly as described in the
   save section. Keep top-level save version 1.
6. Make unique recovery an id-taking idempotent operation. Departure requires every
   `requiredUniques` id and the player aboard; optional journals never gate it.

**Acceptance proof:** preserve all original story tests; add complete tests for both
routes, one-shot hazard request, unresolved-hazard hold, delayed sanctuary, dock,
two unique pickups, return gate, departure, and next stable route state. Round-trip
every safe phase. Test legacy locked/signal/docked/complete payloads, unknown ids,
duplicate ids, missing arrival, NaN/Infinity, and malformed completion.

**Save/failure cases:** serialization returns fresh arrays. Loading a legacy complete
save grants route availability once; loading a legacy docked save does not duplicate
the gyro. Invalid active Foundry state returns to route selection without moving the
world or granting components. `machine.navigationTier` remains derived later in
Game, not read here.

**Luna exit:** no UI, destination, threat, or `Game.ts` edits; publish the exact
effect/refusal union in the handoff.

### NAV-03 — Make Destination definition-driven

**Owner and files:** Luna destination-runtime; `src/story/Destination.ts`,
`src/art/ExpeditionModels.ts` loader lookup only, `tests/unit/destination.test.ts`,
and `tests/unit/expedition-gate.test.ts`.

**Depends on:** NAV-01 and COL-00's coordinate contract.

**Steps:**

1. Replace Wreck One literals in `Destination` with an injected definition and
   optional loaded model. Add `configure(definition, model)` that is legal only
   while inactive; it removes old destination colliders/interactables before
   installing the new definition.
2. Resolve named authored anchors first and validated fallback coordinates second.
   Missing optional journal anchors omit the visual anchor but retain a reachable
   fallback. Missing required unique/gangway anchors fail the authored model and use
   the whole fallback model; never mix a wrong authored collider with fallback
   interaction positions.
3. Generalize progress from `uniqueCollected: boolean` to sets of journal and unique
   ids. Keep world transforms, docking pin, contains-player, player-on-machine, gate,
   and disposal behavior stable.
4. Build/remove only the data-declared simple colliders. Decorative GLB meshes never
   become collision automatically. Ensure reconfigure/reset does not leak colliders,
   meshes, cloned materials, or stale interactables.

**Acceptance proof:** all current Wreck One tests pass through its definition. New
tests swap Wreck → Foundry → Wreck, verify exact collider removal counts, verify
unique interactables disappear independently, and prove inactive/docked containment
and gangway rules for each. Test authored-anchor success and required-anchor fallback.

**Save/failure cases:** Destination has no independent save; NAV-04 reconstructs it
from campaign authority. Unknown definition is refused while leaving the inactive
runtime empty. Repeated load/new-game does not retain the previous destination.

**Luna exit:** no story transitions, UI, build, or `Game.ts`; provide one small
constructor/configure API for NAV-04.

### NAV-04 — Install the powered helm and compose the second expedition

**Owner and files:** one Luna composition owner; `src/game/Game.ts`,
`src/interaction/InteractionSystem.ts`, new `src/ui/HelmUI.ts`, generalized
`src/ui/ExpeditionUI.ts`, `src/core/events/GameEvents.ts`, `src/audio/GameSounds.ts`,
and focused `tests/e2e/expedition-two.spec.ts`.

**Depends on:** COL-00, NAV-02, NAV-03, SPEC-01, GUN-02, and accepted helm/Foundry
asset anchors.

**Steps:**

1. Add a fixed `helm` interactable at the validated machine anchor. It is visible
   before gyro recovery but reads `GYRO SOCKET EMPTY`. On recovery, register a
   1-draw station consumer and expose route selection when powered. Do not make the
   helm a player-buildable piece.
2. Add `HelmUI` with two data-driven cards, distance, estimated fuel, hazard text,
   explicit confirmation, and typed refusal copy. Estimate only; route selection
   never pre-charges fuel. Close/release pointer lock through existing panel rules.
3. Generalize story event payloads from literal `'wreck-one'` to `ExpeditionId` and
   unique ids. Keep compatibility event names where listeners already exist.
4. Apply campaign effects in one `Game` switch. Configure the one Destination before
   activation; route the scripted gunboat request through the encounter coordinator;
   apply the 220 m hold; start sanctuary only after encounter clearance and at the
   Foundry braking edge.
5. On save, write the campaign payload, derived `navigationTier`, unlocks, and active
   destination state. On load/new game, clear destination and encounter presentation
   first, restore progression/campaign, reconcile specialist unlocks, configure the
   active definition, then enable colliders/gangway.
6. Generalize `ExpeditionUI` labels and unique list from definition data. It must show
   each Foundry component independently and make the return requirement clear.

**Acceptance proof:** e2e from a staged legacy-complete save: helm appears, powerless
selection refuses without state change, direct and detour each commit once, the
machine cannot switch routes in flight, the right distance is used, Foundry docks,
both components can be recovered, departure refuses from the Foundry/gangway and
succeeds from the machine. Verify route/foundry reload at every safe boundary and
`?nomodel=1`. No threat begins in sanctuary or while another external encounter is
active.

**Save/failure cases:** route confirmation requests autosave but respects safe-save
rules. An IndexedDB failure keeps the committed in-memory route and reports normal
save failure. Loading missing Foundry art uses fallback. Loading unknown campaign
ids returns to route selection, never to a half-collided destination. A recovered
component grants its blueprint exactly once even if the unlock already exists.

**Luna exit:** do not add lateral steering or a world map. Final integration exit is
blocked until GUN-02 and both automation build gates pass their contracts.

### COM-01 — Add semantic shot results without retuning weapons

**Owner and files:** Luna combat-core; `src/player/PlayerCombat.ts`,
`src/player/Player.ts`, `src/player/PlayerVisual.ts`, `src/art/HeldItem.ts`,
`src/core/events/GameEvents.ts`, `src/combat/Damageable.ts`,
`src/data/weapons.ts`, and `tests/unit/playercombat.test.ts` / held-item tests.

**Depends on:** current graphics-v2 weapon sockets; companion revisions must retain
the `Muzzle` contract.

**Steps:**

1. Expose an actual held-model muzzle world position. Prefer named `Muzzle`; derive a
   stable marker from `fitHeldItem` when absent. Return copies or write into a caller
   vector to avoid exposing mutable scene state.
2. Generate a monotonic session-local `shotId` for every accepted trigger pull.
   Damage ray origin/direction remain the camera. Record the furthest pellet result
   or range endpoint as `aimEnd`; presentation begins at the visible muzzle.
3. Add `Damageable.surface` or a central kind-to-surface classifier. Fix vehicle,
   structure, subsystem, hook, and machine impacts to metal; infantry to flesh;
   terrain defaults to sand. Keep `onMetal` derived while existing listeners migrate.
4. Emit per-impact events with actual post-armor damage and one aggregate
   `combat:shot-resolved` after the pellet loop. De-duplicate target ids in the
   aggregate result. Keep kill confirmation on the existing authoritative
   `enemy:killed`/vehicle terminal events rather than guessing from damage amount.
5. Move recoil recovery/kick presentation parameters into weapon data without
   changing current damage/spread/fire values. Apply bounded held-model translation/
   rotation that settles deterministically and does not affect ray direction.

**Acceptance proof:** tests prove camera-ray authority, visual origin differs from
camera when a muzzle exists, rifle emits one result, shotgun emits one result with
N impacts, metal damageables make metal events, terrain makes sand, damage is
post-armor, shot ids increase, and recoil returns to rest. Existing weapon, held-item,
ammo, and damage tests remain green.

**Save/failure cases:** shot ids/recoil are transient. Load/equip/reload resets held
presentation without changing saved magazines. Missing muzzle uses fallback and
never produces NaN. `INFINITE_AMMO` behavior stays exactly as configured.

**Luna exit:** no stat balance, enemy AI, FX tuning, or `Game.ts` beyond the smallest
call-site signature update coordinated with COM-02.

### COM-02 — Consume combat feedback in pooled FX, HUD, and audio

**Owner and files:** Luna combat-presentation; `src/fx/ImpactFX.ts`, new or existing
pooled tracer helper, `src/ui/HUD.ts`, `src/audio/GameSounds.ts`, and targeted FX/
sound/HUD tests.

**Depends on:** COM-01 and companion art review of weapon muzzle nodes.

**Steps:**

1. Position the pooled muzzle flash from `weapon:fired.visualOrigin`, not the camera
   passed to `ImpactFX.update`. Keep manual/automatic turret origins in their own
   fired events so simultaneous weapons cannot move one global light incorrectly.
2. Add a small pooled tracer budget. Rifle shows one short tracer; shotgun shows at
   most three representative pellet traces. Traces are presentation only and expire
   quickly. Quality changes resize/dispose buffers through the existing quality path.
3. Select impact particles and sounds from `surface`. Aggregate hit marker strength
   from `combat:shot-resolved`; one trigger pull produces one marker pulse. Use the
   existing authoritative killed/terminal events for a distinct terminal cue.
4. Layer current weapon sounds with a bounded mechanical tail/reload cue; use existing
   WebAudio pooling and mute controls. Do not add per-pellet sound nodes.
5. Dispose all subscriptions, geometries, materials, lights, and audio handles on
   reset/dispose; repeated quality changes must not grow scene resources.

**Acceptance proof:** unit/event tests prove one HUD pulse per trigger, correct
surface selection, max tracer count, and disposal. A focused combat review fires
rifle/shotgun into sand, metal structure, infantry, skiff, and gunboat parts in
day/night lighting with no crosshair obstruction or frame-long flash.

**Save/failure cases:** presentation has no save. Missing surface uses sand; missing
visual origin uses ray origin. An FX listener failure cannot stop damage or other bus
listeners.

**Luna exit:** report before/after event counts for one rifle shot and one full
shotgun shot; do not claim feel acceptance from unit tests alone.

### GUN-01 — Implement the pure gunboat encounter and data

**Owner and files:** Luna gunboat-logic; `src/data/vehicles.ts`, new
`src/vehicles/GunboatEncounter.ts`, and new `tests/unit/gunboat-encounter.test.ts`.

**Depends on:** COM-01's surface/damage result contract only for integration, not
for pure state work.

**Steps:**

1. Extend `VehicleId` and add gunboat/subsystem definitions with all tuning values in
   data. Do not force gunboat fields into `VehicleCombatProfile`, which describes the
   skiff's hook/crew choreography.
2. Implement immutable create/step/damage functions for approach, telegraph,
   broadside, subsystem outcomes, retreat, destroyed, and ended. Clamp dt/damage and
   health. Emit volley serial edges from state; do not own audio, physics, RNG, or a
   clock outside fixed-step input.
3. Apply the exact counterplay: weapon zero cancels only future volleys; engine zero
   prevents retreat and holds lane; both zero resolves disabled after five seconds;
   hull zero resolves destroyed immediately; already launched shells are external.
4. Add plain state serialization/restore helpers even though safe saves do not write
   active encounters yet. Filter invalid phases/numbers to a safe ended state.

**Acceptance proof:** fixed-step tests cover each subsystem alone, both orders of
dual disable, hull kill, shot already in flight, no volley after weapon disable,
engine-disabled lane hold, deterministic terminal edge, reward outcome, dt zero/
negative, excessive damage, and JSON round trip.

**Save/failure cases:** encounter save helpers are future-facing. The release save
gate never writes them. Restore of corrupt/unknown gunboat state must end safely, not
spawn rewards or freeze the director.

**Luna exit:** no Three.js, Rapier, ThreatDirector, `VehicleScene`, or `Game.ts`.

### GUN-02 — Integrate a non-boardable gunboat and encounter scheduling

**Owner and files:** one Luna gunboat-integration owner; new
`src/vehicles/GunboatScene.ts`, optional new
`src/vehicles/ExternalEncounterCoordinator.ts`, `src/enemies/ThreatDirector.ts`,
`src/game/Game.ts`, `src/core/events/GameEvents.ts`, `src/audio/GameSounds.ts`,
`src/art/DefenseModels.ts` loader/socket validation only, and targeted threat,
vehicle-scene, save, and `tests/e2e/gunboat.spec.ts` tests.

**Depends on:** COL-00, COM-01, GUN-01, NAV-02's scripted-vehicle effect contract,
and an accepted gunboat asset contract. NAV-04 later exercises the direct-route
request end to end.

**Steps:**

1. Build `GunboatScene` as a transform/choreography adapter over pure state. Require
   named Hull, Weapon, Engine, Muzzle, and shell-origin nodes; use validated fallback
   anchors in `?nomodel=1`. Add simple authored-contract colliders only for hull,
   weapon, and engine. Do not add a walkable collider, crew seats, hook, or gangway.
2. Register three `Damageable` ids (`gunboat:hull`, `gunboat:weapon`,
   `gunboat:engine`) with part armor and metal surface. Damage updates only its part,
   events name the part, and dead-part visuals remain target-ineligible.
3. Plan/telegraph volleys through the existing delayed-target approach. Choose only
   valid exposed targets already supported by the skiff volley planner; each shell
   resolves once. Weapon disable stops scheduling, not shells already queued.
4. Generalize `ThreatDirector` queued vehicle state while preserving calm/recovery
   floors and all old skiff tests. Add `queueExternal('gunboat')` for a scripted route
   request; make it idempotent and defer while infantry/skiff/gunboat/sanctuary owns
   the encounter.
5. Enforce one external encounter in Game/coordinator. Include gunboat in stable
   research, destination approach, save safety, HUD warnings, new-game/load clear,
   and threat completion. Pay exactly one terminal reward.
6. Reconcile a loaded director with `externalEncounterActive` but no serialized
   external scene by calling a no-reward abort/recovery path.

**Acceptance proof:** existing skiff/boarding tests remain unchanged. New tests prove
old `vehicleQueued: true` restores to skiff, scripted gunboat requests once, external
exclusivity, sanctuary deferral, recovery floor, subsystem raycast ids, no boardable
surface, one reward, no reward on abort/load repair, and complete disposal. E2E
demonstrates weapon-only, engine-only, dual-disable, and hull-kill outcomes. NAV-04
adds the route-specific direct/detour assertions after its wiring exists.

**Save/failure cases:** save/save-and-quit refusal says `Finish the gunboat attack`.
An asset load failure uses fallback. Missing mandatory authored nodes rejects that
model as a unit. If the encounter controller/scene disagrees during reset, abort
without reward and release ThreatDirector into recovery.

**Luna exit:** attach event trace from request → buildup → spawn → telegraph → one
terminal edge → recovery. No player boarding/capture and no mixed vehicle fleet.

### SPEC-01 — Add specialist component and blueprint gates

**Owner and files:** Luna progression-data; `src/progression/Progression.ts`,
`src/data/build-pieces.ts`, new `src/data/automation.ts`,
`src/core/events/GameEvents.ts`, `src/ui/BuildUI.ts`, and progression/build-data tests.

**Depends on:** NAV-01 unique ids.

**Steps:**

1. Add the two unlock ids, unique-to-blueprint mapping, `collector-auto` and
   `turret-auto` station definitions, costs/stats above, build-order entries, restore
   ranks, and named missing-component descriptions.
2. Add `requiredUnlockOf(piece)`/`canBuildPiece(piece, progression)` data helpers and
   replace caller-side knowledge in the later integration tasks. Keep the manual
   turret's existing guaranteed unlock behavior.
3. Add idempotent specialist recovery events. Do not add either component to
   `ItemId`, recipes, normal drops, radio research, or `UpgradeBranch`.
4. Build UI shows locked cards without offering placement. Unknown unlock strings in
   old/forward saves remain preserved by `Progression`; typed snapshot helpers expose
   only known automation facts where necessary.

**Acceptance proof:** tests prove each component unlocks only its matching piece,
duplicate grants are no-ops, locked placement cannot spend resources, manual turret
progress is unchanged, costs/weights/health/power values agree across definitions,
and BuildUI names the missing component.

**Save/failure cases:** existing `progression.unlocks` serializes both blueprints, so
no top-level migration. Missing unlock plus recovered campaign component reconciles
on load; unlock without campaign fact is retained. Unknown strings never crash build
menus.

**Luna exit:** no behavior, model generation, power wiring, or `Game.ts`.

### SAL-01 — Make salvage claims and transfer lossless

**Owner and files:** Luna salvage-core; `src/salvage/SalvageField.ts`,
`src/salvage/Reel.ts` only if its candidate contract needs an owner, and
`tests/unit/salvagefield.test.ts`.

**Depends on:** current salvage/radio guarantee tests.

**Steps:**

1. Implement owner-aware claim/release/pull and retain manual wrappers. Only the
   exact owner can pull/release a claimed crate. Unclaimed target enumeration stays
   deterministic.
2. Store a rolled manifest on first transfer. Change deposit callbacks to return
   leftover; retain unaccepted counts and retire only when empty. Award the early
   radio callback exactly once per actual crate, even across partial transfers.
3. Separate `loot:collected` into accepted amounts per transfer. Never report or
   destroy overflow. A claim released after partial transfer preserves its manifest.
4. Clear claims/manifests correctly on reset/retire/dispose. Keep cadence, seeded
   placement, pool size, drift, radio guarantee, and current drop table unchanged.

**Acceptance proof:** tests cover manual claim compatibility, two-owner exclusion,
wrong-owner refusal, release/reclaim, full and partial deposits, no overflow loss,
one radio award, no duplicate loot event, deterministic rolls, reset, and current
180 m cadence.

**Save/failure cases:** salvage crates still are not persisted. Safe save must be
blocked while the manual reel has a claim; collector integration releases transient
claims before serialization and saves only accepted buffer contents. A reset before
acceptance grants no contents.

**Luna exit:** no build pieces, UI, power, or Game behavior.

### SAL-02 — Build and run the automatic collector

**Owner and files:** Luna collector-integration; new
`src/salvage/AutomaticSalvageCollector.ts`, `src/building/BuildSystem.ts`,
`src/building/BuildPieceGeometry.ts`/art factory hookup only,
`src/data/power.ts`, `src/game/Game.ts`, `src/interaction/InteractionSystem.ts`,
`src/ui/InventoryUI.ts`, save/build tests, and `tests/e2e/automatic-collector.spec.ts`.

**Depends on:** COL-00, SPEC-01, SAL-01, and the companion asset contract.

**Steps:**

1. Add a pure controller registry with per-instance idle/claiming/latched/cooldown
   state. Inject target query, claim/pull/transfer, buffer, power, position, and edge
   callbacks. Select nearest then id; update at fixed step; process at most one crate
   per collector.
2. Generalize BuildSystem's container ownership so crate and collector containers
   share serialization/removal/transfer rules. Keep `crateContainer` as a temporary
   compatibility wrapper if it avoids broad call-site churn. Collector state stores
   six slots in its piece state; validate item ids, integer positive counts, stack
   caps, and capacity at the BuildSystem restore boundary before `Container.restore`.
3. Wire placement/removal/restore to controller registration and 4-draw station
   power. Unlock authorization uses `requiredUnlockOf`, not another piece branch.
4. Add `collector` interaction and inventory transfer mode. Prompt states are
   `NO POWER`, `SCANNING`, `REELING`, `BUFFER FULL`, and `READY: N` from controller
   state. Build/removal empties buffered contents through existing storage rules;
   failed transfer leaves items in the device.
5. Release claims on power loss, demolition, load, new game, destination pause, and
   dispose. Do not alter salvage spawn cadence or auto-award distant crates.

**Acceptance proof:** pure tests cover deterministic selection, range, one-at-a-time,
cooldown, power loss/recovery, full buffer, removal, and two collectors competing.
Build/save tests round-trip buffer slots and reject malformed state without item
duplication. E2E proves locked build refusal, unlock, power shedding, automatic pull,
manual reel coexistence, buffer transfer, full-buffer pause, demolish/refund, load,
and `?nomodel=1`.

**Save/failure cases:** building a save is a read-only snapshot: serialize only
accepted buffer contents and neither serialize nor mutate the live claim. Loading,
new game, and disposal release old-session claims before resetting the salvage
field, then recreate idle controllers without an old crate id. Invalid slots are
filtered/clamped by the explicit restore validation. If a piece disappears mid-pull,
its claim releases and no reward is paid.

**Luna exit:** report item counts before/after every capture, transfer, save/load,
and demolition path. No spawn-rate bonus, remote access, or multi-crate arm.

### AUT-01 — Implement pure automatic defense

**Owner and files:** Luna auto-defense core; new
`src/defense/AutomaticDefenseSystem.ts`, `src/data/turrets.ts`, shared
`src/defense/TurretAim.ts` only if a generic helper is required, and new
`tests/unit/automatic-defense.test.ts`.

**Depends on:** SPEC-01 and GUN-01 target ids.

**Steps:**

1. Add `TurretId = 'manual-turret' | 'automatic-turret'` and the automatic definition
   above. Keep manual definitions/modifier functions behaviorally unchanged.
2. Implement register/unregister/clear/restore, powered and health checks, target
   acquisition, line-of-sight lock timer, bounded traverse, aim tolerance, cooldown,
   raycast confirmation, damage, and fired/aim callbacks.
3. Filter target kinds to infantry and gunboat vehicle parts. Rank nearest then id.
   Re-evaluate dead/out-of-range/occluded targets; do not rotate/fire while unpowered.
4. Serialize only instance id, yaw, and pitch. Validate finite angles against the
   definition. Current target, lock time, and cooldown restore empty to prevent an
   instant load shot.
5. Read fixed base stats only. Do not call manual `DefenseSystem.setModifiers` and do
   not consume ammo while `INFINITE_AMMO` is true.

**Acceptance proof:** tests cover deterministic ties, legal target kinds, occlusion,
turn rate, pitch/yaw clamps, lock delay, cadence, power edge, destroyed turret,
target death, gunboat part disable, no cooldown banking, invalid restore, and JSON
round trip. Existing manual defense tests remain green.

**Save/failure cases:** absent saves register all built automatic turrets at neutral
aim. Saved ids without built pieces are ignored by AUT-02; built pieces without save
get defaults. NaN/Infinity never reaches scene transforms.

**Luna exit:** no BuildSystem, Game, UI, audio, asset, or manual behavior edits.

### AUT-02 — Build, power, target, and present automatic turrets

**Owner and files:** one Luna auto-defense integration owner;
`src/building/BuildSystem.ts`, `src/building/BuildPieceGeometry.ts`/art hookup only,
`src/data/power.ts`, `src/game/Game.ts`, `src/core/events/GameEvents.ts`,
`src/audio/GameSounds.ts`, `src/save/SaveSchema.ts`, and build/defense/save plus
`tests/e2e/automatic-turret.spec.ts` tests.

**Depends on:** COL-00, COM-02, GUN-02, SPEC-01, AUT-01, and accepted turret asset
nodes Yaw, Pitch, Muzzle.

**Steps:**

1. Generalize BuildSystem turret visual storage to return definition-specific pivot
   contracts for manual and automatic pieces. Missing required nodes rejects an
   authored model as a unit and uses the validated fallback. Colliders remain simple
   placement-authoritative boxes.
2. Register/unregister automatic pieces with `AutomaticDefenseSystem` and 6-draw
   defense power. Preserve the current manual registration/modifier refresh. Existing
   Heavy Breech/Fast Cycler loops continue to filter `turret-manual`.
3. Supply target snapshots for active infantry plus gunboat live part positions.
   Run acquisition and fire raycasts through physics so machine walls/roof block
   shots. A confirmed hit routes through the existing damageable map.
4. Emit auto-specific aim/fired/power/target edges with the true Muzzle world origin;
   COM-02 reuses pooled effects. Add status-only interaction text; it must never enter
   the manual turret camera or capture player controls.
5. Save yaw/pitch under optional `progression.automaticTurrets`. On load, restore only
   ids whose built piece is `turret-auto`; clear registry before BuildSystem restore.
6. Include automatic turrets in damage/repair, demolition, new-game/load/dispose,
   debug metrics, stable/save checks where relevant, and build blueprint gating.

**Acceptance proof:** e2e proves locked placement refusal, unlocked placement,
power draw/shedding/restore lock delay, infantry acquisition, gunboat weapon/engine
targeting, occlusion by built wall/roof, no firing at salvage/player/structure,
damage/repair/demolition, save/load aim, `?nomodel=1`, and simultaneous manual/auto
fire without FX origin crossover. Existing defense upgrades change manual stats and
draw only.

**Save/failure cases:** missing auto-turret save gets neutral aim; stale ids ignored;
invalid angles clamped. Power loss and load clear target lock. If art fails, gameplay
fallback remains aimable and collidable. No ammo state is written while infinite
ammo is active.

**Luna exit:** include a target-selection trace and power ledger for one generator +
manual gun + collector + automatic turret. Do not add filters, ammo, research mods,
or player mounting.

### QA-01 — Integrated release gate and delivery record

**Owner and files:** one Luna QA/integration owner after all code owners release
shared files; only defect fixes in the owning packet plus new
`docs/art/gameplay-expansion-verification.md` and focused test fixtures.

**Depends on:** COL-00 through AUT-02 and companion art acceptance.

**Steps:**

1. Run `npm test`, `npm run build`, and `npm run lint`, then the focused browser
   specs sequentially: lower room, legacy Wreck One, expedition two direct/detour,
   gunboat, collector, automatic turret, and current playable loop/power/boarding.
2. Run one uninterrupted normal-input route: new game → radio → Wreck One → Course
   Gyro → powered helm → direct route → gunboat → Foundry → both components → return
   → depart → build/power/operate both devices. Run the detour from a route-selection
   save and confirm it reaches the same Foundry without the scripted gunboat.
3. Repeat key flows with `?nomodel=1`. Then repeat authored-art flows at 1080p High,
   recording exact backend and hardware. Inspect muzzle/tracer origins, component
   reach, gunboat target readability, collector buffer state, turret occlusion, and
   lower-room traversal rather than relying on screenshots alone.
4. Exercise saves at every allowed boundary and attempt them at every forbidden one.
   Reload twice, start a new game, and return to title between runs to expose stale
   registries, colliders, event subscriptions, claims, and rewards.
5. Record concrete measured deltas for scene children, Rapier bodies/colliders,
   active subscriptions where exposed, draw calls, triangles, particles, and frame
   time in travel, gunboat combat, two turrets firing, and Foundry docking. Compare to
   the completed graphics-v2 baseline without claiming a broader hardware floor.

**Acceptance proof:** no console/page errors; no duplicate rewards, targets, devices,
colliders, or listeners after reset/load; calm/recovery and sanctuary rules hold;
no full-buffer item loss; direct/detour tradeoff is truthful; both blueprints remain
usable after reload; authored/fallback gameplay agrees. Verification documentation
lists actual commands, pass counts, media, backend, limitations, and deferred stretch.

**Save/failure cases:** explicitly test legacy v1 without story, legacy Wreck One in
each safe phase, campaign format 2 route selection/docked/complete, missing new fields,
unknown ids, malformed device state, future top-level version rejection, IndexedDB
write failure, and orphan external-encounter flag recovery.

**Luna exit:** do not mark the expansion implemented until the uninterrupted direct
and detour paths, save matrix, authored/fallback paths, and existing Wreck One/skiff
regressions all pass.

## Dependency and ownership order

```text
Companion A08 / COL-00
        |------------------------------\
NAV-01 -> NAV-02 -> NAV-03              \
   \------> SPEC-01 -> SAL-01 -> SAL-02  \
                 \-----> AUT-01 ---------> AUT-02
COM-01 -> COM-02 ------------------------/
   \------> GUN-01 -> GUN-02 ---------> NAV-04
NAV-02 + NAV-03 + SPEC-01 --------------/
SAL-02 + AUT-02 + NAV-04 ---------------> QA-01
```

NAV-02 defines the `scripted-vehicle-due` effect; GUN-02 implements the
coordinator/request seam; NAV-04 then wires that already-agreed seam. Only one worker
writes `Game.ts` at a time:
GUN-02, then NAV-04, then SAL-02, then AUT-02, followed by QA defect fixes assigned
back to the owning packet. `BuildSystem.ts` is similarly sequential: SAL-02, then
AUT-02. `GameEvents.ts`, power data, and UI files are released between packets.

The first playable checkpoint after code work is NAV-04 + GUN-02: both helm routes
reach and leave the Foundry, with the direct route proving the gunboat. The first
feature-complete checkpoint adds SAL-02 and AUT-02. It is shippable only at QA-01;
there are no greyed-out “coming soon” rewards in the intended release.

## Targeted test matrix

| Contract | Unit proof | Browser/integration proof |
| --- | --- | --- |
| Lower room | shared bounds, collider/nav link, capsule probes | walk both ways, authored/fallback, body pose extremes |
| Legacy story | format conversion and invariant repair | legacy docked/complete save reaches normal helm flow |
| Routes | refusal/commit/one-shot hazard/hold math | direct forced gunboat; detour longer and no scripted contact |
| Destination | data validation, swap/disposal, progress sets | dock, collect independently, return, depart, reload |
| Combat feel | shot ids, aggregate results, surface classifier | muzzle/tracer/hit cues on sand/flesh/metal |
| Gunboat | every subsystem state/order and terminal edge | hull, weapon, engine, dual-disable, no boarding surface |
| Unlocks | monotonic grants and build requirements | full inventory recovery, locked/unlocked build cards |
| Collector | claims, partial transfer, power, contention | auto pull, buffer full, transfer, demolition, reload |
| Auto turret | target order, LOS, traverse, lock, cadence | infantry/gunboat, cover, power shed, save/load |
| Lifecycle | restore filters and transient resets | new game/load/title cycles; no growth or duplicate reward |

Tests use fixed-step simulation and seeded data. Avoid wall-clock sleeps and brittle
pixel matching for mechanics. Browser reviews may stage an already-completed Wreck
One save, a route-selection save, and direct subsystem health through explicit dev
fixtures, but the final uninterrupted run must use ordinary interactions.

## Balance and failure rules

- Direct route saves 400 m of travel and therefore fuel, but guarantees one gunboat.
  Detour has no scripted gunboat; ordinary threat pacing still applies. UI wording
  says exactly that and does not promise the detour is globally combat-free.
- Foundry docking never erases a fight. Sanctuary waits for encounter clearance.
  The 220 m hold prevents the machine from physically reaching the stop first.
- Unique components are monotonic facts. A full inventory cannot lose them, and a
  second interaction cannot duplicate them or their blueprint event.
- Collector automation changes attention and timing, not drop values or cadence.
  Manual reel remains free of power and can choose a specific crate immediately.
- The automatic turret trades player time for power and performance. At 18 DPS,
  30 m, 6 draw, and a lock delay, it does not replace the 50.4 base DPS, 48 m,
  3-draw manual gun when a player is available to crew it.
- Since power shedding is class-wide, insufficient power can turn off all station
  consumers before defense consumers. The collector reports the outage and releases
  its claim; the turret continues only if the defense class remains powered. The UI
  must show this actual policy rather than implying per-device priority.
- Automatic and manual turrets consume no ammo while `INFINITE_AMMO` is true. A later
  finite-ammo pass must design shared storage, reload, save, UI, and starvation
  behavior together; it is not a hidden cost in this release.

## Deferred stretch

After the release is measured and stable, evaluate these as separate plans:

- real-time heading changes, lateral world offset, off-path POIs, and more route
  destinations from the older provisional navigation plan;
- a mixed enemy fleet, gunboat variants/crew, retreat persistence, and more encounter
  templates while preserving quiet/recovery floors;
- automatic-turret filters, coordinated targeting, manual research compatibility,
  finite ammunition, and player-authored priority rules;
- collector upgrades, multiple simultaneous arms, remote storage links, filters, and
  salvage-field persistence;
- more Foundry rooms, optional encounters, randomized specialist rewards, chapters
  three/four, voice work, or player boarding/capturing enemy machines.

Those extensions are intentionally absent from the task exits above. Completion of
this plan means one coherent second expedition and two usable specialist systems,
not the entire provisional roadmap.
