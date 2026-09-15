# Glass Orchard implementation contract

Status: frozen contract for the next bounded campaign iteration. PR 10 provides
Quiet Array, tier-one steering and optional discoveries. Glass Orchard, its
rewards and the systems in this document are not implemented yet.

## Outcome

After completing Quiet Array, the radio offers Glass Orchard without interrupting
the player's build, survival or optional-discovery loop. Accepting the offer opens
one route choice. Either route produces a distinct, existing encounter during the
approach, docks at the same physical Orchard, asks the player to restore the
remaining archive-power isolator, and allows recovery of preserved human seeds,
the vector governor and ANNIKA's Orchard memory core. Departure grants one
chapter completion, tier-two course authority and a narrative lead toward
Meridian. Meridian remains upcoming until its complete finale is implemented.

## Fixed authored layout

The destination root is X 17 at the same deck surface Y as Quiet Array. Its floor
is 18 by 20 metres (half extents 9 by 10), with gangway local position
`(-9.5, -0.08, 0)` and entry `(-8, 0, 0)`.

| Anchor | Local position | Purpose |
| --- | ---: | --- |
| `SeedBank` | `(-4, 1.2, -5)` | Recover protected human seeds |
| `VectorGovernor` | `(5, 1.2, 5)` | Recover tier-two course hardware |
| `MemoryCore` | `(5, 1.3, -5)` | Recover ANNIKA memory core |
| `MemoryJournal` | `(3.8, 1.2, -3)` | Common memory record |
| `CaretakerJournal` | `(-5, 1.2, 5)` | Caretaker-route testimony |
| `EvacuationJournal` | `(0, 1.2, -7)` | Cold-vault-route testimony |
| `PortIsolator` | `(-5, 1.1, 0)` | Archive power interaction |
| `StarboardIsolator` | `(5, 1.1, 0)` | Archive power interaction |

Navigation spines remain clear through `abs(x) < 2` and `abs(z) < 1`.
Greenhouse plants, furniture and solid colliders stay in the outer quadrants.
The gangway, entry, both isolators and all three recoveries must be connected by
walkable floor. Enemies never spawn or path on the detached Orchard: scripted
combat occurs against the Iron Nomad using the existing boarding/gunboat paths.

## Typed campaign and route changes

Extend the existing types; do not introduce an Orchard-specific save beside the
shared expedition record.

```ts
type ExpeditionId = ExistingExpeditionId | 'glass-orchard';
type RouteId = ExistingRouteId | 'orchard-caretaker' | 'orchard-cold-vault';
type StoryUniqueId = ExistingStoryUniqueId |
  'human-seed-bank' | 'vector-governor' | 'orchard-memory-core';
type StoryObjectiveId =
  'orchard-port-isolator' | 'orchard-starboard-isolator';

interface ActiveExpeditionSave {
  expeditionId: ExpeditionId;
  routeId: RouteId | null;
  phase: ExistingActivePhase | 'route-selection';
  arrivalDistance: number | null;
  journalsRead: string[];
  scriptedEncounter: 'not-due' | 'queued' | 'resolved';
  objectivesCompleted?: StoryObjectiveId[];
}
```

`CampaignSave.format` remains 2. Missing `objectivesCompleted` means none, except
that the selected Orchard route deterministically supplies its one intact
isolator as described below. Save output should write the normalized explicit
set. Unknown, duplicate or wrong-expedition objective IDs are ignored on restore.

Extend `RouteDefinition` so validation accepts all four routes and checks each
route's `destinationId`. Orchard route definitions are:

| Route | Distance | Scripted encounter | Intact on arrival |
| --- | ---: | --- | --- |
| `orchard-caretaker` | 900 m | one standard skiff at 420 m remaining | port isolator |
| `orchard-cold-vault` | 1,100 m | one standard gunboat at 500 m remaining | starboard isolator |

The existing fixed hostile pool remains the authority. No extra pool slots,
enemy definitions, damage changes or destination-nav graph are introduced.
Both encounters use current vehicle spawning, deck navigation, hook cutting and
resolution. If another encounter owns the deck, the scripted request remains
queued. At 220 m remaining the destination holds as Relay Foundry already does
until the scripted encounter resolves; it never spawns twice after save/load.

## StoryDirector state machine

Retain the current public entry points and generalize them:

```ts
beginNextExpedition(context: WreckStartContext): WreckStartResult;
selectRoute(id: RouteId, context: RouteSelectionContext): RouteSelectionResult;
completeObjective(id: StoryObjectiveId): StoryResult;
unmetRequirement(id: StoryUniqueId): string | null;
```

`beginNextExpedition` behavior:

1. After Relay Foundry, it continues to begin Quiet Array directly.
2. After Quiet Array, it selects Glass Orchard, sets phase `route-selection`,
   clears transient journals/objectives/scripted state, and returns
   `route-available` with the two Orchard routes.
3. It refuses active encounters, an off-machine player, unstable state, a
   repeated acceptance, and any committed/docked optional site reported by Game.

Route selection is now saved. `toSave()` emits an active Glass Orchard record
with `phase:'route-selection'`, `routeId:null`, and `arrivalDistance:null`.
Restore accepts that exact combination only for Glass Orchard. Selecting a route
validates the route's destination, sets its arrival from current distance, marks
the route's intact isolator complete, enters approach and emits the existing
route/begin-approach effects.

Widen the existing `scripted-vehicle-due` member and add the objective member;
do not add a second competing effect with the same discriminator:

```ts
type ScriptedVehicleEffect =
  { type: 'scripted-vehicle-due'; vehicle: 'skiff' | 'gunboat'; routeId: RouteId };
type StoryEffect = ExistingStoryEffectWithoutScriptedVehicle |
  ScriptedVehicleEffect |
  { type: 'objective-completed'; id: StoryObjectiveId };
```

The existing `resolveScriptedEncounter()` remains the acknowledgement. Repeated
resolution, objective completion, journal reads, unique collection and departure
are idempotent.

## Passive offer and contact ownership

A passive `snapshot.nextExpedition` offer is not story priority. Tier-one chart
contacts continue to detect, expire, plot and dock while the player decides when
to follow the Orchard signal.

- Game sets chart `storyPriority=true` only for accepted story
  `route-selection`, `approach`, `braking`, `docked` and `departing` phases.
- Accepting Orchard while an optional contact is only `detected` suspends and
  later rebases that same contact through the existing RouteChart mechanism.
- A `committed`, `docked` or `visited` optional contact awaiting departure owns
  the shared Destination. Radio acceptance is refused with “Finish or leave the
  current discovery first”; neither site nor rewards change.
- Completing Orchard releases the channel and resumes a suspended contact.

This requires replacing the current Game predicate that treats
`snapshot.nextExpedition` itself as story priority.

## Physical Orchard objectives

Route consequences use existing mechanics and bounded facts:

- **Caretaker route:** the skiff tests deck defense and grapple cutting. The port
  isolator is intact on arrival; `CaretakerJournal` is readable. The player must
  engage `StarboardIsolator` to restore the other archive bus.
- **Cold-vault route:** the gunboat tests cover and repair pressure. The
  starboard isolator is intact on arrival; `EvacuationJournal` is readable. The
  player must engage `PortIsolator` to restore the other archive bus.

Both journal anchors may remain physically visible, but only the selected
route's testimony is readable during that run. This is the durable narrative
consequence; neither route changes reward quantity or campaign viability.

Isolators are proximity interactions, not build pieces or damage targets.
`completeObjective` requires phase `docked`, a matching Orchard objective and a
not-yet-completed ID. Game additionally revalidates player reach and the live
interactable. The interaction is immediate and repeat-safe; it does not consume
inventory, run a wall-time hold, or create a new power simulation.

Recovery gates:

- `human-seed-bank` requires the port isolator. It unlocks the Seed Garden
  blueprint through Progression; the unique itself never enters inventory.
- `orchard-memory-core` requires the starboard isolator.
- `vector-governor` requires both isolators and both route-accessible story
  records to have been acknowledged. Because only one route journal is readable,
  “both records” means the selected route journal plus a common short record at
  `MemoryCore`; add that common record to story data rather than requiring the
  inaccessible alternate-route journal.
- Departure requires all three uniques and both isolators. Journals remain
  optional except for the selected route record and common Memory Core record
  that gate the governor.

This differs from Quiet Array: the player restores physical archive power,
chooses which testimony/encounter reaches them, preserves human seeds and then
recovers hardware. It is not another pair of calibration logs.

## Data and player-facing status

`Glass Orchard` story data contains:

- the fixed placement, colliders and anchors above;
- route-specific caretaker and evacuation journals;
- one common ANNIKA Memory Core record explaining that S-07 carries an
  unfiltered witness archive and naming Meridian as the next lead;
- explicit `factId` on every unique and objective ID on each isolator;
- required uniques/objectives stated as typed arrays.

Story status must distinguish:

- **offered:** “Glass Orchard signal available at the radio.”
- **route selection:** “Choose which Orchard distress signal to answer.”
- **approach/held:** selected route, distance and unresolved encounter reason;
- **docked:** which isolator is intact, which needs restoring, and the next
  reachable recovery;
- **ready to depart:** all required facts recovered and player return requested;
- **complete:** “Human seeds and ANNIKA's Orchard memory are aboard. Wider course
  control is online. Meridian remains ahead.”

Do not claim that Meridian is reachable, playable, committed or complete.

## Save and resource safety

- Route choice, scripted encounter state, completed isolators, journals, uniques
  and completed expedition survive every stable save boundary.
- Active combat remains outside the safe-save boundary. A queued pre-encounter
  approach may save; restore re-queues exactly one encounter. Resolved never
  replays.
- Story uniques cannot be stolen, dropped, stored, consumed or refunded.
- Seed Garden unlock is derived from `human-seed-bank` on restore, like current
  Foundry blueprints. Reapplying it is idempotent.
- `vector-governor` authorizes course tier 2. Loader derives effective tier from
  recovered story facts, clamps course bearing/desired angle to ±28 degrees and
  ignores a forged `machine.navigationTier`.
- Orchard configure/reset/load reuses the Destination owner correctly and does
  not retain Quiet Array or optional-site bodies, interactables or materials.

## Disjoint implementation ownership

**Luna story:** `src/story/StoryDirector.ts`, `src/data/story.ts`,
`src/data/routes.ts`, optional new story-data-only file, and focused tests. Owns
the typed state/effects, route validation, objectives, gates, prose and restore.
Does not edit Game, Destination, SaveSchema, navigation controllers, enemies,
vehicles, art or build systems.

**Root/Astra:** Game effects and contact arbitration, SaveSchema typing,
Destination model/colliders/interactions, vehicle encounter calls, Radio and
Expedition UI, Progression unlock wiring, tier grant, Blender/GLB/fallback art,
audio and runtime acceptance.

Other Luna workers retain their separately frozen pure Seed Garden and tier-two
navigation/chart tasks. They do not edit Orchard story files.

## Acceptance

Pure tests must prove:

- next-expedition order Relay → Quiet → Orchard and no replay after completion;
- passive offer does not set chart priority;
- route-selection save/restore with null route, each selected route, malformed
  route/destination combinations and legacy format-2 saves;
- exact 900/1,100 m arrivals, one queued/resolved encounter and 220 m hold;
- route-derived intact isolator, idempotent second isolator, recovery gates,
  departure and one completion effect;
- no alternate-route journal requirement can deadlock completion.

Actual browser acceptance must prove:

- an unanswered Orchard offer coexists with at least three optional contact
  schedule slots;
- accepting with a detected contact suspends/rebases it, while committed and
  docked contacts block acceptance without reward loss;
- both routes use their real existing vehicle encounter and resolve before
  docking, without exceeding the eight-enemy pool;
- the player physically crosses the gangway, activates the missing isolator,
  reads the selected/common records, collects each unique once, returns and
  departs;
- saves before choice, after choice, queued, resolved, docked, after each
  isolator/unique, departing and complete restore exactly;
- Seed Garden unlock and tier 2 remain fact-authorized on old/malformed saves;
- Chapter One, Quiet Array, optional sites, raids, hook cutting, building,
  storage, needs and pointer/menu flows remain green;
- 100 mixed configure/route/load cycles keep bodies, colliders, scene objects,
  materials, resources and story rewards bounded.

Visual review must show clear gangway and walkable spines, distinguish both
isolators and all three rewards, and keep greenhouse furniture out of the paths.
Performance acceptance uses the existing High reference scenarios plus one
Orchard docked scene; it does not infer integrated-graphics guarantees from the
RTX reference machine.
