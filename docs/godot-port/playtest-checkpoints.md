# Playtest checkpoints and separate equipment menus

Open **Playtest checkpoints** from the title screen or **Escape → Playtest checkpoints** during play. Select a starting point on the left, review the supplies and previous milestones on the right, then choose **Start fresh checkpoint**.

These are suggested progression loadouts, not snapshots of your own campaign. Each destination keeps its current puzzles, journals, recovery tasks and departure requirements unfinished, except for the explicitly recovered shard in the Array comparison preset. Completed earlier expeditions supply their required components and records. Player health starts at 100%; the two emergency presets deliberately remove supplies or damage machinery. Normal damage, costs, power and combat rules still apply.

The [five-priority update](five-priority-update.md) adds material pins, recent-build undo/copy, physical expedition controls and a smaller wrist computer. Enable **Record playtest timings locally** in the selector to collect optional timing/resource observations; **Escape → Export playtest timings** writes the report locally. Recording is off by default, and every checkpoint load starts a separate segment.

| Start | What to play |
| --- | --- |
| First steps aboard | Post-opening salvage, construction and receiver repair; unopened cutter locker |
| Receiver ready | Scanning, refinery and workbench use |
| The intercepted signal | Crossfire sequence and subsequent defense preparation |
| First boarding defense | The actual tutorial skiff and deck gun |
| The Wake | Wreck exploration and course gyro recovery |
| Foundry route choice | Direct patrol route or quiet detour, including travel |
| Relay Foundry | Local recovery equipment and both specialist components |
| The Quiet Array | Calibration, actuator and archive recovery |
| R-9's refuge | Component exchange and relay repair |
| Shared rooftop workshop | Restore power, build the upper access route and search the workshop |
| Scout encounter | Detection, combat, steering and decoys |
| Recovery gantry | Crane recovery, installation and heavy cargo |
| Glass Orchard: caretaker | Caretaker route; only the route-restored port isolator is complete |
| Glass Orchard: cold vault | Cold-vault route; only the route-restored starboard isolator is complete |
| Silent substation | Battery recovery and backup power |
| Screened relay | Quiet-drive recovery and travel comparisons |
| Meridian: quiet line | Civilian records, transmitter and archive |
| Meridian: cordon gap | Defense records, transmitter and archive |
| The final bearing | Final commitment, journey and arrival |
| Emergency — empty supplies | Zero tank and owned supplies, with the original engine and generator retained |
| Emergency — destroyed machinery | Zero tank/supplies, destroyed engine and no generators; recover using the service port |
| Engineering — generators stopped | Healthy machinery deliberately switched off; restart through local controls |
| Engineering — Foundry equipment | Two generators, refinery, collector and both gun types; compare operating modes |
| Story — Wake dispatch | Recover the gyro and review the connected Foundry lead |
| Story — Array comparison | Shard recovered; compare the references locally while the other Array tasks remain |
| Mission — stranded courier | Post-Foundry aligned intercept; recover the supplied coupling with the salvage hook |
| Mission — rooftop supplies | Post-Array donation and dispatch restart; later reserve awaits at Orchard |
| Mission — quiet watch | Post-Orchard physical uplink cut or one-decoy alternative |
| Finale — no optional support | Modest ordinary equipment; no optional guns, modules, allies or mission outcomes |
| Finale — mission support | All three completed contracts and repaired R-9 relay; publication remains unchosen |
| Finale — receiving berth | Link and journey complete; local restoration, both transfers and publication unfinished |

The first start has the campaign's 260 scrap and generator with 60% fuel. Later campaign starts have a refinery, workbench, cutter, 85% fuel, 12 fuel items, three repair kits, two decoys, and materials scaled with prior expeditions: 260 + 40 per completed expedition scrap and 16 + 4 components. Defense and later presets include the manual deck gun. Post-Orchard presets include the recovered crane. Both firearms retain the game's full starting magazines and unlimited reload supply. The four appended engineering/recovery starts deliberately adjust those defaults as shown above; later heavy-equipment starts use Cruise to preserve navigation power. The selector lists the actual generated inventory, engine condition, operating mode and installed equipment. See the [engineering and recovery guide](recovery-and-operations.md) for controls and exact assistance rules.

## Saves and restarting

The eight story/mission/finale starts are documented in the [delivery guide](story-missions-and-finale.md). The no-support finale uses 80 scrap, 8 components, 8 fuel items, 2 repair kits and 1 decoy, with an 85% tank and ordinary refinery/workbench equipment. It excludes the prepared deck gun, crane and workshop history. These are explicit testing supplies, not evidence of uninterrupted campaign affordability. Mission/history/outcome previews come from the exact same payload used to launch each checkpoint.

- **Escape → Restart this checkpoint** resets the active preset, including during combat or after damage.
- **Escape → Save playtest** saves progress for **Continue this playtest** in the selector. The regular automatic save interval also applies.
- Playtest saves live in `user://campaigns/playtests/<checkpoint-id>/`. Each preset has a separate library; the normal campaign directory remains separate.
- When entering from an active campaign, first return aboard and secure the deck. The game preserves a `before-playtest` campaign save and retains your current campaign state for **Return to campaign**. After restarting the application, that safety save remains in the normal campaign library.
- When entering from the title, **Return to campaign** returns to the normal title screen. New Campaign starts a clean game, and Continue loads your normal campaign.
- A visible **PLAYTEST** label identifies test sessions in the HUD and menus. Choosing another checkpoint loads its fresh starting state; save first if you want to resume your current test later.

## Wrist, stations and building

- **Tab:** personal pack, health, equipment and recovered records only.
- **E at the receiver:** signals and machine research.
- **E at the helm:** navigation, route fuel estimates and departure readiness.
- **E at a service-deck engineering cabinet:** generator switches, operating modes, device priorities and machine servicing. The cabinet works with power off.
- **E at a workbench:** workbench recipes and weapon attachments.
- **E at a refinery:** refinery recipes only.
- **E at storage or equipment:** that object's own controls. Generator refuelling, battery information and quiet-drive switching have equipment panels. Remote storage access was removed from the personal pack.
- **B:** construction catalog, including directly from the wrist. Pick a part and press **Place**; the panel closes and the normal camera immediately resumes. The parts list scrolls independently of the Place button. Left click places, Q/E rotates, G changes parts, and B/Escape cancels placement. Insufficient materials disable Place with the required and available quantities shown.
- **Y / Z during construction:** copy an aimed part's blueprint / undo an eligible recent placement or move. Copy charges normal materials when placed. Undo explains any refusal caused by use, damage, contents, support, occupancy or missing refund space. See [construction behavior](construction-usability.md).

Station interfaces carry a blue border and identify the connected equipment; they do not open the wrist camera. Destination instrument puzzles use their own local panel. Personal records remain on the forearm display.

## Verification

The checkpoint regression runs generated snapshots through native JSON validation, opens every destination, checks spawn and equipment clearance, completes every story destination through its actual instrument transactions, and departs normally. It also starts the boarding and scout encounters, clicks Place and builds a paid part through real input, verifies local recipe lists, and checks per-preset saves and campaign preservation. Native window captures cover the catalog, stations and checkpoint selector at 1440×900 and 1200×900.

Results: [engineering/recovery and 23-checkpoint verification](results/recovery-and-operations-2026-09-28.json), [earlier physical-expedition verification](results/physical-expeditions.json), [five-priority native UI review](results/five-priority-ui-review-2026-09-28.json), and [original checkpoint/menu evidence](results/playtest-checkpoints.json). Additional regression suites cover inventory/research parity, controls, wrist input, later expeditions, story activities, asynchronous saves, workshop traversal and campaign integration.
