# Midgame and Survival validation notes

The authored playability repair is merged through PR #18 at
`4052c73d4cbf53a2ccfd5f5fe9f2497c3ad1949a`. PR CI `34977339980` passed;
main build and Pages deployment `34977697821` succeeded. The live site serves
`index-BReJezW_.js`, matching the tested production build. Public normal-input
New Game / opening skip / Save & Quit / cold Continue passed 14 checks with no
errors in `test-results/public-continuity/run-1789480559703`.

The next source profile is the full-art Wreck departure checkpoint:
`test-results/continuity-wreck/run-2026-09-15T13-39-44-061Z/browser-profile`.
It has seed `mmf-dev-seed`, 216 scrap, 9 components, 4 fuel items, 29.967 tank
fuel, 78 HP, eight structures, and one Course Gyro. Origin remains port 5205.
The physical Navigation Helm opens the Foundry route cards after cold Continue.

## MID-02

`tools/campaign/continuity-midgame.mjs` passed its full-art run at
`test-results/continuity-midgame/run-2026-09-15T13-59-55-419Z`.
The first full-art attempt, `run-2026-09-15T13-49-27-636Z`, correctly selected
the 1,150 m Foundry detour and reached braking. It left the player idle and
died before docking at 4,419.65 m. Health was 78 at 4,367.78 m and zero about
25 seconds later; position remained on the deck beside the Helm. It did not
record a damage source, so this is not evidence of a balance defect. The route
card explicitly allows ordinary threats even though no scripted gunboat is due.

The accepted revision adds ordinary aim/fire/reload defense and damage,
threat, enemy, boarding and loot evidence. The Nomad aisle uses
absolute coordinates `(0.7,-1.5) → (4.2,-1.5) → (4.2,0) → (5.8,0)` before
the starboard gangway. Root-relative coordinates belong only to Foundry.

Foundry requires the Salvage Controller and Tracking Servo. Its departure
ends at `complete`; Quiet Array is a separate radio offer. A successful
checkpoint preserved the real route consequences and resource ledger,
then survived an ordinary committed save and cold Continue. It reached
4,606.79 m with both Foundry parts and zero active destination colliders.

The final ledger is 234 scrap (+18 from one Wasteland Scavenger), nine
components, four fuel items and 22.445 tank fuel. Two recorded scavenger hits
reduced health from 78 to 60. The runner fired 27 rifle rounds; Story reserve
remained infinite. Both recovered components occur exactly once alongside
the original Course Gyro. Six structures remain: generator `bp-3` and refinery
`bp-5` were lost during the run, and floor `bp-4` ended at 40/120 health.
Subsystems remain intact. The runner did not subscribe to build damage events,
so the exact cause of each destroyed piece is not attributed from this evidence.
Cold Continue matches this damaged checkpoint, rather than its undamaged parent.

The intermediate `13-58-07-430Z` run was interrupted by a closed browser;
the cause is unestablished. Preserve it separately from the successful retry.

## MID-03

Continue from the passed full-art Foundry profile above. Its generator must be
rebuilt through the actual catalog using 60 scrap and six components before
powered radio/Helm checks. Capture build damage/removal events in this child.
The Quiet Array gate passed through four linked runs, each consuming an ordinary
save from its parent. `14-15-15-728Z` rebuilt the generator (234/9 to 174/3),
accepted the 950 m signal, docked and read both calibrations. It then stopped
at a waypoint aimed into the archive console. `14-20-05-806Z` exposed the test's
camera-offset steering error at a tight waypoint. The corrected walking helper
uses the capsule's bearing while weapon aiming still uses the camera.

`14-21-47-346Z` recovered the actuator, optional archive note and ANNIKA shard,
returned aboard, departed, commanded -12 then +12 degrees through the Helm,
and observed real bearing/lateral movement. It committed an exact paused save
and cold-loaded it. Its final assertion incorrectly compared transient legacy
chapter fields after completion; the durable chapter/journal archive matched.
`14-23-53-655Z` continued that actual completed save and passed all corrected
Helm and cold-save checks with no browser errors. The lineage is recorded in
[the compact evidence](midgame-validation/quiet-array-summary.json).

The accepted committed save is at 5,646.95 m, 174 scrap, three components,
four fuel items, 7.746 tank fuel and 60 HP. Seven structures remain, including
the new generator. All three Quiet Array journals, five earned uniques and
tier-one steering persist. The powered Helm has an actual +12-degree target;
destination colliders and gangway are disabled. Live bearing and fuel are
allowed to advance between Continue and Pause within the production limits.

## SURV-01

`tools/campaign/continuity-story.mjs` now accepts `MMF_CAMPAIGN_PROFILE=survival`
through the real New Game profile button. The first run passed in
`test-results/continuity-survival/run-2026-09-15T14-11-13-182Z`.
It removes the seed override in the Survival path and checks fresh finite
rifle 30/150, shotgun 6/48, 260 scrap, and no inventory ammunition. It does
not convert an existing Story profile. Ordinary rooftop movement/jump,
first salvage, Save & Quit and Continue passed without errors. The checkpoint
has 299 scrap, three components, seven fuel items and 91 HP; both weapon
ledgers remain 30/150 and 6/48 with `infiniteReserve=false`. The build/boarding
loop built all required stations and crewed the gun. Its 25-second wall-clock
wait ended before the tutorial's simulation-time delay; the tool now allows
120 seconds. The ordinary autosave continued into
`test-results/continuity-boarding/run-1789482484702`, where the boarding,
reward, Save & Quit and cold Continue passed: 121 scrap, five components,
seven fuel items, eight pieces and 91 HP.
The refined SURV-02/03 crafting and
depletion ledger is in `docs/superpowers/plans/2026-09-15-authored-campaign-playability.md`.

One GPU/browser driver runs at a time. No gameplay authority writes, enemy
suppression, injected inventory, or test teleports can establish these gates.

## SURV-02/03 and the observed repair fix

The first ammo attempts stopped at a damaged support plate underneath the
workbench. Plate `bp-6` had 80/120 health and won the nearest-interaction tie;
the initial prompt incorrectly quoted zero scrap before E was held.
`RepairSystem.update` now returns the real idle price and affordability without
spending materials or advancing repair progress. Prices, damage and hold time
are unchanged. Two regressions cover an affordable one-scrap plate preview
and an unaffordable preview.

The corrected runtime bundle `index-DIcql4Hj.js` passed the normal-input run
`test-results/continuity-survival-ammo/run-2026-09-15T14-39-16-978Z`:

- The visible prompt quoted one scrap, and holding E repaired the support
  plate for exactly one scrap before the workbench opened.
- Crafting rifle ammunition while holding the shotgun spent two scrap and
  one component and added 30 rifle rounds. No ammunition remained in inventory.
- All 54 starting shotgun shells were fired through finite reloads. A dry
  trigger produced no ammunition. Crafting shells while holding the rifle
  spent three scrap and supplied eight shells, reloaded to exactly 6 + 2.
- The rifle fired 38 rounds across a reload: 180 starting + 30 crafted - 38
  fired = 172 remaining (22 magazine + 150 reserve).
- The final ledger is 115 scrap, four components, seven fuel items, 91 HP and
  all eight structures intact. Both weapons remained finite after cold Continue.
- Exact paused Save & Quit, committed payload and durable cold state matched;
  no runtime or asset errors were recorded.

This Survival run uses simpler visuals for mechanics verification. Full-art
claims belong to the separate Foundry/Quiet lineage. Compact exact evidence is
in [the Survival report](midgame-validation/survival-summary.json).

Local validation passed all 1,486 tests across 168 files, lint, TypeScript,
production build and syntax checks for the campaign tools. The next continuity
slices are [recovery, Orchard and Meridian](../superpowers/plans/2026-09-15-late-campaign-continuity.md).
