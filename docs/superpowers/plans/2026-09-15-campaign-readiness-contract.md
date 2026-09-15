# Campaign readiness integration contract

Status: implementation contract for `codex/campaign-readiness`, based on main
`a808ed2`. The Meridian ending remains a peaceful, deliberate commitment. This
iteration does not add a finale fight, another chapter, currencies, rewards or
campaign state.

## Ownership

- **Astra/root** owns `main.ts`, `Game.ts`, model loading/cache code, the boot
  screen, all integration, authored media and browser acceptance.
- **Luna Noether** owns a new pure recovery projection and focused tests. It
  does not read `Game`, the DOM, clocks, storage or the event bus.
- **Luna Ptolemy** owns a pure campaign-summary projection, a read-only campaign
  log view and focused tests. It does not alter story, chart, ending or save
  authorities.

Workers add new files until root freezes a small view wiring seam. Existing
save schemas remain unchanged.

## 1. Recoverable staged loading

Today `main.ts` waits for all of `Game.create`, while `loadDefenseModels`
fetches 23 authored models into one mutable cache. Construction then awaits
station kits, textures, props, tactical accessories, weapons and shader
warm-up. A missing model has a procedural fallback, but the player sees only a
static boot screen while slow requests remain pending.

Root should split loading into immutable batches:

```ts
type BootStage = 'runtime' | 'critical-art' | 'playable' | 'background-art' | 'ready';

interface BootProgress {
  stage: BootStage;
  completed: number;
  total: number;
  label: string;
  degraded: readonly string[];
}

type AssetResult =
  | { status: 'loaded' }
  | { status: 'fallback'; reason: 'missing' | 'decode' | 'timeout' | 'aborted' };
```

`BootProgress` is presentation only. It cannot gate simulation by percentage.
The boot overlay shows the current label, a determinate count, and a plain
fallback notice. It exposes Retry only if the critical batch cannot establish
a playable procedural path. Ordinary 404/decode/deadline failures resolve to a
fallback and never strand the boot.

### Asset batches

The critical authored cache contains the assets needed before the first
interactive frame:

- `player` (with the existing `s07-player.glb` then `player.glb` fallback),
- `manual-turret`, `raider-skiff`, `scavenger`, `raider`,
- `raider-gunboat`, `bastion`, `revenant`, `warden`, `sovereign`,
- `expedition-wreck`, tactical accessories, desert props and the signal-battle
  shader variants, because existing constructors retain these borrowed models
  and combat must be ready without a loading interruption,
- `salvaged-radio`, `navigation-helm`,
- machine/station/collision kits, opening-visible salvage models, textures and
  the critical shader variants.

The background batch contains:

- `relay-foundry`, `quiet-array`, `glass-orchard`,
  `last-garden-meridian`, `meridian-horizon`,
- `route-water-cache`, `route-salvage-wreck`, `route-memorial`,
  `route-repair-depot`, `seed-garden` and their noncritical warm-up variants.

`ExpeditionModels`, `OpportunityModels`, `SeedGardenModels`, `BuildSystem`,
`SignalBattleScene`, `MeridianArrivalScene` and vehicle/enemy factories borrow
cached sources. Therefore a late batch must never call `models.clear()`, replace
an existing source, or dispose a material/texture reachable from a published
source. Load and prepare a batch off-cache, deduplicate its palette against the
retained cache, then publish each previously absent ID exactly once. Disposal
belongs to the cache owner at final game teardown.

Starting the title/opening after the critical batch is allowed. Network byte
prefetch may continue during play, but glTF parse, cache publication and GPU
warm-up run only at the title/menu or an existing paused route/destination
transition; they must not introduce a main-thread parse/compile hitch during
combat. Before any late asset's first factory call, root awaits that asset's
settled load result inside that transition; fallback construction remains
valid. Continue must inspect the selected save early enough to prioritize its
docked destination, active vehicle/enemy set, seed garden and Meridian arrival
assets before restore publishes build/destination instances or returns control.
This is prioritization, not a second cache or a second save owner.

Each request has a bounded deadline and uses the locally available dedicated
`THREE.LoadingManager.abort()` path. A timed-out request may still complete at
the transport/decoder boundary; its late result is disposed unless it still
owns the unpublished entry in the current generation. Retry creates a new
generation. Older generations cannot publish or dispose resources owned by a
newer generation. Progress callbacks stop after their owner is disposed.

The critical-failure choices are **Retry** (reload/restart the critical
generation) and **Use simpler visuals** (commit the existing procedural
fallbacks). Neither choice resumes a half-published cache.

## 2. Recovery guide and forecasts

The guide is a deterministic projection of a snapshot root already owns:

```ts
export interface RecoverySnapshot {
  firstRunComplete: boolean;
  fuel: number;
  fuelCapacity: number;
  fuelBurnPerSecond: number;
  machineSpeedMps: number;
  emergencyCrawl: boolean;
  generatorCount: number;
  powerCapacity: number;
  registeredDemand: number;
  poweredDraw: number;
  shedPriorities: readonly PowerPriority[];
  hydration: number;
  nourishment: number;
  waterCarried: number;
  rationsCarried: number;
  condenserCount: number;
  garden?: { water: number; greens: number; progressS: number; cycleS: number };
  damagedSubsystems: number;
  repairKits: number;
  safeToSave: boolean;
  saveRefusal?: string;
}

export type RecoveryTopic =
  | 'fuel' | 'power' | 'water' | 'food' | 'garden' | 'repair' | 'save';

export interface RecoveryHint {
  topic: RecoveryTopic;
  severity: 'info' | 'warning' | 'blocked';
  title: string;
  detail: string;
  metric?: string;
}

export function projectRecovery(snapshot: RecoverySnapshot): readonly RecoveryHint[];
```

This is read-only guidance. Root may dismiss a topic for the current session;
dismissal is ephemeral and resets on a new game/load or when the topic becomes
blocked. Do not add onboarding fields to `GameSave`.

Fuel forecasts use the live effective burn rate:
`FUEL_BURN_PER_S * active fuelBurnMultiplier`. With positive fuel and burn,
time is `fuel / burn`; range is time times the current positive machine speed.
At zero speed, zero fuel or emergency crawl, show the real recovery state and
omit the range. Never show Infinity or claim crawl has free range. Power shows
both registered demand and powered draw so shedding is not hidden by the lower
post-shed number. Garden ETA exists only while it contains water and has room
for the next three greens.

Priority is stable: an immediate blocker, then fuel, power, water, food,
garden, repair, save. At most three hints render at once. Control labels are
resolved by the existing binding resolver in the view layer, never embedded in
the pure projection.

## 3. Campaign record and Keep Walking guidance

The summary derives only durable facts already present in the composed save or
live authorities:

```ts
export interface CampaignSummaryInput {
  completedExpeditions: readonly ExpeditionId[];
  recoveredUniques: readonly StoryUniqueId[];
  journalArchive: readonly string[];
  activeRouteId: RouteId | null;
  endingPhase: EndingPhase;
  chart: {
    contact: RouteContact | null;
    visitedIds: readonly string[];
    missedIds: readonly string[];
  };
  firstRunComplete: boolean;
  navigationTier: number;
  gardenCount: number;
  automation: { collectors: number; turrets: number };
}

export interface CampaignRecord {
  chapters: readonly { id: ExpeditionId; title: string; completed: boolean }[];
  recordsRead: number;
  discoveries: { visited: number; missed: number };
  preserved: readonly string[];
  endingComplete: boolean;
  keepWalking: readonly KeepWalkingGuidance[];
}

export interface KeepWalkingGuidance {
  id: 'answer-signal' | 'tend-garden' | 'automate-home' | 'fortify-home' | 'read-archive';
  label: string;
  completeNow: boolean;
}

export function projectCampaignRecord(input: CampaignSummaryInput): CampaignRecord;
```

The chart input uses `RouteChart.snapshot.visited` and `.missed`, which are the
bounded histories persisted in `RouteChartSave`; the summary must not infer
history from `nextSlot`, the world seed or current contact. Unknown journal IDs
are ignored through story data lookup. `preserved` names only recovered uniques
and readable records; it does not infer human survival, optional reads or route
outcomes.

Keep Walking guidance is optional and state-derived. It awards nothing, owns no
counters, and can become incomplete again as live state changes. The read-only
log may group existing archive records and show the current chart contact, but
it cannot call StoryDirector, RouteChart, inventory or SaveManager directly.
Root composes the input and owns any EndingUI conditional lines. Those lines
remain nonjudgmental and never punish missed contacts.

## Compatibility invariants

- No movement, camera, combat, needs, fuel, reward, raid or ending timings
  change.
- Existing saves gain no required fields and continue through the same
  `SaveManager` migration and safe-save boundary.
- The peaceful Meridian commitment, safe checkpoint, 400m journey, 12-second
  arrival and Keep Walking continuation remain unchanged.
- Pure projections never retain mutable game objects and never emit events.
- Loading fallback does not mutate gameplay data or turn a missing visual into
  a missing collider/interactable.
