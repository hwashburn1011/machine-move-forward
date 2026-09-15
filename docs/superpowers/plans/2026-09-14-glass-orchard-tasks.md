# Glass Orchard, Seed Garden and wider route discoveries

Refined tasks for the iteration after PR 10, based on main `b17749d`. The current
foundation below is shipped. The new tasks are being implemented on
`codex/glass-orchard`; acceptance evidence will be recorded separately.

## Current foundation

The playable campaign currently reaches Quiet Array, recovers the
`course-actuator` and `annika-archive-shard`, unlocks tier-one course control
(±12 degrees), and then continues survival. The powered Helm, deterministic
three-contact chart, water/salvage/memorial sites, physical docking, partial
reward accounting, building, storage, crafting, condenser, planter, stove,
needs, raids and save/load are working authorities.

The existing food loop is intentionally small: a planter passively stores up to
three greens at one per 150 simulated seconds; a powered condenser stores one
water at one per 90 seconds; the stove instantly turns one green plus one water
into one ration. Needs drain over 25 simulated minutes and never kill the
player. New work should deepen the calm loop without shortening those timers or
invalidating existing planters.

## Recommended next three

### 1. Ship Glass Orchard as a complete playable chapter

This is the highest-value next step. It advances S-07's purpose, provides the
promised middle chapter, and supplies the fiction and physical reward for the
next two systems. The chapter begins as a radio offer only after Quiet Array is
complete. It cannot be missed. A passive offer does not suppress discoveries:
the player may keep building, steering and visiting optional sites until they
accept the trace. Story priority begins only with accepted route selection,
approach, braking or docking.

The implemented approach has two choices:

- **Caretaker Approach:** 900m, one boarding-skiff patrol at 420m remaining,
  caretaker testimony, port isolator already intact.
- **Cold Vault:** 1,100m, one gunboat at 500m remaining,
  evacuation testimony, starboard isolator already intact.

Patrols use existing combat systems around the Nomad. Clear the encounter before
exploring; no enemies path onto the detached Orchard platform.

Both routes reach the same explorable Orchard, human seed bank and required
rewards. The choice changes one encounter and one journal set; it never deletes
the garden unlock, vector governor, memory core, or main ending path.

Story contracts:

```ts
type ExpeditionId = ExistingExpeditionId | 'glass-orchard';
type StoryUniqueId = ExistingStoryUniqueId |
  'human-seed-bank' | 'vector-governor' | 'orchard-memory-core';

type RouteId = ExistingRouteId |
  'orchard-caretaker' | 'orchard-cold-vault';

interface ActiveExpeditionSave {
  expeditionId: ExpeditionId;
  routeId: RouteId | null;
  phase: ExistingActivePhase | 'route-selection';
  // Existing arrival, journal and scripted fields remain.
}

beginNextExpedition(context: WreckStartContext): WreckStartResult;
selectRoute(route: RouteId, context: RouteSelectionContext): RouteSelectionResult;
```

Keep `beginNextExpedition` as the single entry point. With Relay Foundry complete
it retains today's direct Quiet Array approach. With Quiet Array complete it
selects Glass Orchard and enters `route-selection`, returning the existing
`route-available` effect with the two Orchard route IDs. `selectRoute` validates
that the chosen `RouteDefinition.destinationId` matches the pending expedition,
persists it in the shared active record, and enters approach.

Today `ActiveExpeditionSave.phase` excludes `route-selection`; Foundry can
reconstruct that choice from Wreck One, but Orchard cannot. Extend the shared
active record to serialize `{ expeditionId:'glass-orchard', routeId:null,
phase:'route-selection' }`. Restore accepts that state only for a known
expedition with defined routes. Old format-2 saves with `active:null` remain
valid. Do not add a parallel `orchardRoute` save field.

Required completion is: both isolators, the selected testimony and common memory record, `human-seed-bank`,
`vector-governor`, and `orchard-memory-core`, followed by a physical return and
departure. Unique facts are durable, never inventory stacks, never theft cargo,
and never granted by merely loading a completed expedition ID.

Channel ownership is explicit:

- A passive `snapshot.nextExpedition` offer leaves `storyPriority=false`.
  Detected contacts continue to appear and expire normally.
- Accepting Orchard while a contact is merely `detected` suspends that exact
  contact through `observe(...storyPriority:true)`. Its remaining approach and
  expiry distances are rebased when the story releases the channel.
- A `committed`, `docked` or `visited` contact awaiting departure blocks radio
  acceptance with a readable “finish or leave this discovery” reason. Its
  Destination and rewards remain untouched.
- Accepted story `route-selection`, `approach`, `braking`, `docked` and
  `departing` states own the shared Destination/contact channel.

Root integration must revise the current `Game.chartContext.storyPriority`
predicate, which also checks `snapshot.nextExpedition`. The new predicate is
phase ownership from the final bullet above. `radioTraceView` may block Begin
only when an optional contact is committed/docked/visited and owns Destination;
a detected chart-only contact is safe to suspend when Begin succeeds.

**Luna story task (disjoint):** own `src/story/StoryDirector.ts`,
`src/data/story.ts`, `src/data/routes.ts`, new `src/data/orchard.ts`, story/route
validation and focused tests. Add typed phase/effects and prose only. Do not edit
Game, Destination, SaveSchema, art, combat, navigation controllers, or existing
balance data.

**Root/Astra:** own the authored Orchard model, anchors/colliders, route-specific
encounter wiring, Radio/Expedition UI, Game effects, save integration, audio and
visual review.

Acceptance:

- Quiet-complete old and new saves receive one re-offering radio lead.
- Leaving the offer unanswered for 2,100+ m still yields the deterministic
  optional schedule.
- Accepting with a detected contact suspends/rebases it; acceptance while an
  optional approach or dock owns Destination is refused without reward changes.
- Both routes dock through the real braking/gangway flow and can always return.
- Saving before choice, after choice, docked, after each unique, departing and
  complete restores exactly once.
- Route encounters use existing enemy budgets and tactics; no new weapon or
  damage tuning.
- Completing Orchard emits one clear milestone, resumes raids and exposes the
  Meridian lead without starting the finale automatically.

### 2. Add a useful Seed Garden building loop

Recovering `human-seed-bank` unlocks a **Seed Garden** build piece. It gives the
player a visible, optional calm activity while reusing water, greens, rations,
storage, placement and producer conventions. Existing planters remain valid and
unchanged.

Frozen default behavior:

- Cost: 35 scrap and 4 components; cell anchored, rotatable, 180 kg, 110 health,
  nonblocking like the planter.
- Internal capacity: two water charges and six greens.
- Loading transfers up to two water from existing `ResourceAccess`; one water
  grows three greens over 180 simulated seconds. Growth pauses when dry or when
  six greens are stored. It has no power draw.
- Harvest deposits only what fits and leaves the exact remainder in the bed.
  Demolition returns the normal structural refund plus all stored water/greens
  through the existing BuildSystem recovery path. Relocation preserves the same
  controller and progress.
- The visual has dry, growing, ready and full states. There is no failure timer,
  crop death, mutation tree, morale meter or new consumable item.

Pure controller/save contract:

```ts
interface SeedGardenSave {
  format: 1;
  water: number;       // integer 0..2
  greens: number;      // integer 0..6
  progressS: number;   // finite 0..180
}

class SeedGarden {
  loadWater(available: number): number;       // amount accepted
  fixedUpdate(dt: number): number;            // greens produced this step
  harvest(room: number): number;              // amount removed
  snapshot(): Readonly<SeedGardenSave>;
  restore(raw: unknown): void;
}
```

No controller method reaches inventory, BuildSystem, clocks, Three.js or the
event bus. Game performs a revalidated consume/deposit and acknowledges the
actual count, following the RouteChart reward pattern.

**Luna garden task (disjoint):** create `src/building/SeedGarden.ts`, focused
tests, and optionally a pure `SeedGardenView` formatter in a new file. Do not
edit BuildSystem, Game, build-piece data, geometry, interactions or save schema.

**Root/Astra:** own the build-piece definition and geometry/art, BuildSystem
controller lifecycle, Game interactions, HUD prompt, resource transactions,
events and save wiring.

Acceptance:

- 30/60/144 fixed schedules produce identical growth; pause advances nothing.
- Full/empty/NaN inputs cannot mint or destroy water or greens.
- Full player inventory causes a zero harvest and leaves bed contents intact.
- Relocate 100 times, demolish, reset and save/load conserve water, greens,
  controller identity, body/collider counts and timers.
- A real browser loop loads water, visibly grows, harvests greens and cooks a
  ration at the existing stove. Existing planter saves behave exactly as before.

### 3. Make tier-two steering useful with wider, readable discoveries

The `vector-governor` grants tier two (±28 degrees) only after physical recovery.
It should immediately reveal why wider control matters: chart schedules gain a
second lateral band that tier one can preview but cannot reach. This is an
extension of the existing single-active-contact loop, not a simultaneous map of
icons.

Add one new reusable **repair depot** opportunity. It requests existing scrap or
one repair kit through ordinary reward claims and includes one Orchard journal
fact; it introduces no new item. Keep the current 700 m schedule and 450 m
detection runway. Far contacts use deterministic absolute `worldX` offsets of
120–150 m from lateral position at first detection. At most one optional contact
is active. Only an accepted story route suspends it with its remaining window
intact; a passive radio offer does not.

Contracts:

```ts
type RouteContactKind = ExistingRouteContactKind | 'repair-depot';

interface RouteObservation {
  distanceM: number;
  lateralM: number;
  /** True only after story acceptance, never for a passive radio offer. */
  storyPriority: boolean;
  tier: 0 | 1 | 2 | 3;
}
```

The chart continues to return declarative claims; Game alone deposits items or
grants journal facts. Save format may remain `RouteChartSave.format: 1` because
the kind is self-describing, provided restore validates old kinds and the new
reward exactly. If that cannot be guaranteed, bump only the inner chart format
and migrate format 1 deterministically; do not bump the whole game save.

**Luna navigation task (disjoint):** own `CourseController.ts`, `RouteChart.ts`,
new opportunity data (no prose UI), and focused pure tests. Add tier-two limits,
far-contact scheduling and validation. Do not edit Game, world rendering,
Destination, SaveSchema, inventory or art.

**Root/Astra:** own governor pickup integration, Game chart context, depot
Destination/art, Helm copy/markers, world projection verification and saves.

Acceptance:

- Story facts, rather than mutable saved tier integers, authorize tier two.
- Tier one refuses a far contact with a readable preview; tier two reaches it
  from both signs through real fixed updates and docks within 0.65 m.
- Power loss and cancel return to detected state without changing rewards.
- Partial depot rewards, abandonment and save/load conserve exact counts.
- ±4096 m lateral travel remains populated with stable three-band scene,
  physics, material and texture counts over 100 mixed cycles.

## Finale boundary for the following iteration

Do not implement a placeholder ending in this slice. Glass Orchard should end
with ANNIKA identifying **The Last Garden at Meridian** and the player retaining
control in normal survival. The next iteration must ship the final commitment,
safe checkpoint, staged assault, in-engine handoff, skippable credits and
`keepWalking` postgame state together. Adding a `keepWalking` flag or a fake
Meridian destination before those behaviors exist would create misleading save
states.

Before that work starts, freeze these requirements: the final route is explicit
and warns about the checkpoint; failure reloads without reward duplication;
ending recognition reads durable discoveries without grading missed logs; the
full raid/discovery/build loop resumes afterward; old saves cannot enter credits
or postgame accidentally.

## Integration order and release gate

1. Freeze the three pure contracts and IDs.
2. Land Luna story, garden and navigation work in disjoint files.
3. Root integrates Garden lifecycle/resources, then Orchard story/destination,
   then tier-two chart/world behavior. This order keeps save ownership singular.
4. Run pure tests before authored assets, then browser story routes, physical
   gangway, real garden transactions, both-sign far approaches and old saves.
5. Finish with Chapter One/Quiet compatibility, 100 mixed lifecycle cycles,
   High reference performance, lower-quality smoke, visual/audio review and a
   production build.

The iteration is complete only when Glass Orchard, Seed Garden and tier-two
discoveries are each playable and save-safe. A model, controller or journal by
itself is not completion.
