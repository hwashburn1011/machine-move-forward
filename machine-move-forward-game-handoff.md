# Machine Move Forward — Game Design & Implementation Handoff

> **Working title:** Machine Move Forward  
> **Genre:** PvE survival / shooter-looter / moving-base builder  
> **Core inspirations:** *Raft* + *SAND*  
> **Initial platform:** Desktop browser  
> **Initial engine:** Three.js + TypeScript  
> **Goal of this document:** Give an implementation agent enough product, gameplay, architecture, and milestone detail to build a playable prototype/vertical slice without requiring additional design decisions for the core systems.

---

# 1. High-Level Game Concept

The player lives on a large, continuously moving land machine crossing a hostile wasteland.

The machine is simultaneously:

- the player's home,
- vehicle,
- factory,
- fortress,
- storage system,
- crafting platform,
- combat arena,
- and long-term progression object.

The ground is effectively unsafe/inaccessible for normal traversal. The player spends most of the game on their own machine or temporarily interacting with other machines, wrecks, platforms, structures, or encounter objects.

At the start of the game, the machine **moves forward only**. The player cannot steer it.

Over time, progression unlocks:

1. improved awareness,
2. better collection tools,
3. more powerful player weapons,
4. machine-mounted weapons,
5. machine armor,
6. automated defenses,
7. expanded construction,
8. engine/power upgrades,
9. limited course adjustment,
10. true steering/navigation.

The initial game should be **PvE only** and have **no required story**. Focus on systems, emergent encounters, progression, and replayability.

---

# 2. Core Fantasy

The player should feel like they are gradually turning a crude moving platform into a terrifying customized mobile fortress.

Early game:

```text
small exposed platform
a few crates
primitive rifle
manual collector
basic engine
no steering
```

Late prototype / future game:

```text
multi-deck armored crawler
storage rooms
workshop
armory
power room
automated resource processing
radar
multiple turrets
large weapon hardpoints
defensive choke points
boarding defenses
advanced engine
steering/navigation
```

The strongest emotional arc is:

> "This fragile machine used to barely keep me alive. Now it is my moving city and weapon."

---

# 3. Core Design Pillars

## 3.1 The Machine Never Stops Being Important

The machine is not merely a vehicle between gameplay areas.

Almost every major system should connect back to it:

- resource gathering,
- storage,
- crafting,
- defense,
- combat,
- navigation,
- progression,
- power,
- repairs,
- loot,
- enemy boarding,
- tactical layout.

---

## 3.2 Calm → Warning → Combat → Recovery

Combat should **not** be constant.

Players need quiet time to:

- build,
- reorganize,
- craft,
- repair,
- process resources,
- manage inventory,
- inspect loot,
- improve the machine.

Enemy encounters should be controlled by a pacing/threat director.

Desired rhythm:

```text
CALM
↓
building / crafting / travel
↓
DISTANT CONTACT
↓
warning cues
↓
PREPARATION
↓
enemy approach
↓
COMBAT / BOARDING
↓
loot
↓
repairs / rebuilding
↓
CALM
```

---

## 3.3 Shooter-Looter + Base-Looter

There are two major loot tracks.

### Player loot

- rifles,
- pistols,
- shotguns,
- machine guns,
- armor,
- tools,
- weapon mods,
- ammo,
- consumables.

### Machine loot

- turrets,
- cannons,
- engines,
- generators,
- batteries,
- armor modules,
- radar,
- collectors,
- cranes,
- fabrication machinery,
- hardpoints,
- rare structural modules.

A powerful machine component should feel as exciting as a powerful gun.

---

## 3.4 Player-Built Layout Matters During Combat

The player's custom base becomes the combat level.

Examples:

- narrow corridors create choke points,
- roof platforms create firing positions,
- exterior storage is vulnerable,
- internal storage is safer,
- exposed power systems can be destroyed,
- turrets require line of sight,
- doors affect boarding paths,
- damaged walls can create new boarding routes.

The player should sometimes think:

> "I built this badly for defense."

---

# 4. MVP / Vertical Slice Goal

The first meaningful version should answer one question:

> Is it fun to live, build, shoot, loot, and defend a continuously moving machine?

Do **not** initially build:

- multiplayer,
- deep story,
- quests,
- NPC towns,
- complex skill trees,
- dozens of biomes,
- fully simulated economy,
- sophisticated faction diplomacy,
- destructible terrain,
- realistic vehicle simulation.

---

# 5. Initial Technology Stack

Recommended:

```text
TypeScript
Vite
Three.js
@dimforge/rapier3d-compat
Zustand
Howler.js
Vitest
Playwright
ESLint
Prettier
```

Optional:

```text
React
```

Use React only for UI/HUD if desired. Do not use React to manage the game simulation.

---

# 6. Critical World Architecture Decision

## Do not move the machine endlessly through giant world coordinates.

Keep the player machine near world origin.

Move/recycle the world around it.

Conceptually:

```ts
machine.position.set(0, 0, 0);

for (const worldObject of movingWorldObjects) {
  worldObject.position.z -= worldSpeed * dt;
}
```

When terrain chunks pass behind the player:

```ts
recycleChunk(chunk, nextSpawnPosition);
```

Benefits:

- avoids floating-point precision problems,
- simplifies procedural generation,
- simplifies collision,
- simplifies save/load,
- makes endless traversal cheap,
- keeps player physics stable.

Represent distance traveled separately:

```ts
worldState.distanceTraveled += machineSpeed * dt;
```

---

# 7. Suggested Repository Layout

```text
machine-move-forward/
├── src/
│   ├── main.ts
│   ├── game/
│   │   ├── Game.ts
│   │   ├── GameLoop.ts
│   │   ├── GameState.ts
│   │   └── constants.ts
│   │
│   ├── core/
│   │   ├── renderer/
│   │   ├── physics/
│   │   ├── input/
│   │   ├── audio/
│   │   ├── assets/
│   │   ├── events/
│   │   └── debug/
│   │
│   ├── player/
│   │   ├── Player.ts
│   │   ├── PlayerController.ts
│   │   ├── PlayerCombat.ts
│   │   ├── PlayerInventory.ts
│   │   └── PlayerStats.ts
│   │
│   ├── machine/
│   │   ├── Machine.ts
│   │   ├── MachineMovement.ts
│   │   ├── MachineHealth.ts
│   │   ├── MachinePower.ts
│   │   ├── MachineWeight.ts
│   │   ├── MachineGrid.ts
│   │   ├── MachineDamage.ts
│   │   └── MachineNavigation.ts
│   │
│   ├── building/
│   │   ├── BuildSystem.ts
│   │   ├── BuildPreview.ts
│   │   ├── BuildValidation.ts
│   │   ├── RoomDetector.ts
│   │   ├── StructuralPiece.ts
│   │   └── Hardpoint.ts
│   │
│   ├── world/
│   │   ├── WorldManager.ts
│   │   ├── ChunkManager.ts
│   │   ├── TerrainChunk.ts
│   │   ├── PropSpawner.ts
│   │   ├── ResourceSpawner.ts
│   │   ├── EncounterSpawner.ts
│   │   └── WorldSeed.ts
│   │
│   ├── combat/
│   │   ├── Weapon.ts
│   │   ├── HitscanWeapon.ts
│   │   ├── ProjectileWeapon.ts
│   │   ├── DamageSystem.ts
│   │   ├── AmmoSystem.ts
│   │   └── WeaponMods.ts
│   │
│   ├── enemies/
│   │   ├── Enemy.ts
│   │   ├── EnemyAI.ts
│   │   ├── EnemyVehicle.ts
│   │   ├── EnemyVehicleAI.ts
│   │   ├── BoardingSystem.ts
│   │   └── ThreatDirector.ts
│   │
│   ├── loot/
│   │   ├── LootTable.ts
│   │   ├── LootGenerator.ts
│   │   ├── Item.ts
│   │   ├── Rarity.ts
│   │   └── Affixes.ts
│   │
│   ├── machines/
│   │   ├── CraftingStation.ts
│   │   ├── Refinery.ts
│   │   ├── StorageContainer.ts
│   │   ├── Collector.ts
│   │   ├── Generator.ts
│   │   └── Turret.ts
│   │
│   ├── progression/
│   │   ├── UnlockSystem.ts
│   │   ├── TechTree.ts
│   │   └── ProgressionState.ts
│   │
│   ├── save/
│   │   ├── SaveManager.ts
│   │   ├── SaveSchema.ts
│   │   └── migrations/
│   │
│   └── ui/
│       ├── HUD.ts
│       ├── InventoryUI.ts
│       ├── BuildUI.ts
│       ├── LootUI.ts
│       ├── MachineStatusUI.ts
│       └── RadarUI.ts
│
├── public/
│   ├── models/
│   ├── textures/
│   ├── audio/
│   └── icons/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
└── docs/
```

---

# 8. Player Camera and Controls

Initial recommendation: third-person over-the-shoulder shooter.

Controls:

```text
WASD        move
Mouse       camera
LMB         fire
RMB         aim
R           reload
E           interact
F           contextual action / pickup
1-5         weapon slots
Tab         inventory
B           build mode
Q/E or wheel rotate build piece
Space       jump
Shift       sprint
Ctrl/C      crouch optional
```

The player should feel reasonably responsive rather than simulation-heavy.

---

# 9. Physics

Use Rapier.

Primary uses:

- player movement,
- collision against machine structures,
- enemy movement/collision,
- projectiles,
- boarding connections,
- damageable props,
- simple physics debris.

Avoid simulating every base component as independent dynamic rigid bodies.

Most constructed machine geometry should be:

```text
kinematic/static relative to the machine root
```

Do not build a fully physically simulated vehicle for the prototype.

---

# 10. Machine Structure System

Use a grid-based modular build system.

Suggested base grid:

```text
1 grid tile = 2m × 2m
```

Initial structural pieces:

```text
floor
wall
half-wall
door frame
door
window wall
stairs
ladder
roof
railing
support
platform extension
```

Each piece should have:

```ts
interface BuildPieceDefinition {
  id: string;
  category: string;
  size: { x: number; y: number; z: number };
  cost: ResourceCost[];
  maxHealth: number;
  armor?: number;
  snapRules: SnapRule[];
  supportsHardpoint?: HardpointType[];
}
```

Placed structure:

```ts
interface BuildPieceInstance {
  instanceId: string;
  definitionId: string;
  gridPosition: Vector3Like;
  rotation: number;
  health: number;
  state?: Record<string, unknown>;
}
```

---

# 11. Room System

Players must be able to construct enclosed rooms.

Examples:

- storage room,
- armory,
- workshop,
- generator room,
- refinery room,
- ammo room,
- repair bay,
- command room.

Do not require manually assigning room types initially.

Instead:

1. detect enclosed spaces,
2. determine contents,
3. optionally label based on installed equipment.

Example:

```text
room contains:
8 storage crates
1 weapon rack

=> suggested label: STORAGE / ARMORY
```

Room detection can initially be simple flood-fill over grid cells.

Room system should support:

- enclosed vs exposed,
- doorway connectivity,
- interior volume,
- room ID,
- contained machines,
- breach state.

Future possibilities:

- fire,
- smoke,
- oxygen,
- temperature,
- power isolation.

Do not implement those in first prototype.

---

# 12. Storage

Storage should matter physically.

Initial storage types:

```text
small crate
large crate
weapon locker
ammo box
component rack
```

Each has finite slots/capacity.

Later progression can unlock:

- item filters,
- linked crafting storage,
- automatic sorting,
- conveyor/logistics.

For MVP, avoid Factorio-level logistics.

---

# 13. Machine Power

Machines and weapons should consume power.

Initial resources:

```text
fuel
electrical power
```

Core model:

```text
generator burns fuel
↓
produces power capacity
↓
devices consume power
```

Examples:

```text
lights         1 power
small turret   5 power
radar          8 power
refinery       10 power
large turret   15 power
```

If consumption exceeds capacity:

- prioritize systems,
- disable lower-priority systems,
- or require manual shutdown.

Prototype can use simple priority groups.

---

# 14. Weight and Machine Performance

Every structural object and machine component should have a weight value.

Machine state:

```ts
interface MachinePerformance {
  totalWeight: number;
  enginePower: number;
  maxSpeed: number;
  currentSpeed: number;
  steeringAuthority: number;
  fuelEfficiency: number;
}
```

Do not make this punishing early.

Use weight primarily to create interesting tradeoffs:

```text
more armor
= safer
= heavier

large cannon
= powerful
= heavier

bigger machine
= more useful
= more fuel/power demand
```

---

# 15. Machine Damage Model

Avoid one global HP bar.

Use localized damage.

Every structure/component has:

```text
health
armor
damage state
```

Examples:

```text
enemy cannon hits wall
↓
wall loses HP
↓
wall breaks
↓
room exposed
↓
boarding route opens
```

Subsystem damage:

```text
generator destroyed
=> powered systems shut down

engine damaged
=> machine slows

turret destroyed
=> defense lost

storage destroyed
=> some items spill / are lost

radar destroyed
=> early-warning capability lost
```

The machine may still have a core/chassis health value as a fail-safe loss condition, but localized systems should dominate normal combat.

---

# 16. Repair System

Player can repair damaged pieces.

Initial implementation:

```text
hold repair tool on damaged component
consume scrap/material
restore HP
```

Later:

- automated repair drones,
- repair stations,
- emergency patch kits.

After combat, repairing the machine should be part of the recovery loop.

---

# 17. Hardpoint System

Weapons and heavy machinery should require hardpoints.

Types:

```text
LIGHT
MEDIUM
HEAVY
UTILITY
```

Examples:

### Light

- machine gun turret,
- spotlight,
- small collector,
- sensor.

### Medium

- autocannon,
- crane,
- missile launcher,
- medium collector.

### Heavy

- large cannon,
- industrial harvesting arm,
- heavy defensive system.

Hardpoints provide:

- placement rules,
- weight support,
- power connection,
- weapon rotation constraints.

---

# 18. Player Weapons

Initial weapon classes:

```text
pistol
assault rifle
shotgun
marksman rifle
SMG
```

MVP only needs:

```text
assault rifle
shotgun
```

Use hitscan initially for most firearms.

Weapon definition:

```ts
interface WeaponDefinition {
  id: string;
  name: string;
  weaponClass: string;
  damage: number;
  fireRate: number;
  magazineSize: number;
  reloadTime: number;
  spread: number;
  recoil: number;
  range: number;
  ammoType: string;
}
```

---

# 19. Loot Rarity

Suggested rarity tiers:

```text
Common
Uncommon
Rare
Epic
Legendary
```

Do not make the screen explode with loot.

Loot should be relatively intentional.

A successful enemy machine encounter might drop:

```text
1 weapon
1-3 components
ammo
scrap/resources
small chance of rare machine module
```

---

# 20. Weapon Mod System

Possible modifiers:

```text
armor piercing
incendiary
larger magazine
faster reload
reduced recoil
higher projectile velocity
critical damage
explosive rounds
electrical damage
```

Avoid large meaningless stat soup.

Prioritize modifiers that change behavior.

---

# 21. Machine Weapon System

Machine-mounted weapons:

```text
manual machine gun
automated machine gun turret
autocannon
shotgun turret
missile launcher
heavy cannon
```

MVP:

```text
one manually controlled turret
one automated turret
```

Turret states:

```text
idle
tracking
firing
cooldown
disabled
destroyed
```

Automated targeting should support filtering:

```text
enemy infantry
enemy vehicles
boarders
priority targets
```

---

# 22. Resource Collection

Avoid making most resource collection:

```text
walk up
press E
receive scrap
```

The machine should increasingly perform collection.

Progression:

```text
Tier 0: manual grapple/hook
Tier 1: mechanical arm
Tier 2: magnetic collector
Tier 3: crane
Tier 4: automated collector
Tier 5: drones
```

Initial prototype:

```text
manual or mechanical collector
```

Resources appear ahead and must be collected before they pass.

This reinforces forward movement.

---

# 23. Basic Resources

Keep the initial economy small.

Suggested MVP resources:

```text
scrap metal
components
fuel
ammo
```

Possible expansion:

```text
electronics
alloys
chemicals
rare tech
fabric
rubber
explosives
```

---

# 24. Crafting

Initial crafting:

```text
scrap -> structural pieces
scrap + components -> machines
components + ammo materials -> ammo
```

Crafting station types:

```text
workbench
refinery
fabricator
ammo bench
```

MVP:

```text
workbench
refinery
```

---

# 25. Procedural World

The wasteland should use recycled chunks.

Chunk pipeline:

```text
generate/retrieve chunk
↓
position ahead of machine
↓
populate terrain
↓
spawn props/resources
↓
possibly spawn encounter
↓
move toward player
↓
pass behind machine
↓
clean/recycle
```

Use deterministic seeded generation.

```ts
worldSeed + chunkIndex
```

This enables reliable save/load.

---

# 26. Terrain Style

Initial environment:

```text
stylized desert / dune wasteland
```

Visual target:

- stylized,
- low-to-mid poly,
- warm colors,
- strong silhouettes,
- atmospheric fog,
- sand particles,
- simple but good PBR materials,
- soft shadows,
- strong sun lighting.

Aim for *Raft*-level visual readability rather than photorealism.

---

# 27. Terrain Interaction

Terrain should eventually affect machine traversal.

Potential terrain types:

```text
normal sand
deep sand
rock field
large dunes
canyon
salt flats
ruins
storm region
```

Effects:

```text
deep sand -> slower
rocks -> damage risk
large dunes -> incline/tilt
canyon -> route challenge
```

MVP can visually include dunes but mechanically treat terrain as mostly flat.

---

# 28. Threat Director

Do not spawn enemies using simple random timers.

Create a threat director.

State machine:

```text
CALM
BUILDUP
CONTACT
ENGAGEMENT
RECOVERY
```

Example data:

```ts
interface ThreatDirectorState {
  phase: "CALM" | "BUILDUP" | "CONTACT" | "ENGAGEMENT" | "RECOVERY";
  threatBudget: number;
  timeSinceCombat: number;
  recentDamageTaken: number;
  playerPowerScore: number;
  machinePowerScore: number;
}
```

The director chooses encounters based on:

- time since last attack,
- player health,
- machine damage,
- player progression,
- distance traveled,
- recent encounter difficulty,
- random seed.

Hard rule:

> Do not chain attacks so aggressively that players cannot build or recover.

---

# 29. Encounter Telegraphing

Enemy encounters should often be visible before combat.

Warning cues:

```text
dust plume
engine noise
radio static
lights on horizon
spotlight
distant gunfire
tracer fire
radar contact
```

Early player:

```text
"What is that?"
```

Advanced player:

```text
RADAR CONTACT
Heavy crawler
Distance: 1.2 km
Estimated crew: 7
Weapons detected: 2
```

Awareness itself is progression.

---

# 30. Enemy Vehicle Classes

Initial planned classes:

## Skiff

- small,
- fast,
- 1-3 enemies,
- low armor,
- harassment.

## Light Crawler

- medium speed,
- ranged weapon,
- attempts to flank.

## Boarding Vehicle

- attempts to attach,
- deploys infantry.

## Sniper Rig

- long range,
- targets exposed structures.

## Salvager

- tries to steal resources/components.

## Heavy Crawler

- armored,
- multiple weapons,
- valuable loot.

## Roaming Fortress

- rare,
- initially too dangerous,
- future aspirational target.

MVP should implement:

```text
Skiff
Boarding Vehicle
```

---

# 31. Boarding System

Boarding is a signature feature.

Enemy sequence:

```text
enemy vehicle approaches
↓
matches relative speed
↓
moves alongside player machine
↓
fires grappling/boarding connection
↓
connection succeeds
↓
boarding bridge/cable attaches
↓
enemy infantry cross
↓
fight occurs inside player's base
```

Player counterplay:

- shoot attackers before attachment,
- destroy boarding vehicle,
- destroy boarding hook,
- close doors,
- fall back to chokepoints,
- use defensive turret,
- manually cut attachment.

UI/audio cue:

```text
BOARDING HOOK ATTACHED — LEFT DECK
```

---

# 32. Enemy Infantry AI

Initial AI states:

```text
idle
approach
seek_cover
attack
advance
board
search
steal
retreat
dead
```

MVP AI can be simpler:

```text
navigate
attack
board
pursue
```

Use navmesh/pathfinding carefully because player-built geometry changes.

For first prototype:

- grid/path graph based on build tiles,
- regenerate connectivity when structures change,
- or use simplified steering with waypoint graph.

Do not spend weeks building perfect dynamic navmesh tech.

---

# 33. Enemy Vehicle AI

Enemy vehicle behavior should be based on relative motion around the player machine rather than normal open-world driving.

Example:

```text
spawn far ahead/right
↓
move toward intercept vector
↓
enter combat lane
↓
maintain relative distance
↓
attack / board
↓
break away / destroyed
```

Treat this as a combat choreography system, not realistic driving simulation.

---

# 34. Player Navigation Progression

Navigation itself is progression.

## Tier 0

```text
forward only
```

## Tier 1

```text
small course correction
~5 degrees
cooldown / cost
```

## Tier 2

```text
15-30 degree course changes
```

## Tier 3

```text
true steering
```

## Tier 4

```text
advanced navigation / route planning
```

Steering should consume some combination of:

```text
fuel
engine capacity
time
mechanical stress
```

This makes route changes a choice.

---

# 35. World Opportunities

Objects/events can appear ahead:

```text
resource field
wreck
abandoned crawler
raider convoy
tower
industrial rig
large skeleton
ruin
storm
rare loot beacon
enemy fortress
```

Because the machine initially cannot steer, some opportunities will pass out of reach.

That is intentional.

Later navigation upgrades turn previously frustrating sightings into player agency.

---

# 36. Difficulty Philosophy

Do not strictly scale every enemy to player power.

The world should occasionally produce encounters that are obviously dangerous.

Example:

```text
player sees giant roaming fortress
player is under-equipped
best choice = survive / avoid
```

Later:

```text
same class of fortress appears
player actively hunts it
```

That gives visible progression.

---

# 37. PvE Failure Conditions

Potential loss conditions:

```text
player dies
machine core destroyed
engine completely disabled while in lethal condition
```

For the prototype, simplest:

```text
player death => reload save/checkpoint
machine core HP <= 0 => reload save/checkpoint
```

---

# 38. Save System

Use IndexedDB, not only localStorage.

Save:

```ts
interface SaveGame {
  version: number;
  seed: string;
  distanceTraveled: number;

  player: {
    position: Vec3;
    health: number;
    inventory: ItemInstance[];
    equipment: EquipmentState;
  };

  machine: {
    structures: BuildPieceInstance[];
    devices: DeviceInstance[];
    fuel: number;
    coreHealth: number;
    navigationTier: number;
  };

  progression: {
    unlocks: string[];
  };

  world: {
    chunkIndex: number;
    threatDirector: ThreatDirectorState;
  };
}
```

Use schema versioning immediately.

---

# 39. Performance Targets

Initial desktop browser targets:

```text
60 FPS target
30 FPS minimum acceptable on lower-end hardware
```

Use:

- InstancedMesh for repeated props,
- pooled projectiles,
- pooled enemies,
- pooled terrain chunks,
- LOD for distant machines,
- limited dynamic shadows,
- baked/static lighting where possible,
- frustum culling,
- object pooling.

Avoid:

- one draw call per tiny prop,
- hundreds of physics bodies for decorative items,
- expensive transparent effects everywhere.

---

# 40. Rendering Setup

Suggested baseline:

```ts
WebGLRenderer
ACESFilmicToneMapping
SRGB color space
directional sun
hemisphere/ambient fill
fog
shadow map
```

Visual effects:

```text
sand particles
muzzle flashes
tracer effects
dust trails
impact sparks
light bloom used sparingly
```

---

# 41. Art Direction

Target:

```text
Raft readability
+
SAND industrial/desert feeling
+
chunky modular machinery
```

Avoid:

- photorealism,
- ultra-detailed materials,
- excessive grime/noise,
- visually unreadable loot.

Use strong silhouettes and readable colors/forms.

---

# 42. Audio

Audio is important for encounter telegraphing.

Must-have:

```text
machine engine loop
wind
metal creaks
footsteps
weapon sounds
enemy engine sounds
boarding impact
damage alarms
turret sounds
loot pickup
UI feedback
```

Players should sometimes hear danger before seeing it.

---

# 43. UI / HUD

Initial HUD:

```text
player HP
ammo
equipped weapon
interaction prompt
machine core/status
fuel
power usage
current speed
threat warning
crosshair
```

Build mode:

```text
selected piece
resource cost
rotation
valid/invalid placement
```

Later:

```text
radar
subsystem health
power priorities
room status
```

---

# 44. Core Data-Driven Design

Do not hardcode item stats into logic.

Use definitions:

```text
data/
├── weapons.json
├── items.json
├── build-pieces.json
├── enemies.json
├── enemy-vehicles.json
├── loot-tables.json
├── crafting-recipes.json
└── progression.json
```

Or TypeScript data modules if preferred during prototype.

The important part is separation between:

```text
definition
vs
runtime instance
```

---

# 45. Event Bus

Use a simple typed event bus.

Examples:

```ts
type GameEvents = {
  "player:damaged": PlayerDamageEvent;
  "enemy:killed": EnemyKilledEvent;
  "machine:piece-destroyed": PieceDestroyedEvent;
  "boarding:started": BoardingStartedEvent;
  "boarding:ended": BoardingEndedEvent;
  "loot:dropped": LootDroppedEvent;
  "build:placed": BuildPlacedEvent;
};
```

This keeps UI, audio, loot, and gameplay systems decoupled.

---

# 46. Game Loop

Use fixed timestep physics.

Concept:

```ts
const FIXED_DT = 1 / 60;

while (accumulator >= FIXED_DT) {
  input.fixedUpdate();
  player.fixedUpdate(FIXED_DT);
  machine.fixedUpdate(FIXED_DT);
  enemies.fixedUpdate(FIXED_DT);
  world.fixedUpdate(FIXED_DT);
  physics.step();
  accumulator -= FIXED_DT;
}

render(interpolation);
```

---

# 47. Prototype Development Milestones

## Milestone 0 — Technical Skeleton

Build:

- Vite + TypeScript,
- Three.js scene,
- Rapier initialized,
- game loop,
- input,
- debug panel,
- asset loader.

Acceptance:

```text
player can load into scene
60 FPS baseline
physics simulation works
```

---

## Milestone 1 — Moving Machine

Build:

- machine platform,
- third-person player controller,
- player remains stable on machine,
- world movement illusion,
- terrain chunks recycle,
- distance tracker.

Acceptance:

```text
player can move/jump on machine
machine appears to travel indefinitely
no major physics jitter
```

---

## Milestone 2 — Shooter Core

Build:

- rifle,
- aiming,
- shooting,
- reload,
- damage,
- one enemy,
- enemy death.

Acceptance:

```text
player can reliably fight enemies on machine
shooting feels responsive
```

---

## Milestone 3 — Building

Build:

- build mode,
- floor,
- wall,
- door,
- stairs,
- roof,
- snapping,
- resource cost,
- demolition.

Acceptance:

```text
player can create enclosed multi-room structures
```

---

## Milestone 4 — Storage / Crafting

Build:

- inventory,
- storage crate,
- workbench,
- basic crafting,
- scrap/components/fuel/ammo.

Acceptance:

```text
player collects resources and converts them into meaningful upgrades
```

---

## Milestone 5 — Procedural Resources

Build:

- resource spawning ahead,
- collector tool,
- limited time to collect before objects pass,
- seeded chunk generation.

Acceptance:

```text
forward movement directly creates resource decisions
```

---

## Milestone 6 — Enemy Vehicle

Build:

- small enemy skiff,
- vehicle intercept,
- hostile fire,
- destroyable vehicle,
- loot drop.

Acceptance:

```text
enemy vehicle approaches, fights, and can be destroyed
```

---

## Milestone 7 — Boarding

Build:

- boarding vehicle,
- attachment,
- boarders,
- combat inside player-built base,
- detach/destroy mechanic.

Acceptance:

```text
enemy vehicle can physically attach
enemies cross onto machine
player can repel boarders
```

---

## Milestone 8 — Machine Turrets

Build:

- light hardpoint,
- manual turret,
- automated turret,
- machine power cost.

Acceptance:

```text
player can mount defensive weapons and use them in encounters
```

---

## Milestone 9 — Machine Damage / Repair

Build:

- per-piece health,
- destructible walls,
- subsystem damage,
- repair tool,
- destroyed piece replacement.

Acceptance:

```text
combat visibly damages the player's custom machine
player repairs it afterward
```

---

## Milestone 10 — Threat Director

Build:

- calm periods,
- encounter budgeting,
- telegraphing,
- recovery windows,
- variable enemy encounter timing.

Acceptance:

```text
combat feels unpredictable but not relentless
at least several minutes of peaceful building can occur
```

---

## Milestone 11 — Loot Progression

Build:

- rarity,
- weapon drops,
- machine component drops,
- weapon mods,
- better turrets.

Acceptance:

```text
combat produces upgrades that meaningfully change player/machine power
```

---

## Milestone 12 — Navigation Unlock

Build:

- no steering default,
- unlock limited course adjustment,
- visible points of interest,
- choice of spending fuel/resources to alter course.

Acceptance:

```text
unlocking steering materially changes player agency
```

---

# 48. Vertical Slice Feature List

The first "shareable" build should contain:

```text
✓ third-person controls
✓ rifle + shotgun
✓ one desert environment
✓ endless terrain streaming
✓ always-forward machine
✓ player machine building
✓ enclosed rooms
✓ storage
✓ workbench
✓ resource collector
✓ power system
✓ fuel
✓ light hardpoints
✓ manual turret
✓ automatic turret
✓ skiff enemy
✓ boarding enemy vehicle
✓ infantry boarders
✓ localized machine damage
✓ repairs
✓ loot rarity
✓ player weapon drops
✓ machine component drops
✓ calm/combat threat director
✓ save/load
✓ day/night or basic lighting cycle
```

Do not require steering for the first shareable build.

---

# 49. Recommended Starting Machine

Initial machine footprint:

```text
5 × 8 grid tiles
```

At 2m tiles:

```text
10m × 16m
```

Starting equipment:

```text
engine
small generator
fuel tank
workbench
2 storage crates
collector
one light hardpoint
```

Starting player:

```text
basic rifle
repair tool
small ammo reserve
```

---

# 50. Example Initial 20-Minute Session

```text
00:00
spawn on crude crawler

02:00
learn movement and collector

04:00
collect scrap passing machine

06:00
build first walls/storage area

08:00
craft ammo

10:00
dust plume appears

12:00
enemy skiff attacks

13:00
destroy skiff

14:00
loot better rifle + turret component

16:00
install light turret

18:00
boarding vehicle approaches

19:00
enemies attach and board

20:00
player survives and begins repairs
```

This is the experience the prototype should optimize for.

---

# 51. Example Encounter

```text
CALM

Player is building a storage room.

A distant engine becomes audible.

Dust plume appears on right horizon.

Enemy vehicle closes.

First shots hit exterior armor.

Player activates mounted turret.

Enemy vehicle moves alongside.

BOARDING HOOK ATTACHED — RIGHT DECK

Two enemies cross.

Player closes interior door.

Boarders enter narrow hallway.

Player uses shotgun to defend choke point.

Enemy vehicle is destroyed.

Boarding connection breaks.

Loot crate remains attached/deposited.

Player repairs breached wall.

CALM resumes.
```

If this sequence is fun, the game's core systems are working.

---

# 52. Example Loot

Player loot:

```text
RARE — Marauder Rifle

Damage: 28
Magazine: 32
Trait:
Armor Piercing I

Mod slot:
1
```

Machine loot:

```text
RARE — Twin Autocannon

Hardpoint: Medium
Weight: 680 kg
Power Draw: 12
Ammo: 30mm

Trait:
+15% tracking speed
```

---

# 53. Example Machine Progression

## Stage 1 — Survivor

```text
small exposed platform
manual collector
basic rifle
```

## Stage 2 — Workshop

```text
walls
storage
workbench
small generator
```

## Stage 3 — Armed Crawler

```text
turret
armor
better engine
radar
```

## Stage 4 — Mobile Fortress

```text
multiple decks
automated defenses
specialized rooms
large weapons
advanced processing
```

## Stage 5 — Wasteland Predator

```text
advanced steering
heavy armor
large cannons
enemy machine hunting
```

---

# 54. Non-Goals for Early Development

Explicitly defer:

```text
multiplayer
PvP
story campaign
voice acting
NPC settlements
complex dialogue
full procedural interiors
faction reputation
vehicles player can freely drive
massive open-world map
destructible terrain
advanced fluid simulation
realistic drivetrain simulation
MMO persistence
```

---

# 55. Technical Risks

## Risk 1 — Player Physics on Moving Base

Mitigation:

- keep machine transform mostly fixed,
- move world instead,
- structures remain stable relative to origin.

This is one reason the world-moving architecture is important.

---

## Risk 2 — Dynamic Navigation on Player-Built Base

Mitigation:

- grid-based connectivity,
- tile graph,
- simple enemy locomotion initially,
- rebuild graph only when structures change.

Do not over-engineer navmesh regeneration early.

---

## Risk 3 — Too Many Physics Objects

Mitigation:

- static/kinematic base pieces,
- pool projectiles,
- only simulate important debris,
- instanced decorative meshes.

---

## Risk 4 — Procedural World Feels Empty

Mitigation:

Use authored encounter templates combined procedurally.

```text
procedural placement
+
hand-authored encounter archetypes
```

Do not rely entirely on random object scattering.

---

## Risk 5 — Building Becomes Tedious

Mitigation:

- generous snapping,
- fast placement,
- easy demolition,
- partial material refund,
- blueprint/copy features later.

---

## Risk 6 — Constant Combat Ruins Building

Mitigation:

Threat director must enforce recovery periods.

---

# 56. Testing Strategy

Unit-test deterministic systems:

```text
loot generation
crafting recipes
power calculation
weight calculation
damage calculation
threat director state transitions
save migrations
```

Integration tests:

```text
place structure -> save -> reload
destroy structure -> navigation updates
generator disabled -> turret loses power
boarding attach -> enemies enter machine graph
```

Playwright smoke test:

```text
launch game
start session
move player
fire weapon
enter build mode
place floor
save game
reload game
```

---

# 57. Debug Tools

Build these early.

Debug overlay:

```text
FPS
draw calls
triangles
physics bodies
active enemies
active chunks
world distance
current threat phase
current threat budget
machine weight
power produced/used
```

Debug actions:

```text
spawn enemy
spawn boarding encounter
give resources
give weapon
damage machine
repair all
toggle god mode
advance threat phase
unlock steering
```

These will save enormous development time.

---

# 58. Implementation Rules for the Coding Agent

1. Build systems incrementally.
2. Every milestone must remain playable.
3. Do not build future systems before core loop validation.
4. Prefer simple deterministic implementations over clever abstractions.
5. Data-drive weapons/items/build pieces.
6. Avoid dependencies unless they materially simplify development.
7. Maintain stable 60 FPS on the target machine before increasing complexity.
8. Add debug controls whenever implementing a system.
9. Keep save schema versioned.
10. Use placeholder geometry before spending time on art.
11. Do not block progress waiting for final models/textures/audio.
12. Preserve the no-steering opening experience.
13. Combat must have quiet periods between encounters.
14. Boarding must work inside player-built geometry.
15. Machine destruction must be localized enough that layout matters.

---

# 59. First Implementation Sprint

The first sprint should implement only:

```text
1. Three.js scene
2. Rapier
3. third-person movement
4. static player machine at origin
5. scrolling/recycled desert chunks
6. rifle
7. one hostile humanoid
8. build floor/wall
9. one resource
10. save/load skeleton
```

Then build:

```text
enemy vehicle
boarding
loot
turret
machine damage
```

Do not start with a giant procedural system.

---

# 60. Definition of Core Prototype Success

The project is successful enough to continue if the following moment works:

> The player is inside a room they personally built on a machine that is continuously traveling through the desert. They hear an enemy vehicle approaching, run onto the roof, fire at it with a looted weapon, use a mounted turret, fail to stop a boarding hook, retreat into their own structure, fight boarders through a doorway they built, survive, loot a better machine component, repair the damage, install the upgrade, and continue moving forward.

That single experience validates almost every major design pillar.

---

# 61. Future Expansion Ideas

Only consider after the vertical slice is fun.

Possible additions:

```text
multiple wasteland biomes
weather
sandstorms
rare mega-machines
boss crawlers
dynamic factions
machine-to-machine grappling
player boarding enemy vehicles
salvage dismantling
drones
advanced automation
blueprints
logistics
co-op multiplayer
specialized crew/NPCs
unique machine chassis
world events
rare landmarks
navigation map
advanced steering
machine ramming
heavy artillery
vehicle capture
```

---

# 62. Final Product Direction

The game should not become:

> "generic survival crafting game, except in a desert."

It should become:

> **A shooter-looter where the player's continuously moving, fully customizable machine is simultaneously their base, vehicle, fortress, factory, inventory, defensive position, and most valuable possession.**

The distinctive combination is:

```text
Raft-like mobile base building
+
SAND-like desert machine aesthetic
+
PvE shooter-looter combat
+
enemy vehicle encounters
+
boarding
+
localized base destruction
+
machine weapon progression
+
eventual navigation control
```

Protect that identity throughout implementation.

---

# 63. Immediate Build Order

If handing this document directly to an implementation agent, start here:

```text
A. Create project skeleton.
B. Implement player + camera.
C. Implement stable machine platform at origin.
D. Implement endlessly recycled desert.
E. Implement rifle and enemy.
F. Implement modular building.
G. Implement inventory/resources.
H. Implement small enemy vehicle.
I. Implement boarding.
J. Implement localized base damage.
K. Implement turret.
L. Implement loot.
M. Implement threat director.
N. Implement save/load.
O. Polish the 20-minute vertical slice.
```

Do not move on to steering, complex progression, additional biomes, or multiplayer until that sequence is demonstrably fun.
