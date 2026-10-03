# Connected story, optional missions and playable Meridian

Native Godot implementation, 29 September 2026. The retained browser game is unchanged. The [delivery board](../superpowers/plans/2026-09-29-story-missions-and-finale-delivery-plan.md) contains the original design; this guide describes the shipped behavior and remaining playtest work.

## Play the additions

Open **Playtest checkpoints** from the title or pause menu. Starts **24–31** isolate the new content, with their exact supplies and prior outcomes shown before launch. These saves remain separate from the campaign.

| Starts | What to test |
| --- | --- |
| 24–25 | Wake dispatch and local Array comparison |
| 26 | Accept the courier request at the receiver, intercept at the helm, cross the gangway, throw the salvage hook at the yellow coupling, and connect it at the charging cradle |
| 27 | Donate at the supply relay's own console, then restart its bus |
| 28 | Isolate/cut the Order uplink locally, or insert a single decoy |
| 29–30 | Review the final operation at the helm, secure its receiver link, then resume the protected final journey; compare no help with completed mission support |
| 31 | Walk into the receiving berth, select channel B and close its isolator, connect seeds, import the archive copy, preview and confirm a communication policy, then return aboard |

**Tab** remains personal Pack/Log. Its Story so far and Optional requests entries are read-only. Accept requests at the receiver, navigate at the helm, and operate site machinery at the reached local control. **B → Place** returns directly to construction in the world. Normal bindings, close controls and objective marker preferences apply.

## Campaign placement and consequences

The story now connects five recovered discoveries and the new conclusion: damaged Wake dispatch → Foundry routing mark → Array false-corridor comparison → Orchard seeds and names → verified Meridian receiving berth → a functioning refuge channel. Each discovery has a local reader, a queued short message and a persistent personal recap with a next lead. ANNIKA's words are identified as recordings. The Array passenger-register copy describes S-07 as one of many helped travellers. It assigns neither a chosen destiny nor a secret purpose to the Nomad.

| Request | Availability | Work and exact cost | Result |
| --- | --- | --- | --- |
| A stranded courier | After Foundry, before choosing the Array course | Salvage-hook recovery and local coupling connection; no donated materials | 4 fuel items and 2 components in a finite local cache; checksum corroborates Array and berth readouts |
| Supplies for the next roof | After Array, before Orchard | 2 components + 4 fuel **items**, with exact pack/storage contributors shown; local bus restart | 8 fuel items reserved at either Orchard route's common service bay, after ordinary required recoveries |
| Quiet the watch | After Orchard, before Meridian | Free local isolate/cut sequence, or 1 decoy | Prevents the designated final link interception; unrelated patrols and active enemies remain |

Foundry departure now leaves an explicit **Continue to the Array** choice. The courier contact is on the current heading, so zero-degree steering can reach it. Later mission sweeps retain two alternative radar contacts, including eligible equipment discovery. They require receiver power and never overwrite a committed stop.

Ignore an offer and it can return later in the same chapter window. Decline to continue immediately. Starting the next main course explicitly warns that unfinished requests will expire. Abandoning a partially paid mission keeps its payment and durable work; a later service platform resumes that state. Completed courier supplies can be offered for collection again within the same window if some remain. Full bags preserve all unclaimed stock. The Orchard mission reserve is separate from the original 20-unit service pump and its scrap price.

## Final operation

At the helm, review the actual travel plan, fuel estimate, earned support and interception risk. Commitment first writes and verifies `meridian-checkpoint`; failure or an outdated proposal changes nothing. At the receiver, completed quiet-watch work consumes one named suppression receipt. Otherwise an ordinary Order skiff intercepts the link. Existing personal weapons and decoy/disengagement rules apply; there is no new boss. The carrier and crew must finish their normal lifecycle before final travel can resume.

The existing protected 400 m journey and arrival framing remain. Arrival now returns ordinary control at a raised receiving berth. The berth has independent power, supported access, readable local stations and a construction obstruction check at the Nomad gangway. A blocked passage keeps the safety gate shut until the obstruction is moved. It does not demolish player construction.

Read the maintenance reference if the courier was skipped. Select channel B, close the isolator, then perform the seed and archive transfers separately. Lamps, the isolator lever and seed trays reflect durable progress. The original Orchard core stays installed at Meridian; this station imports its transmitted copy.

At the transmitter, preview either policy before confirming:

- **Open channel:** publish a public invitation and approach instructions. Unknown travellers and hostile listeners can receive it. Personal records remain private.
- **Relay chain:** share authenticated approach instructions through maintained relays. Reach is narrower; autonomous endpoints make this possible without optional allies.

Both preserve the seeds and archive. Neither promises a worldwide rescue or secretly changes combat difficulty. The chosen beacon and response persist; R-9, courier, relay and L-12 acknowledgments depend on actual history. Credits are optional. Return aboard and use the helm to retract the gangway and keep playing.

## Saves and compatibility

Three optional version-1 blocks separate narrative knowledge, mission outcomes/remainders and detailed finale progress. Existing story uniques/objectives still own required campaign progress. Unknown IDs, invalid values, impossible stage combinations and unproven narrative facts reject before replacing the current session. Quotes detect stale local actions and donations. Repeated transfer/publication/reward callbacks cannot pay twice.

Older saves infer only story knowledge supported by their required uniques. They receive no invented optional outcomes. Old `ending-ready` campaigns can start the new sequence. Old `ending-journey`, `arrival` and `complete` campaigns retain their original ending path, with no forced new choice. Use a new playtest start to replay the expanded finale independently.

Ordinary off-machine save restrictions remain. The stationary receiving berth has a narrow exception: a supported, clear player capsule on its own collision can save settled progress. Reload reconstructs the berth, transfers, lights and supported pose. Live combat, unsafe ground, active salvage and moving mechanisms still prevent saving. Verified precommit, secure-link and berth-departure checkpoints supplement normal autosaves.

## Implementation and verification

The native overlay is applied after existing progression definitions and is idempotent; generated browser JSON is not edited. Editable geometry and colliders live in `mission_site.gd` and `meridian_berth.gd`. `mission_contracts.gd` owns costs/outcomes; `missions.gd` coordinates physical contacts; `narrative_progress.gd` owns evidence/recap; `meridian_finale.gd` coordinates the operation and local berth controls.

Run the affected suite set with:

```powershell
python -X utf8 tools/godot/run-narrative-regressions.py
```

The runner keeps prior checked-in reports intact, captures each suite separately, rejects runtime errors and records source hashes before and after each run. The rendered review is `godot/tests/narrative_native_review.gd`; it uses normal movement across the berth and normal Use/mouse input for its local controls. `narrative_delivery.gd` covers transactions and the four combinations of support/no support × Open/Relay. `narrative_edge_cases.gd` covers resumed payments, cache remainder on both Orchard routes, radar alternatives, window expiry, recap and legacy endings. The integration suite follows existing expedition dependencies and the new no-help finale; it accelerates travel/uses fixtures and is not a natural campaign playthrough.

See the [source-stamped report](results/story-missions-and-finale-2026-09-29.json) for final counts and captures. The delivery source baseline was preserved in `test-results/narrative-baseline/sources.zip`, alongside the pre-existing dirty-tree inventory. All tests use isolated campaign directories.

Refinements made during verification include preserving ordinary/gear radar choices alongside mission offers, respecting receiver power, re-offering ignored/partially completed requests, cleaning up departed platforms during main-route travel, retaining unclaimed courier supplies, preserving exact downstream reward remainders, and gating the final journey until the carrier lifecycle is finished. Existing tests were updated where they assumed cinematic-only completion or older machine-menu/power behavior; audio teardown now waits for mixer resources.

Technical checks and controlled native input do **not** establish uncoached story comprehension, final difficulty or campaign economy. Opening → Array and uninterrupted Orchard → finale human sessions, pacing measurements and human reception remain open. Prepared checkpoint resources and accelerated fixture timing are not used as evidence that the full campaign is balanced. Mission rewards and main route distances remain at their planned/existing values pending that evidence.
