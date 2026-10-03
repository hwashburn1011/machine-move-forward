# Playable Meridian finale: tasks

Date: 2026-09-29. Status: **MF01–MF09 implemented and technically checked; MF10 controlled review complete, continuous/human acceptance pending**. Parent: [three-feature delivery plan](2026-09-29-story-missions-and-finale-delivery-plan.md). This board develops priority 3. It changes the current cinematic-only completion into a bounded playable arrival while retaining existing Meridian prerequisites and a safe continuation afterward.

Implementation: see the [delivery guide](../../godot-port/story-missions-and-finale.md) and [source-stamped report](../../godot-port/results/story-missions-and-finale-2026-09-29.json). The task table retains the full original acceptance criteria. Automated fixtures and a normal-input berth walkthrough do not replace the uninterrupted or uncoached sessions requested below.

## Outcome and limits

The proposed payoff is a functioning receiving berth: restored power, viable seeds transferred into care, and the recovered records available to future travellers. This resolves a local action. It neither proves humanity extinct nor announces that the whole world is saved. Human survival remains possible without requiring a new human cast or silently identifying the current ambiguous radio sender.

ANNIKA is represented by the archive already recovered. R-9 responds from his own location if his relay was repaired. The courier and relay caretaker respond only to completed contracts. Optional L-12 stays with the player under existing companion rules. The new berth may use one fixed maintenance robot, with no escort/pathfinding dependency.

The physical Orchard core was already installed at Meridian under existing progression. At the receiving berth, import its transmitted archive copy; do not require the player to remove an installed core or grant a duplicate core item. Treat the preserved seeds' transfer as a story transaction with persistent physical presentation, not sellable reward duplication.

## Playable sequence

| Stage | Player action and world response | Completion / recovery rule |
| --- | --- | --- |
| `briefing` | At the helm, review destination, actual operating plan/fuel, remaining required work and earned support. State that an Order link may need securing before the final protected travel leg. | Existing solution and safe-aboard guards apply. Player may postpone, service/build, or finish an already active optional stop. |
| `committed` | Explicitly commit after a successful synchronous `meridian-checkpoint` write. Freeze a proposal containing relevant mission outcomes and operation revision. | Failure or stale proposal changes nothing. Mark commit and effect receipts together after success; do not confuse queued autosave with durable completion. |
| `secure-link` | Use the receiver's own final-link control. Without quiet-watch help, one announced existing skiff interception can occur in ordinary Nomad space. Resolve through existing combat or supported disengagement; no new boss or infinite waves. With quiet-watch completed, visibly block that uplink and skip this exact spawn. | This is before `ending-journey`. Never remove the global sanctuary guard. Existing carrier/crew/grapple lifecycle must finish; no despawn on menu or story-stage switch. Recovery remains pending until genuinely safe. |
| `protected-travel` | Resume the previously reviewed viable configuration and travel the existing 400 m final leg. | Existing ending sanctuary remains. No timer kills the player; damaged/no-fuel machines retain normal service/recovery paths. |
| `moor` | Short optional/reduced-motion arrival framing, then restore the ordinary camera and controls at a stable berth connected by an authored gangway. | Cinematic completion advances to playable berth state, not `story.complete`. Do not deploy or retract with obstructed access or a stranded player. |
| `restore-receiver` | Cross the gangway, align the receiving coupler and operate its local isolator. Lamps and conduit states change visibly. | Captive berth power and local controls work without optional Nomad upgrades. Courier checksum labels the correct channel; a nearby maintenance reference is the complete no-help solution. |
| `transfer` | Connect the seed enclosure, import the Meridian archive copy and verify their separate readouts. | No purchased mission materials or timer. Each substep persists; interrupted motion settles/reconstructs safely. Seeds and records cannot be awarded, spent or acknowledged twice. |
| `publish-access` | At the berth transmitter, preview and confirm Open channel or Relay chain. Preserve the archive in both cases. | No automatic default on close/back/load. Choice is durable after explicit commit and can be replayed only in an isolated checkpoint or from the preserved precommit save. |
| `aftermath` | Show planted/preserved seed trays, restored lamps, the published channel state and truthful short callbacks. Return to normal movement. | No mandatory ending speech loop. Existing credits are retained and can be dismissed without resetting progress. |
| `complete` | Return to the Nomad when ready; normal post-campaign travel/optional play remains available. | Berth visit does not trap the player. Do not restart the finale or reissue caches on load, revisit, credits close or subsequent travel. |

`briefing`/`secure-link` etc. are proposed internal finale stages, not a decision to scatter all of them into `story.phase`. MF02/NP02 must define the minimal top-level phases needed by session, validation, saving and threat scheduling. `finale` owns its detailed stage. Existing code that special-cases `arrival` and `complete` must use the agreed mapping.

## Final choice and visible consequences

| Choice | What the player is told before confirming | Immediate and persistent result |
| --- | --- | --- |
| **Open channel** | Publish a public invitation and safe approach instructions. It may reach isolated unknown travellers and can also be heard by hostile machines. Do not publish identifiable residents' records. | Public beacon lights and receiver status become active; a brief unidentified request may arrive. Epilogue acknowledges wider reach and uncertainty. No surprise combat immediately after the choice. |
| **Relay chain** | Keep the berth's exact approach private and distribute challenge/response instructions through the maintained relay network. Reach is narrower; unknown isolated travellers may take longer to connect. | Directed link lamps and authenticated-request status become active. Helped relays acknowledge if present; an existing autonomous endpoint supplies a valid path even when every optional contract was skipped. |

Neither is labelled the good ending. Both preserve the same required seeds and archive and allow continued play. This patch implements visible communication states and a bounded response, not a hidden global faction simulation or a permanent difficulty multiplier. Do not promise later raids or rescued populations that are not actually implemented.

## Support and no-support behavior

| Prior action | Exact benefit | Baseline without it |
| --- | --- | --- |
| Courier restored | Correct receiver channel is identified by checksum, with a recognizable courier callback | Read the local reference and perform the same accessible alignment. |
| Supply relay completed | Eight finite fuel items were available at Orchard; remaining cache claims obey their original site rules | Standard supplies, existing service stations and emergency recovery. No fuel appears by magic at the finale. |
| Quiet-watch uplink disabled/decoyed | Consume the effect once to prevent `finale-link-interception` | One ordinary skiff event, resolvable with standard personal weapons or existing supported escape rules. |
| R-9 relay repaired / L-12 recovered | Contextual acknowledgment and presence under existing availability rules | Local narration/readouts deliver every necessary instruction. |

No optional benefit removes an existing mandatory expedition patrol, grants story hardware, or alters current weapon damage/ammunition rules. The baseline must be playtested with an ordinary modest build. A checkpoint with every gun and resource is insufficient evidence of fairness.

## Persistence, recovery and physical safety

Use a versioned bounded finale save block: stage, durable substeps, selected publication policy, commit/completion receipts and legacy disposition. Freeze exact fields in MF02. Do not serialize scene nodes, active hold durations or transient enemy objects. Validate invariants, e.g. an outcome cannot precede both completed transfers.

Before commitment, preserve the current verified checkpoint order and reject if the player is off-machine, threatened, using the deck gun or in a transient mechanism/salvage action. New pending combat is owned by one encounter receipt. Saving is unavailable during the live fight as today; loading a pre-fight safe checkpoint recreates the authored encounter once, without duplicating loot or consuming the suppression twice.

At the receiving berth, save only at settled safe boundaries under the explicit platform policy in the parent plan. Rebuild the correct scene/platform and completed machinery before restoring player pose, then clear input holds and camera transitions. A failed safe-stage write retains the last verified checkpoint and reports the failure without falsely claiming durability.

Old `ending-ready` saves can enter the new sequence. Old `ending-journey`/`arrival` saves preserve their original ending disposition; old `complete` saves remain complete. Use a dedicated isolated replay start for players who want the new content. No migration retroactively picks a publication policy or invents mission help.

The authored berth needs fixed colliders, continuous elevated access, a supported turning area and a return path usable with the default capsule. Test player-built overhangs/walls at the Nomad docking edge. Block deployment with a clear instruction or choose a validated alternate anchor; do not demolish player construction or teleport through it. No moving coupler or seed carrier may sweep through the player.

## Tasks

| ID | Deliverable / likely files | Depends on | Size | Acceptance |
| --- | --- | --- | --- | --- |
| MF01 | Freeze finale beat/stage/outcome sheet and continuity with Meridian core installation | NP01 | M | All-skipped path, two policies and concrete aftermath are specified; no secret mission or new definitive human identity required. |
| MF02 | Implement pure finale transitions, bounded validation and legacy migration | NP02, NP03 | M | Stage invariants and idempotent receipts hold; legacy committed/completed campaigns remain intact; failed restore is atomic. |
| MF03 | Integrate briefing, durable precommit write, operation proposal and safe-stage save/load mapping | MF02 | L | Failed save/stale context changes nothing; correct scene restored before pose; queued autosaves are not treated as verified checkpoints; safe berth exception narrowly validated. |
| MF04 | Build and walk-test the receiving berth, docking connection and local equipment | MF02 | L | Supported round trip with default controller and varied construction; new art has editable source/builder and named anchors; captive power and obstruction guards work. |
| MF05 | Integrate one pre-journey interception and quiet-watch suppression, followed by protected travel | MF03, CM07 | L | Exactly one designated event or one consumed suppression; ordinary fight/escape works; no active enemy deletion, stacked waves or changes to the protected 400 m leg. |
| MF06 | Implement receiver restoration and separate seed/archive transfer activities | MF04, MF05, NS06 | L | Real reached controls and visible changes; both checksum/fallback solutions work; partial progress restores without duplicating core/seeds or trapping the player. |
| MF07 | Implement policy preview/confirm, persistent physical aftermath and conditional callbacks | MF06, NS07 | M | Both choices show understandable reach/privacy tradeoffs, neither destroys archives; back/close selects nothing; truthful callbacks and no unsupported world-simulation promises. |
| MF08 | Integrate cinematic handoff, credits, continuation, replay and cleanup | MF07 | M | Arrival returns control instead of prematurely completing; post-campaign travel resumes; completed saves/replay do not duplicate mission rewards or leave stale cameras, threats, colliders or UI. |
| MF09 | Add finale transition/restore/encounter/access regressions and minimal-loadout fixtures | MF03–MF08 | L | Both policies × help/no-help × existing route variants; failed checkpoints, old saves, full bags, low fuel, absent optional gear and interrupted activities pass. |
| MF10 | Native normal-input and continuous Orchard → finale review; tune duration and difficulty | MF09 | L | Demonstrate modest-build completion, understandable final choice and satisfying visible payoff; measure stalls and capture large text/camera handoffs. Human reception remains pending until observed. |

## Acceptance evidence

Keep screenshots/video for the earned-support briefing, surviving or preventing the announced interception, ordinary walking across the gangway, both transfer substeps, each publication preview and persistent aftermath. Tests must include failures and reloads, not only a directly injected completed state.

Finish with one continuous Orchard → Meridian → expanded finale run using campaign-earned supplies, and an all-optional-skipped run with standard personal weapons. Compare time spent travelling, fighting, reading and interacting; preserve room for quiet observation. Retain the existing technical regression suite and record human feedback separately from automated or assisted evidence.
