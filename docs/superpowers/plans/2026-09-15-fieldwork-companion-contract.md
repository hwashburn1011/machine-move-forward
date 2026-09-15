# Fieldwork and companion contract

Status: implemented and validated on `codex/fieldwork-and-companion` with
same-deck caretaker movement. See the [delivery record](../../campaign/fieldwork-delivery.md)
for tests, performance measurements and remaining limitations.
The peaceful Meridian ending remains authoritative. This iteration deepens the
existing workbench, survival economy, repair depot and lived-in Nomad; it adds
no chapter, enemy class, currency or machine-upgrade branch.

## Authority boundaries

- Immutable weapon definitions remain the unmodified baseline. `Weapon` owns
  magazine, reserve, reload deadline and shot cadence. A pure loadout projection
  derives effective values from a definition and one selected attachment.
- The legacy extended magazine remains a separate, permanent magazine bonus.
  It neither occupies nor unlocks the new attachment selection.
- `SaveGameV1.profile` owns the campaign ammunition rule. Its absence means
  `story`, preserving every published save and the current default.
- Inventory/`ResourceAccess` alone owns scrap and components. Buying an
  attachment is an atomic resource consume followed by a durable ownership
  update. An in-flight guard prevents resource-change listeners from re-entering
  the purchase before ownership is recorded; a failed consume changes nothing.
- The caretaker owns intent and presentation only. Producers, gardens,
  containers, build pieces, power, navigation and known story facts remain
  authoritative in their existing systems. The caretaker has no inventory.
- Game owns cross-system admission, input cancellation, save composition,
  physical navigation, scene lifetime and UI transitions. Art/model ownership
  stays with root.

## Field weapon loadouts

```ts
export type WeaponLoadoutWeapon = 'rifle' | 'shotgun';
export type AttachmentId =
  'rifle-stabilizer' | 'rifle-burst-cam' | 'shotgun-choke' | 'shotgun-scatter-brake';

export interface WeaponSave {
  // Existing fields omitted here.
  attachments?: { researched: AttachmentId[]; active?: AttachmentId };
}

export function attachmentsForWeapon(weaponId: string): readonly AttachmentId[];
export function applyAttachment(def: WeaponDefinition, id: AttachmentId): WeaponDefinition;
```

`Weapon` exposes `installedAttachment`, `researchedAttachments`,
`researchAttachment(id, purse)`, `setAttachment(id | null)` and `effectiveDef`.
`researchAttachment` performs the affordability check and atomic purse consume;
Game supplies an adapter over `ResourceAccess`. `tryFire(now,
triggerHeld = true)`, `hasPendingBurst` and `cancelBurst()` are the authoritative
burst seam. `PlayerCombat` calls them from the fixed-step input path and invokes
`cancelBurst()` at every control/lifecycle boundary listed below.

Each gun may select zero or one compatible attachment. Buying an attachment
costs **12 scrap and 8 components**, once per weapon attachment. Once researched,
swapping or removing it is free but requires the player to be at a workbench
whose temporary fieldwork tools can draw **1 power**, with normal crafting
controls available. There are no attachment
inventory items and no refund path. All four purchases become available after
Relay Foundry completion. The old extended-mag recipe and installed magazine
bonus remain available and stack only with the selected attachment's derived
stats.

The exact effects are:

| Attachment            | Effect                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Rifle stabilizer      | hip and aim spread ×0.55, recoil ×0.65, reload duration ×1.15                                                 |
| Rifle burst cam       | one trigger commitment fires 3 base-damage rounds at 12 shots/s, followed by 0.50s recovery after round three |
| Shotgun choke         | hip and aim spread ×0.60, range ×1.35, falloff-start distance ×1.25, fire rate ×0.80                          |
| Shotgun scatter brake | hip and aim spread ×1.20, range ×0.75, falloff-start distance ×0.80, fire rate ×1.25                          |

Multipliers apply to the immutable base definition. They do not compound through
re-equip or save/load. Damage, pellet count, magazine size and ammunition cost
per shot remain unchanged.

The burst cam consumes and resolves each round through the normal authoritative
shot path. A press starts at most one three-round commitment; holding fire may
start another only after the 0.50-second post-third-round recovery. An empty
magazine ends the burst and follows normal reload behavior. Pending rounds and
recovery are transient and are cancelled on manual/automatic reload, weapon
swap, death/respawn, build or panel capture, cinematic/ending control, new game,
load and disposal. A burst is never saved or reconstructed.

Extend each weapon's optional save data with `attachments?: { researched:
AttachmentId[]; active?: AttachmentId }`. Restore keeps only IDs compatible with that weapon,
deduplicates `researched`, and clears `active` when it is invalid or not
researched. Malformed data becomes no researched/active attachment; it cannot grant one.

## Campaign profile and ammunition

```ts
export type CampaignProfile = 'story' | 'survival';

export function sanitizeCampaignProfile(raw: unknown): CampaignProfile;
export function profileUsesInfiniteAmmo(profile: CampaignProfile): boolean;
export function campaignProfileLabel(profile: CampaignProfile): string;
```

`SaveGameV1` gains `profile?: CampaignProfile`. Missing, malformed and legacy
values normalize to `story`. A new campaign presents Story first and selected
by default:

- **Story:** current behavior, including infinite reserve ammunition.
- **Survival:** finite rifle and shotgun reserves. Existing ammo pickups and
  workbench recipes replenish their matching weapon through the current ammo
  routing.

The profile is chosen before a new game is created, written on every save and
immutable for that campaign. Continue never asks again. It is not a Settings
toggle and cannot be switched to refill ammunition. Story still serializes the
real reserve counters so a save remains well formed, but firing/reloading does
not consume them. Survival clamps restored magazine and reserve values to
finite, non-negative integers and never turns missing ammunition into a refill.
New Survival campaigns use the existing weapon starting reserves.

No enemy health, damage, raid timing, needs, loot, crafting cost or movement
value changes with this profile. Recovery and crafting text read the effective
rule: Story must not advise hunting for ammunition; Survival must not claim
infinite ammunition.

## L-12 recovery and home presence

The existing Linekeeper repair-depot log is the hook. Until L-12 is recruited,
every generated repair depot exposes a separate **Restore L-12 — 6 components**
interaction. The depot's existing repair kit and journal rewards remain
independent. Insufficient resources or departure does not mark the opportunity
missed: the interaction returns at later repair depots. A successful atomic
consume sets the durable recruited state once; repeated interaction cannot
charge again or create another unit.

```ts
export type CaretakerMode = 'companion' | 'steward';
export type CaretakerJobPhase =
  'idle' | 'to-source' | 'service-source' | 'to-target' | 'service-target' | 'returning';

export interface CaretakerSave {
  format: 1;
  recruited: boolean;
  mode: CaretakerMode;
}

export type CaretakerJob =
  | {
      readonly kind: 'store-output';
      readonly sourceId: string;
      readonly targetId: string;
      readonly itemId: string;
      readonly count: 1;
    }
  | {
      readonly kind: 'water-garden';
      readonly sourceId: string;
      readonly targetId: string;
      readonly itemId: 'water';
      readonly count: 1;
    };

export interface CaretakerNavState {
  sourceReached: boolean;
  targetReached: boolean;
  homeReached?: boolean;
  safe: boolean;
  powered: boolean;
  docked: boolean;
}

export class CaretakerDirector {
  recruit(): boolean;
  setMode(mode: CaretakerMode): boolean;
  plan(view: CaretakerWorkSnapshot): CaretakerJob | null;
  fixedUpdate(dt: number, nav: CaretakerNavState): CaretakerSnapshot;
  resolveJob(token: number, success: boolean): boolean;
  cancel(): void;
  snapshot(): CaretakerSnapshot;
  toSave(): CaretakerSave;
  restore(raw: unknown): void;
  reset(): void;
}
```

Recruitment unlocks one `caretaker-dock` build piece. It costs **40 scrap and
8 components**, draws **3 power**, and at most one may exist. The approximately
1.1 m L-12 helper is
noncombat: it has no health, weapon, enemy target, collision damage or loot.

In `companion` mode L-12 follows S-07 across valid navigation on the charging
dock's deck. Actual machine stair tests found blocked physical landings, so
the caretaker's private graph excludes cross-deck links (including detours).
It waits when the player changes decks. Moving the dock cancels work, removes
the old actor and redeploys one unit on the new deck only when safe and powered.
Multi-deck following is deferred; enemy and player navigation is unchanged.
It may present bounded ambient lines selected solely from facts the
campaign already knows. It grants no buff and never reveals unread records.

In `steward` mode it considers one-unit jobs in a deterministic order. It
prioritizes watering gardens first, then storing finished output:

1. move one water from a live built storage crate to a seed garden that can
   accept it; or
2. move one completed unit from a condenser, automatic collector or seed
   garden to a live built storage crate with room.

Planning reserves no resource. A successful `plan` creates one job and a
monotonic session token. `fixedUpdate` advances `to-source`, the bounded source
service, `to-target`, bounded target service and `returning` phases from
authoritative navigation flags. L-12 walks source then target. At commit, Game
re-resolves stable piece IDs and revalidates source count, target room, garden
capacity, power, safety and reach. The existing producer/garden/container APIs
perform one atomic unit transfer and then call `resolveJob(token, success)`;
stale or repeated tokens cannot resolve another job. Any stale, moved,
demolished, emptied, full,
unpowered or unreachable endpoint cancels without mutation and replans later.
The player inventory is never a source or target.

The director keeps a bounded single job and no queue. New game, load, death,
unsafe control, destination transition, dock loss and disposal cancel the
transient job. Saves contain recruitment and mode only; they never contain dock
identity, position, carried cargo, reservations or job progress. Game owns the
live dock selection/configuration separately. On load L-12 begins from a valid
powered dock when one exists, otherwise it remains idle and unavailable for
work until Game supplies one.

Navigation failure never teleports resources. If L-12 is outside valid nav it
waits and retries a dock route. A presentation-only soft return to the live
dock is allowed only while it carries nothing, has no job, the player is aboard,
and no hostile encounter/control transition is active. With no reachable dock
or target it stays put/waits rather than falling, consuming, or spawning work.

## Save and lifecycle invariants

- `profile`, weapon attachment state and `progression.caretaker?` are optional v1
  additions. Existing saves remain Story, unmodified and unrecruited.
- Loading never resumes a burst or caretaker job and never grants depot
  recruitment, components, ammunition or an attachment.
- Save safety uses existing Game policy. A workbench purchase/recruitment is
  either fully committed before serialization or absent. Caretaker travel does
  not block saving because it owns no resource.
- Build relocation preserves the live dock instance ID in Game's build lookup.
  Demolition clears Game's configured dock and leaves recruited L-12 safely waiting; rebuilding a dock
  does not create another L-12.
- Event listeners run after successful resource/state commits. Listener errors
  cannot roll back one side of a committed transaction.
