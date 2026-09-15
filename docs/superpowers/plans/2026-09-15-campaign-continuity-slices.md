# Campaign continuity slices

Status: planned and in progress. PR #16 (`6487abd`) shipped the opening-pursuer
ownership fix, caretaker stair traversal, continuity tooling, and the first
normal-input campaign checkpoints. It did not prove an uninterrupted full
campaign. These three slices continue the same Story-profile lineage instead
of substituting fixtures for unfinished play.

## Acceptance authority

The runners use visible game UI and normal keyboard and mouse input. They may
read runtime state to aim, diagnose, and record evidence, but may not assign
player position or health, resources, inventory, distance, story facts,
encounter state, FirstRun state, or save contents. Acceptance URLs must not use
`nospawn`, `nolock`, `nomenu`, or `noload`. Low graphics and muted audio are
allowed and must be recorded.

Long empty-road spans may run repeated production-order `Game.fixedUpdate(1 / 60)`
steps with fewer rendered frames. Combat, boarding, docking, interiors, repair,
and player movement remain at normal fixed-step cadence. Evidence records wall,
simulation, and accelerated-travel time separately. Acceleration stops when a
threat, prompt, story gate, player need, or save blocker appears.

Every slice starts from the prior slice's successful Game save. A runner may
copy that browser profile to protect the source checkpoint and retry from the
copy; the copy remains the same durable lineage. It must never click New Game
when asked to resume. Each checkpoint records the slot ID, save timestamp,
FirstRun and story projection, inventory totals, machine resources, built
instances, subsystem health, needs, player health, active vehicle or threat,
and pause/menu state before Save & Quit and after Continue. Exact equality is
required except for a reward, repair cost, crafting cost, enemy loot, or need
change that the event log attributes to an observed action.

## Slice 1 — tutorial boarding, damage, and repair

**Owner:** Luna `build_foundation` owns
`tools/campaign/continuity-boarding.mjs`; Sol reviews authority and evidence;
root owns production fixes.

Start from the released first-loop checkpoint containing the normally built
refinery, workbench and crewed manual turret, with the tutorial vehicle queued.
Resume through Continue. Enter the manual turret with `E`, aim through real
mouse movement at the skiff's actual world position, and hold primary fire.
Read `VehicleManager.snapshot` to verify a real hull, hook, or crew-health delta;
the encounter group's origin and scene-only fields are not valid proxies. Exit
the turret through its normal control and finish the boarders with ordinary
weapon/melee input if necessary.

Record `MachineDamage.toSave()` as its actual `{id, health}[]` array. If the
boarding damages a subsystem, walk to the subsystem's real repair point, hold
the normal repair interaction, and verify health and resource cost. If defense
is perfect, accept the no-repair branch only when `boarding:ended` and the
FirstRun durable state explicitly report that outcome; do not damage the
machine to manufacture coverage.

Capture resources immediately before boarding, after encounter rewards and
enemy loot, after each repair, and at the final save. The final restore compares
against the final saved snapshot, not the pre-fire balance. Prove Save & Quit
reaches a title state with a visible Continue action before clicking Continue,
then prove exact checkpoint restoration in a fresh page/process.

**Gate to Slice 2 (passed):** tutorial boarding is terminal, no vehicle or opening enemy
survives, the relevant repair branch is resolved, FirstRun advances through its
authoritative event, and the cold-restored checkpoint conserves all recorded
resources and machine damage. Accepted child `boarding-1789473321465` destroys
the hook through two turret hits, preserves all eight structures and completes
the perfect-defense branch. The exact 30 scrap / two component reward and
committed quicksave survive a cold browser restart; no damage was manufactured
to force a repair check.

## Slice 2 — ordinary survival, signal, and radio trace

**Owner:** a Luna runner task begins only after Slice 1 passes; Sol freezes the
interaction map and reviews evidence; root owns shared Game/Radio production
changes.

Resume the Slice 1 checkpoint and continue normal survival. Let distance,
signal, crossfire, and recurring threats advance through authoritative fixed
updates. Resolve combat with normal player, turret, build, and repair actions.
Do not mark a radio victory by calling StoryDirector or RadioRaids directly.
The runner must observe the successful encounter event and its durable wave
count before treating the radio trace as eligible.

Use physical movement and `E` to open the radio and verify its Wreck One trace
offer. Save at each naturally admissible calm boundary: after tutorial boarding
and after the qualifying radio encounter, before accepting the trace. Approach
is intentionally not saveable, so acceptance belongs to Slice 3's uninterrupted
departure-and-docking run. When saving is refused, record the displayed reason, clear it
through gameplay, and retry; do not close or mutate the blocker.

Resource verification uses an event ledger. Purchases, crafts, repair costs,
boarding rewards, raid rewards, and observed enemy drops each receive a named
delta. The ledger must reconcile with the aggregate inventory and built-storage
snapshot at every checkpoint. Needs and subsystem damage remain live during
accelerated travel and may change only by their production systems.

**Gate to Slice 3 (passed):** Clean canonical run `1789475135178`, resumed
from the accepted `mmf-dev-seed` boarding profile, visibly offered Wreck One
after a resolved ordinary raid and restored the exact Save & Quit / Continue
checkpoint and resource ledger. Slice 3 may accept the offer through the
Radio UI. Earlier `seed=continuity-radio` runs remain supplementary only.

## Slice 3 — Wreck One physical expedition and return

**Owner:** a separate Luna runner task after Slice 2; Sol reviews continuity and
claim wording; root owns expedition, destination, art, and Game fixes.

Accept the trace through the Radio UI and advance its approach through actual simulation. Do not assign travel
distance, destination phase, docking state, or player position. Verify the
arrival/docking prompt, board Wreck One by physically crossing its gangway, and
interact with the required Course Gyro through normal `E` input. Journals count
only when their in-world interaction and readable record are observed; optional
records may remain unread.

Walk back aboard Iron Nomad and use the real radio/expedition UI to depart.
Verify the destination is removed, the gangway and input contexts return to
normal, the gyro unique is present exactly once, and the campaign enters its
real post-Wreck route-selection state. Save only after the player is aboard and
departure succeeds, then cold-restore and compare the full checkpoint.

**Acceptance:** the three slices form one traceable lineage from the already
accepted first-loop save through Wreck One. Evidence identifies every copied
profile and parent checkpoint, retains failures, reports console/page errors,
and contains no direct mutation of campaign authority. This is a meaningful
campaign-continuity milestone; Quiet Array, Orchard, Meridian, Keep Walking,
Survival-profile completion, and a full-duration 8–15 hour estimate remain
unproven by these slices.

**Slice 3 gate (passed):** Parent run `2026-09-15T12-39-52-916Z` physically
accepted and docked Wreck One and recovered the Course Gyro. Child run
`2026-09-15T12-43-44-604Z` resumed that docked autosave, crossed back aboard,
departed through the route UI, and cold-restored the paused checkpoint with
the same seed, health, inventory/resources, machine pieces, damage, story and
single gyro. The destination was inactive with its colliders disabled after
departure. Live clocks and needs were allowed to advance.

## Sequencing and release

1. `build_foundation` completes Slice 1 and hands its append-only evidence to
   Sol before any later runner is implemented.
2. Root fixes only reproduced production blockers. Harness failures caused by
   stale selectors, guessed fields, or invalid profiles remain labelled as
   harness failures and are not product regressions.
3. Slice 2 starts from the accepted Slice 1 save; Slice 3 starts from Slice 2.
4. Root performs final full-art smoke, automated tests, lint, production build,
   release, and public Continue verification after the logical lineage passes.
