# Chapter One and tactical identities — execution record

Status: implemented and locally accepted. This record describes the changes
based on main `97630f4` on 13 September 2026. It complements the design contract in
[`2026-09-13-chapter-tactics-plan.md`](../superpowers/plans/2026-09-13-chapter-tactics-plan.md).

The implementation completes an optional first progression chapter using the
existing Wreck One and Relay Foundry destinations, then returns the player to
continuing survival. It also gives the four existing mech types tactical
counterplay and adds assault, sabotage and supply-theft goals to recurring radio
raids. It adds no weapon, equipment branch, weather system or second chapter.

## What the player can do

After the existing opening and radio crossfire, complete one recurring boarding
raid. The Radio then shows **Trace Wreck One**. Closing the Radio leaves the
offer available and the normal travel/raid loop running; the expedition is not
forced. With the radio powered, no encounter active and the player safely aboard,
selecting the action commits the route to Wreck One.

At Wreck One, allow the Nomad to moor, cross the physical gangway and recover the
Course Gyro. Return aboard and depart. The powered Navigation Helm then offers:

- **Foundry Direct**, the shorter route with its existing scripted gunboat.
- **Foundry Detour**, the longer route which avoids that scripted gunboat.

Both routes lead to Relay Foundry. Recover the salvage controller and tracking
servo, return aboard and depart. These uniques unlock the existing automatic
salvage collector and automatic defense turret. The Radio reports the first
chapter complete; ordinary recurring raids remain permitted and survival
continues. Completion and both unlocks survive save/load without replaying the
crossfire or expedition rewards.

The tactical counters are:

- **Revenant:** a 0.55-second lane telegraph commits its facing, followed by a
  collision-bound 0.38-second lunge and 0.75-second recovery. Step out of the
  marked lane; the strike rechecks current reach and line of sight.
- **Bastion:** its existing three-shot burst is followed by a 1.8-second cooling
  window. The visible cooling vent is targetable only while open and routes
  double damage to the Bastion.
- **Warden:** sustained blocked line of sight triggers a bounded search of up to
  12 same-deck candidates within 8 metres. It commits briefly to reachable cover
  with a clear firing lane, then falls back to ordinary navigation if none is
  valid. Mission travel overrides flanking.
- **Sovereign:** one 35-HP support drone protects other living enemies within
  7 metres with a nonstacking 20% incoming-damage reduction. It does not protect
  the Sovereign itself. Destroying it removes support immediately for the rest
  of that Sovereign's life; pooled reuse starts a fresh life cleanly.

Raid objective selection is seeded by radio wave. The first post-crossfire raid
remains assault. Later waves rotate a shuffled assault/sabotage/theft bag without
changing the eight-enemy pool. Sabotage sends one boarder to a live machine
subsystem. Theft assigns one carrier and one live built storage crate. At the
crate it atomically takes one bounded stack: at most 6 scrap, 2 components or
2 fuel. It never reads the player inventory, equipped items, story uniques,
producer output or collector claims.

The extraction ship can be held for at most 90 seconds. A carrier must hold at
its attached-side return point for 3 seconds to escape. Cutting the hook blocks
escape while leaving its cargo recoverable on death. A killed carrier returns
what fits to the original crate, then the normal reachable resource containers;
any full-inventory overflow becomes a persisted Radio recovery ledger. The
**Collect recovered supplies** action removes only what actually fits and leaves
the rest for a later attempt. Repeated kill or collection callbacks cannot
duplicate cargo.

## Implemented architecture

- `StoryDirector` retains campaign format 2 with optional
  `radioTraceEligible` and `chapterComplete`. Its public progression seam is
  `recordRadioRaidVictory(count)`, `beginWreckExpedition(context)`,
  `permitsRadioRaids`, and the readonly `radioTraceOffer`, `radioTraceReady` and
  `chapterComplete` snapshot fields. Loading an older raids save backfills the
  offer from a positive saved `RadioRaids.wave`; completed Foundry saves derive
  the milestone from their completed expedition list.
- `EnemyTactics` owns fixed-time state. `Enemy` keeps authoritative physics,
  health, attack timing, muzzle origin and damage. Mission travel suppresses
  normal player attacks and ranged windups; sabotage uses the selected subsystem
  with the existing cooldown/damage path.
- `EnemyManager` keeps the existing eight-slot pool and round-robin path budget.
  Warden searches are capped, and per-enemy flank state is cleared on spawn,
  death, despawn and manager reset.
- `RaidObjectiveController` is pure and seeded. `RaidMissionSystem` owns live
  mission routing and calls the existing BuildSystem, ResourceAccess,
  MachineDamage and boarding APIs through their public seams. Only recovered
  overflow is serialized as optional `world.raidRecovery`; live intent and
  carried cargo remain transient because encounters are not save-safe.
- `EnemyTacticsVisual` owns bounded shared cue geometry/materials and transient
  sensor colliders. Authored accessory clones borrow the loaded model resources;
  slot removal does not dispose borrowed assets, while final model disposal does.
  Death/reset removes sensors and cues.

## Task status

| Task | Status | Evidence and remaining acceptance |
| --- | --- | --- |
| CH1-01 contract freeze | Complete | Typed progression, mission, save and ownership seams are recorded in the plan and backlog. |
| CH1-02 optional Wreck offer | Implemented and exercised | No-offer, resolved-raid offer, decline, guarded start, format-2 persistence and legacy wave backfill passed focused tests and runtime QA. |
| CH1-03 Radio and milestone UI | Complete locally | Actual Radio button starts the trace; power/enemy refusal, completion text and recovered-supply collection passed DOM/runtime checks. |
| TAC-01 pure tactic state | Implemented and unit-tested | Fixed-time Revenant, Bastion, Warden and Sovereign transitions/reset behavior are covered by focused tests. |
| TAC-02 Revenant/Bastion integration | Complete locally | Browser QA exercised a real Revenant's committed lane and verified that a lateral dodge avoids damage. The warning was captured in the real scene, and a live authored vent collider preserved armor before routing double damage. |
| TAC-03 Warden/Sovereign integration | Complete locally | Focused tests cover bounded same-level flank selection, fallback and pool cleanup. Browser QA exercised Warden movement and fire suppression around an isolated real-physics cover fixture, then verified that fire resumes after release. It also hit the authored drone through a real physics ray and confirmed support removal. This is automated fixture evidence, not a claim of manual Warden counterplay acceptance. |
| RAID-01 objective controller | Implemented and tested | Seeded selection, one carrier, bounded cargo, idempotent recovery, recovered-only save and collection retry are covered by focused tests. |
| INT-01 campaign/save integration | Implemented and exercised | Both routes, both Foundry uniques, blueprint grants, completion, legacy backfill and actual save/load passed runtime QA. |
| INT-02 mission/tactical feedback | Complete locally | Real carrier navigation, pickup, hook-cut recovery, escape, storage relocation/demolition and real drone/vent sensors passed. Browser QA also walked a live sabotage actor to the engine service point and verified that only its selected subsystem took damage. Assault controller behavior is covered by focused pure tests. |
| ACC-01 chapter browser acceptance | 28 checks passed | The actual Radio UI, destination pickup, gangway, both routes, gunboat distinction, Foundry rewards, completion, later raid scheduling, reload and legacy backfill were exercised. Travel distance was shortened by the fixture; this is not evidence of a manual 20-minute traversal. |
| ACC-02 tactical/resource acceptance | 24 checks passed | Real theft physics and conservation, hook cut, full inventory ledger, save/load, collection idempotence, carrier escape, relocation, demolition, sabotage travel, Revenant dodge, Warden committed movement/release, drone ray, vent damage and 100 lifecycle cycles passed. Visual captures document the drone, vent and lunge warning. Warden evidence uses an automated isolated fixture rather than manual play. |
| VAL-01 final regression | Complete locally | Final runtime code passed 1,214 tests across 122 files, lint and production build. Runtime QA passed 52/52; camera/stair regression passed 8/8. The local production bundle includes `assets/index-PILyQiL3.js`. Publication to main remains pending. |

## Runtime acceptance evidence

The preserved harness result is [`runtime-qa.json`](runtime-qa.json): 52/52
checks passed with no recorded errors. Camera and stair regression evidence is
[`camera-results.json`](camera-results.json): 8/8 checks passed.

Progression coverage includes the actual RadioUI click, Wreck docking and
physical gangway, Course Gyro pickup, direct and detour helm commits, both
Foundry unique pickups, both automation blueprint grants, durable completion,
actual save/load, legacy raid-wave backfill and a later real boarding schedule
after each completed route. The harness advances authored world distance and
destination state through explicit fixtures so it can reach both route endings
in one acceptance run. It does not simulate or claim a manual 20-minute walk.

Mission coverage uses a real spawned carrier, the live navigation graph and
Rapier collision to approach a real built crate and remove exactly 6 scrap. It
then cuts the real hook, fills available recovery storage, kills the carrier,
checks exact overflow, repeats the kill callback, saves/loads, collects once and
repeats collection. Separate browser cases prove an unopposed return/escape,
storage relocation with stable retargeting, and demolition cancellation without
loss or duplication. It also raycasts the authored drone sensor, confirms support
removal and verifies that a live vent sensor preserves ordinary armor before
routing double damage. Further live cases walk a sabotage actor to the engine
service point and damage only its target, demonstrate a lateral dodge against a
committed Revenant lunge, and exercise Warden committed movement, fire
suppression and release with an isolated real-physics cover fixture.

The mixed lifecycle run completed 100 tactical/objective cycles. Bodies remained
26 to 26, colliders 37 to 37, scene objects 901 to 901, and eligible stock stayed
`[21, 1, 0]`; no containers remained after cleanup in either sample.

The same harness recorded a 10-second four-mech sample after a 2-second warmup on
an RTX 3070 at High quality, 1600×900. It rendered 601 frames at 59.997 FPS.
Frame time was 16.667 ms mean, 16.8 ms p95 and 16.8 ms p99. Measured work time
was 7.578 ms mean, 10.6 ms p95 and 16.2 ms p99. The sample held four active
enemies, 30 bodies and 43 colliders. This short local sample detects an obvious
regression; it is not a broad hardware benchmark or long-session guarantee.

Camera QA used isolated storage and prepared stair starts with physical W/S/V,
RMB and mouse input, sampling after the game render. It passed both lower-deck
ramp ascents/descents, full-model restoration after cover, unchanged render-only
framing, visible upper-body framing through 880 stair/turn frames, and zero
camera-volume overlap frames.

Pure tests establish deterministic state boundaries, lunge hit/LOS behavior,
Warden candidate bounds/fallback, nonstacking support, seeded objectives and
save validation. Browser checks establish the Game/UI/save wiring and the real
physics/resource cases listed above. The screenshots establish presentation at
the captured poses. The automated Warden fixture proves locomotion, fire
suppression and release; it is not a manual player counterplay evaluation. This
evidence does not claim a natural-length campaign walk, broad hardware
performance or long-session endurance.

## Assets

The editable source is
`assets/chapter-tactics/tactical-accessories.blend` with its generation/export
script at `tools/art/chapter_tactics/build_accessories.py`. The promoted runtime asset is
`public/models/authored/tactical-accessories.glb`.

The GLB is approximately 4.8 MB and contains 9 mesh primitives / 11,088
triangles. The Sovereign drone begins from the original reference Sovereign orb;
the Bastion cooling pack is newly authored for this feature. Runtime fallback
geometry keeps weak points functional when character models are disabled.

Final captured presentation:

- [Support drone](support-drone.png)
- [Bastion cooling vent](cooling-vent.png)
- [Revenant lunge warning](lunge-warning.png)

## Preserved boundaries

The implementation keeps the existing opening and crossfire, camera and input
controls, weapon/equipment rules, machine speed/fuel equations, enemy pool size,
destination collision scheme and old save version. It does not add weather,
weapons, wearable equipment, a new enemy definition, a next chapter destination
or a terminal victory screen. Continuing raids after the completed milestone are
part of the delivered loop. A final scope comparison against main found no
changes to enemy, weapon or subsystem definitions, movement, `PlayerCamera`,
`FirstRun`, `RadioRaids` or existing story data.
