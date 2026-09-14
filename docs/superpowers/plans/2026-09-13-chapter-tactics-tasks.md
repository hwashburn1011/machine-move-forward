# Chapter One and tactical identity execution tasks

Implementation was authorized 13 September 2026. Design authority is
[`2026-09-13-chapter-tactics-plan.md`](2026-09-13-chapter-tactics-plan.md).
Base is main `97630f4`. This backlog describes completion criteria; checkmarks
belong in a separate execution record with evidence.

## Work rules

- Preserve `dealer-agent-readiness/`, `dealer-signal-work/` and `docs/vpc-mvp/`.
- Root creates the branch and serializes edits to `Game.ts`, `GameEvents.ts`,
  save files, HUD and shared visuals. Workers do not opportunistically edit them.
- Luna progression and Luna tactics may work concurrently only while their file
  ownership remains disjoint. Freeze/export an API before root integration.
- Do not change balance constants in `data/enemies.ts`, weapon/equipment systems,
  opening/crossfire timing, machine motion/fuel or weather.
- Tests use fixed simulation time and seeded RNG. Typecheck-only, mocked-only and
  screenshot-only evidence cannot close a gameplay task.
- No new Blender/GPU process while another GPU validation is active. Reuse current
  models and authored clips; root owns any visual marker/animation decision.

## CH1-01 — Freeze campaign and objective contracts (Sol review, root accepts)

**Own:** these two plan files and, in a serialized root window, shared type
declarations only.

- Confirm the raid victory count, implemented optional offer representation,
  expedition start context, tactical snapshots/effects and theft ledger.
- Enumerate exhaustive phase switches in Game/HUD/ExpeditionUI/save migration so
  an offer-ready flag cannot accidentally create a sanctuary or stop raids.
- Record existing save-safety predicate and build-container access seam before
  implementation.

**Done:** both Luna owners and root can implement without touching one another's
files; coordinate/clock/ID ownership and cancel semantics are explicit.

## CH1-02 — Optional Wreck One offer (Luna progression)

**Own:** `src/story/StoryDirector.ts`, `src/story/RadioRaids.ts`,
`src/data/story.ts`, `tests/unit/storydirector.test.ts`, focused radio-raid tests.

- Make normal radio-raid completion return a stable monotonically increasing
  raid ID and let StoryDirector consume it once.
- Persist optional `radioTraceEligible` and `chapterComplete` without changing
  campaign format or phase from `raids`; expose `radioTraceOffer`,
  `radioTraceReady` and phase-bound `permitsRadioRaids`. Backfill from a positive
  saved `RadioRaids.wave`, otherwise an
  old raids save requires one newly completed raid. Preserve later states.
- Use guarded, idempotent `beginWreckExpedition(context)` to emit existing approach
  effects and arrival distance. Closing/ignoring does nothing.
- Keep crossfire finish and recurring cadence unchanged.

**Tests:** no offer before crossfire or before a completed raid; one offer after
completion; duplicate completion/accept ignored; decline permits later raids;
format-2 migration at locked/signal/crossfire/raids/approach/docked/route/
Foundry/complete; extended format-2 round trips and raid-wave backfill.

**Done:** pure state-machine tests prove optionality and no reward/event replay.

## CH1-03 — Radio offer and completed milestone UI (Luna progression)

**Own:** `src/ui/RadioUI.ts`, its stylesheet if already dedicated, focused DOM
tests. Coordinate any shared CSS ownership before editing.

- Add `Trace Wreck One` only when found, powered, offer-ready and not committed.
- Show the existing refusal reason from root-provided view state; never mutate
  story state from rendering.
- Completed view names Course Gyro, automatic collector and automatic turret,
  says survival continues, and offers no fake next destination.
- Retain close, research and route/depart controls and their focus behavior.

**Tests:** hidden/disabled/enabled states, one callback per click, reopen after
decline, completed copy and keyboard focus. No raw internal action IDs.

## TAC-01 — Pure tactic state machines (Luna tactics)

**Own:** new `src/enemies/EnemyTactics.ts` and focused unit tests.

- Implement explicit spawn-resettable state machines for Revenant telegraph /
  lunge / recovery, Bastion burst-to-vent timing, Warden blocked-LOS commitment,
  and Sovereign drone alive/destroyed-for-life.
- Consume fixed `dt`; return decisions/effects without importing Game, UI,
  Three renderer or save manager.
- Clamp invalid/nonfinite input and ensure a large tick cannot emit repeated
  strikes, bursts or destruction effects.

**Tests:** exact boundary transitions; 30/60/144 render cadence over the same
fixed ticks; pause/no tick; death/despawn/reset from every state; no duplicate
one-shot effects.

## TAC-02 — Integrate Revenant and Bastion counters (Luna tactics)

**Own:** `src/enemies/Enemy.ts`, `src/enemies/EnemyManager.ts`, narrow hit-proxy
helper, focused Enemy tests. Coordinate visual anchor request with root; do not
edit shared model assets.

- Route Revenant movement through the committed collision-aware lunge decision.
  Snapshot direction once, do no steering during lunge, call existing damage
  once only at the strike frame, then lock recovery.
- Trigger Bastion vent after its current authoritative three-shot burst. Add one
  nonblocking sensor/hit proxy with model anchor and models-off fallback. Only
  active proxy hits receive 2x post-armor damage.
- Preserve authoritative attack origin, original animation order, health, armor,
  drops, death timer and pool identity.

**Tests:** lateral dodge misses, endpoint hit once, wall collision stops lunge,
recovery blocks attack; body/closed-vent/open-vent damage; proxy follows owner;
death/despawn/reuse removes collider and resets state; real Rapier body/collider
counts stable for 100 cycles.

## TAC-03 — Integrate Warden flank and Sovereign drone (Luna tactics)

**Own:** `src/enemies/Enemy.ts`, `src/enemies/EnemyManager.ts`,
`src/enemies/EnemyTargeting.ts` or a new isolated flank selector, drone helper,
focused navigation/combat tests. This follows TAC-02's ownership window.

- Score only existing walkable cells, once per manager repath turn, within the
  stated radius. Reject other levels and reserved/destination cells. Commit
  briefly and fall back without blocking if no path exists.
- Export stable drone state and anchor position plus a no-op visual seam for root.
  One drone per living Sovereign has 35 health/no loot and a 7 m nonstacking 20%
  incoming-damage reduction. Destruction lasts for that Sovereign's life; a
  pooled respawned Sovereign gets a fresh drone. Apply damage reduction per
  instance after ordinary armor/hit calculation; never mutate definitions.
- Keep drone out of the Enemy pool and enemy count, but include its proxy in
  lifecycle/resource accounting.

**Tests:** cover-to-flank choice, no-cover fallback, nav invalidation, bounded
candidate calls; near/far buff, two Sovereigns do not stack, destruction clears
same tick, no same-life respawn, owner death and pooled reuse clean all membership and
physics handles.

## RAID-01 — Pure objective director and atomic theft cargo (foundation worker)

**Own:** new `src/enemies/RaidObjectives.ts` and focused pure tests. Keep the
director callback-driven; it must not import BuildSystem, Container, Game or UI.
Root separately owns storage and recovery integration.

- Seed one assault/sabotage/theft choice per raid ID. Scripted encounters opt out.
- Sabotage stores one validated subsystem stable ID and emits ordinary target /
  outcome effects.
- Theft tracks one thief's intent toward a stable built-crate ID. At reach Game
  revalidates and atomically removes at most one stack (6 scrap, 2 components or
  2 fuel), then cargo owns the exact actual amount until kill/drop or return to
  the attached boarding edge. There is no inventory reservation.
- Missing/empty source cancels to assault. Relocation remains valid through the
  stable ID. Reset/load cancellation never drops or delivers.

**Tests:** deterministic objective choice without consuming an injected unrelated
RNG; no eligible storage falls back to assault; only one thief is assigned;
partial depletion limits actual pickup; move survives; destroy/reset cancels; exact conservation
for death and escape; duplicate callbacks idempotent; player/equipped/unique and
producer/collector sources are never requested.

## INT-01 — Root campaign/save integration

**Own:** `src/game/Game.ts`, `src/core/events/GameEvents.ts`,
`src/save/SaveSchema.ts`, HUD/ExpeditionUI glue, focused integration/save tests.

- Feed only normally resolved post-crossfire raid completions to StoryDirector.
- Expose accept through the RadioUI callback with current powered/stable/aboard /
  encounter context; apply returned effects through the existing story effect
  handler.
- Preserve Wreck/Foundry destination lifecycle and route behavior exactly. Direct
  keeps its scripted gunboat; detour gains no extra reward or encounter.
- On Foundry departure grant mapped specialist unlocks once, publish typed
  `chapter-one-complete`, release sanctuary/speed limits and leave raid updates
  active in complete state.
- Migrate campaign save conservatively and prevent active objectives from being
  saved through the existing safety gate. Clear transient tactical/objective
  ownership before restoring world/build state.
- Persist only overflow recovery after a kill in an optional SaveGameV1 ledger.
  Return cargo to the original crate first, then `ResourceAccess.deposit`, then
  ledger the exact remainder. Radio collection retries without clearing leftovers.

**Tests:** effects applied once; `recordRadioRaidVictory` receives only a newly
resolved saved wave count; raid eligibility while offer waits and after complete
but never during expeditions; full old-save
matrix; destination collider/gangway cleanup; unlock idempotence; complete save
reload resumes ordinary threats rather than destination/story effects. Full
inventory/crates retain pending recovery across save/load and collect later.

## INT-02 — Root tactical/objective integration and feedback

**Own:** `src/game/Game.ts`, `src/core/events/GameEvents.ts`, HUD markers/text,
minimal visual anchors/effects. Serialized after INT-01.

- Supply manager with nav/LOS/subsystem/storage callbacks and apply typed tactic
  and raid-objective effects in fixed-update order.
- Show telegraph/recovery, active vent, Warden flank intent, drone state and raid
  objective without changing authoritative hit timing.
- For theft, Game alone resolves BuildSystem stable-ID container lookup/removal,
  creates recoverable ordinary loot and owns escape-boundary delivery. Verify
  actual removal before displaying carried count.
- Threat/build guard treats every tactic, drone and carrier as part of the same
  active encounter; no new immunity or build window.

**Tests:** fixed-update ordering for pickup versus crate destruction, kill versus
escape, and raid completion; event payloads carry stable IDs/actual counts;
models-off fallback supports every mechanic.

## ACC-01 — Chapter browser acceptance

**Own:** new focused harness under `tools/` and evidence under a new chapter
acceptance folder. No real user profile/save slot.

- Drive opening/crossfire through existing tested seams, finish one actual radio
  raid, close/reopen the offer, then accept.
- Dock and board Wreck One, recover gyro, return, prove an unpowered helm refuses,
  then choose each route in separate isolated contexts.
- Dock Foundry, recover both uniques, depart, reload the save, verify both
  automation pieces available and survive until a later ordinary raid begins.
- Record which setup is fixture-driven and which actions use real UI/input.

**Done:** two route runs complete without forced opt-in, duplicate rewards,
or a terminal campaign screen; old-save compatibility is separately proven.

## ACC-02 — Tactical and resource acceptance

**Own:** focused real-game combat/resource harness and evidence. Run after unit,
type, lint and build checks; serialize GPU/browser use.

- In isolated seeded encounters demonstrate one readable counter for each mech.
- Run one assault, sabotage and theft raid using real Enemy/EnemyManager physics.
- For theft capture totals before intent, after pickup, after carrier kill /
  recovery and after escape in separate runs. Move and destroy the target crate;
  load/reset during an intent through the allowed fixture cleanup path.
- Fill the player inventory and all reachable crates before killing the carrier;
  verify exact overflow appears at Radio, survives save/load and is only removed
  from the ledger by an actual successful deposit.
- Run 100 mixed spawn/despawn/objective cycles after warmup and record enemy pool,
  bodies, colliders, scene objects, containers and total eligible resources.

**Done:** exact resource conservation and cleanup; no active hostile/pool growth;
fixed enemy count; no changes to uniques/equipment/player inventory; presentation
matches authoritative tactic state in real models and models-off mode.

## VAL-01 — Final regression and release record (root, Sol review)

- Run focused suites, complete unit suite, TypeScript, lint and production build.
- Re-run opening/crossfire compatibility, save/load/destination boarding, camera /
  input and gameplay-polish invariants affected by Game integration.
- Hash or diff-review weapon stats, enemy definition balance, machine movement /
  fuel and opening timing to prove scope preservation.
- Record commands, counts, browser evidence, hardware/settings and known limits.
  Do not claim visual or real-game acceptance from pure helper tests.

**Release gate:** Chapter One is optional, complete and durable; survival resumes;
all four mechs expose distinct working counterplay; all three raid objectives are
visible and deterministic; theft cannot lose/duplicate protected resources; old
saves load; resource owners return to baseline; rejected feature #2 remains out.
