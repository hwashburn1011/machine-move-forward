# Connected survivor story: tasks

Date: 2026-09-29. Status: **NS01–NS09 implemented and technically checked; NS10 controlled review complete, continuous/human acceptance pending**. Parent: [three-feature delivery plan](2026-09-29-story-missions-and-finale-delivery-plan.md). This board develops priority 1 and supplies context to the [optional missions](2026-09-29-consequential-missions-tasks.md) and [finale](2026-09-29-playable-meridian-finale-tasks.md).

Implementation: see the [delivery guide](../../godot-port/story-missions-and-finale.md) and [source-stamped report](../../godot-port/results/story-missions-and-finale-2026-09-29.json). The task table retains the full original acceptance criteria. Automated fixtures and a normal-input berth walkthrough do not replace the uninterrupted or uncoached sessions requested below.

## Player experience

The player should be able to explain: what was just learned, why the next destination matters, and what S-07 personally chose to do. Retain a small cast: S-07, ANNIKA's recorded words, R-9, optional L-12, and recognizable Order routing announcements. An Order announcement is a repeating institutional protocol, not proof of a new sentient villain who knows every player action.

Deliver information through physical discoveries and short responses around existing mechanisms. Reading every optional journal must not be required to follow the main motivation. Preserve required records that already gate existing equipment until the relevant task explicitly revises and tests them. The player can replay delivered narrative lines from the personal Log; that log has no machine controls.

## Beat sheet and knowledge boundaries

| Beat | Player action | New understanding and next lead | Conditional response |
| --- | --- | --- | --- |
| `wake-dispatch` | Recover the gyro through existing wreck activity and inspect the exposed dispatch carrier | ANNIKA attempted to keep a civilian route open; Foundry equipment can read the damaged routing mark | R-9's broadcast is impersonal unless the player actually met him. |
| `foundry-routing-mark` | Finish the gantry/recovery activity and locally compare its service output with the dispatch | The same Order rule calls travellers obstructions; the Array offers an independent reference | A previously repaired R-9 relay can acknowledge a comparison request. Missing help has a local readout. |
| `array-false-corridor` | Physically align the existing port/starboard instruments and inspect the resulting route comparison | The advertised corridor was false; surviving records connect S-07 with carrying passengers, without assigning him a destiny | Courier checksum corroborates one reading. Without it, a fixed maintenance reference provides the same required inference. |
| `orchard-names-and-seeds` | Restore the two existing isolators and recover their contents | The cargo represents particular lives and a practical chance to help a receiving refuge | L-12 can comment if recovered; R-9 can respond if known. Both absent still leaves the local testimony complete. |
| `meridian-trusted-bearing` | Restore the transmitter, install the existing core and recover the existing solution | Evidence supports a real receiving installation, but does not prove who remains alive there | Recap actual assistance and what it changes; do not promise nonexistent allies or imply optional work was mandatory. |
| `berth-keep-the-channel` | Complete the final transfer and communication choice | A small refuge can function again; the player decides how new travellers can find it | Show only earned callbacks and one clear result of the choice. No claim of worldwide victory or extinction. |

The first three beats are the initial implementation slice. Content should add a purpose to interactions already being performed, rather than six additional collectable keys. A new evidence panel is local to its instrument, has readable feedback and an obvious return to play, and cannot silently finish an unfinished machinery activity.

## Presentation and content rules

- Draft approximately two to four concise lines per exchange as an initial target; judge interruptions and comprehension through play. Full records remain available for interested players. Text/subtitles are sufficient for first delivery; paid voice production is outside scope.
- Mark archive playback clearly. Never have an old recording answer a new player choice. An automated stored branch may acknowledge a matching checksum only if labelled as such.
- Classify lines by knowledge prerequisites, speaker availability, stage, priority and replay policy. Queue critical context without interrupting aiming, threats, construction placement or a local hold; expire incidental chatter when its context no longer applies.
- Persist whether a fact was learned separately from whether its line finished displaying. Restore an interrupted critical message once or provide a recap; do not repeat rewards or fill the log with the same opening sentence.
- The personal recap contains a short current lead, relevant discovered facts and the next physical station. Unknown outcomes remain unknown. In-world objectives continue through the existing guide/marker settings.
- Old saves may infer only specific existing required knowledge proven by their durable facts. Skipped new staging receives a brief neutral recap. Do not mark all new records as read or introduce new mandatory visits behind a completed chapter.
- Reconcile existing lines addressing S-07 on a protected list with the survivor direction. Being one of many helped travellers is compatible; a predestined chosen machine or a secretly assigned Nomad mission is not.

## Tasks

Owners describe file responsibility, not currently running agents. The integrator applies all shared-runtime edits.

| ID | Deliverable / likely files | Depends on | Size | Acceptance |
| --- | --- | --- | --- | --- |
| NS01 | Audit existing chapter/journal/ending copy and write the six-beat continuity sheet; list intentional copy replacements | NP01 | M | Each beat has an action, inference, next lead and speaker knowledge limits. Distinguish shipped facts from proposed additions; no human identity or ANNIKA survival invented as established fact. |
| NS02 | Implement native narrative definitions and pure beat eligibility/recap in `native_narrative_data.gd` and `narrative_progress.gd` | NP02, NP03 | M | Known IDs and prerequisites validated, ordering deterministic, preview pure; overlays applied once and survive regeneration of base definitions. |
| NS03 | Stage the Wake dispatch in the existing wreck recovery sequence | NS02 | M | Reachable via normal input; gyro remains obtainable with normal opening resources; the Foundry lead is understandable even if optional records are skipped. |
| NS04 | Stage Foundry comparison and short Order protocol response around completed recovery machinery | NS03 | M | Physical action changes a visible/readable result, no duplicate required hardware or new payment; no response falsely assumes an R-9 visit. |
| NS05 | Stage Array evidence comparison and S-07 revelation through existing alignment controls | NS04, CM04 | L | Helped and skipped courier paths both complete. Actuator/recovered archive and required calibration remain authoritative; next Orchard lead follows from evidence. |
| NS06 | Write/stage Orchard and Meridian connective beats and finale setup | NS05, MF01 | M | Both route variants preserve their testimony; seeds and memory have a concrete receiving purpose; the exact final risk/support preview matches planned gameplay. |
| NS07 | Integrate conditional R-9/L-12/courier callbacks with existing `journey.gd` queue and mission receipts | NS02, CM07 | M | Correct speaker availability, no live answers from archives, cross-chapter important messages survive, stale incidental chatter drops, duplicate delivery does not duplicate facts. |
| NS08 | Add read-only current-story recap, replay and marker handoffs; integrate native-save migration | NS05, NS06, NS07 | M | Log remains personal, critical directions survive missed audio/text, controls rebind and text scales; mid-campaign migration skips no unfinished required activity and forces no backward travel. |
| NS09 | Add content validation, knowledge/queue/migration and expedition integration tests | NS03–NS08 | M | Exercise missing allies, reordered callbacks, interrupted text, old saves, optional-record skipping and both routes; existing objective and story tests keep their behavioral meaning. |
| NS10 | Review native delivery and an uncoached Wake → Array slice; refine writing and placement | NS09 | M | Observe whether the player can name the current lead and why they care without prompting; record confusion/interruptions and actual fixes. Human gate stays pending if no participant is observed. |

## Evidence and completion

Technical acceptance includes replay without side effects, malicious/unknown IDs rejected atomically, speaker knowledge tests and actual use of the reached scene controls. Native captures cover a discovery, comparison panel and large-text personal recap, including closing back to shooting/building without leaking a click.

Story acceptance needs an uninterrupted slice as well as focused checkpoints. Do not count a test that directly injects every knowledge flag as evidence that the player can discover the story. Keep a short copy change log with reasons so later mission/finale dialogue does not regress established facts.
