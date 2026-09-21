# Expedition operations and desert cohesion

> Sequencing update, 2026-09-21: the user's
> [Nomad foundation roadmap](2026-09-21-nomad-foundation-roadmap.md) takes priority.
> Preserve the partial implementation, but first deliver scanner onboarding,
> readable cargo/fuel, roomier decks and the wrist terminal. Optional exploration
> must stay on connected raised platforms above radioactive ground, and the
> operations view belongs inside the new terminal. This older contract remains
> useful for transaction and regression requirements; it does not supersede the
> newer layout, access, or player-experience decisions.

Status: implementation contract for the first complete iteration. This plan adds
three compact forms to the existing optional-contact loop, turns the current
machine status and L-12 work data into an actionable three-deck view, measures a
fresh Story and Survival campaign before changing balance, and refines the existing
desert ruin library. It does not add a campaign chapter, route scheduler, enemy,
resource, crafting family, damage rule, destination save, or second caretaker.

The authoritative systems remain authoritative:

- `RouteChart` schedules one optional contact and owns its reward request/resolve
  transaction. `StoryDirector` continues to own campaign routes and journals.
- `BuildSystem`, `MachineDamage`, `MachinePower`, the inventory containers and
  `CaretakerDirector` own machine state. The operations screen is their projection.
- `SaveGameV1` stays version 1. New state is optional and narrowly validated.
- `DesertScenery` keeps its seeded placement, shared atlas, batched ownership,
  two LODs and no-physics promise.
- Balance changes require a reproduced baseline defect. The richer stops do not
  smuggle an economy rebalance into their content work.

Unrelated untracked dealer directories, `docs/vpc-mvp`, prior campaign-library,
workshop, pool, feel/pacing and progression-art work are outside this iteration.

## Current diagnosis and bounded decisions

`RouteChart` currently rotates `water-cache`, `salvage-wreck` and `memorial`
contacts every 700 m and substitutes a far `repair-depot` at eligible tier-two or
tier-three slots. Every ordinary optional destination uses the same floor and
equipment block. The salvage wreck already has a sound safe/deep transaction:
secure recovery pays 24 scrap and 2 components; broadcast recovery starts the
existing patrol and pays at most 48 scrap and 6 components after victory. Water
and memorial contacts pay four water and one journal respectively. Those totals,
the schedule, the one-active-contact rule, the tier depot and L-12 remain fixed.

The three requested forms therefore replace presentation and add short tasks to
the three ordinary kinds, rather than creating another scheduling dimension:

| Existing contact kind | New form | Short task | Existing outcome |
| --- | --- | --- | --- |
| `water-cache` | Collapsed service depot | Restore the cistern bypass | Up to 4 water |
| `salvage-wreck` | Wrecked convoy | Retrieve the service transponder | Existing secure/broadcast choice and caps |
| `memorial` | Damaged relay | Align the relay coupler and retrieve its record | `memorial-transmission` journal |

`repair-depot` remains the calm, far Linekeeper depot introduced for L-12. It is
not renamed, remodelled into the collapsed depot, or put behind the new task state.
This prevents a visual variant from changing its navigation-tier, repair-kit,
journal, caretaker or campaign-memory meaning.

The machine already exposes subsystem repair anchors, three build-grid levels,
serialized structure cells, container/producer/garden work snapshots and L-12's
transactional one-item jobs. The first operations view uses those exact facts. It
does not add free transfer, remote repair, production queues, arbitrary job chains
or an editable floor plan.

The campaign has strong slice-by-slice continuity evidence, but no one evidence
packet follows a fresh Story and a fresh Survival profile through the whole shipped
campaign while recording the same resource ledger. The first balance deliverable
is that comparable evidence. One canonical automated run per profile is descriptive,
not statistical and not human playtesting.

## Authority and ownership

| Area | Owner | May change | Must not change |
| --- | --- | --- | --- |
| Optional expedition rules | expedition Luna | `OpportunityExpedition.ts`, `RouteChart.ts`, `opportunities.ts`, focused tests | `Game.ts`, global save validation, reward amounts, story routes |
| Machine operations projection | operations Luna | `MachineOperations.ts`, caretaker work/director, status UI and focused tests | `Game.ts`, build commits, repair commits, power/needs rates |
| Integration | root | `Game.ts`, `SaveSchema.ts`, `SaveExportCodec.ts`, asset cache/warmup, integration tests | authorities and resource invariants below |
| Balance evidence | Sol | plan, browser orchestration, ledger/report tooling and evidence docs | production gameplay values before accepted evidence |
| Desert reference and art | Astra, integrated by root | reference ledger, Blender source/export, ruin library/runtime scenery within its contract | route placement authority, gameplay colliders, destination interaction anchors |

Only root edits `Game.ts` and save-schema/codec integration while the two module
owners work. Root resolves shared-file integration after their focused tests pass.
Browser/GPU work runs serially. The balance logical pass can use the inexpensive
model/texture fallback, but visual and performance claims require the final authored
bundle.

## EXPEDITION — three compact optional stops

### Pure definitions and saved state

Add a dependency-light module adjacent to `RouteChart`, proposed as
`src/navigation/OpportunityExpedition.ts`:

```ts
export type OpportunityVariantId =
  | 'collapsed-service-depot'
  | 'wrecked-convoy'
  | 'damaged-relay';

export type OpportunityTaskId =
  | 'restore-cistern-bypass'
  | 'retrieve-convoy-transponder'
  | 'align-relay-coupler';

export interface RouteExpeditionSave {
  format: 1;
  step: 'task-ready' | 'task-complete';
}

export interface OpportunityTaskDefinition {
  id: OpportunityTaskId;
  label: string;
  anchor: string;
  fallback: { x: number; y: number; z: number };
  holdS: number;
}

export interface OpportunityExpeditionDefinition {
  variant: OpportunityVariantId;
  contactKind: 'water-cache' | 'salvage-wreck' | 'memorial';
  title: string;
  summary: string;
  safeOutcome: string;
  deepOutcome: string;
  riskLabel: 'calm traversal' | 'exposed traversal' | 'hostile patrol';
  task: OpportunityTaskDefinition;
}

export interface OpportunityExpeditionView {
  definition: OpportunityExpeditionDefinition;
  step: RouteExpeditionSave['step'];
  canWork: boolean;
  rewardUnlocked: boolean;
  salvageChoiceUnlocked: boolean;
}

export function expeditionDefinition(
  kind: RouteContactKind,
): OpportunityExpeditionDefinition | null;

export function projectOpportunityExpedition(
  contact: Readonly<RouteContact>,
): OpportunityExpeditionView | null;
```

`RouteContact` gains only `expedition?: RouteExpeditionSave`. The variant is always
derived from `kind`, so changing code cannot reroll a loaded contact. Hold progress
and transient interaction focus are not saved. Task completion is an instantaneous
simulation transaction after the full hold succeeds.

`RouteChart` adds:

```ts
export type ExpeditionTaskResult =
  | { ok: true; contact: RouteContact }
  | { ok: false; reason: 'missing' | 'unavailable' | 'already-complete' };

completeExpeditionTask(id: string): ExpeditionTaskResult;
```

The method accepts only the matching active contact in `docked` state, records the
task once and returns a clone. It consumes no resource and grants no reward. Repeated,
stale and wrong-contact calls are inert. The existing `requestReward`,
`resolveReward`, `chooseSalvage`, `resolveSalvage`, `abortSalvage` and `depart`
methods remain the only reward and salvage authority.

For the three mapped kinds, reward access and salvage choice remain locked until
`task-complete`. The task completion and reward deposit are deliberately separate:
a full inventory can leave a completed task with an unclaimed remainder, save it,
and claim later. A failed deposit resolves with the accepted count it actually
stored; zero accepted leaves the whole reward. A patrol start failure or lost fight
uses the current broadcast abort path and never upgrades the cache.

### Layout and interaction contract

Each destination remains one bounded platform with the existing gangway and
departure interaction. `opportunityDefinition(kind)` supplies different authored
colliders and anchors for the three mapped kinds while preserving the current
world root, entry and exit conventions. The layouts have one readable outer route,
one deeper task anchor and one return route. They do not create a general puzzle
framework or use story objective state.

- **Collapsed service depot:** the intact edge and departure are visible from the
  gangway. Sand-filled bays and a fallen canopy form a short route to the cistern
  bypass. Holding interact for the defined task duration repairs the bypass and
  unlocks the existing four-water cache. The site is calm; copy must not promise
  an enemy, electrocution or damage that does not exist.
- **Wrecked convoy:** two or three compact vehicle silhouettes make a broken lane.
  The outer transponder is a short retrieval hold. It reveals the existing secure
  recovery and broadcast choices. Secure is explicitly the safe 24/2 result;
  broadcast is explicitly a hostile patrol with the defended 48/6 cap. No new
  patrol composition, health, damage or reward rule is introduced.
- **Damaged relay:** a fallen mast and service cabinet create a short exposed walk
  to the coupler. The alignment/retrieval hold unlocks the existing memorial record.
  The risk label describes traversal and exposure only. There is no hidden resource
  cost or unimplemented electrical damage.

Before the player leaves the gangway, the panel states the task, known reward,
actual risk and that departure abandons unclaimed supplies. A safe outcome may be
to inspect and depart with no reward; text must say so. The deeper outcome is never
presented as randomized after commitment.

Root integrates one optional-task interaction through the existing destination
candidate path. It may use the existing `objective` interaction presentation, but
it must route the optional ID directly to `completeExpeditionTask`; it must not add
the ID to `StoryDirector` objectives or journal facts. Interaction range, hold time
and world anchor use the same normal-input path as other destination interactions.

### Legacy and transaction rules

Overall save version and `RouteChartSave.format` remain `1`. The strict validator
accepts the optional exact object above and rejects wrong format, extra state values,
non-object payloads and a task field on `repair-depot`.

An active legacy contact with no `expedition` is normalized as follows:

- detected, committed or untouched docked ordinary contacts start `task-ready`;
- a docked contact with a reward already below its authored cap, any existing
  `salvageMode`, or `visited` state is treated as `task-complete`;
- the current partial `remaining` values are retained exactly; normalization never
  restores a full reward or promotes secure salvage to defended;
- a saved transient `broadcast` continues to use the existing restore rule, which
  returns it to secure rather than resurrecting an external encounter;
- `repair-depot` ignores the new projection and preserves its existing repair-kit
  and journal flow.

Clone, snapshot and save paths copy the nested expedition object. Restore clears
transient in-flight reward claims as it does now. A task-complete save with an
unclaimed reward resumes at the claim step. A save taken after one reward entry is
claimed retains the remaining entry and cannot repeat the first.

### Expedition tests and browser acceptance

Focused tests must cover every state edge, including:

- the one-to-one kind/variant/task mapping and `repair-depot === null`;
- wrong contact, undocked, already-complete and repeated task completion;
- reward and salvage choice locked before completion and available after it;
- zero, partial and full deposit resolution without duplication;
- secure, broadcast, patrol-start failure, fight abort, defended and reload paths;
- old untouched, old partial, old secure, old defended and visited contacts;
- task-complete/unclaimed and task-complete/partially-claimed round trips;
- strict rejection of malformed nested state and exact preservation by export/import;
- contact suspension, approach cancellation, missed contacts and story-priority
  scheduling remaining unchanged.

The normal-input browser route starts from a genuine eligible save, reaches each
kind through its existing chart, walks from gangway to task and back, completes the
hold, exercises safe/deep behavior, claims through ordinary inventory capacity,
saves and cold-continues. It checks exactly one reward ledger change and no story,
route-history or repair-depot regression. Prepared saves may select a known existing
contact seed, but the run may not inject a contact, set task state, grant inventory,
teleport the player, bypass collision or call reward methods from the page.

## OPERATIONS — selectable deck plan, pins and L-12 priority

### Pure projection

Add `src/machine/MachineOperations.ts`. It accepts snapshots and coordinates; it
does not retain Three objects, DOM nodes, mutable containers or system owners.

```ts
export type MachineDeckId = 'lower' | 'middle' | 'upper';
export type CaretakerPriority = 'auto' | 'gardens' | 'outputs';
export type OperationsNodeKind =
  | 'subsystem'
  | 'storage'
  | 'producer'
  | 'garden'
  | 'equipment';

export type OperationsPin =
  | { kind: 'subsystem'; id: SubsystemId }
  | { kind: 'structure'; id: string };

export interface MachineOperationsSave {
  format: 1;
  pin?: OperationsPin;
}

export type CaretakerBlockedReason =
  | 'no-work'
  | 'garden-unreachable'
  | 'output-unreachable'
  | 'water-unavailable'
  | 'water-source-unreachable'
  | 'storage-full'
  | 'storage-unreachable';

export type CaretakerWorkDecision =
  | { kind: 'ready'; job: CaretakerJob }
  | { kind: 'idle'; reason: 'no-work' }
  | { kind: 'blocked'; reason: Exclude<CaretakerBlockedReason, 'no-work'>; nodeId?: string };

export interface MachineOperationsNode {
  id: string;
  source: OperationsPin;
  deck: MachineDeckId;
  kind: OperationsNodeKind;
  label: string;
  x: number; // normalized, clamped 0..1 from machine-local x
  z: number; // normalized, clamped 0..1 from machine-local z
  condition?: number;
  reachable: boolean;
  task?: { label: string; blockedReason?: string };
}

export interface MachineOperationsView {
  decks: readonly { id: MachineDeckId; label: string; nodes: readonly MachineOperationsNode[] }[];
  pin: OperationsPin | null;
  pinnedNode: MachineOperationsNode | null;
  caretaker: {
    recruited: boolean;
    mode: CaretakerMode;
    priority: CaretakerPriority;
    phase: CaretakerJobPhase;
    decision: CaretakerWorkDecision;
    globalBlock?: OperationsGlobalBlock;
  };
}

export function projectMachineOperations(input: MachineOperationsInput): MachineOperationsView;
```

The three deck IDs map directly to build-grid levels 0, 1 and 2. Structure nodes
use serialized `cell` plus the definition label and role. Subsystem nodes use
`SUBSYSTEMS[id].repairAt`, converted to the closest valid deck by the same
`DECK_SURFACE_Y`/`LEVEL_HEIGHT` convention used by navigation. Diagram coordinates
normalize the machine-local iron-nomad footprint once; they never use camera or
screen coordinates. Stable IDs are the subsystem ID or existing structure
`instanceId`. Sorting is deck, z, x, then ID so projection and keyboard order are
deterministic.

Only actionable nodes are included: damaged subsystem service points, crates,
producers with stored output, thirsty gardens, and existing relevant equipment.
Selecting a deck filters presentation only. Selecting a node shows its exact deck,
label, current status, required materials if supplied by the existing repair view,
and L-12 eligibility/blocker. It does not remotely open a crate, repair, water,
harvest, move or demolish anything.

### Caretaker priority and blocked reasons

Extend `CaretakerWork.ts` without weakening its immutable one-item transaction:

```ts
export function evaluateCaretakerWork(
  snapshot: CaretakerWorkSnapshot,
  priority?: CaretakerPriority,
): CaretakerWorkDecision;

export function chooseCaretakerJob(
  snapshot: CaretakerWorkSnapshot,
  priority?: CaretakerPriority,
): CaretakerJob | null;
```

`auto` is exactly the shipped stable order: reachable thirsty gardens first,
then reachable stored output, IDs sorted lexically. `gardens` uses that same order
and reports garden blockers before unrelated output; `outputs` reverses only the
two eligible categories. A priority never changes source/target validation, moves
more than one item, services another deck, fills a full container, consumes remote
inventory or commits work. `BuildSystem.commitCaretakerJob` stays the atomic owner.

The evaluator retains enough unfiltered facts to explain why no job was issued:

- thirsty garden but no water anywhere: `water-unavailable`;
- water exists only in an unreachable crate: `water-source-unreachable`;
- the chosen garden cannot be reached: `garden-unreachable`;
- stored output exists only at an unreachable producer: `output-unreachable`;
- reachable output has capacity only in unreachable crates: `storage-unreachable`;
- reachable crates exist but none can accept the item: `storage-full`;
- no thirsty garden and no stored output: `no-work`.

When several facts apply, report the selected priority category first, then the
lexically first source/target ID. Game supplies global blockers that the pure work
snapshot cannot know, in this precedence: `unsafe`, `dock-missing`,
`dock-unpowered`, `companion-mode`, `busy`. A live route disappearance continues
to cancel the token and reports the current `unreachable` refusal; changing priority
does not rewrite an issued frozen job.

`CaretakerSave` remains format 1 and gains `priority?: CaretakerPriority`. Missing
priority restores `auto`; malformed priority rejects imported data before load.
`setPriority` requires a recruited caretaker, validates the enum and affects the
next plan only. It does not cancel or reorder an active token. Reset/new campaign
returns to `auto`.

### Pin and UI behavior

Root adds optional `machine.operations?: MachineOperationsSave`. A pin is user
intent and survives ordinary save, Save & Quit, export/import and cold Continue.
Restore happens after structures. A well-formed pin whose structure was later
demolished or whose subsystem no longer projects clears harmlessly; malformed shape,
kind or ID rejects an imported save. Missing state means no pin. Selected deck,
expanded details and focus are session presentation and are not saved.

The existing `MachineStatusView` gains one **Operations** control and hosts a compact
panel; it does not create another pause/menu layer. The presentation callback is:

```ts
export interface MachineOperationsCallbacks {
  selectDeck(deck: MachineDeckId): void;
  pinTask(pin: OperationsPin | null): void;
  setCaretakerPriority(priority: CaretakerPriority): void;
  close(): void;
}
```

The panel has three actual buttons/tabs, a labelled diagram, a keyboard-operable
node list representing the same data, a selected-node detail, Pin/Clear pin and
L-12 priority controls. Re-render preserves the selected deck, open state and focus
by stable data attributes. The diagram is usable at 1280×720 and 200% zoom without
covering pause controls or placing actionable buttons outside its scroll region.

A pin produces one HUD line naming deck and target and highlights the same node in
the diagram. If root adds a world marker, it is a presentation child at the existing
machine-local anchor, has no collider/raycast authority, and is disposed on clear,
load, new game and Game disposal. It must not reveal remote destination locations,
path through walls, or imply that L-12 can cross an unbuilt stair route.

### Operations tests and browser acceptance

Focused tests establish:

- exact grid-level/deck and repair-anchor mapping at boundaries;
- stable normalized coordinates/order and source snapshot immutability;
- structure/subsystem pin lookup, demolished stale-pin clearing and malformed save
  rejection through the codec integration tests;
- `auto` parity with the old planner and both explicit priority orders;
- every blocked reason, blocker precedence and deterministic node attribution;
- unreachable gardens, water sources, producers and storage distinguished from
  empty/full/no-work cases;
- changing priority during an issued job leaves its job/token frozen;
- reset, legacy restore, valid round trip and invalid priority behavior;
- UI click/keyboard callbacks, focus retention, literal labels, pin clearing,
  selected-deck persistence and small-screen bounds.

The browser path builds ordinary floors, a cross-deck stair, crate, producer,
garden and L-12 dock through normal controls. It selects all three decks; pins a
repair and a work task; saves/cold-continues the pin; switches priorities; observes
one real garden job and one output job; creates each reachable/full/unreachable
blocker with normal build/move/demolish and resource actions; and checks exact item
conservation. It never calls `commitCaretakerJob`, rewrites a piece cell, grants an
item or moves L-12 from page code.

## BALANCE — fresh campaign evidence before tuning

### Runner and lineage

Add a small orchestrator, proposed as:

- `tools/campaign/expedition-balance-lib.mjs` — immutable snapshots, ledger
  comparison, child-profile creation, subprocess result parsing and report writing;
- `tools/campaign/expedition-balance.mjs` — profile/route matrix and fail-safe
  orchestration;
- `docs/campaign/expedition-balance-delivery.md` and JSON/JSONL under
  `test-results/expedition-balance/<run>/` — evidence, not design authority.

The orchestrator reuses the shipped continuity runners rather than copying their
movement/combat logic. Every profile starts through the real title **New Game** and
profile button in a fresh unique browser directory. Story uses the continuity seed
already supported by the runner. Survival must receive an explicit deterministic
seed through an accepted normal start option or record the generated seed and reuse
the committed source profile; it must never convert a Story save into Survival or
edit IndexedDB/local storage.

Each child step copies only a closed, committed browser profile into a new unique
directory before opening Chromium. The source lineage is read-only. A child failure
retains its directory, event log, screenshot and last snapshot and does not overwrite
the last accepted parent. One Vite origin is used for the whole lineage because
browser storage is origin-bound. No two profile writers run concurrently.

The canonical matrix is:

1. Fresh Story from New Game through Keep Walking.
2. Fresh Survival from New Game through Keep Walking.
3. Three build-order branches from the earliest committed milestone at which their
   listed pieces are normally unlocked and affordable:
   - objective-minimum: only explicit campaign prerequisites and repairs;
   - sustainment-first: water/food/storage pieces before optional automation;
   - defense-first: manual/automatic defense and salvage automation before optional
     home pieces.

The branches use ordinary catalog, crafting, repair and interaction input. They do
not need to finish the campaign; each runs through the next two campaign milestones
or until it records a hard stall. A requested piece that is still locked or
unaffordable is recorded as an experimental outcome, not bypassed.

The full-profile checkpoints are: opening/first salvage, first boarding, Wreck One
departure, Foundry departure, Quiet Array departure, recovery/L-12, Glass Orchard
departure, Meridian arrival, and Keep Walking. At minimum Wreck departure, Quiet
Array departure, Orchard departure and Keep Walking perform actual Pause → Save &
Quit → title → cold Continue. Earlier existing slice saves remain part of the chain;
the orchestrator records which runner and committed slot produced each child.

### Snapshot and accounting schema

At start, before/after every milestone, before/after a save, after cold Continue,
and on failure, record:

```ts
interface BalanceSample {
  profile: 'story' | 'survival';
  seed: string;
  lineage: string;
  milestone: string;
  simTimeS: number;
  distanceM: number;
  health: number;
  needs: { water: number; food: number } | null;
  tankFuel: number;
  inventoryTotals: Record<string, number>;
  containerTotals: Record<string, number>;
  weaponAmmo: { id: string; magazine: number; reserve: number; infinite: boolean }[];
  structures: { id: string; definitionId: string; health?: number }[];
  subsystems: { id: string; health: number }[];
  power: { capacity: number; demand: number; shed: string[] };
  story: unknown;
  routeChart: RouteChartSave | null;
  deaths: number;
  retries: number;
  encounters: Record<string, number>;
  optionalContacts: { accepted: string[]; missed: string[] };
  save: { slot: string; savedAt: number; checksum?: string } | null;
}
```

The ledger also records every observed source/sink event: salvage/reward accepted,
loot recovered, build/craft/repair cost, consumption, production, loss with destroyed
container, and refund. If the existing public diagnostic surface cannot attribute a
delta, the report names it as unattributed rather than inventing a cause. Cold-load
comparison ignores permitted moving fields such as current live distance only when
the production flow actually advances them; durable inventories, structures,
profile, story facts, route rewards, caretaker priority and operations pin compare
exactly.

A **hard stall** means the next explicit campaign prerequisite is unavailable and
the run has no currently reachable normal source, recipe or recovery action for its
required resource/state. An unaffordable piece with an available salvage/production
source is a measured recovery debt, not a hard stall. A harness navigation error,
driver close, timeout while a normal source remains, or unexplained death is a test
blocker and cannot justify balance tuning.

### Change gate

No gameplay value changes during baseline capture. After the baseline report, a
candidate adjustment is allowed only when:

1. the event ledger identifies one repeatable gameplay cause rather than harness
   failure or user inaction;
2. the same seed reproduces it from the prior committed checkpoint;
3. the proposed change names one authoritative data constant and all affected sinks
   or sources;
4. the candidate is run from that same checkpoint and a second applicable seed;
5. the report shows the intended effect, exact resource accounting and no new Story
   or Survival stall.

One coherent data-only tuning patch is the maximum for this iteration. It may adjust
an existing cost, yield or pacing constant, but it may not add a resource, grant,
chapter, difficulty exception or special-case recovery. Damage, health and story
gates require a separate decision and are not changed here. Optional-stop content
keeps the current reward caps during this baseline, so it cannot be the hidden fix
for a main-route shortage.

Automated normal-input evidence can establish reachability, completion, accounting,
save continuity and measured intervals. It cannot establish that pacing is fun,
that shortages feel fair, that a layout is readable at first sight, or that scenery
looks cohesive. A human review may later record those judgments, but delivery does
not promise or claim one.

## DESERT — reference-led authored refinement

### Reference and visual language

Astra first writes `docs/art/desert-expedition/reference-ledger.md`. Each reference
entry records the page URL, creator/institution, access date, license/use status and
one concrete form/material/weathering observation. Prefer public-domain, CC0 or
museum/official engineering references. References guide construction and decay;
textures, logos and distinctive proprietary designs are not copied.

The 14 existing archetype names and their gameplay-neutral role remain stable:
ruined houses, shop, apartment, tower, factory, overpass, three wreck vehicles,
three signs, pylon and water tower. Refinement gives them a shared desert history:

- windward faces show sand abrasion and softened paint edges;
- leeward bases collect sand and partially bury low openings;
- sun-exposed paint and cloth bleach upward; sheltered recesses retain value;
- rust concentrates at fasteners, seams, water traps and broken coatings rather
  than covering every metal surface uniformly;
- broken concrete exposes aggregate/rebar at plausible failure edges;
- cables sag from supports and debris follows gravity and prevailing wind;
- signage remains fictional, sparse and readable as silhouette rather than lore
  that conflicts with the campaign.

The three optional destinations reuse that language but stay separate authored
models with their exact interaction anchors. Generic scenery never places a collider,
reward, task or route contact.

### Asset and runtime contract

Preserve the published root/node contract of
`models/props/ruins/desert-ruins.glb`: each `DESERT_ARCHETYPES` name and its
`__lod` mate, indexed position/normal/UV geometry, one shared standard-material
atlas, matched transforms and compatible bounds. Keep editable Blender masters,
texture masters, export manifest and validator reports under the existing
`assets/desert-ruins` and `tools/art/desert_ruins` paths.

The first iteration refines those 14 near meshes and their 14 distant meshes. It
does not increase the archetype list or add a third LOD. Near silhouettes may gain
structural breakup and restrained debris; distant LODs retain the same dominant
silhouette and pivot. Root validates that `createDesertLibrary` still rejects a
missing/malformed pair and disposes every cloned geometry/material/texture once.

`desertLayout`, `chunkAspectSeed`, the starboard 8–45 m opportunity corridor,
course bands, chunk recycling and dune seating remain deterministic. A before/after
placement snapshot for the same seed/quality must match kind, world x/z, yaw and
width. Only mesh shape, atlas shading and a justified burial correction may differ.
No scenery mesh enters Rapier or interaction raycasts.

Use the existing batched mesh, shared material and two geometry IDs per archetype.
Do not add per-instance materials, per-prop lights, animation mixers, cloned texture
ownership or unbounded shadows. Root may tune LOD thresholds only if a captured
transition or performance defect names the reason.

### Art acceptance

Validate with the existing optimize/validator and gameplay QA paths, then capture
the same named seeds and camera positions before/after at road, district and skyline
range. Acceptance requires:

- all 28 named mesh roots present with valid indexed position/normal/UV data and
  the shared atlas/material contract intact;
- no root-scale, pivot, inverted-normal, floating foundation or near/far silhouette
  jump at the existing 116/136 m hysteresis;
- seeded placement and opportunity corridor unchanged; no new physics bodies or
  blocked story/optional approach;
- fallback model failure still boots and saves/loads;
- no texture, geometry, material or instance growth after repeated chunk/course
  recycling and disposal;
- on the same hardware, route and final production bundle, p95 frame time and draw
  calls/geometries/textures do not regress more than 10%, and no new repeated frame
  above 50 ms appears. Report actual values; do not claim a universal frame rate.

Automated screenshots and counters can establish composition, silhouette presence,
LOD continuity and bounded ownership. Cohesion, believable decay and landmark
readability remain human visual judgments and must be labelled unreviewed unless a
named reviewer records them.

## Delivery order

1. **Freeze and record.** Root records the branch/commit, current unit/build status,
   current optional reward tables, current `auto` caretaker decisions and same-seed
   desert placement/render counters. Sol prepares the orchestration without tuning.
2. **Build pure modules in parallel.** Expedition Luna implements definitions,
   optional contact state and tests. Operations Luna implements the projection,
   planner decisions, priority, panel and tests. Neither edits `Game.ts` or codec.
3. **Integrate saves and Game once.** Root wires interactions, destination models,
   machine snapshots, callbacks, pin marker and additive strict validation. Load
   validates before mutation; structures restore before stale-pin resolution.
4. **Run focused gates.** Unit tests, lint, TypeScript and production build pass.
   Root runs short normal-input expedition and operations acceptance serially and
   fixes transactional/integration failures before art or long campaign work.
5. **Refine desert assets.** Astra completes the reference ledger, Blender/export
   artifacts and validation; root integrates cache/warmup/runtime presentation and
   runs visual/performance checks serially.
6. **Capture campaign baseline.** Sol runs the fresh Story and Survival lineages on
   the stable final bundle, preserves every child result and publishes the ledger.
   A production tuning patch is considered only under the change gate, then rerun
   from identical checkpoints.
7. **Final regression.** Run the complete unit suite, lint, TypeScript/production
   build, save import/export/cold-load fixtures, existing campaign continuity smoke,
   three optional stops, operations matrix, desert fallback/recycling and one final
   serial performance sample.

## Definition of complete

This iteration is complete when all of the following are true:

- each existing ordinary route kind presents its named compact form and distinct
  normal-input task; the far repair depot remains unchanged;
- safe/deeper copy matches real consequences, existing rewards occur at most once,
  failed/aborted transactions preserve exact remainder, and old saves never receive
  a regenerated bonus;
- the operations panel selects all three decks, projects live authoritative nodes,
  pins/clears one task across cold save, changes future L-12 priority, and reports a
  specific tested blocker without bypassing normal work rules;
- old saves lacking every new optional field retain route, rewards, caretaker mode
  and structures; malformed imported new fields reject before Game mutation;
- one fresh automated Story lineage and one fresh automated Survival lineage either
  reach Keep Walking or retain a precise reproducible blocker with its last valid
  checkpoint. A blocker is reported honestly and is not called a completed campaign;
- experimental build branches preserve their source checkpoint and report normal
  affordability, recovery debt and resource conservation without grants;
- the desert reference ledger, Blender masters, runtime export and validation agree;
  seeded placement, corridor clearance, fallback, disposal and measured performance
  stay within contract;
- delivery separates automated normal-input results, tool/visual inspection and any
  human review. No automated result is described as a human playtest.
