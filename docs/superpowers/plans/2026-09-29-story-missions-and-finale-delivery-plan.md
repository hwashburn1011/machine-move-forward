# Story, consequential missions and Meridian: delivery plan

Date: 2026-09-29. Status: **implemented; technical validation and controlled native review complete; continuous human playtest gates remain open**. Scope: the native Godot game. The user requested all three additions: a connected story mission chain, optional missions with lasting consequences, and a playable Meridian finale. This is a repository task plan, not a set of external tickets or background jobs.

The [recovery and operations update](../../godot-port/recovery-and-operations.md) is the starting point. Its [last technical report](../../godot-port/results/recovery-and-operations-2026-09-28.json) records 728 existing regression checks, 97 focused headless checks and 117 overlapping native checks. Those are historical implementation results, not validation of this new plan. Continuous campaign and human balance acceptance remain open.

## Implementation disposition

The [implementation guide](../../godot-port/story-missions-and-finale.md) and [source-stamped results](../../godot-port/results/story-missions-and-finale-2026-09-29.json) describe the delivered behavior and evidence. The design and acceptance criteria below remain as the original task specification.

| Tasks | Disposition |
| --- | --- |
| NP01 | Preserved a source archive and dirty-tree inventory; compatibility fixtures use isolated representative native payloads. User campaign saves were not modified. |
| NP02–NP04 | Implemented bounded save blocks and transitions, station authority, mission/contact arbitration, legacy endings and all eight focused starts; validated on a frozen runtime source. |
| NS01–NS09 | Implemented six beats, local readers/comparison, truthful conditional lines, recap, migration and regressions. |
| CM01–CM09 | Implemented all three contracts, costs, finite caches, named consequence, abandonment/re-offer, independent radar alternatives and regressions. |
| MF01–MF09 | Implemented briefing/checkpoints, interception/suppression, protected travel, physical berth, separate transfers, both policies, aftermath/continuation and regressions. |
| NP05, NS10, CM10, MF10 | Controlled native review and fixes completed for reached menus and the supported berth round trip. Uninterrupted campaign economy/pacing, uncoached comprehension and human reception remain pending; no claim of human acceptance. |
| NP06 | Delivered guide, checkpoint notes, migration policy and source-stamped reports with these limits explicit. |

No worker agents, external tasks or background jobs were created during this implementation. Existing user changes and historical reports were preserved.

## Direction and bounded scope

S-07 initially boards the Nomad to survive. He gradually chooses to help others and preserve what he finds. Keep the [established survivor direction](2026-09-25-survivor-combat-and-wrist-terminal-plan.md): scarce humans, benevolent and hostile machines, practical needs, elevated exploration, and no chosen-one assignment or secret purpose imposed on the Nomad. ANNIKA's material is recorded evidence; do not quietly turn it into a live omniscient companion. R-9 stays at his refuge. L-12 speaks only if actually recovered.

The proposed through-line is **learning which signals can be trusted, then choosing how to keep a refuge channel open**. The Array already contains the false-corridor evidence and S-07's connection to passenger transport. Stage that revelation through play and revise contradictory copy; do not present it as a new collectible or evidence that S-07 was destined to arrive. The player is helping a local network, not restoring the entire world.

Deliver three bounded packages:

1. Six linked story beats using the existing five expeditions and the new arrival. Include a concise persistent recap and conditional responses from established characters.
2. Three authored optional missions, each with one concrete later consequence. Extend existing contacts and docking rather than adding a procedural quest generator, global reputation score, crew simulation or mission currency.
3. One playable receiving berth beyond Meridian, a bounded encounter before the protected final journey, two clearly explained communication choices, and a short world-based aftermath. No new boss AI, compulsory escort navigation, timed platforming or mandatory optional equipment.

Working titles and dialogue can change during writing. The defaults in these boards are concrete enough to implement; narrative review is a production task, not a new permission gate.

## Placement in the campaign

| Point | Story purpose | Optional activity / later effect | Gameplay boundary |
| --- | --- | --- | --- |
| Opening through first defense | Preserve survival, salvage, construction and scanner teaching. Establish S-07's lack of a mission. | Existing contacts remain available under their existing prerequisites. | No added compulsory briefing or longer scan. |
| The Wake | Recover a damaged ANNIKA dispatch while operating the existing wreck equipment. Learn that civilian bearings were being altered. | An impersonal R-9 open-channel signal may establish a recurring voice; it must not claim the player has met him. | No extra paid repair or journal toll for the gyro. |
| Relay Foundry | Restored machinery reveals that the obstruction reports share an Order routing signature. The next useful comparison is at the Array. | Offer **A stranded courier** after departure, before committing to the Array. Successful help supplies a checksum used in later diagnostics. | The courier lies on the current heading: steering is still 0 degrees here. |
| Quiet Array | Physically compare the references already described by the calibration records. Understand the false corridor and S-07's ordinary connection to displaced passengers. | Introduce **Supplies for the next roof** in the post-Array travel window. | Steering/radar retain their existing unlock. Core interpretation has a local fallback if the courier was skipped. |
| Glass Orchard | Give names and seeds a practical destination; explain the difference between preserving a copy and exposing a location. | Earlier supplies produce a separate finite reserve at the common return service point. Then offer **Quiet the watch** before Meridian. | Both Orchard routes get equal access; existing 20-unit pump stocks and required recoveries remain authoritative. |
| Meridian expedition | Combine the evidence into a credible receiving-berth lead. Preview the final operation, support actually earned and possible contact risk. | Relay work can prevent one specifically designated final interception. R-9/courier acknowledgments depend on real history. | Existing transmitter, archive and solution prerequisites remain. Optional missions never gate the final bearing. |
| Final operation and arrival | Secure the link, travel the protected final leg, restore the berth's receiving equipment, transfer seeds/data, choose how to publish access information, and see the result. | Earned support changes identifiable steps, supplies or messages. | Completion works with all optional missions skipped and without L-12, crane, battery, quiet drive or automatic guns. |

## Findings that affect implementation

These are source-review findings on 29 September, not a fresh playthrough:

- [Journey](../../../godot/scripts/journey.gd) already queues briefings, reward notices and conditional L-12 lines. It drops many messages across chapters, caps the live queue and has a bounded log. Extend it; do not create a second radio/message player.
- [Campaign](../../../godot/scripts/campaign.gd) automatically calls `begin_route()` after departure when the next expedition has no route alternatives. In particular, the Foundry-to-Array gap needs an explicit **Continue to the Array** action so the courier is discoverable. It must remain immediately possible to continue the main journey.
- [Contacts](../../../godot/scripts/opportunities.gd) are eligible only in certain story phases. [Radar](../../../godot/scripts/route_chart.gd) has at most three candidates and can consume/expire them together. Mission offers need arbitration with ordinary contacts and gear discoveries, not a fourth invisible candidate or a competing scheduler.
- Before the Array, [Session](../../../godot/scripts/session.gd) permits zero steering. A lateral optional site would be unreachable. Fix the authored courier intercept geometry, not the steering unlock.
- The current ending writes a verified `meridian-checkpoint`, starts a protected 400 m journey, plays [an arrival cinematic](../../../godot/scripts/cinematics.gd), and marks completion. The playable finale must deliberately replace that completion handoff without replaying/duplicating it.
- [Save validation](../../../godot/scripts/save_validation.gd) has a closed story-phase list. [Main](../../../godot/scripts/main.gd) currently allows ordinary saves only aboard and restores `arrival` directly into the cinematic. New finale phases, safe-stage saves and load reconstruction need coordinated changes.
- [Generated definitions](../../../tools/godot/prepare.mjs) originate in the retained browser data. Native narrative additions should use a dedicated native data overlay applied once after the existing overlays, with validation and regeneration tests. Do not edit generated JSON alone or silently rewrite the separate browser campaign.
- [Checkpoints](../../../godot/scripts/playtest_checkpoints.gd) currently have 23 stable IDs. Preserve their identities, isolated saves and exact generated inventory previews.

## Shared architecture and contracts

One integrator owns changes to `session.gd`, `save_validation.gd`, `main.gd`, `campaign.gd`, `ui.gd`, `journey.gd`, `opportunities.gd`, `route_chart.gd`, `combat.gd` and `playtest_checkpoints.gd`. Feature modules propose actions and expose reports; they do not each mutate another subsystem's state.

Implemented feature modules (the integration coordinator also adds `missions.gd`):

| Module | Responsibility |
| --- | --- |
| `native_narrative_data.gd` | Known beat/mission/finale IDs, localized-ready text keys, conditions, rewards, effect definitions and native copy overrides. |
| `narrative_progress.gd` | Pure knowledge/beat eligibility, recap and migration; no direct UI or encounter spawning. |
| `mission_contracts.gd` | Explicit mission transitions, costs, exact reward remainder and later-effect receipts. |
| `mission_site.gd` | Reached physical interactions and bounded mission visuals on supported sites. |
| `meridian_finale.gd` | Finale stages, local controls and integration requests; uses existing combat, travel and save authorities. |
| `meridian_berth.gd` | Receiving-berth scene, collision, interaction anchors and persistent aftermath presentation. |

Store optional versioned native save blocks for narrative knowledge, the three mission records and finale progress. NP02 must freeze exact field names and enum lists before parallel implementation. Bound IDs and collection sizes. Distinguish **eligible**, **offered**, **accepted**, **action completed**, **outcome committed**, **reward remaining**, **effect consumed**, and **message shown**; a displayed line is never the authority for a reward or gameplay fact. Current story uniques/objectives remain owned by campaign.

Actions must revalidate physical reach, active site identity, prerequisites, current revision, safety and exact cost. A stale or repeated callback has no side effects. Stage/outcome/reward/effect updates commit together. A partial cache claim decreases only the successfully transferred quantities; full bags do not destroy rewards. A pending consequence never grants materials every time its visual is rebuilt.

The wrist remains personal Pack/Log and may show mission progress or a recap. Accept/decline transmissions at the receiver; select routes at the helm; act on machinery at its own panel; converse at a reached character. A read-only record must not become a remote service, mission-payment or generator-control button. Build → Place keeps returning to the world.

Use fixed simulation time for holds and encounter timing. Dialogue waits through fighting, cinematic handoffs and critical interaction prompts, then resumes in a valid context. Core directions also remain readable locally. No quest deadline advances during a paused menu, and no dialogue queue overflow can remove a required interaction.

New content respects construction, cargo and encounter identity. Reserve only new authored clearances; do not delete old player construction. Never reset owned stores or tank fuel when spawning a mission. Existing enemies, carriers, grapples and scripted patrols must resolve normally. Recovery remains accessible before commitment and after combat; accepting a mission is not a way to clear threats.

## Save compatibility and ending policy

- Older campaigns default to no new optional outcomes. Map only facts proven by existing uniques, journal IDs and R-9 repair state. Do not invent a courier rescue, donation, patrol suppression, reward claim or a heard conversation.
- Use one short chapter-appropriate recap for a mid-campaign save; do not force completed areas to replay newly staged story beats.
- A legacy `ending-ready` save can begin the expanded finale. A legacy already committed `ending-journey`/`arrival` save completes its original path safely. A legacy `complete` save stays complete. Offer the new finale through a separate playtest/replay start without changing the original campaign's outcome.
- The existing protected 400 m ending journey stays protected. Any new authored interception occurs in an explicit **pre-journey link-security stage**, announced before commitment, never by removing the general sanctuary guard.
- Keep the synchronous verified precommit checkpoint before irreversible state changes. Reject commit if it fails. Normal autosave queue acceptance is not proof of a durable checkpoint.
- Save safe finale boundaries aboard. To support a save inside the new berth, add a narrow `safe_at_finale_berth` policy only for a verified, stationary authored platform with settled mechanisms, no threats and no active input hold. Keep other off-machine restrictions unchanged. Validate the saved platform/pose and rebuild support before restoring the player. If this support is deferred, the implementation must explicitly retain only aboard saves and disclose the lost granularity; it must not claim arbitrary mid-finale resume.

## Task boards and delivery order

There are **36 tasks: 10 story, 10 optional-mission, 10 finale and 6 shared tasks**. Implementation and task disposition are recorded below. S/M/L denotes relative scope, not elapsed time.

- [Connected story — NS01–NS10](2026-09-29-connected-story-tasks.md)
- [Consequential optional missions — CM01–CM10](2026-09-29-consequential-missions-tasks.md)
- [Playable Meridian finale — MF01–MF10](2026-09-29-playable-meridian-finale-tasks.md)

| Batch | Work | Exit condition |
| --- | --- | --- |
| 0: baseline and contracts | NP01; NS01, CM01, MF01; then NP02 | Story continuity, mission windows, consequence matrix and finale state diagram agree. |
| 1: shared foundation | NP03; NS02, CM02, MF02 | Validated optional saves, event hooks and migration exist without changing old campaign outcomes. |
| 2: first connected slice | NS03–NS05; CM03–CM04; start MF03–MF04 | Play Wake → Foundry → courier or skip → Array with normal controls and understandable leads. |
| 3: consequences and later chapters | CM05–CM08; NS06–NS08; MF05–MF08 | Donation and relay work visibly pay off; all-skipped route reaches the complete playable finale. |
| 4: combined validation | NS09, CM09, MF09; then NP04 | Save/transition/economy/interface tests and all focused starts pass on one source revision. |
| 5: refinement and handoff | NS10, CM10, MF10; NP05 → NP06 | Native captures and continuous-play findings drive fixes; human acceptance is separately recorded. |

This planning pass starts no worker agents. If later implementation is explicitly delegated, the story data/pure eligibility, mission domain logic, and berth scene are independent workstreams after NP02. Shared runtime files remain with the integrator. Keep GPU captures, physics playtests, art imports and performance runs serialized; do not interrupt a user's game session.

## Shared task board

| ID | Deliverable | Depends on | Size | Acceptance |
| --- | --- | --- | --- | --- |
| NP01 | Preserve current source, dirty-tree inventory and copied representative saves; audit reachable integration points | None | S | Record actual baseline source hash, live phases and 23 checkpoint IDs. Preserve all existing user work and campaign saves. |
| NP02 | Freeze narrative IDs, ownership, mission windows, cost/effect and finale/save contracts | NP01, NS01, CM01, MF01 | M | One consistent registry/state diagram; no circular unlock, optional hard gate, ambiguous effect recipient or double reward authority. |
| NP03 | Integrate validated save blocks, read-only reports, action dispatch and opt-in recorder events | NP02 | L | Atomic rejected loads/actions; old saves retain progress; modules use existing message/contact/save systems; no per-frame disk writes. |
| NP04 | Add named focused starts and run combined technical regression | NP03, NS09, CM09, MF09 | L | Exact displayed state, independent restart/save/return, stable original 23 IDs and unchanged campaign library; all-skipped and supported finale paths both work. |
| NP05 | Observe continuous routes, normal input, accessibility and representative performance; fix demonstrated problems | NP04, NS10, CM10, MF10 | L | Opening → Array and Orchard → ending observed continuously; record coaching, resource use, stale dialogue, delays and frame behavior. At least one uncoached human session before claiming comprehension/balance acceptance. |
| NP06 | Deliver implementation guide, task disposition and source-stamped evidence | NP05 technical evidence; human evidence when available | S | Distinguish implemented, automated, controlled native, continuous and human results. Keep unperformed gates open and document migration/replay behavior. |

## Focused starts to append

These eight IDs are implemented as starts 24–31. Do not renumber 01–23. Payload generation must be the single source of previews and launch state, including paid/remaining rewards, seen/unknown evidence and effect receipts.

| ID | State to prepare | Work deliberately unfinished |
| --- | --- | --- |
| `story-wake-link` | Normal Wake loadout, no prior personal R-9 relationship | Dispatch and gyro activity |
| `story-array-comparison` | Array-ready equipment, courier skipped | Calibration/evidence comparison and required recoveries |
| `mission-courier` | Post-Foundry, zero steering, aligned contact; ordinary campaign stock | Accept, physical rescue and checksum handoff |
| `mission-supply-relay` | Post-Array, exact donation stock plus ordinary supplies | Donation and relay repair; no downstream reserve claim |
| `mission-watch-relay` | Post-Orchard, one decoy, no earned suppression | Relay visit, physical method choice and later token use |
| `finale-no-support` | Final-bearing essentials only; no optional gear, ally outcomes or suppressions | Entire expanded finale and final choice |
| `finale-supported` | Explicitly completed three contracts plus repaired R-9 relay; outcomes shown as fixture history | Finale, cache collection and final choice |
| `finale-transfer` | New berth safely moored, link secured, normal required archives/seeds | Receiving equipment, transfer and communication choice |

These eight starts bring the selector to **31**. Low-fuel, full-bag, stale-save and interruption cases belong in deterministic test fixtures rather than multiplying user-visible presets. Initial checkpoint items are curated test loadouts, not proof of campaign affordability.

## Combined acceptance and scope controls

Run focused domain/restore tests first, then affected story, expedition, contact, recovery/operations, construction, controls, autosave and checkpoint suites. Repeat runtime measurements only after a relevant change or failure. Preserve old source-stamped results and record new evidence separately.

Essential cases: no optional help; each mission alone; all help; each Orchard/Meridian route; L-12 absent/present; receiver off; insufficient donation supplies; full bags and partial claims; late offers; declined/abandoned missions; save/load at every permitted stage; stale UI actions; duplicated callbacks; old pre-ending/committed/completed saves; failed durable precommit save; damaged or missing machinery; obstructed authored access; recovery during a pending final operation; and repeated completion/replay without campaign reward duplication.

Story comprehension, interest, mission length and supply values are hypotheses until observed. Preserve quiet travel/build time and do not retune all route distances or rewards as part of this content patch. Record targeted changes justified by playtests. Finish one connected slice before commissioning extensive new art or voice work.
