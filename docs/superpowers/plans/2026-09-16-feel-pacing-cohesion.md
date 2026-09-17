# Feel, pacing, and campaign-memory cohesion

Status: implementation complete; acceptance evidence is recorded separately in
[`feel-pacing-cohesion-delivery.md`](../../campaign/feel-pacing-cohesion-delivery.md).
The broad validation matrix below remains the design target; the delivery record
distinguishes automated coverage, measured browser cases, and unperformed human review.
This work does not add a
chapter, enemy, weapon, resource, ending, preservation station, or menu. It measures
the shipped movement/camera/combat/audio experience over a sustained session, gives
ordinary threats and recurring radio raids one recovery clock, and makes already
earned navigation and preservation state visible in the existing helm and keepsake
shelf.

## Frozen constraints and present diagnosis

- Preserve the browser Three/Rapier runtime, 60 Hz fixed simulation, current movement
  speeds, weapon timing, damage, health, mercy threshold, enemy rosters, rewards,
  story gates, route encounters, peaceful Meridian ending, and old saves. A measured
  feel defect may change presentation response or mix values, but it may not quietly
  rebalance combat or survival.
- `ThreatDirector` remains the authority for encounter phases and distance-based
  quiet. Standing still is safe: stopped distance does not advance recovery, calm, or
  buildup. Do not add timed invulnerability, health/ammo replenishment, or a separate
  stationary attack path.
- `RadioRaids` currently owns an independent 75–115 second post-raid timer. During
  `story.permitsRadioRaids`, `Game.updateSpawns` returns through that timer rather
  than advancing director recovery/calm. A radio skiff therefore appears without the
  ordinary `buildup` edge, warning sound, or HUD warning. This is the pacing defect to
  remove.
- Route skiff/gunboat queues, destination sanctuary, optional salvage, and live
  external ownership stay intact. A lane transition must never discard a queued
  scripted route encounter.
- Story/Progression remain the authorities for journals and recovered uniques.
  `CampaignRecord` remains their read-only projection. The helm and shelf are physical
  projections of the same facts; they own no reward or progression state.
- Preserve all uncommitted campaign-library, workshop, opening, and boarding-pool
  work. Ownership below is exclusive to avoid shared-file conflicts.

## FEEL — sustained movement, camera, combat, and audible review

### Measurement before tuning

The diagnostic owner adds a bounded browser harness and evidence route, proposed as
`tools/campaign/feel-acceptance.mjs` and
`docs/campaign/feel-route.md`. Instrumentation may expose read-only
snapshots under the existing development handle; it must not create a second gameplay
loop or modify the run after its starting save is loaded.

Capture one comparable baseline and candidate packet with:

- real animation-frame intervals and fixed-step count; average, p95, p99, frames over
  25/33/50 ms, longest frame, and lost-focus/pause intervals reported separately;
- requested versus resolved open-deck movement, grounded state, machine carry,
  crouch/sprint transitions, stair/ramp traversal, and any frame in which input remains
  active after pause, panel, cinematic, or pointer-lock loss;
- camera collision distance, inside-solid detections, shoulder swap, aim blend, hip/aim
  FOV return, recoil recovery, and mouse deltas consumed exactly once across zero-,
  one-, and multi-tick rendered frames;
- fired/dry-fire/reload/hit/kill/damage events and their matching presentation/audio
  events, with timestamps and bounded live enemy/vehicle counts;
- director lane/phase edges, external ownership, warning/request/finish distances,
  and actual quiet interval samples rather than a claim inferred from constants;
- renderer programs, calls, geometries, textures, physics bodies/colliders, audio
  sources/voices where observable, console/page errors, and the existing
  `SessionMetrics` samples at 0/300/900/1800 playable seconds.

The final gate is one uninterrupted **30-minute active-play target** in hardware-
accelerated Chrome at 1920×1080, DPR 1, Medium, from a cold-loaded representative
campaign save. After load, the reviewer uses ordinary keyboard and mouse input with
normal damage, ammunition, needs, construction, saves, and encounter flow; no debug
distance skips, direct spawns, invulnerability, or time compression. Paused or hidden
time does not count toward the 1,800 playable seconds. Record hardware, commit, seed,
profile, start slot, quality, browser version, and whether the session actually reached
1,800 seconds. This duration is feasible as a release acceptance run, not as a normal
CI test.

Pair the long run with short deterministic browser routes for the encounter lane not
reached naturally, 30/60/144 FPS input cadence, stairs and close camera, all shipped
weapons, reload/dry fire, an eight-enemy combat sample, one ordinary warning, one radio
warning, and pause/cinematic/pointer-lock handoffs. Prepared starting saves are allowed;
direct state mutation after each route begins is not.

### Change rule and measurable acceptance

Fix only a reproduced issue. Each change records the triggering route, before/after
value, source constant or system changed, and a same-seed comparison. Keep movement
physics, weapon statistics, damage, health, AI, and encounter composition byte-for-byte
unchanged. Prefer presentation-only camera response, animation, event routing, or mix
adjustments when those are the measured cause.

Acceptance requires:

- 1,800 active playable seconds, no uncaught/page error, no stuck control state, no
  camera inside a solid, and successful normal-input deck, interior, stairs, aiming,
  firing, reload, building, pause, panel, and save/resume transitions;
- every input delta consumed once; every accepted shot has one weapon event and one
  matching shot sound; reload start/finish, dry fire, hit material, player-damage
  bearing, buildup warning, and recovery all-clear are neither missing nor duplicated;
- candidate p95/p99 and >25/33/50 ms counts reported beside baseline on the same
  hardware. No measured route may regress p95 by more than 10%, create a new repeated
  >50 ms stall, grow warmed renderer/physics/audio owners across encounter cleanup, or
  claim a locked frame rate the evidence does not show;
- hip/aim FOV, camera collision, recoil, movement speed, grounded carry, aim ray and hit
  target return to their existing unit-tested values unless the evidence packet names
  the precise measured defect and approved presentation-only correction;
- the 0/300/900/1800 resource samples and encounter chronology remain plausible for
  the selected profile, with no diagnostic grant, healing, refill, or skipped cost.

`tools/audio-qa.mjs`, WebAudio node inspection, event counts, peak/RMS measurements,
and a system-audio capture can prove signal presence, routing, bounded ownership, and
clipping behavior. They cannot prove that a mix sounds clear or comfortable. A human
must listen to the final normal run on named speakers or headphones and record whether
engine/ambience masks footsteps, hits, reload completion, damage direction, or threat
warnings; whether repeated combat is fatiguing; and whether pause/background/mute are
silent. If system-audio capture is unavailable, record the reviewer, device, and notes
and make no claim that tooling heard the output.

**Ownership:** the campaign-library/UI worker owns the diagnostic harness, event ledger,
and evidence route only. Root owns any production feel/audio correction after reviewing
the measurement. The worker does not tune gameplay constants or edit pacing/art files.

## PACE — one recovery clock for ordinary threats and radio raids

### Frozen types and profile values

Add these pure types beside `ThreatDirector` (or in one dependency-free adjacent
module imported by it):

```ts
export type EncounterLane = 'ordinary' | 'radio-raid';

export interface ThreatPacing {
  recoveryM: number;
  calmMinM: number;
  calmSpreadM: number;
  buildupM: number;
}

export const THREAT_PACING_BY_PROFILE: Readonly<
  Record<CampaignProfile, ThreatPacing>
> = {
  story: { recoveryM: 250, calmMinM: 400, calmSpreadM: 700, buildupM: 140 },
  survival: { recoveryM: 200, calmMinM: 300, calmSpreadM: 500, buildupM: 140 },
};

export interface ThreatEncounterUpdate {
  distanceM: number;
  activeCount: number;
  healthFraction: number;
  externalEncounterActive: boolean;
  lane: EncounterLane;
  scheduleAllowed: boolean;
  pacing: ThreatPacing;
}
```

Story intentionally preserves the current ordinary 250 m recovery, 400–1100 m calm,
and 140 m warning. Survival starts with 200 m recovery and 300–800 m calm; it changes
frequency only. At the nominal 7.5 m/s cruise, encounter finish to next warning is at
least about 87 seconds in Story and 67 seconds in Survival, then both provide about 19
seconds of visible buildup. Actual sampled intervals, speed, stops, sanctuary, legacy
delay, and safety holds are reported rather than replaced with these estimates.

Add:

```ts
ThreatDirector.updateEncounter(input: ThreatEncounterUpdate): ThreatDecision;
ThreatDirector.reset(
  startDistance?: number,
  pacing?: ThreatPacing,
  lane?: EncounterLane,
): void;
```

Keep the existing positional `update(...)` as an ordinary-lane/default-pacing wrapper
so current call sites and focused tests do not change accidentally. Extend the decision
vehicle discriminator with `'radio-raid'`; do not put `'radio-raid'` in
`queuedVehicle`, whose saved `'skiff' | 'gunboat'` values remain route/ordinary external
requests. `finishExternalEncounter(distanceM, pacing)` uses the selected profile's
recovery. Existing no-pacing calls retain Story/current values.

### Lane, safety, and warning semantics

- The effective lane is saved as optional `ThreatDirectorSave.lane`. A lane request
  during contact, engagement, or live external ownership is deferred until that
  encounter finishes. A quiescent lane change begins a fresh profile recovery; a
  recurring buildup may be canceled into that recovery. It clears no scripted
  `queuedVehicle`. Radio mode ignores a queued skiff/gunboat; existing
  `tryBeginExternal` remains able to claim it, and ordinary mode can service it later.
  A request queued while another external encounter owns the deck survives completion
  and duplicate terminal callbacks; requests remove themselves when actually claimed.
- Ordinary lane retains the shipped infantry/skiff composition and release behavior.
  Radio lane advances the same recovery → calm → buildup → engagement phases, releases
  no infantry, and returns one `{ type: 'radio-raid' }` request at the end of buildup.
- `scheduleAllowed` is the existing Game safety predicate, including its current health
  fraction gate. False while calm prevents entry into buildup, so no warning is issued
  for an encounter that cannot approach. False after buildup began holds at the due
  edge: do not spawn, fall back to calm, reset the deadline, or emit a second warning.
  The first later safe update may issue the request. Stopping the machine freezes the
  distance clock in every case.
- Every entered phase is emitted through the existing `threat:phase` path. Radio raids
  therefore receive exactly one ordinary buildup HUD/audio warning and one recovery
  all-clear. Engagement is emitted only when the vehicle start transaction succeeds;
  spawn failure releases ownership into recovery and cannot strand the director.
- Destination sanctuary, active enemies, panels/cinematics, docks/approaches, optional
  salvage, death, and live skiff/gunboat ownership retain their current exclusions.
  Do not change the 0.35 health gate, mercy composition, damage, rewards, or mission
  counting.

### RadioRaids compatibility adapter

Keep the stored shape unchanged:

```ts
interface RadioRaidSave { wave: number; remaining: number }
```

Expose deterministic roster planning and make `remaining` a one-time legacy gate:

```ts
consumeLegacyDelay(dt: number, safe: boolean): boolean; // true when remaining === 0
plan(seed: number | string): RadioRaidPlan | null;
started(): void;
abort(): void; // clears transient ownership; no wave/reward/timer change
finished(seed?: number | string): void; // increments wave; leaves remaining at 0
```

A fresh campaign retains its current 24 second initial delay. An old save with a valid
positive `remaining` (including a post-raid 75–115 second value) drains it once under
the existing safety predicate. Reaching zero only opens eligibility; it cannot bypass
director recovery, calm, buildup, or stopped-machine safety. `finished` no longer rolls
a second cooldown. `wave`, roster, side, objective, seed behavior, and transient
in-flight exclusion remain unchanged.

Fresh campaign setup calls `reset(0, THREAT_PACING_BY_PROFILE[profile])`, so its first
calm uses the selected profile. Restore does not reset: the saved absolute deadline
remains authoritative and the supplied profile applies only to later deadlines. Safe
save gates mean the transient deferred lane needs no save field. A null roster plan or
rejected scene start calls `abort`, returns the director to recovery, and emits no false
engagement edge.

Old `ThreatDirectorSave` objects without `lane` restore as ordinary. If the restored
story currently permits radio raids, the first safe lane transition begins recovery,
so an old file cannot load directly into an attack. New saves preserve the effective
lane and absolute phase deadline exactly. Extend the strict export validator only for
the optional enum; reject every other unknown/malformed branch as before. The existing
`RadioRaidSave` schema needs no expansion.

### Pacing tests and browser acceptance

Focused pure tests must establish:

- Story's old ordinary seeded phase/spawn sequence remains identical through an
  ordinary-lane wrapper; Survival uses its shorter quiet values without changing wave
  size, health mercy, stagger, or damage;
- ordinary and radio encounters both require recovery + calm + full buildup distance;
  zero distance while stopped never advances them;
- unsafe calm emits no warning, unsafe post-warning buildup emits no duplicate warning
  and no request, and the later safe request is one-shot;
- lane changes defer during live encounters, preserve queued route skiff/gunboat state,
  never overlap active infantry/external scenes, and survive fixed-seed save/restore;
- fresh 24-second and old 75–115-second radio delays round-trip and drain once; a new
  completed raid saves `remaining: 0`; roster/wave determinism is unchanged;
- missing-lane old saves receive a safe transition; current saves restore the exact
  next phase/request; sanctuary and orphan-external recovery continue to work.

Browser acceptance records at least two complete ordinary encounters and two radio
raids per profile, including one stop during calm, one stop during buildup, one unsafe
panel/scene hold after warning, and one save/cold-load during recovery or calm. For each,
record finish, recovery, calm, warning, request, spawn, and all-clear distances/times.
There is one warning before danger, one all-clear after resolution, no mixed encounter
ownership, and no health/ammo/damage mutation attributable to pacing.

**Ownership:** the foundation worker owns `ThreatDirector`, `RadioRaids`, and their
focused unit tests. It does not edit `Game`, profile UI, strict save codec, HUD/audio,
or art. Root owns Game lane derivation (`story.permitsRadioRaids`), safety input,
vehicle start/rollback, event emission, optional save-validator enum, integration tests,
and browser evidence.

## MEMORY — visible earned navigation and preservation

### Navigation helm contract

Keep the existing `HelmRoot`, `GyroInstalled`, `HelmPowerLamp`, and `HelmInteract`.
Root authors and integrates `nomad-progress.glb` as presentation geometry under the
existing helm. The module roots have identity transforms and contain geometry already
placed in helm-local coordinates. These exported bounds are the integration contract:

| Recovered fact / role | Required node | Helm-local geometry bounds (min → max) |
| --- | --- | --- |
| `course-gyro` | existing `GyroInstalled` | existing anchor `(0.25, 0.65, 0.29)` |
| `course-actuator` | `HelmActuator` | `(-0.44, 0.225, 0.259)` → `(-0.12, 0.841, 0.372)` |
| `vector-governor` | `HelmGovernor` | `(-0.44, 0.750, 0.263)` → `(0.44, 1.008, 0.350)` |
| `meridian-solution` | `HelmMeridian` | `(-0.20, 0.191, 0.272)` → `(0.44, 0.326, 0.342)` |
| earned bearing pointer | `HelmBearingNeedle`, `HelmDialFace` | runtime pivot `(-0.17, 1.276, 0.01)`, inclination `x = 0.41 rad` |

`HelmBearingNeedle` becomes visible with the course gyro and follows the existing saved
bearing. Each module becomes visible independently from
`StoryDirector.snapshot(...).recoveredUniques`; later facts never imply an earlier
missing fact. The combined authored bounds remain inside helm-local `x ±0.57`,
`y 0..1.36`, `z ±0.375`. `HelmInteract`, power lamp, aisle clearance, and collider stay
unchanged; the new asset adds no physics, interaction, power consumer, gameplay bonus,
or save owner. Only cloned emissive materials are owned and disposed by the presentation
helper; cached geometry and other materials remain borrowed.

Use one cached integration map rather than scattered conditionals:

```ts
export const NAVIGATION_MODULE_NODES = {
  'course-actuator': 'HelmActuator',
  'vector-governor': 'HelmGovernor',
  'meridian-solution': 'HelmMeridian',
} as const;

syncNavigationProgress(
  recovered: readonly StoryUniqueId[],
  bearingDeg: number,
  powered: boolean,
): void;
```

The existing cached `GyroInstalled` remains separate. Cache the three new module nodes
after authored installation and sync during the existing story presentation update, so
install, new game, load, unique collection, bearing, and Helm power all converge on the
same projection. Missing optional presentation nodes leave gameplay usable; existing
Gyro and text continue to show earned state when models are disabled or fail to load.

### Existing keepsake shelf contract

Do not add a preservation station or selection menu. Continue using
`Game.keepsakeChoices`, `openHomeShelf`, `selectHomeKeepsake`, and the shelf's existing
saved `{ factId?: string }`. Add a dedicated `PreservationExhibits` wrapper on the
existing top shelf at shelf-local `(0.00, 1.526, 0.00)`. It contains exactly these
mutually exclusive roots at wrapper-local origin:

- `PreservationRecord` for journal facts and as the visible fallback for any other
  known fact;
- `PreservationSeeds` for `human-seed-bank`;
- `PreservationCore` for `annika-archive-shard` and `orchard-memory-core`.

Each variant remains inside wrapper-local `x ±0.23`, `y 0..0.31`, `z ±0.15`; its cradle
rests on the 1.50 m top shelf and stays inside the existing floor footprint. Retain the
existing `KeepsakeLit` waveform as a generic earned-selection cue when models are
disabled or fail to load. No selection hides every exhibit and the waveform; one valid
selection shows the waveform and exactly one physical child. Unknown, unearned,
malformed, and cleared facts still sanitize to an empty shelf and hide all variants.

Expose one pure classifier shared by placement and restore:

```ts
export type PreservationExhibit =
  | 'PreservationRecord'
  | 'PreservationSeeds'
  | 'PreservationCore';
export function preservationExhibit(factId: string): PreservationExhibit;
```

The display never grants a fact, removes it, changes `CampaignRecord.preserved`, or
stores the visual kind. Relocation and save/load continue to preserve only `factId`.
The Campaign Log remains the complete readable record; the physical object shows the
player's selected remembrance while all earned navigation modules remain visible at
the helm.

### Art and continuity acceptance

- Blender source, deterministic export, GLB validation, manifest/cache registration,
  material borrowing/ownership, fallback construction, and disposal tests pass. All
  named roots and transforms are asserted from the shipped GLB.
- Before/after captures show the helm at zero, one, two, three, and four navigation
  facts from the player approach and interaction position. No module crosses the
  current helm bounds, obscures `HelmInteract`, changes its collider, or blocks the
  aisle/camera.
- Shelf captures show empty, record, seed, and core at the same normal placement.
  Selection, clear, relocation, demolition, save/cold-load, old `KeepsakeLit` fallback,
  authored-model failure, and 100 variant cycles keep the chosen `factId`, renderer
  resources, interaction target, and physics counts correct and bounded.
- An old save with absent later uniques shows only facts actually recovered. A complete
  current save shows the existing Gyro plus all three added helm modules and restores each selected shelf
  variant exactly. Forward unknown facts remain readable in the Campaign Record path
  and use the record visual only if they pass the existing known-fact sanitizer.
- Campaign Record values before and after this integration are deeply equal for the
  same story/progression input. The art creates no second record, seed inventory,
  navigation tier, achievement, or ending flag.

**Ownership:** root owns Blender source/export, `nomad-progress.glb`, shelf art revision,
asset cache/registry, fallback roots, Game node caching/sync, BuildSystem visual
selection, Campaign Record integration tests, captures, and GPU review. No parallel
worker edits those production paths.

## Delivery order and release boundary

1. Capture the same-seed feel baseline and land pure diagnostic counters without
   tuning. In parallel, implement and unit-test the director/radio contract behind the
   compatibility wrapper.
2. Root integrates Game lane/safety/events and strict optional-lane validation; run old
   save, route queue, sanctuary, optional salvage, radio mission, and current complete
   save tests before browser pacing checks.
3. Root authors and integrates progress art against the frozen roots/transforms, then
   proves zero progression/save changes and authored/fallback continuity.
4. Run focused ordinary/radio/profile browser cases, the final 30-minute normal-input
   session with human audible review, targeted unit suites, full tests, lint, TypeScript,
   and production build. Repeat the long run only when a subsequent change touches its
   measured movement/camera/combat/audio/pacing paths.

Release notes must distinguish arithmetic/audio-signal checks, automated browser input,
and human listening. This iteration may claim improved measured feel, coherent shared
recovery, consistent warnings, and visible earned campaign memory. It may not claim a
new chapter, longer campaign duration, altered combat balance, or audible quality that
no person reviewed.
