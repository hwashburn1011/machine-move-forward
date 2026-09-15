# Meridian and ending continuity — accepted

The accepted parent is the Glass Orchard cold checkpoint
`run-2026-09-15T16-42-56-295Z`: tier 2, eight preserved unique facts, five
journals, 749 scrap, 38 components, 12.079 tank fuel, 51 health and ten
surviving structures. The ordinary patrol destroyed the manual gun and its
floor. No replacement, fuel, health or story state is supplied by these
validation scripts.

The Orchard cursor correction and its continuity evidence were merged in
[PR 21](https://github.com/hwashburn1011/machine-move-forward/pull/21), main
commit `84152b6d9cb9306ad051ae1d206d450c8b1805bc`. CI and Pages deployment
passed; the public site serves `index-tv9aKn5k.js`.

## Tasks and acceptance

1. Recover normal supplies before Meridian. Collect salvage with the reel,
   deposit fuel at the live generator, claim condenser/planter outputs, cook
   at the stove, and consume supplies through inventory. Preserve costs,
   engine burn, damage, needs and ordinary threats. The target reserve is
   28 fuel with both needs above 60; this is a test preparation target, not
   a new gameplay gate or a promised route cost.
2. Select and confirm Quiet Line, resolve its marked skiff, walk the full
   Meridian model, restore its transmitter/archive, read common and civilian
   records, earn the solution and tier 3, return aboard and depart. Verify
   exact durable state plus bounded elapsed changes across a cold restart.
3. Commit the final course through the Helm's two-step confirmation. Cold
   restart the committed journey, observe normal arrival and credits, choose
   Keep Walking, move and build a real floor, then save and cold restart
   again. A committed journey intentionally keeps the cursor free and locks
   movement; normal pointer-locked play must return after Keep Walking.

Sol prepared the Meridian recovery runner and reviewed the ending runner;
Luna prepared the initial ending scaffold. Root reviews source contracts,
navigation, input ownership, raw evidence and all browser execution.

## Findings so far

The initial recovery attempt stopped at the engine housing because the
driver used the center aisle all the way to the stern. The housing occupies
x=-1.4..1.4, z=4.7..7.3. The successful generator approach uses the east
service gap through `(2.15,4.05)` and `(2.15,5.75)`; both use normal walking.
Blender source bounds and the runtime solid were inspected separately.

Another attempt selected the nearest enemy in horizontal distance while it
was on the deck below. Shots hit the floor. The driver now prioritizes
enemies on the same deck and routes around the cabin. Production navigation
already has stair links; no navigation defect is established by this test.
`run-2026-09-15T17-04-13-273Z` resolved an ordinary boarding encounter and
continued real salvage/refueling, but stopped when no new salvage target
entered reach within a 50-second driver wait. This is not an accepted
Meridian route or expedition completion.

The scripts retain failed profiles and ancestry. Resource waits need to
allow ordinary gaps between salvage targets while remaining bounded and
checking threats. Water, food and repair supplies should be used before
prolonged recovery leaves the character depleted. The next run continues
the latest durable recovery save; it does not reset the campaign.

The next recovery run identified why distance had stopped advancing: the
engine was destroyed, with fuel still in the tank. Ordinary held-E engine
maintenance spent exactly 80 scrap, restored 320 engine health and resumed
travel at about 7.01 m/s. This distinguishes a damaged-engine stop from the
working emergency drive at zero fuel. Water, a cooked ration and a crafted
repair kit were also consumed normally; the kit cost 2 scrap and 2 components
and healed 25 to 65 health in the recorded recovery.

The existing Economy Governor is a useful next investment for this save:
research immediately costs 40 scrap and 8 components. The data contains a
40-second research value, but the shipped transaction does not use a timer;
this validation makes no elapsed research claim. Installation reduces fuel
burn to 55% while removing two power
capacity. The current six-unit demand fits the resulting 14 capacity.
The normal UI research/install transaction passed in
`run-2026-09-15T17-38-12-840Z`: exactly 40 scrap and 8 components spent,
no installation charge, fuel burn 0.033 per second and capacity 14 with
six demand. The next run restored the active governor from the real save.
Final slice acceptance still requires its explicit cold checkpoint comparison.

The subsequent recovery found a full-inventory cooking defect. The bag held
all 20 slots, including one water and two greens. Cooking consumes that water
and would free a slot for the ration, but `CraftingSystem` checked capacity
before spending ingredients and refused the recipe. The fix must plan the
entire exchange against cloned reachable containers and commit only when both
inputs and output fit, preserving every item on refusal. No recipe costs,
capacity or power rules change.

Salvage recovery also needs ordinary storage use: depositing fuel before
claiming water freed its slot, but continued scrap accumulation can fill the
bag again. Build a real crate and transfer surplus stacks through the storage
UI rather than discarding or changing resources through test hooks.

## Crafting correction and storage verification

The atomic exchange correction passed 1,496 tests across 169 files, lint,
TypeScript and the production build. The revised local production bundle is
`index-C14Vr-ed.js`; the ending cursor correction was added in the later
`index-BANlYU6u.js` validation build.

In `run-2026-09-15T17-52-36-083Z`, the ordinary stove UI cooked the previously
blocked ration, consuming one water and one greens for one ration. A normal
meal and crafted repair kit then restored supplies and health. The run stopped
at a test camera placement attempt across the stairwell, not at crafting.

In `run-2026-09-15T17-55-52-445Z`, normal walking to the west bow gave a clear
build view. A floor cost 8 scrap and a crate cost 15 scrap and 2 components.
Eight full scrap stacks were transferred through the actual crate UI:
player -800, crate +800, with all item totals conserved. The crate uses the
west upper deck at (-4,-2), reached around the bow so the stairs stay clear.
The test returns through the same aisle; no collision or movement rules were
changed for this path.

## Accepted Meridian boundary

`run-2026-09-15T17-55-52-445Z` passed Quiet Line using ordinary controls:
1,250 m, its marked skiff resolved, both Meridian consoles restored, common
and civilian records read, solution recovered, tier 3 earned, and physical
return aboard followed by radio departure. The defense record remains unknown.
This accepted attempt observed zero player deaths. Eight earlier retained
Meridian attempts include three observed deaths; this is a continuous save
lineage with retries, not an uninterrupted deathless campaign.

The cold checkpoint retains nine uniques, seven journals, twelve structures,
800 scrap inside the crate, 841 carried scrap, 87 components, 62 health,
22.24025 tank fuel, and the installed Economy Governor. Both producers were
full. Exact static fields, paused/committed payloads, and the cold result were
independently recomputed from raw events. During the 0.85-second cold window,
fuel fell 0.00385 and distance advanced 0.78825 m; needs changed within their
normal elapsed limits. See [accepted evidence](meridian-continuity-validation/accepted.json),
[attempt history](meridian-continuity-validation/attempts.json), and
[crafting/storage evidence](meridian-continuity-validation/crafting-storage.json).

## Accepted ending and post-ending boundary

The real Helm confirmation and committed save passed in
`run-2026-09-15T18-02-38-446Z`. Its cold restart continued the journey but
captured the cursor: `leaveTitle()` requested pointer lock before
`restoreEndingPresentation()` released it, allowing an asynchronous grant to
arrive afterward. The correction avoids that request for committed, arrival,
and credits phases while preserving ordinary available/complete entry.
The next runner resumed the recorded commitment rather than issuing another
final-course action. `run-2026-09-15T18-11-26-503Z` passed the committed cold
restart with a free cursor, reached the authored horizon after 400.0249 m,
and observed the full 12-second arrival before credits. Keep Walking restored
normal pointer-locked movement (4.4575 m) and a real floor placement costing
8 scrap. A second cold restart retained the completed ending, thirteen
structures, 800 stored scrap, 833 carried scrap, 87 components, 62 health,
20.2278 fuel and the nine unique recoveries/seven journals.

Both committed and complete cold saves were checked against their paused
payloads, including item slots, weapon equipment, upgrades, damage, storage
contents and bounded course/needs/fuel changes. See
[ending evidence](meridian-continuity-validation/ending-accepted.json).
The separate five-second [post-ending observation](meridian-continuity-validation/postending-observation.json)
confirmed normal travel, enabled raids with a decreasing raid timer, and
optional routes released from story priority with a powered helm. It does not
claim a whole additional raid or optional expedition was completed.

Final validation: 1,507 tests across 170 files, lint, TypeScript and production
build passed. Root strengthened and reran the 11 ending-input tests to ensure
Continue could not silently swallow a fixture error. The accepted ending
bundle is `index-BANlYU6u.js`. The Skip branch and independent arrival/credits
midpoint restarts remain outside this normal-input acceptance.

A separate visual follow-up remains: the Meridian docking screenshot, taken
while looking down beside the stove, showed nearby geometry filling the camera.
The route and interactions passed, but that image is not a camera-polish pass.
