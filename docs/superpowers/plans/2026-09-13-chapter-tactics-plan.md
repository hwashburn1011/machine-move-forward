# Chapter One completion and mech tactics

Status: implementation plan. Prepared 13 September 2026 against main
`97630f4`. The user authorized recommendations 1 and 3: finish the first
progression chapter and give the four authored mechs distinct tactics. This
plan does not include the deferred equipment/weapon or weather expansion.

## Outcome

The existing opening, recovered radio, signal crossfire and recurring radio
raids remain intact. Surviving the first complete raid after the crossfire
adds a persistent, optional radio offer to trace Wreck One. Accepting that
offer starts the already-built Wreck One expedition; ignoring it leaves the
machine moving and the survival loop running normally.

Wreck One awards the existing Course Gyro. Back aboard, a powered Navigation
Helm offers the existing direct and detour routes to Relay Foundry. Completing
the Foundry awards the existing salvage controller and tracking servo, which
unlock the automatic collector and automatic turret. Departing the Foundry
marks Chapter One complete, restores ordinary threat scheduling and keeps the
endless survival loop playable. This is the satisfying milestone for this
scope; it is not an ending screen and does not promise Chapter Two.

The Revenant, Bastion, Warden and Sovereign keep their current definitions,
damage, health, armor, loot and authored presentation. Small deterministic
tactic controllers change how those values are delivered. Radio raid waves
also receive one visible objective: assault, sabotage or supply theft. Total
active hostile budget remains bounded by the existing eight-slot enemy pool;
ordinary encounter composition does not grow.

## Current seams to preserve

- `StoryDirector` already models Wreck One, Course Gyro, route selection,
  Relay Foundry, both Foundry uniques and campaign format 2.
- `RadioRaids` owns the seeded recurring raid cadence. `Game` currently moves
  `crossfire` to `raids` and is the authority that knows when a raid encounter
  has actually ended.
- `SPECIALIST_BLUEPRINT` already maps the Foundry uniques to
  `automatic-salvage-collector` and `automatic-defense-turret`. Do not add a
  parallel reward or unlock registry.
- `EnemyManager` owns an eight-object pool. `Enemy` owns authoritative attack
  timing, physics, damage and the original muzzle pose. Tactics compose around
  those paths rather than replacing combat with presentation events.
- Built storage is keyed by stable build instance ID. Relocation preserves that
  ID and container identity. Demolition/reset remove it. The player container,
  equipped weapon state and story uniques are separate authorities.
- Active encounters already make saving unsafe. Theft state is transient and
  must participate in that existing guard; it must never be partly serialized
  through the ordinary storage snapshot.

## Chapter contract

### Opt-in and raid qualification

Only a raid that starts after `finishSignalBattle()` and reaches its normal
resolved state qualifies. A cinematic combatant, canceled spawn, partial wave,
debug despawn or load cleanup does not. `RadioRaids.finished(seed)` remains the
single cadence completion call; it returns or accompanies a stable completion
fact that `StoryDirector.recordRadioRaidVictory(count)` consumes. `count` is the
post-`finished()` `RadioRaids.wave` value, not an encounter-start index.

The first qualifying completion changes the story from `raids` to a new
offer-ready state without starting travel. The radio button reads **Trace Wreck
One** and explains that it commits a destination. Closing the panel is a true
decline-for-now: movement, fuel, production and raids continue, and the offer
remains available. Accept is allowed only when the existing stable-world,
on-machine, powered-radio and no-encounter rules pass. It emits one
`begin-approach` effect using the existing Wreck One distance and sanctuary
rules. Double click/replayed events cannot commit twice.

The implemented representation keeps campaign format 2 and adds optional
`radioTraceEligible` and `chapterComplete` fields. `radioTraceOffer` means the
trace action is currently displayable (`eligible && phase === raids`), while
`radioTraceReady` preserves durable eligibility for UI/integration checks.
`permitsRadioRaids` is true in raids and after a valid completed chapter, but
must remain false during every expedition phase. Backfill eligibility from
`RadioRaids.wave > 0` when an old raids-phase save proves a completed radio
encounter; otherwise an old raids save must survive one new raid. Approach,
docked, route, Foundry and complete saves retain exact progress. Old completed
Foundry saves derive `chapterComplete` from `completed`, never regress to the
offer and never replay crossfire.

### Wreck, helm, routes and completion

`beginWreckExpedition(context)` reuses Wreck One's current approach, braking, sanctuary, destination,
interactables and departure code. The unique remains `course-gyro`; do not turn
it into fungible inventory. Route selection remains gated by the gyro, a powered
helm, player aboard, stable world and no encounter.

Keep the existing authored routes:

- `foundry-direct`: shorter, with its existing scripted gunboat pressure.
- `foundry-detour`: longer, with its existing safer route semantics and no new
  authored reward.

Both routes reach the same Relay Foundry and neither changes machine speed or
fuel equations. Foundry departure requires both existing uniques. Completing it
grants both mapped automation unlocks once, records `relay-foundry` complete,
emits one durable `chapter-one-complete` milestone/event, removes destination
sanctuary and speed limits, and resumes recurring survival raids. Reloading the
completed save must not replay reward toasts, duplicate unlocks or respawn the
destination.

The final radio view states that Chapter One is complete and survival continues;
it may show the two unlocked automation pieces, but it must not imply an
implemented next chapter.

## Tactical identity contract

All tactic time uses the fixed simulation clock. Pause, title, load and inactive
pooled enemies do not advance it. Spawn and despawn fully reset tactic state.
Tactics do not change definition data, random-stream ownership, authoritative
muzzle transforms, attack damage, cooldown, drops or navigation collision.

### Revenant: committed lunge

At melee acquisition, the Revenant telegraphs for **0.55 s**, snapshots a
horizontal direction and target point, then lunges up to **4.5 m** over
**0.38 s**. It cannot turn during the lunge. Collision or reaching the endpoint
ends movement; damage occurs once through the normal attack path only if the
player is in the existing attack reach at the strike frame. It then has
**0.75 s** recovery with no movement or attack. Leaving the lane dodges the
hit. Walls remain solid and may not be tunneled through. No bonus damage.

### Bastion: cooling vent

After each existing three-shot burst, the Bastion vents for **1.8 s**. It does
not move, aim or fire while venting. A small named vent hit proxy follows the
authored back/chest vent anchor and is active only during that window. Hits on
that proxy apply **2x post-armor damage** to the owning Bastion through
`Enemy.takeDamage`; body hits retain normal armor/damage. The proxy has no
independent loot or health, never blocks movement, and is removed/disabled on
death, despawn, pool reuse and model absence. A fallback local anchor keeps the
mechanic functional when models are disabled.

### Warden: cover and flank

The Warden first uses current ranged LOS and navigation. When LOS remains blocked
for **1.25 s**, it scores a bounded set of existing walkable nav cells within
**8 m**: prefer a cell with cover from the player's current point and a clear
shot from an adjacent flank cell, reject reserved/destination/off-level cells,
and cap work to one candidate scan per repath turn. It commits to the selected
flank for **3 s** or until reached. If no valid candidate exists or the nav graph
changes, it immediately falls back to current player pursuit. No cover geometry
is spawned and no pathfinder runs outside the manager's existing round-robin
budget.

### Sovereign: destroyable support drone

An active Sovereign owns at most one support drone represented by a lightweight
child visual and one sensor/hit proxy, not another `Enemy` pool slot or roaming
AI body. The drone stays within **2.5 m** of its owner and grants nearby enemies
within **7 m** a **20% damage-reduction** multiplier; it does not alter movement,
attack damage, cooldown, armor data or health and never stacks with another Sovereign. The
proxy has **35 health** and no loot. At zero it visibly breaks and removes the
buff immediately for the remainder of that Sovereign's life/encounter. Owner
death/despawn/reset disposes the proxy and clears all buff membership. A reused
Sovereign receives one fresh drone at its next spawn. The eight-enemy budget and
encounter threat price stay fixed.

Buff application is derived each fixed step from a living owner/drone and target
proximity; do not write modifiers into shared `EnemyDefinition` objects. Apply
`incoming damage × 0.8` per instance after ordinary hit/armor calculation. A
dead-but-still-active corpse provides no support.

## Raid objectives

`RaidObjectiveDirector` (or equivalently named isolated module) chooses once per
qualifying radio raid from the raid's seeded RNG and exposes a readonly snapshot
for HUD/AI. Scripted story fights keep their authored objective. Objective choice
does not consume `ThreatDirector`'s unrelated random stream.

- **Assault:** existing player/engine priorities and win condition.
- **Sabotage:** choose one live damageable machine subsystem by stable ID. Raiders
  route to it using the existing subsystem target seam. Destroying it is visible
  objective failure but does not invent a second damage model; killing the wave
  resolves the raid.
- **Supply theft:** select one live built storage crate by stable piece ID and
  assign one thief. This is intent, not a long-lived inventory reservation.
  Relocation remains valid because the piece/container identity survives. On
  reach, re-read the exact live container and atomically remove at most one
  stack: **6 scrap**, **2 components** or **2 fuel**, in that priority order.
  Only these fungible IDs are eligible. A zero removal cancels and falls back
  to assault. Never inspect or mutate player inventory, weapon/equipment slots,
  story uniques, producer output or collector claims.

After pickup the carrier owns `{ itemId, actualRemovedCount }`, and the HUD/marker
shows that exact cargo. If the carrier dies, clear the cargo and create one
recoverable ordinary loot stack for exactly that amount; normal ground-loot
rules apply. If the carrier returns to its attached boarding edge alive, clear
the cargo and mark the theft delivered. Despawn for load/reset/cancellation is
not delivery and must not manufacture a drop. A removed/emptied crate before
pickup simply cancels the intent without charging the player.

Saving remains denied from objective start through live wave resolution by the
existing `Game.isSafeToSave()` enemy/vehicle/hook checks. Load/reset first clears
theft intent, carrier payloads, drone proxies and objective markers, then restores
saved crates. Intent and carried cargo are therefore transient. Recovered cargo
that could not fit is different: once the encounter ends the game is saveable,
so an optional pending-recovery ledger must be serialized in `SaveGameV1` and
restored before Radio UI state is built.

Kill recovery is a three-step accounting transaction. Copy cargo, return as much
as fits to its original live source crate by stable ID, send the remainder to
`ResourceAccess.deposit()` (player inventory plus currently reachable crates),
then append the exact leftover to the persisted pending-recovery ledger. Only
after those sinks account for the original count may carrier cargo clear. A
**Collect recovered supplies** radio action retries deposit; a full inventory and
full crates leave the remainder in the ledger. Coalesce by item ID and validate
the same 6/2/2 maxima per entry or a bounded aggregate. Reset/load must never pay
transient intent/cargo, duplicate the ledger, or discard ledger overflow.

## Ownership and integration

One owner at a time for shared files:

- **Luna progression:** `StoryDirector.ts`, `RadioRaids.ts`, `RadioUI.ts`,
  `data/story.ts`, focused progression/UI tests. No `Game.ts`.
- **Luna tactics:** `Enemy.ts`, `EnemyManager.ts`, new tactic modules and focused
  combat tests. Export stable tactic state/position surfaces and initially call
  no-op visual seams. Avoid inventory, `Game.ts`, save schema and story UI.
- **Foundation worker:** pure `RaidObjectives.ts` controller and focused tests;
  no inventory, BuildSystem, Game or UI imports.
- **Root:** `Game.ts`, `GameEvents.ts`, save migration/schema, HUD/objective glue,
  theft/storage/recovery-ledger integration, unlock application,
  destination/route integration and new vent/drone visuals/accessories. Root
  consumes worker APIs after their files freeze.
- **Sol:** contract review, edge cases and acceptance evidence. No concurrent
  runtime ownership.

Suggested typed seams:

```ts
story.recordRadioRaidVictory(count: number): boolean
story.beginWreckExpedition(context: WreckStartContext): WreckStartResult
story.permitsRadioRaids: boolean
story.snapshot(distance): { radioTraceOffer; radioTraceReady; chapterComplete; ... }
radioRaids.finished(seed): void // Game then reads the saved/current wave count

enemy.setTacticalContext(context: EnemyTacticalContext): void
enemy.tacticalSnapshot: EnemyTacticalSnapshot
enemy.applyHit(hit: EnemyHit): DamageResult

raidObjectives.begin(input: RaidObjectiveInput): RaidObjectiveSnapshot
raidObjectives.fixedUpdate(input: RaidObjectiveTick): RaidObjectiveEffect[]
raidObjectives.onEnemyKilled(enemyId: string): RaidObjectiveEffect[]
raidObjectives.cancel(reason: 'load' | 'reset' | 'encounter-cancelled'): void
```

Effects request actions; they do not directly reach into `Game`, HUD, build
storage or save managers. Container lookup/removal and ground-drop creation stay
with their current owners and are passed as narrow callbacks.

## Acceptance gates

- Existing opening, crossfire skip/completion, camera/input and recurring raid
  tests remain unchanged and green.
- One real post-crossfire raid unlocks the offer; zero raids does not. Closing
  the radio continues travel and raids. Accepting once reaches Wreck One.
- Wreck One gyro, powered helm, both route choices, Relay Foundry uniques and
  departure complete in a real-game harness. Completion persists and survival
  produces a later raid.
- A format-2 save from every existing phase loads without loss. New saves round
  trip before offer, offer-ready, each destination phase, route selection and
  complete. Rewards/events are idempotent.
- At 30/60/144 Hz render cadence with fixed simulation ticks, tactic transition,
  strike, burst, vent and recovery times match. Pooled reuse starts clean.
- Each mech has a deterministic proof of its counterplay: sidestep lunge, hit
  active vent versus body, Warden flank/fallback, destroy drone and observe buff
  removal for the rest of that encounter.
- Assault/sabotage/theft each run in a seeded encounter. Theft conservation is
  exact for pickup→kill and pickup→escape; cancel/move/destroy/reset cases leave
  no theft intent/cargo or duplicate resource. Full-inventory recovery persists
  in the radio ledger across save/load until collected. Unique/player/equipped contents are
  byte-for-byte unchanged.
- Enemy pool never exceeds eight, active ordinary-wave composition does not
  increase, physics bodies/colliders and visuals return to warm baseline after
  100 spawn/despawn/objective cycles.
- No weapon stats, equipment expansion, weather, fuel rate, machine speed,
  opening/crossfire timing or destination collision changes enter this scope.
