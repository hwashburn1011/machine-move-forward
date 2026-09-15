# Meridian next iteration handoff

Status: design-only handoff prepared after the Glass Orchard implementation. The
current game ends its implemented story at Glass Orchard, grants course tier 2,
and names Meridian as a future lead. Nothing below is shipped yet. This iteration
closes the playable campaign while retaining the existing survival, building,
raid, chart, save and browser-runtime architecture.

The next three deliverables should be implemented as one vertical slice. They
reuse `StoryDirector`, `Destination`, `CourseController`, `RouteChart`, the
existing enemy/vehicle encounters, and the current menu/pointer-lock lifecycle.
They do not add a quest framework, new combat AI, a vehicle-driving minigame, or
a claim that humanity is extinct or fully recovered.

## 1. The Last Garden at Meridian

After Glass Orchard is completed, the radio offers **The Last Garden at
Meridian** passively. Optional chart contacts continue while the offer waits.
Accepting the trace suspends an uncommitted detected contact through the existing
RouteChart story-priority behavior; a committed or docked optional contact must
be departed first. Acceptance enters a saved route-selection phase and offers
two routes to the same authored destination:

- `meridian-quiet-line`: 1,250 m, one existing skiff encounter at 520 m
  remaining. It preserves a civilian beacon record.
- `meridian-cordon-gap`: 1,050 m, one existing gunboat encounter at 620 m
  remaining. It preserves a defense-controller record.

These alter testimony and encounter shape, not ending eligibility. Encounters
run on the Iron Nomad's existing navigation and fixed hostile pool. Meridian has
no enemy navigation mesh and no destructible relay objective. The destination
holds at 220 m while any encounter is active or the scripted vehicle remains
unresolved, then uses the existing braking, sanctuary, gangway and departure
pipeline.

The physical destination contains three readable records, one route-selected
record, and three reachable interactions:

1. restore the Meridian transmitter from its local console;
2. install the Orchard memory core in the archive cradle;
3. recover the `meridian-solution` only after both interactions and the common
   record are complete.

The records establish that Meridian is a maintained refuge channel with recent,
ambiguous human-origin traffic. They never confirm the sender's identity or
declare humanity extinct. S-07 chooses to carry memory toward possible people
because protecting that possibility is sufficient.

### Frozen story/data contract

Extend the closed unions:

```ts
type ExpeditionId = ExistingExpeditionId | 'last-garden-meridian';
type DestinationModelId = ExistingModelId | 'last-garden-meridian';
type RouteId = ExistingRouteId | 'meridian-quiet-line' | 'meridian-cordon-gap';
type StoryUniqueId = ExistingStoryUniqueId | 'meridian-solution';
type StoryObjectiveId = ExistingStoryObjectiveId |
  'meridian-transmitter-online' | 'meridian-archive-installed';
```

Add one `ExpeditionDefinition` and two normal `RouteDefinition` entries. Keep
`CampaignSave.format: 2`; its typed arrays and active expedition record already
carry these IDs and objectives. Add one optional durable journal history:

```ts
interface CampaignSave {
  // existing format-2 members
  journalArchive?: string[];
  ending?: EndingSave;
}
```

`StoryDirector` owns an archive set separate from the current expedition's
`journals`. Every successful first `readJournal(id)` inserts the known ID into
both sets. Rereading is view-only. `snapshot` exposes `journalArchive` as a
readonly array and `toSave()` writes a deduplicated, data-known list. Starting,
departing or configuring another expedition clears only active journals, never
the archive.

Old format-2 saves migrate conservatively. Copy every valid journal from the
active expedition's `journalsRead`. A durable unique may prove a required record
was read, but migration may add only records whose identity is unambiguous in
data: for each recovered unique, add that expedition's `requiredJournals` only
when the unique's existing gate required every one of those exact IDs. Thus a
recovered Quiet Array `course-actuator` proves its required calibration records.
The Orchard vector governor proves the common memory record, but it does not
prove whether the caretaker or evacuation route record was selected after the
active route record is gone, so neither route-specific record is fabricated.
Completion alone never fabricates optional reads. Unknown archive IDs are
ignored. Legacy saves without enough evidence simply have a partial archive.
Encode the proof relationship as a small data-owned table, for example
`REQUIRED_JOURNALS_PROVEN_BY_UNIQUE`, rather than chapter-name conditionals in
the restore loop. Orchard maps `vector-governor` only to
`orchard-memory-record`; its selected route record remains unknowable once an
old completed save has discarded `routeId`.

Missing new fields in old saves mean Meridian has not started. Restore must
derive the following invariants:

- completed Meridian implies Glass Orchard, Quiet Array, Relay Foundry and
  Wreck One are complete;
- completed Meridian implies `meridian-solution` and the existing prerequisite
  uniques are recovered;
- an active Meridian approach/dock requires a matching Meridian route and a
  finite arrival distance;
- an invalid active Meridian record falls back to the Meridian route-selection
  offer, never to a completed ending.

Generalize `beginNextExpedition()` to select Meridian after Glass Orchard and
`selectRoute()` to validate its two destination routes. Add no Meridian-specific
parallel save. Reuse `completeObjective`, `readJournal`, `collectUnique`,
`canDepart`, scripted encounter state and existing `StoryEffect` variants.
`snapshot.nextExpedition` exposes the passive Meridian offer only while no main
story expedition is active.

**Luna story/data owner:** `src/data/story.ts`, `src/data/routes.ts`,
`src/story/StoryDirector.ts`, and focused pure tests. No `Game.ts`, models,
physics, inventory or UI edits.

**Astra/root art owner:** one original Blender source, reproducible export script,
optimized GLB and a cheap fallback model. The layout must have a clear central
route from gangway to every mandatory interaction, explicit floor bounds and
colliders, readable anchors, and a distant transmitter silhouette. Reuse the
current shared material/texture ownership. No new enemy model is required.

**Root integration owner:** `Game.ts`, model loading, destination model factory,
Radio/Expedition view glue, authored interaction copy, save ordering and browser
QA. Root freezes anchor coordinates before story data lands.

### Acceptance

- A profile completed through Orchard can ignore the Meridian offer and keep
  building, tending gardens, fighting raids and visiting optional contacts.
- Both route cards require a powered helm, an aboard player, a stable deck and a
  clear gangway. Each queues exactly one real existing vehicle encounter and
  survives a stable save/load without duplication.
- Every mandatory interaction is physically reached from the gangway in the
  actual Rapier world. The alternate-route record is unavailable; the common and
  selected records remain readable after load.
- Departure is impossible before both objectives, the common record and
  `meridian-solution`; it also requires the player aboard and no queued encounter.
- Old and malformed saves normalize conservatively. Repeated configure,
  dock/depart and 100 load/reset cycles keep body, collider, scene, program and
  resource counts bounded.

## 2. Final course commitment and ending

Recovering `meridian-solution` grants course tier 3, whose existing controller
limit is ±45 degrees. Tier 3 is useful immediately for wider chart contacts, but
the ending is a separate deliberate action at the powered helm after returning
aboard. The helm presents **Commit to the Meridian bearing**, lists the required
state, and requires a second confirm click. It does not trigger on unique pickup,
gangway crossing, chapter departure, distance, or radio polling.

The commit prerequisites are: Meridian expedition complete, solution recovered,
player aboard, powered helm, stable story state, no enemy/vehicle/pending boarding
outcome, no hook, no build mode or mounted turret, no committed/docked optional
site, and a clear expedition gangway. Before changing state, Game writes a named
safe checkpoint through the existing SaveManager path. A failed checkpoint write
leaves the confirm action enabled with a readable error and does not start the
ending.

The committed journey is exactly **400 forward metres** from the checkpointed
distance. Arrival presentation lasts **12 seconds of Game-supplied simulation
time** before credits become available. Pausing stops that clock because Game
does not call the controller with additional elapsed simulation time; the
controller owns no wall clock, animation, physics or camera.

Use a small pure controller rather than embedding timing in `Game`. Freeze this
API so the controller can be implemented and tested independently:

```ts
type EndingPhase = 'available' | 'committed' | 'arrival' | 'credits' | 'complete';

interface EndingSave {
  format: 1;
  phase: EndingPhase;
  committedAtDistance: number | null;
  arrivalElapsedS: number;
}

type EndingEffect =
  | { type: 'lock-course'; bearingDeg: number; remainingM: 400 }
  | { type: 'request-sanctuary'; active: boolean }
  | { type: 'begin-arrival' }
  | { type: 'show-credits' }
  | { type: 'enter-keep-walking' };

interface EndingContext {
  eligible: boolean;          // Meridian complete + solution recovered
  currentDistance: number;
  meridianBearingDeg: number; // authored final bearing, finite and within ±45
  stable: boolean;            // Game's full safe-commit predicate
}

type CommitTicket = {
  readonly id: number;
  readonly distance: number;
  readonly bearingDeg: number;
};

class EndingDirector {
  get phase(): EndingPhase;
  get snapshot(): Readonly<EndingSave>;

  // Pure preflight. Returns a one-use in-memory ticket and does not change phase.
  // Preparing again invalidates the previous ticket.
  prepareCommit(context: EndingContext):
    | { ok: true; ticket: CommitTicket }
    | { ok: false; reason: 'unavailable' | 'unstable' | 'invalid-distance' };

  // Called only after SaveManager confirms the checkpoint write. Revalidates
  // eligibility/stability and the finite ±45 bearing, requires current distance
  // to remain within 1m of the ticket, consumes it, and is the sole
  // available -> committed transition.
  checkpointSucceeded(ticket: CommitTicket, context: EndingContext): EndingEffect[];

  // Invalid, stale, reused or failed tickets have no effect.
  checkpointFailed(ticket: CommitTicket): void;

  // Game supplies paused-aware simulation seconds elapsed since the previous
  // call, plus authoritative forward distance. Non-finite/negative elapsed is
  // zero. Effects are edge-triggered.
  update(input: { currentDistance: number; elapsedSimS: number }): EndingEffect[];

  // committed/arrival/credits -> complete; available/complete are no-ops.
  // Repeated Skip returns no effects.
  skip(): EndingEffect[];

  // credits -> complete only. Repeated acknowledgement returns no effects.
  acknowledgeCredits(): EndingEffect[];

  toSave(): EndingSave;
  restore(save: Partial<EndingSave> | null | undefined, eligible: boolean): void;
}
```

Store `ending?: EndingSave` as an optional member of campaign format 2. Missing
means `available` only when the durable Meridian completion facts authorize it;
otherwise it is absent. `restore` accepts only `format:1`, finite nonnegative
distance/elapsed values and legal phases. Without durable eligibility every
value normalizes to `available` with no effects and Game does not expose commit.
`committed` restores with elapsed zero at its saved committed distance;
`arrival` restores at arrival with elapsed clamped to `[0,12]`; `credits` and
`complete` remain those phases. Restore emits nothing: Game explicitly applies
the corresponding camera/course/sanctuary view after all authorities load.
Never trust the ending phase to grant tier 3; derive the effective tier from
`meridian-solution`, as current loads derive tiers 1 and 2 from recovered parts.
`StoryDirector` does not own the ending state machine: root serializes
`{ ...story.toSave(), ending: ending.toSave() }` into `world.story`, restores
StoryDirector first, computes durable eligibility from its normalized snapshot,
then calls `ending.restore(savedStory.ending, eligible)`. StoryDirector ignores
the extra `ending` member when parsing its own state.

The committed 400 m travel uses the normal course/world projection and existing
resource consumption. `checkpointSucceeded` emits course lock and sanctuary
once; reaching committed distance +400 emits `begin-arrival`; reaching 12 seconds
of arrival simulation emits `show-credits`. `acknowledgeCredits` emits
`enter-keep-walking` plus sanctuary release exactly once. `skip` emits the same
completion/release effects directly and never shows or replays credits.
Sanctuary starts only after the
commit preflight has verified a clear encounter; it prevents new threats during
the ending but never deletes a live threat. The arrival is an in-engine camera
sequence over the moving Nomad and Meridian transmitter, with captions and
radio/ANNIKA text. It contains no simulated human crowd. A reply, lights and
maintained structures indicate possible survivors without resolving who sent it.
Skip uses the same idempotent completion method as natural playback. Credits are
skippable and shown once per save; reload from `committed` or `arrival` resumes at
a safe phase boundary rather than replaying rewards.

**Luna controller/UI owner:** new `src/story/EndingDirector.ts`, focused tests,
and a view-only `src/ui/EndingUI.ts`. The controller emits effects and owns no
DOM globals, game objects, saves or inventory.

**Root integration/art/audio owner:** safe-checkpoint sequencing, `Game.ts`,
camera choreography, captions, radio copy, music/ambience, Settings volume
compliance, and the Meridian environment. No control is taken until checkpoint
success. Pause, remap, focus loss and Skip converge on existing safe lifecycle
paths.

### Acceptance

- Attempting commitment during combat, while off-machine/unpowered, or at an
  optional site gives a readable refusal and changes no course/story/save state.
- Successful commitment creates a loadable checkpoint before sanctuary/course
  lock. Injected save rejection leaves state and resources unchanged.
- Natural and skipped sequences each enter completion exactly once; repeated
  input, refresh and load cannot replay unlocks, credits, audio or completion
  events.
- Save/load is tested at `available`, `committed`, `arrival`, `credits` and
  `complete`. Loading a pre-Meridian save cannot forge tier 3 or postgame.
- The sequence remains in-engine, is pause-safe, and restores pointer lock and
  camera ownership on both normal completion and Skip.

## 3. Keep Walking post-ending loop

Ending completion transitions the same save into **Keep Walking**. It is a mode
of the existing campaign rather than New Game Plus. The player keeps the machine,
builds, containers, upgrades, gardens, facts, chart history, inventory, needs,
damage and course state. No reward is duplicated and no world reset occurs.

Expose one durable, derived flag:

```ts
`StorySnapshot` adds only `journalArchive: readonly string[]`. Game composes
`campaignComplete` from `ending.phase === 'complete'` into HUD/radio views; it is
not a second mutable StoryDirector flag.
```

`StoryDirector.permitsRadioRaids` remains true after campaign completion.
`RouteChart` continues generating deterministic contacts with tier-3 reach and
its existing bounded history. Main-story radio offers stop; the radio instead
shows the final Meridian reply and normal raid/recovery information. The HUD
objective becomes a calm persistent prompt: keep the Nomad supplied, tend what
was saved, answer discoveries, and protect the route. Gardens, automation,
research, crafting, building, needs, theft recovery and all recurring raid
objectives retain their current rules.

Add only two postgame quality-of-life behaviors:

- the Archive section can reread every journal already present in the durable
  story facts, grouped by expedition, without spawning destinations or granting
  items;
- the helm labels tier 3 as `Meridian authority` and retains full throttle,
  bearing and opportunity controls after the ending releases its course lock.

No endless stat escalation, prestige currency, procedural quests, additional
enemy tier, weather system or postgame-exclusive resource is part of this
iteration.

**Luna UI/data owner:** a pure archive projection helper and additions to the
existing Radio/Expedition/Helm view models with DOM tests. It consumes readonly
story facts and performs no mutations.

**Root integration owner:** transition effects, persistent HUD/radio state,
course unlock release, archive callbacks and end-to-end save QA.

### Acceptance

- Completing or skipping the ending returns control to the same physical world
  with identical resources, structures, containers, garden timers, health and
  chart state.
- For at least ten real-time minutes and 100 mixed build/garden/contact/save-load
  cycles, scene/physics/render counts remain bounded and all conservation checks
  pass. Recurring assault, sabotage and theft raids still occur and remain
  recoverable.
- Credits and Meridian completion never replay after reload. Main-story trace
  controls disappear, while optional chart contacts and raid recovery remain
  usable.
- Archive rereads cannot grant rewards or alter journal completion. Empty and old
  saves render safely.
- A fresh profile can still play the unchanged opening and all prior chapters;
  existing camera, input remapping, pause, save safety and original enemy combat
  parity suites remain green.

## Implementation order and release boundary

1. Freeze Meridian anchors, typed IDs/routes and StoryDirector save behavior.
2. Build and validate the physical destination and both real route encounters.
3. Add EndingDirector and checkpoint-first Game integration.
4. Add the in-engine arrival/credits and idempotent completion transition.
5. Expose Keep Walking radio/HUD/archive views and run full regression, browser,
   visual, audio, performance and long-session conservation acceptance.

The iteration is complete only when a new profile can reach Meridian, deliberately
commit, see or skip the ending, reload every stable boundary, and continue the
same survival/build/chill game afterward. A data-only Meridian definition, a
credits overlay without checkpoint recovery, or a postgame flag without playable
continuation is incomplete.
