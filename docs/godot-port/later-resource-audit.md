# Later campaign resource accounting

Source inspection, 2026-09-28. This supplements the [opening resource ledger](results/opening-resource-ledger-2026-09-28.json); it is not a playthrough, timing sample or simulated campaign surplus. Native overrides take precedence over the exported definitions. Two issues identified here subsequently received narrow corrections and focused headless validation, described below; none of the quantities or time budgets were tuned.

After the opening equipment/scanner chain, there is **no new fixed scrap, component, crafted-item or installed-equipment bill for any mandatory expedition or ending**. The remaining mandatory gates are local actions, retained unique facts, records, safe departure, operational power when committing a route, and a successful final checkpoint save. Fuel and damage recovery remain variable costs. Optional purchases compete with those reserves.

## Mandatory milestones and rewards

The opening ledger includes three floor plates, refinery, workbench, six refining batches, scanner module and manual deck gun: 228 scrap, producing and spending 12 components; the starting floor/generator are already present. This is the ledger's guided opening bill, not a claim that every plate or refining batch is unavoidable with a different layout or scavenged components. Installing the scanner consumes its one replacement module. The scan requires a powered receiver for 180 eligible simulation seconds, with a 3-second handoff. Later milestones do not repeat this bill.

| Milestone | Mandatory action / retained reward | New material or installation bill |
| --- | --- | --- |
| The Wake | Isolate feed, arrest rotor, release cradle; recover `course-gyro`. | None. Gyro fitting/helm presentation follows the story fact. |
| Relay Foundry | Route captive recovery power, unlock/move/latch the site gantry; separately recover `salvage-controller` and `tracking-servo`. | None. These unlock the optional collector/turret; buying either is unnecessary for departure. The site gantry does not require the optional Nomad crane. |
| Quiet Array | Read both relay-calibration records, operate three local service wheels and lock phase; separately recover `course-actuator` and `annika-archive-shard`. | None. Actuator grants steering to ±12°; completed Array plus actuator enables the later route radar. |
| Orchard: caretaker approach | Route already supplies the port isolator objective. Restore the starboard isolator, claim both route-accessible recoveries, read Common memory and Caretaker testimony, then recover `vector-governor`. | None. Final required uniques are `human-seed-bank`, `orchard-memory-core`, `vector-governor`; both isolator objectives must be present. No recruited caretaker or caretaker dock is required. |
| Orchard: cold-vault approach | Route already supplies the starboard isolator objective. Restore the port isolator; read Common memory and Evacuation register; collect the same three uniques. | None. Seed bank unlocks an optional display; governor grants ±28° steering. |
| Meridian: quiet line | Verify/seat/read back the captive archive carrier; link/synchronize/confirm the transmitter; acknowledge both local objectives. Read Common refuge and Civilian passage records, then recover `meridian-solution`. | None. `orchard-memory-core` is required as a retained story fact and is not consumed/deleted. |
| Meridian: cordon gap | Same two physical mechanisms and objectives; read Common refuge and Defense watch records; recover the same solution. | None. Solution grants ±45° steering. |
| Final commitment / arrival | Return aboard, clear threats, depart with all required rewards/objectives; successfully save `meridian-checkpoint`, commit the final 400 m journey. | No recipe, upgrade, supplies payment, or optional equipment check. A damaged/empty-fuel machine still affects travel. |

These sites grant unique/objective/journal facts, **not loose scrap, components, fuel or repair-kit bundles**. Physical actions use captive equipment and do not call inventory payment/removal. A partially completed or restored mechanism adds no new material cost; reward collection remains separate and idempotent. No mandatory construction, jumping or ground traversal was added at these sites.

Authority: [definitions](../../godot/data/definitions.json) (`STORY_EXPEDITIONS` and route arrays), [campaign](../../godot/scripts/campaign.gd) (`begin_route`, `requirement`, `interact`, `departure_reason`, `begin_ending`), [mechanism definitions](../../godot/scripts/expedition_mechanisms.gd), [local activity](../../godot/scripts/expedition_activity.gd), [native progression](../../godot/scripts/native_progression.gd).

## Travel, power and recovery costs

| Leg | Authored approach distance | Scripted carrier |
| --- | ---: | --- |
| Wake | 700 m | None in the route definition; opening combat is separate. |
| Foundry direct / detour | 750 / 1,150 m | Gunboat / none. |
| Array | 950 m | None in the route definition. |
| Orchard caretaker / cold vault | 900 / 1,100 m | Skiff / gunboat. |
| Meridian quiet line / cordon gap | 1,250 / 1,050 m | Skiff / gunboat. |
| Final committed leg | 400 m | New ambient encounters are held by the ending sanctuary. |

Distances are not fuel budgets: braking, the departure clear distance (>40 m per site), detours, machine mass/condition, optional equipment, combat and time spent walking or reading away from the Nomad change elapsed simulation time. Scripted carrier destruction is not required; clearing the encounter can yield no carrier reward.

- Fuel debit is `dt × 0.06 × healthy_generator_count × fuelBurnMultiplier`: **3.6 fuel units per active minute per living generator at default modifiers**. Generator condition scales generation (`16 × condition` before modifiers), but does not reduce fuel burn until its health is zero. Additional generators multiply burn even if their spare output is unused. One fuel item in the player pack restores one tank unit, capped at 100.
- Main skips session ticks while the tree is paused or a cinematic is active. Aboard non-Build menus pause; Build and ordinary away-site Console/Record interactions remain live. Docking stops movement but does not stop fuel debit. Thus ten active minutes on a site cost 36 fuel units with one default generator; this is arithmetic, not a measured visit duration.
- Positive capacity is checked for a main-route or optional-contact commitment. Power shedding can disable the receiver/helm/fieldwork. Captive destination mechanisms themselves do not debit or require Nomad fuel. Zero fuel reduces the movement target to 20% rather than removing all movement; engine health still multiplies that target. A charged optional battery may support navigation controls briefly but does not restore normal propulsion.
- Engine repair costs `max(1, ceil(80 × missing/320))` scrap; each leg costs `max(1, ceil(45 × missing/180))`. A damaged constructed part costs `max(1, ceil(build_scrap_cost × missing_fraction × 0.2))` scrap to restore. Destroyed parts may require full replacement. All damage amounts and repair frequency depend on play.
- S-07 repair kit: 2 scrap + 2 components at a workbench, restoring up to 40 health. Death currently restores 100 health aboard after 3 seconds with no inventory debit. A safe, comfortable enclosed chair can heal 2 health/sec without a supply debit. Neither replaces machine repair.
- **Firearms have unlimited reload supply.** Reload completion directly fills the magazine; it does not debit `reserveAmmo` or ammo inventory. Manual and automatic turret firing likewise has no ammunition debit. The exported rifle/shell recipes (2 scrap + 1 component for 30 rounds; 3 scrap for 8 shells) had no native reload/use benefit and are now excluded from the native catalog. Previously crafted ammo, storage, world loot and saved weapon state remain intact. This removes misleading optional expenditure without introducing a combat resource bill.
- Refine components remains 8 scrap → 2 components at a powered refinery. There is no fuel recipe. Ordinary dismantling refunds `floor(cost × 0.6)` per item; destroyed construction has no material refund. Eligible recent-construction undo has its separate full-transaction rules, so it should not be budgeted as unlimited recovery of old structures.

Authority: [session](../../godot/scripts/session.gd) (`tick`, `refuel`, `repair`, `craft`, `use_item`), [main](../../godot/scripts/main.gd) (`open_menu`, `_physics_process`, manual turret), [power budget](../../godot/scripts/power_budget.gd), [player](../../godot/scripts/player.gd) (reload and death), [combat](../../godot/scripts/combat.gd) (scheduling and turret), [home](../../godot/scripts/home.gd), [building](../../godot/scripts/building.gd) (dismantling).

## Available recovery sources

| Source | Source-defined return | Conditions / limitations |
| --- | --- | --- |
| Ordinary moving salvage | 22–46 scrap; independent 75% chance of 1–3 components and 75% chance of 3–4 fuel. First collected salvage adds 12 scrap and 4 fuel. | Later spawn opportunities every 90 m after first salvage (180 m beforehand), available pooled crate permitting. Hook is free and does not require power. Collection success, distance and RNG matter; first bonus is not repeatable. |
| Optional fuel reserve | 6 fuel. | Service/retrieval task; later radar's fuel choice can include a scout patrol. Receiver power, steering reach, interception and travel matter. |
| Optional salvage wreck | 24 scrap + 2 components; broadcasting and clearing the encounter changes this to 48 scrap + 6 components. | Extra reward involves an optional encounter. |
| Optional repair depot | 1 repair kit and record access. | Also offers optional L-12 restoration for 6 components. |
| R-9 refuge exchange | 4 scrap + 3 fuel and workshop bearing. | Costs 3 components and local relay service; not a free fuel rescue. |
| Rooftop workshop main cache | 24 scrap + 4 components. | Isolate bus, recover its captive spare fuse, restart: no inventory fuse/payment. This restoration also satisfies the optional crane-discovery prerequisite after Array. |
| Rooftop workshop raised cache | 5 components + 1 repair kit. | Supported upper route/boarding extension required. The supplied guide from an empty matching layout costs **82 scrap + 2 components** (5 floors, wall, stairs, extension). Existing suitable construction reduces the actual missing bill. The 24-scrap main cache does not fund that entire fresh guide. |
| Destroyed carrier | Skiff: 30 scrap + 2 components; gunboat: 45 scrap + 3 components. | One bounded award per destroyed ship; escape/retreat grants none. Overflow drops aboard. Ordinary dead boarders are not an additional resource faucet; recovering stolen cargo returns previously owned items. |
| Crane-only heavy cargo | 48 scrap + 8 components + 4 fuel. | Hoisting requires optional recovered, installed, healthy, powered crane and clear cable path. Normal-stream fourth opportunities now require recovered equipment plus a living installed crane with explicit current power; otherwise they remain ordinary hookable cargo. Recovery-site practice cargo still appears before installation, and existing saved heavy cargo is preserved. |

Full storage does not convert these tables into guaranteed receipts: ordinary and site cargo keep unclaimed remainders, while some overflow becomes recoverable world loot. Moving cargo may pass by; optional contact windows and unclaimed stock require real-world handling tests. Contacts are offered during route-selection/ending-ready/complete windows, not on demand during a committed mandatory expedition.

Authority: [salvage](../../godot/scripts/salvage.gd), [session.salvage_reward](../../godot/scripts/session.gd), [opportunities](../../godot/scripts/opportunities.gd), [route chart](../../godot/scripts/route_chart.gd), [survivor content](../../godot/scripts/survivor_content.gd), [survivor site](../../godot/scripts/survivor_site.gd), [workshop guide](../../godot/scripts/workshop_guide.gd), [gear site](../../godot/scripts/gear_site.gd), [carrier rewards](../../godot/scripts/combat.gd), [stolen-cargo recovery](../../godot/scripts/raid_mission.gd).

## Optional spending after the opening

All amounts below are `(scrap, components)` and exclude any additional floors/supports the player's layout needs. These are purchases/unlocks, not mandatory campaign gates.

| Purchase | Cost | Relevant condition |
| --- | --- | --- |
| Automatic collector / automatic turret | (55, 6) / (65, 8) | Foundry controller / servo; draws 4 / 6 power. |
| Salvage crane | (45, 5) | Complete Array and restore rooftop workshop; recover optional assembly before installation; draws 4. |
| Battery bank | (35, 6) | Complete Orchard and recover assembly. Stores 120 energy; up to 4 backup output, up to 2 charge/sec from spare generation. |
| Quiet drive | (40, 8) | Complete Orchard, prior gear recovery and 600 m since latest recovery, then recover this assembly. Quiet mode reduces speed by 35% and generator output by 4; no direct fuel-burn discount. |
| L-12 restoration + dock | (0, 6) + (40, 8) | Optional depot restoration; dock draws 3. The current native companion does not supply automatic repair income. |
| Seed preservation display | (35, 4) | Seed bank unlock; decorative, no ongoing supplies. |
| Signal decoy | (4, 2) per item | Workbench recipe; deployed item consumed. Optional scout response. |
| Extended magazine | (8, 5) per item | Workbench recipe; one item consumed to add 50% base magazine capacity to selected weapon once. |
| Each weapon attachment | (12, 8) once per attachment | Foundry complete, functional local workbench and 1 fieldwork power. Four attachments; later refitting researched attachments is free. |
| Longstride / Torque research | (60, 8) / (45, 10) | Propulsion alternatives. Longstride increases fuel burn ×1.25; Torque changes mass/speed/acceleration. |
| Overwound / Economy research | (55, 8) / (40, 8) | Power alternatives: generation +6 and fuel burn ×1.5 / generation −2 and fuel burn ×0.55. |
| Heavy Breech / Fast Cycler research | (50, 6) / (45, 8) | Defense alternatives; add 1 / 2 turret power draw. Research paid once; fitting/removing researched upgrade is free. |

Other active build catalog costs: floor (8,0), wall (12,0), doorway (20,0), railing (5,0), roof (10,0), stairs (18,0), boarding extension (12,2), crate (15,2), additional workbench (30,4), refinery (80,0), generator (60,6), lamp (6,1), manual turret (42,4), chair (4,0), table (6,0), rug (3,0), shelf (5,0). Stove, planter, condenser and food/water recipes in exported JSON are retired by native progression; do not include them as robot-survival requirements.

Authority: [exported recipes/builds/upgrades/attachments](../../godot/data/definitions.json), [native additions](../../godot/scripts/native_survivor_data.gd), [native progression overrides](../../godot/scripts/native_progression.gd), [workbench/research authority](../../godot/scripts/main.gd), [decoy consumption](../../godot/scripts/scout_encounter.gd).

## Addressed observations and evidence still needed

The [resource refinement record](resource-refinements-proposal.md) documents the native recipe filter, exact legacy-pin compatibility and strict crane-power gate. The dedicated [81-check result](results/native-resource-refinements-2026-09-28.json) passed, including no-payment retired crafts, retained recipes, full old-save round trips, atomic invalid-save rejection, actual reload behavior, live cargo pool cases and deferred recovery-trial preservation. The unchanged later-expeditions suite also passed all 85 checks, retaining its trial hoist and overflow assertions. Focused source stamp: `0f69a800743efd9d270a4871b0372a5b5b3e6820e14c0ddb8d5ede93a5271967`, stable throughout the focused run. These are correctness results, not human timing evidence.

1. Measure each destination's **active** walk/read/solve/return time and fuel before/after on a continuous run. The physical traversal suites freeze unrelated world simulation for correctness; their passing empty-inventory fixtures prove no mechanism material bill, not adequate fuel reserves or acceptable elapsed time.
2. Run both later-route combinations with normal acquired stock, expected damage and optional equipment choices. Separate repair/replacement spending, stolen/lost cargo, missed catches and fuel refills from optional purchases. Do not treat prepared checkpoint stock, ship destruction rewards or perfect cargo collection as assured income.
3. Exercise low/zero-fuel recovery with a healthy engine and with severe engine damage. Emergency crawl plus free hook allows a recovery avenue while moving, but random fuel returns have no fixed maximum waiting distance. A zero-health engine multiplies target speed to zero; distance-triggered new cargo cannot itself rescue a stationary machine. Accessible existing cargo, owned scrap and dismantlable parts may help; this inspection does **not** establish a guaranteed rescue from every exhausted state. Targeted state testing should precede any claim that these cases cannot strand the player.
4. Test the fuel-cache detour's net fuel after braking, walking and a possible patrol, and the optional workshop's 82-scrap fresh upper route against its actual benefit. These are meaningful time/build choices, not inherently resource-positive transactions.
5. Check whether the corrected crane introduction makes the distinction between recovery and paid installation clear. Check additional generators and quiet drive for comprehensible fuel/power tradeoffs. The prior stream-substitution and unusable-ammo-recipe defects are covered by the focused regression suite rather than left as unresolved human questions.

No reward amounts, route lengths, fuel rates, repair rules, equipment costs or reload behavior changed. The two narrow corrections are implemented; human continuous-campaign and recovery-timing gates remain pending.
