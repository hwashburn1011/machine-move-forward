# Consequential optional missions: tasks

Date: 2026-09-29. Status: **CM01–CM09 implemented and technically checked; CM10 controlled review complete, continuous/human acceptance pending**. Parent: [three-feature delivery plan](2026-09-29-story-missions-and-finale-delivery-plan.md). This board develops priority 2. Use three authored contracts with explicit outcomes, not a general-purpose quest generator.

Implementation: see the [delivery guide](../../godot-port/story-missions-and-finale.md) and [source-stamped report](../../godot-port/results/story-missions-and-finale-2026-09-29.json). The task table retains the full original acceptance criteria. Automated fixtures and a normal-input berth walkthrough do not replace the uninterrupted or uncoached sessions requested below.

## Three concrete missions

Names and quantities below are initial implementation candidates, not accepted balance. Each mission offers **accept**, **leave for now**, and **decline** with honest consequences. Main campaign progress remains possible with all three declined. Only a resolved mission outcome produces its later effect.

| Contract | First window and activity | Up-front cost / reward candidate | Later consequence |
| --- | --- | --- | --- |
| `stranded-courier` / A stranded courier | After Foundry, before the Array course. Intercept a disabled service courier's raised charging platform on the current heading. Reel a supplied loose power coupling to its cradle, reconnect it locally and recover the courier's dispatch checksum. | No donated materials; the coupling is site-owned mission equipment, not a refundable build part. A finite local cache offers 4 fuel and 2 components. | Checksum corroborates the Array comparison and identifies the correct receiver channel at the final berth. Without it, a local reference diagram still solves each task. Show a later courier acknowledgment; no permanent passenger/escort system. |
| `roof-supplies` / Supplies for the next roof | After Array, before committing to Orchard. Visit an elevated supply relay, contribute the requested goods and isolate/restart its dispatch bus. | Donate exactly 2 components and 4 fuel items from the pack/aboard stores with a source preview; never siphon the tank. Commit the donation all-or-none, once. | The common Orchard return point gains an **additional mission cache of 8 fuel items**, available after the ordinary required recoveries. It has its own remaining count and visual label, separate from the existing pump stock. A relay caretaker acknowledges the contribution. |
| `quiet-watch` / Quiet the watch | After Orchard, before Meridian. Visit an elevated Order retransmitter. Physically isolate and cut its uplink, or insert one owned signal decoy through its local test port. | Physical method requires no purchased item and uses reachable local controls; decoy method consumes exactly one. Both have a clear preview and persistent completion. | One specific Order interception in the final pre-journey link-security stage is prevented. The briefing shows the jammed link and suppressed interception; no active enemy disappears and no unrelated patrol is removed. |

The courier is a robot survivor, allowing an encountered person with a practical problem without asserting that human refuge residents have been found. Its one local idle/recovery animation is enough; do not add free-roaming friendly AI. Existing R-9 and workshop content remains separate, useful and optional.

The supply relay is new mission functionality, not a replacement for R-9's three-component repair exchange. Its eight-item reserve is additional finite stock with a separately validated maximum. Existing Foundry/Orchard pump stock stays at 20 and its price stays unchanged unless later evidence justifies an explicit balance change.

## Offers, travel and abandonment

- Preserve one active physical contact and the radar's three-candidate bound. Reserve at most one candidate for an eligible authored contract; arbitrate alongside ordinary contacts and gear discovery. A committed/docked contact cannot be replaced by a story offer.
- Add an explicit post-Foundry continuation action rather than auto-starting the Array route. Offer the courier while route selection is available, within a reachable intercept distance and exactly on the current heading before steering exists. It does not require Array radar.
- After Array and Orchard, authored missions use the existing unlocked navigation/radar and predictable chapter windows. A brief receiver cue and read-only personal log establish that they are optional. The helm retains the main destination choice.
- A mission record has a fixed identity distinct from a disposable contact instance. If a signal expires before acceptance, record **missed offer**, not a completed or morally failed task. It may be offered again in the same eligible window using a fresh reachable contact placement, never by teleporting a previously visited site behind the player.
- Once accepted, durable steps survive save/load. Leaving a site before its outcome commits is abandonment: keep paid/durable steps and unclaimed local reward counts. A re-offer in the allowed chapter window resumes those steps at a clearly described follow-up service platform; it cannot collect the donation or reward again. The originally passed platform is not moved in view.
- Choosing the next main expedition closes the relevant unfinished mission window after a clear confirmation in the route preview. Do not stop a committed main route to revive a missed side mission. Expired contracts award nothing; already completed outcomes and downstream caches persist.
- Required gear contacts must retain discovery opportunities after an authored mission; do not advance their acquisition facts merely because a candidate was displaced. The optional crane/workshop and later battery/quiet-drive prerequisite order is unchanged.

## Transactions and consequences

`mission_contracts.gd` owns explicit transitions and reports. Keep finite mission flags, outcome and reward remainder separate from ordinary story uniques and `polish.seen`. Suggested lifecycle: `unavailable → available → offered → accepted → in_progress → completed`; `declined`, `abandoned` and `expired` describe actual player/window outcomes. NP02 freezes legal resume transitions and validators.

Site actions require a matching contract/contact ID, live stage, physical reach and a fresh proposal. For donations, show exact pack/storage contributors before confirming; revalidate them, stock and stage at commit. Reopening a panel, moving an item between bags, clicking twice or loading after payment cannot spend twice or receive free credit. A full downstream bag leaves unclaimed cache contents intact. Rewards use ordinary inventory capacity rules.

Effects are narrowly typed, owned by the mission record and consumed by a named later event. The quiet-watch effect is only for `finale-link-interception`; it is marked consumed atomically when that encounter decision is committed. If used, show the alternative secure-link feedback. It never cancels the Foundry/Meridian route's authored patrol, an active scout, boarding crew, recovery wait, or the main combat director's general rules.

Observational effects such as the courier checksum may be queried repeatedly without spending a reward. Physical supply claims are finite transactions. Do not represent either as a global morality/reputation score or apply invisible combat stat multipliers.

## Tasks

| ID | Deliverable / likely files | Depends on | Size | Acceptance |
| --- | --- | --- | --- | --- |
| CM01 | Freeze three mission briefs, exact windows, method/outcome matrix and candidate economy | NP01 | M | Each contract has a distinct physical activity and one visible future consequence; no mandatory upgrade, humanity claim or hidden deadline. |
| CM02 | Build pure contract state/quotes, bounded save validation and effect receipts in `mission_contracts.gd` | NP02, NP03 | M | Legal transitions explicit; preview has no effects; stale/duplicate actions and unknown IDs reject atomically; costs/reward remainders round-trip. |
| CM03 | Integrate offers with contacts/radar and the post-Foundry main-course handoff | CM02 | L | Courier reachable at 0-degree steering; all three windows arise in a continuous campaign; decline continues immediately; no committed contact overwrite, starvation or fourth radar candidate. |
| CM04 | Build/play A stranded courier, with physical coupling recovery and local checksum/cache handoff | CM03 | L | Ordinary hook/input works; no sand walking, optional crane or companion required; coupling is not duplicable inventory; help/skip both feed NS05 correctly. |
| CM05 | Build/play Supplies for the next roof and connect the finite Orchard mission cache | CM03 | L | Exact all-or-none donation once; insufficient supplies can leave safely; both Orchard approaches reveal the same eight-item remainder, independent of pump stock. |
| CM06 | Build/play Quiet the watch with physical and decoy methods | CM03 | L | Both methods reachable and readable, decoy debit exact, physical method free of item gates, only one completed outcome regardless of repeated method inputs. |
| CM07 | Integrate later visual/dialogue consequences and named finale effect consumption | CM04, CM05, CM06 | M | Player can identify which earlier act caused each effect; no active threat deletion, duplicate reward or unsupported ally claim; skipping changes no main-route prerequisites. |
| CM08 | Integrate abandonment, re-offer, partial collection and old-save migration | CM07 | M | Resume uses stable contract ID and preserves payment/reward state; expired signals do not spawn behind the machine; late old saves invent no completed mission. |
| CM09 | Add contract/accounting, scheduler, geometry and campaign tests | CM04–CM08 | L | Each mission alone/all/none, 0/12/28-degree travel, competing contacts, full bags, moved stock, duplicate callbacks, save boundaries and window closure pass. |
| CM10 | Native review and continuous-play economy/pacing refinement | CM09 | M | Observe actual discovery, travel and activity lengths; compare benefit with materials/time spent and quiet intervals. Capture physical methods and consequence recognition, not only a flags-injected test. |

## Art, UI and testing boundaries

Reuse existing raised-platform, relay and friendly-machine assets where they fit. Author only the charging coupling/cradle, dispatch bus and cut/test uplink details needed to distinguish activities. Ship editable sources/reproducible builders for new art, named collision and interaction anchors, and readable state changes. Inspect native scenes with normal player construction and both camera shoulders.

Mission previews show task, required items, route distance/fuel, advertised danger and which later effect is known. Unknown story content stays undisclosed. Local machine/NPC menus own actions; wrist notes remain read-only. Check large text, rebinding, menu closure, accidental shooting and return to Build → Place.

Initial time targets: a short courier rescue, a compact supply stop, and a slightly longer relay operation. Measure them before assigning precise durations or retuning rewards. No success claim based on accelerated headless timing or prepared checkpoint supplies alone.
