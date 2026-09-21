# Plan 1 — build, repair the scanner, scan, witness the battle

Parent: [Nomad foundation roadmap](2026-09-21-nomad-foundation-roadmap.md).
Status: implemented locally ahead of optional expedition and specialization work.
[Delivery and current evidence](../../campaign/nomad-foundations-delivery.md).

## Pre-implementation behavior and the defect in the experience

The first eligible reeled chest grants the radio once, plus 12 scrap and 4 fuel.
Finding it immediately begins the initial signal phase. Reception currently rises
from 8% to 100% over 2,200 m of travel, roughly 293 seconds at 7.5 m/s.

However, the battle also requires the entire seven-step first-run guide:
salvage, refinery, refine components, workbench, build/crew gun, survive the
tutorial boarding, and repair. Consequently, a player can see 100% without the
scene starting and without understanding the remaining prerequisite.

Keep the existing rooftop opening and 17-second passing-ship battle, including
the Revenant reveal and hold-to-skip. Change what leads into it.

## New player-facing sequence

1. **Recover supplies.** Reel a clearly marked salvage cargo crate; the existing
   first-chest guarantee supplies the receiver, presented as a damaged scanner/radio assembly.
2. **Build a refinery.** Guide the player through selecting and placing it on a
   clear deck area. Pre-existing valid builds count.
3. **Prepare components and build a workbench.** Use existing scrap/component
   recipes and ordinary construction. Keep the current underlying seven-step
   history; make the new objective projection acknowledge out-of-order work.
4. **Make a scanner replacement module.** A workbench recipe uses common scrap
   and components; no rare drop, extra station, or randomized research gate.
5. **Install the module.** Use the obvious scanner service socket once. Consume
   the module only when installation succeeds; show the repaired assembly.
6. **Start scanning.** Explicitly choose Start Scan. The HUD states that the
   player can build, salvage, and get settled while it runs.
7. **Scan to 100%.** Initial tuning: 180 active simulation seconds. No recurring
   attacks or tutorial boarding during this calm interval.
8. **“Contact acquired — look starboard.”** Three safe simulation seconds after
   reaching 100%, start the existing battle scene. After completion/skip, resume
   the existing defense/boarding/repair lessons and subsequent raid/story loop.

Do not require construction of a manual gun, winning a boarding encounter,
repairing battle damage, or finishing the entire tutorial to see this scene.
Keep the post-scene defense lesson and its preparation grace; do not deliver a
new immediate boarding attack while the player is recovering control.

## State and ownership contract

Add a small pure opening-scanner controller, proposed `src/progression/ScannerSetup.ts`:

`awaiting-receiver → awaiting-module → installed → scanning → contact-ready → consumed`

- The existing early-radio ledger owns the unique receiver award.
- `FirstRunDirector` exposes a `workshopReady` fact and retains its durable seven
  steps. A separate objective projection inserts scanner guidance ahead of the
  unfinished defense lesson. No second owner writes first-run completion facts.
- The scanner controller owns installed/started/progress/pending-delay facts.
- `StoryDirector` consumes initial scanner readiness and owns `crossfire` and
  later story phases. `SignalBattleScene` owns presentation only.
- Preserve the distance-based signal behavior of later chapters unless a separate
  change is explicitly designed. The new time-based behavior is for the opening scan.
- One shared snapshot supplies the HUD, scanner model indicators, Radio/terminal
  page, and Story input. They must never display conflicting percentages.

Proposed optional save addition: `progression.scanner`, format 1, with durable
setup phase, bounded `elapsedS`, and bounded pending safe-delay state. `consumed`
is a projection of Story state, not an independently writable completion flag.
Choose the exact shape in S-01; validate combinations strictly. Story `crossfire`
reconciles older scanner data to contact-ready and restarts presentation; Story
`raids`/later projects consumed. A claimed terminal scanner phase with Story still
locked/signal is invalid. Runtime `sceneStarting` is not a second saved completion
flag. Story alone authorizes and proves consumption of the reveal.

### Timing and calm-period rules

- Reuse the existing one-power communications consumer; do not charge a second
  scanner power draw for the same hardware.
- Start requires receiver, installed module, an alive player aboard, operational
  radio power, and a clear gameplay boundary with no live/committing encounter.
  Reject with a specific reason. If a legacy encounter is already committed,
  finish its existing resolution before acquiring scanner calm; do not freeze a
  required encounter forever behind a Start rejection.
- During scanning, progress uses unpaused simulation time, not distance or wall
  clock. Stop/slow travel and emergency crawl do not stretch a three-minute scan
  into an unexplained long wait.
- Loss of power, death, or leaving the machine suspends progress and states why;
  it never resets earned progress. Do not require a permanently open menu.
- Pause/menu/background behavior follows the game's pause policy. No offline progress.
- From the start of onboard settling-in through the completed/skipped reveal,
  suppress ordinary spawns, the tutorial skiff, recurring radio raids, and new
  dust-front onset. Do not erase an encounter already active in a legacy save.
- Preserve suspended threat distance/timer budgets; do not merely let a backlog
  accumulate and spawn every deferred attack immediately after the cutscene.
  In particular, `Game.updateVehicles()` has a separate `tutorialReadyAt` skiff
  path. Block/freeze that path even if the player builds/crews the gun early,
  and rebase a full preparation grace after the reveal. Deferred tutorial
  readiness is not itself an active encounter that permanently blocks Start.
- Audit `beginSignalBattle()` before reuse: its current external-encounter
  cleanup can retire an ordinary wave. Acquire a clear boundary without discarding
  suspended queues or calling unrelated encounter-completion logic. Preserve any
  deferred vehicle queue separately from a live/committing encounter.
- At 100%, remain visibly ready. Count three seconds only while alive, aboard,
  resumed, and free of competing panels/placement/cinematics/active threats.
  Pausing or a safe-boundary hold suspends the delay; it does not lose the event.
- Power is required to scan. Once a contact is acquired at 100%, later power loss
  does not invent an extra hidden requirement to witness a visible passing battle.
- Missing optional scene art uses the existing presentation/fallback completion
  path; do not strand the campaign in `crossfire`.

## Recipe and recovery budget

Proposed item/recipe: `scanner-replacement-module`, 4 scrap + 4 components at a
built, functional workbench, one output. The workbench currently has no registered
power draw; do not introduce one through a generic “powered station” guard.
The existing radio's one-power requirement is for scanning. The module is a quest
assembly, not a new general resource.
Render it as a compact shielded cartridge matching the scanner's service socket.

For a fresh campaign, teach refinement of 12 components: four for the workbench,
four for the scanner, and four retained for the later manual gun. Existing completed
refinement facts remain complete; never revoke old tutorial credit to enforce 12.
Count actual recipe output: `craft:completed` currently forwards only recipe ID,
while the director's default count is one and refinement yields two components.
Wire the true output count into monotonic tutorial facts so storing/spending
components cannot strand the step or force extra refinement.

Current proposed playable-path arithmetic: 260 starting scrap, refinery 80,
six refinement batches 48, workbench 30, module 4, and at least two supporting
floor plates 16. That leaves 82 scrap and four components before the later gun.
Its additional floor costs 8 and the gun 42 scrap/four components, leaving 32
scrap before the guaranteed 12-scrap radio bonus (44 with it). Include supports
in the fresh Story/Survival ledger; this is not yet a completed pacing test.

Normal repeatable salvage must recover overspending, lost cargo, low fuel, or a
demolished station. Never respawn the unique receiver award or a free repair
module to solve recovery. Full inventory leaves the module uncrafted/unclaimed
with a clear capacity message; every cost/output/install is atomic and idempotent.
Surface exact outstanding ingredients, not an instruction to grind an unknown amount.

## Tasks

| ID | Owner | Specific work | Done when |
| --- | --- | --- | --- |
| S-01 | Sol + Luna | Freeze state transitions, one-power contract, initial timer, three-second safe delay, and legacy mapping; implement the pure controller and save validator. | Unit tests cover every transition, invalid values, duplicate install/start, pause/resume, and one-shot readiness. |
| S-02 | Luna | Expose workshop readiness; project build/module/install/start/scan objectives ahead of defense without replacing old durable tutorial steps. Update control labels to semantic actions usable by current menus and the future terminal. | Out-of-order builds and existing workbench/refinery satisfy the correct steps; no requirement hides behind a 100% meter. |
| S-03 | Luna + Astra | Add module item, recipe, icon, installation command and repaired-state art anchor. Keep crafting and consumption with existing transactional authorities; refuse redundant crafting while a module is owned or already installed. | Exact costs, one output/one consumption, actual station/space errors explained, no double-click duplication or extra workbench power gate. |
| S-04 | Astra | Integrate progress into initial Story signal, HUD, scanner display, and existing cinematic start. Preload scene assets during the calm period within the established load budget. | After an eligible 100% state the scene starts in three simulation seconds, without a loading hitch or tutorial-defense requirement. |
| S-05 | Luna + Astra | Move the tutorial skiff/ordinary/radio/dust eligibility gates to the intended before/after-scene phases. Retain the existing defense training and bounded post-scene preparation. | No attacks interrupt fresh scanning; resume never unleashes stacked queued raids; later Wreck trace remains reachable. |
| S-06 | Luna + Astra | Implement additive save migration and strict import validation; preserve later campaigns, first-run facts and receiver award history. | Every row in the compatibility matrix below passes round-trip and repeated-load checks. |
| S-07 | Luna + Astra | Run fresh Story and Survival through rooftop, salvage, builds, install, calm scan, reveal, post-scene defense, and Wreck offer using ordinary input. | Video/screenshots, event times, cost ledger and cold Continue evidence; actual loop matches the objective text. |

## Save compatibility matrix

| Existing state | Expected behavior |
| --- | --- |
| Fresh run | New build/repair/start flow; no scan before installation and Start. |
| Locked story with partial modern guide | Preserve useful builds, resources and tutorial facts; introduce only still-missing scanner work. |
| Legacy initial `signal`, no scanner save | Treat receiver as already installed/started and derive elapsed time from the old clamped distance-progress fraction `(distance - signalStartedAt) / 2200`; do not use displayed 8% as eight percent of paid new progress. Missing/nonfinite origin maps to zero raw progress and persists the current distance as origin, never origin zero. |
| Legacy signal at 100%, defense guide unfinished | Durable contact-ready; begin safe three-second delay without retroactive module cost or mandatory battle lesson. |
| Legacy `crossfire` | Restart the existing 17-second scene from its beginning, as current loading does; no extra reward, module consumption or new tutorial charge. Natural finish and hold-Esc skip converge on the same idempotent completion edge. |
| `raids`, Wreck, later chapters, ending/Keep Walking | Mark the opening scanner consumed; never replay the introduction or re-lock earned content. |
| Very old save without first-run data | Retain the existing completed-guide compatibility behavior; do not force new station construction on a mature campaign. |
| New scanner save at each intermediate phase | Preserve exact valid phase/progress; reject malformed, unsupported, or story-inconsistent imported combinations. |

## Primary paths

`src/game/FirstRunDirector.ts`, `src/progression/EarlyRadioDrop.ts`, new scanner
controller/projection, `src/story/StoryDirector.ts`, `RadioRaids.ts`,
`SignalBattleScene.ts`, `src/game/Game.ts`, `src/data/items.ts`, `recipes.ts`,
`src/save/SaveSchema.ts`, `SaveExportCodec.ts`, `src/ui/HUD.ts`, `RadioUI.ts`,
and the existing first-run, early-radio, story, save, and radio-scene test routes.

The final normal-input check must explicitly measure 100%-to-scene time. A test
that jumps Story directly to `crossfire` does not demonstrate this feature.
Include the adversarial order: build/crew the gun before Start, remain aboard
beyond the old 15-second tutorial deadline, install and scan with no encounter,
finish or skip the reveal, then observe one fresh preparation grace and one
tutorial skiff. Update old first-loop harnesses that expect turret/skiff before
the distance-driven reveal; do not treat those obsolete expectations as regressions.
