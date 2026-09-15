# Campaign continuity evidence

These files record the low-cost logical continuity pass. The browser ran at
640×360 with `nomodel=1`, `notex=1`, muted audio and Chromium SwiftShader. This
is interaction, authority and persistence evidence; it is not art, GPU or
performance evidence.

No run seeded resources, inventory, health, facts, progression phases, world
distance or player position. The only fixture is an isolated browser profile.
Input used the visible title and campaign controls, normal keyboard actions,
catalog and recipe DOM buttons, mouse-look events through `InputManager`, and
trusted mouse presses for placement. Read-only Game state selected targets and
verified results.

## Provenance

- `baseline-opening-trap-{events,summary}` copies the deployed-main 0994f1d
  run from
  `test-results/continuity-story-main0994f1d/run-2026-09-15T10-34-20-392Z`.
  The physical opening succeeded, but two opening-owned scavengers remained
  beneath the Nomad and blocked saving. This is failure evidence for the bug
  fixed by the candidate's explicit rooftop-pursuer retirement.
- `candidate-story-{events,summary}` copies the candidate 5205 run from
  `test-results/continuity-build-clean/run-2026-09-15T11-02-16-853Z`. It proves
  physical rooftop sprint/jump, zero surviving opening pursuers, manual Save,
  Save & Quit/Continue, first reel salvage, radio recovery, Wreck One signal,
  and a second exact Save & Quit/Continue restoration.
- `candidate-first-loop-events` copies the child run
  `first-loop-1789470403504`. The runner cloned the candidate story browser
  profile before continuing, so retries and ordinary autosaves could not alter
  the accepted source checkpoint. This is one legitimate branch from the same
  durable save, not a separately seeded campaign. It proves normal placement
  of three floor plates, refinery, workbench and manual deck gun; four refinery
  crafts; turret entry; and the normally delayed tutorial boarding start.

The earlier `continuity-story-candidate/run-2026-09-15T10-47-55-042Z` profile
is deliberately excluded. An initial version of the follow-up launcher opened
its restored last page, threw before navigation because it passed a URL object
instead of a string, and immediately closed during boot. Continue was missing
on the next attempt. That run is invalid and the precise reason its save was
unavailable remains unresolved; the premature launcher failure alone does not
prove a cause. Source review found no boot-time delete or overwrite path:
SaveManager's title queries are read-only, periodic autosave cannot pass title
save admission, and new-game reset only runs after the visible New Game choice.
A clean controlled save-close-reopen pair subsequently passed. The new-story
runner now refuses to run without `--fresh`, and the follow-up runner always
works from a copied profile.

## Boarding continuation

`boarding-perfect-*` continues the first-loop profile in child
`boarding-1789473321465`, at the same 5205 origin. It uses normal pointer lock,
mouse movement and held primary fire. Low graphics, disabled authored models
and textures, and muted audio make this logical evidence, not visual evidence.

The turret hits `skiff-hook` at simulation seconds 21.183 and 22.033. The real
encounter ends at 25.05 with outcome `hook`, zero crossed boarders and
`needsRepair: false`. FirstRun completes its existing perfect-defense branch.
All eight structures survive. The sole reward event grants 30 scrap and two
components, exactly reconciling 86/1/4 to 116/3/4 scrap/components/fuel.

The runner pauses, captures `buildSave`, clicks Save & Quit, waits for the
visible boot Continue button, then reads the committed quicksave. Player,
machine, story, progression, seed and distance match the paused checkpoint.
After closing and reopening the browser, Continue restores the resources,
structures, subsystem health, FirstRun and equipment. Distance advances only
0.564 m during the ordinary post-load frames. No browser errors were recorded.
Sol reviewed the raw event ledger and save evidence.

Earlier boarding attempts remain under the first-loop evidence directory.
They exposed test-driver faults: incorrect turret angle conversion, a mouse
click signature error, too-short button holds, and a wall-time wait that ended
before the simulation spawned the encounter. `boarding-1789473099775` did
defeat two landed boarders and repair the engine for two scrap, but destroyed
the refinery through friendly fire and closed before its manual save had
committed. Its cold restore was 9.75 m behind the requested checkpoint. It is
supplementary combat/repair evidence and is excluded from the accepted lineage.
The accepted branch does not claim damaged-machine repair coverage.

## Radio Slice 2 — canonical run

Run `1789475135178` is the accepted clean Slice 2 lineage. Its compact
append-only event record is [`radio-clean-events.jsonl`](radio-clean-events.jsonl),
the committed SaveManager payload is
[`radio-clean-committed-save.json`](radio-clean-committed-save.json), and the
runner summary is [`radio-clean-summary.json`](radio-clean-summary.json). The
original raw log remains at
`test-results/continuity-radio/run-1789475135178/events.jsonl`, with phase
screenshots and the complete browser profile beside it.

The run resumed the accepted `mmf-dev-seed` boarding save, advanced through
signal and crossfire, observed a real wave-1 radio raid and `boarding:ended`,
opened the radio's visible Wreck One offer, then saved at the admissible calm
boundary. SaveManager read `quicksave`, and a cold browser restart restored
the player, machine, world, progression, seed, distance, eight structures,
FirstRun state and radio eligibility. The resource ledger ended at 216 scrap,
9 components and 4 fuel after named real loot deltas; no browser errors were
recorded. The trace remained unaccepted for Slice 3.

## Wreck One Slice 3 — canonical run

The parent run `2026-09-15T12-39-52-916Z` physically accepted the trace,
approached and docked Wreck One, crossed the gangway, and recovered exactly one
Course Gyro. Its return walk circled at the doorway; that retained failure is
runner evidence. Child run `2026-09-15T12-43-44-604Z` cloned the actual docked
gyro autosave, walked back aboard, departed through the real route UI, and
completed Save & Quit plus cold Continue. Compact records are
[`wreck-parent-events.jsonl`](wreck-parent-events.jsonl),
[`wreck-child-events.jsonl`](wreck-child-events.jsonl), and
[`wreck-summary.md`](wreck-summary.md); the committed payload is
[`wreck-committed-save.json`](wreck-committed-save.json). Raw logs remain under
`test-results/continuity-wreck`.

The child restore matched seed, health, inventory/resources (216 scrap, 9
components, 4 fuel), all eight structures, machine damage, story and the one
gyro. Destination colliders were disabled, the player was aboard Iron Nomad,
and the next route menu was reached. Live clocks and needs advance normally
and are not claimed byte-identical. The Wreck model lookup was corrected from
`relay-wreck` to the shipped `expedition-wreck` asset ID.

## Radio Slice 2 — supplementary runs

Earlier seed-mismatched Slice 2 runs are retained in
[`radio-slice2-first-run.json`](radio-slice2-first-run.json) and its original
raw log remains at
`test-results/continuity-radio/run-1789474059926/events.jsonl`. It continued
the accepted boarding profile from distance 364 m, observed signal → crossfire
→ raids, completed a real wave-1 boarding encounter, and opened the radio at
distance 2706 m. The qualifying `boarding:ended` event, durable wave count,
`radioTraceEligible: true`, and the visible `Trace Wreck One` offer are all
recorded. The run's first Save & Quit attempt failed because the harness sent
the second Escape while the panel-close pointer-lock transition was still in
flight; this is retained as harness failure evidence, not a product result.

The corrected resume run is retained as supplementary evidence in
[`radio-slice2-resume-run.json`](radio-slice2-resume-run.json), with the
committed payload separately summarized in
[`radio-slice2-committed-checkpoint.json`](radio-slice2-committed-checkpoint.json).
It cloned the first run's actual autosave into a flat profile, verified the
persisted wave-1/radio-eligible state before interaction, opened the offer,
waited for pointer lock and pause to settle, and read the committed
`quicksave` through the real SaveManager. The paused checkpoint and loaded
payload matched for player, machine, world, progression, seed and distance.
After closing and relaunching the same URL, Continue restored the same eight
structures, FirstRun state, resources (204 scrap, 9 components, 4 fuel), wave
1 and the radio offer. The trace was deliberately left unaccepted for Slice 3.

These runs used the runner's `seed=continuity-radio` query while the accepted
boarding parent was `mmf-dev-seed`; changing that saved seed means they remain
supplementary rather than canonical lineage. The later clean `mmf-dev-seed`
run is recorded above.
The initial nested-profile Continue failure is preserved in the raw run
lineage; its long profile path is the probable cause because a flat copy of
the same source loaded successfully. The first full-run Escape
failure is likewise preserved as a timing defect in the runner. The successful
flat-profile recovery was useful supplementary coverage and avoids treating
either harness issue as save loss. The resource ledger records the real raid
deltas: the prior scavenger added 14 scrap, the commander added 21 scrap and 2
components, the heavy gunner added 23 scrap and 2 components, and skiff salvage
added 30 scrap and 2 components before the final 204/9/4 checkpoint.

## Current boundary

Canonical Slice 3 ends after Wreck One departure at a cold-restored route
selection state with the player aboard Iron Nomad and one Course Gyro. Broader
Foundry, ending, Survival and full-campaign continuity remain future coverage.
