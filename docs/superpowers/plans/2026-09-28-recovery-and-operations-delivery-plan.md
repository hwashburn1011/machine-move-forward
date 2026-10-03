# Recovery and Nomad operations: delivery plan

Date: 2026-09-28. Status: **playable implementation delivered; technical validation recorded separately from pending continuous-play and human acceptance**. Scope: the native Godot game. This follows the [five-priority update](../../godot-port/five-priority-update.md) and covers the next priorities 1 and 2: emergency recovery/machine servicing and player-controlled power/operating modes. See the [implemented controls and validation scope](../../godot-port/recovery-and-operations.md).

The player should understand why the Nomad cannot proceed, have a dependable recovery action, and control operating costs without returning to the wrist computer. Introduce these systems through existing journeys and equipment rather than another compulsory tutorial or new story collectible.

Final technical evidence: [97 focused headless checks, 117 native checks and 728 existing regression checks](../../godot-port/results/recovery-and-operations-2026-09-28.json), all passing on one unchanged runtime source fingerprint. Native includes the headless contracts, so those counts overlap. Continuous-play and human gates below remain open.

## Placement in the campaign

Unlock teaching and convenience progressively. Basic repairs, generator switches and emergency assistance must work from the first playable deck, including an old save loaded beyond that point. Do not lock a solution behind the milestone that a breakdown prevents the player from reaching.

| Campaign moment | Recovery and servicing | Operating controls | Why here |
| --- | --- | --- | --- |
| First steps aboard, before scanner repair | An always-accessible service port on the fixed chassis provides diagnosis, normal repairs and a manual distress beacon. Mention it only if something goes wrong. | Make an existing switchgear cabinet the engineering station. Show fuel, condition, currently running generators and manual start/stop. Preserve the opening's existing settings. | Prevent an early dead end without adding a construction bill or interrupting salvage/refinery/workbench teaching. |
| After the first boarding defense | If the machine is damaged, point to the actual damaged system and show the exact repair cost. No damage means no repair tutorial. | Explain a power shortage only if one occurs; keep the deck gun's local interaction intact. | Repairs become relevant after a real encounter rather than manufactured damage. |
| First docking at the Wake | Introduce the departure readiness check and the difference between personal repair and machine repair. Assistance remains available aboard. | Introduce **Docked** to stop unnecessary generator burn while exploring. Introduce **Cruise** before departure, alongside the recovered gyro and helm. | This is the first substantial expedition away from the running machine. Captive Wake mechanisms do not require Nomad power. |
| Relay Foundry, after its required recoveries and safe return | Open the first normal service bay beside the existing return gangway. Offer ordinary scrap-paid repairs and a finite, priced fuel reserve. Service is optional and does not gate departure. | Reveal **Salvage** and **Defense**, plus optional per-device priorities, when `relay-foundry` is completed. Explain collector/turret loads using the controller/servo unlocks. | These are the first major competing automatic loads; the Foundry is a natural place to teach machine operation. No collector or turret purchase is required. |
| Quiet Array / subsequent route selection | Add a fuel/recovery summary to existing route previews. The newly available radar can identify existing repair/fuel contacts; it is never required to summon emergency help. | Teach the effect of an underpowered receiver/helm and show projected service availability. Respect the existing crane prerequisite: Array complete plus restored rooftop workshop, then recovery and installation. | Steering and optional travel decisions now make operating estimates useful. |
| Glass Orchard, either approach | Provide a second normal service bay in the common return area after the required recoveries. Both approaches offer the same service terms and stock. | Keep the already learned modes. Introduce battery charge/backup controls only after a battery is recovered and installed; quiet-running operation stays at its own assembly. | Prepare for the longer Meridian legs without making either optional assembly necessary. |
| Meridian and the final bearing | Review fuel, propulsion, engine/legs and return/departure state before the final commitment. An empty tank or breakdown still has a local recovery path. | Show the actual active configuration and route estimate. Preserve the final checkpoint save and ending sanctuary. | Avoid a surprise failure after commitment; this is a check, not another unlock or resource toll. |

The fixed engineering/service anchor should reuse the accessible authored switchgear area. Select its exact cabinet and interaction point during SR01 with a walking/clearance review. Keep its access on the permanent chassis, independent of a player-built floor, optional generator, cutter locker, receiver module or battery. Existing saves must not have their construction deleted to make room.

## Concrete scope

1. **Recovery:** truthful fault diagnosis, itemized ordinary service, two optional campaign service bays, and repeatable last-resort assistance delivered to the stranded Nomad. No required trek, fuel purchase or powered radio before requesting assistance.
2. **Operations:** generator start/stop, deterministic device priorities, four editable operating proposals, and fuel/battery/affected-device previews. Each proposal is explicitly applied at a physical machine interface. Quiet drive remains a separate existing device; an operating preset does not unlock or fit it.
3. **Playtesting:** retain the 19 existing checkpoint IDs and add focused fault/operations variants with exact loadout and equipment previews. Keep those variants separate from representative campaign supplies.

Detailed task boards:

- [Emergency recovery and servicing — ER01–ER10](2026-09-28-emergency-recovery-tasks.md)
- [Nomad power and operating controls — OP01–OP10](2026-09-28-nomad-operations-tasks.md)

There are **26 tasks**: ten recovery, ten operations and six shared tasks below. The disposition table below supersedes the original queue. S/M/L means relative scope, not a calendar estimate. Initial service prices and emergency quantities are implemented candidates requiring continuous-play evidence, not accepted balance.

## Implementation disposition

| Tasks | Status and evidence scope |
| --- | --- |
| SR01 | Captured 470 source/test/data/config entries in the local baseline archive and the pre-existing dirty-tree status. Runtime baseline `05ed64e1d551778300593de28241cdbb6e4a282c1180280f767e0dbf29d319f5` reproduced normal travel without a generator, zero-fuel crawl and zero-engine stop. No art assets were edited. |
| SR02 | Shared configuration/report/service contracts implemented. Four existing service-deck cabinets are reachable physical anchors. Missing-source assistance does not assume a build location is usable merely because materials are owned. |
| SR03 | Shared hooks, versioned optional saves, guarded local actions, construction use/pruning and existing recorder events integrated. Recovery state includes durable substeps and request completion IDs. |
| SR04 | Four separately named fault/operations starts appended; original 19 IDs retained. All checkpoint cases and existing affected regression suites pass. Late high-load starts now use Cruise to preserve actual helm power. |
| SR05 | Controlled native walking/input and standard/4:3 large-text checks pass. Continuous opening→Foundry and Orchard→ending runs, an uncoached participant, and balance/performance comparison remain outstanding. |
| SR06 | Technical handoff and controls documented; final human/balance acceptance remains conditional on SR05. |
| ER01–ER08 / OP01–OP09 | Runtime implementation present; see the individual boards for intentional scope adjustments. |
| ER09/ER10 / OP10 | Focused accounting, restore, transaction, physical-interface and input evidence available. Extreme-state whole-opening progression, repeated-assistance economics and uninterrupted campaign pacing still need observation. |

Implementation adjustments: reused the existing Foundry/Orchard return controls as physical service stations instead of adding another platform; appended four named checkpoints instead of a Scenario subselector; made basic device on/off available immediately while priority editing waits for Foundry; exposed battery policy for the installed bank group. Existing supplied assets and the personal wrist were preserved. No agents were started for this implementation.

## Current behavior that constrains the design

Source inspection on 2026-09-28, not a new campaign playtest:

- [Session](../../../godot/scripts/session.gd) debits fuel at `0.06 × living generators × fuelBurnMultiplier` per active second. Docking does not stop debit. Reduced demand alone does not save fuel.
- Ordinary propulsion currently depends on engine/legs/mass/fuel, independently of electrical shedding. A zero-health engine stops movement; zero fuel with a functioning engine permits 20% crawl. Generator switches therefore need an explicit propulsion contract, not a UI-only toggle.
- [Power budget](../../../godot/scripts/power_budget.gd) already centralizes read-only previews and live calculation, uses group shedding, and supplies navigation backup from optional batteries. Preserve this authority rather than writing a second calculator.
- [Main](../../../godot/scripts/main.gd) pauses aboard station menus, while ordinary off-machine site interfaces remain live. A service task cannot wait on a simulation timer inside a paused menu.
- [UI](../../../godot/scripts/ui.gd) already has local generator service and a Machine page linked to the helm. [Switchgear](../../../godot/scripts/machine_switchgear.gd) already has authored cabinets and status lights. Extend these, giving engineering a distinct physical anchor; the wrist remains Pack/Log.
- [Optional contacts](../../../godot/scripts/opportunities.gd) depend on story windows, navigation and distance. A repair depot is not an on-demand rescue from a stopped machine. [The resource audit](../../godot-port/later-resource-audit.md) records these limitations and existing costs.

## Shared contracts

- **Single state owners:** session owns persistent operating configuration and service transactions; a recovery coordinator owns the in-world request/task lifecycle. Campaign keeps ownership of routes, objectives and rewards. UI only asks for reports and submits actions.
- **Single power calculation:** extend `MMFPowerBudget.calculate` to accept a proposed configuration and return generation, requested/served load, shed reasons, fuel debit, battery rate and propulsion availability without mutation. Live simulation, build previews, equipment panels and route estimates use that result.
- **Distinct machine state:** distinguish stopped, damaged, out of fuel, deliberately disabled and shed by shortage. Positive aggregate capacity does not prove the helm/receiver is powered. Route/scan/interaction guards must inspect the required consumer and progression prerequisites.
- **Intent before effects:** applying a proposal revalidates the current pieces, damage, fuel, battery and station context. A rejected or stale action changes no switches, inventory, route, charge or service stock. One click produces at most one transaction.
- **Reach and menus:** engineering controls use the physical cabinet; each generator retains its own local switch/service panel. Helm keeps navigation and a departure action that can explicitly resume the last travel configuration. Wrist access and unrelated site menus cannot operate either system. Reserve clearance and show readable text/icons as well as colored lights.
- **Persistence:** add bounded, versioned optional `operations` and `recovery` payloads, with deliberate legacy defaults and atomic validation before live restore. Persist service stock, pending/completed assistance IDs, generator intent and device priorities. Do not serialize node references or active input holds. Completion rewards and top-ups must not repeat after save/reload.
- **Construction:** switching, repairing, refuelling or using an installation invalidates any eligible recent-build refund through the existing usage hooks. Removal prunes configuration references; IDs are not reused. A copied generator does not copy fuel, service privileges, configuration identity or stored charge.
- **Measurement:** extend the existing opt-in recorder with diagnoses, quotes, committed configuration changes, recovery requests/completions and before/after supplies. No second recorder, uploads or unbounded per-frame events.

## Implementation order and task ownership

This planning pass does not start worker agents. The implementation can run sequentially. If delegated, recovery and operations are suitable bounded workstreams after SR02, with one integrator owning shared files; native captures and performance runs remain serialized.

| Batch | Work | Exit condition |
| --- | --- | --- |
| 0 — contracts and fixtures | SR01 → SR02; ER01 and OP01 supply their concrete cases | Current behavior reproduced; cabinet anchor, rescue floor, migration and propulsion contracts fixed before feature code. |
| 1 — working chassis controls | OP02 → OP03; ER02 → ER03 → ER04; start OP04 and SR03 integration | Switches affect real fuel/power/movement; ordinary repairs and black-start assistance work from the first deck. |
| 2 — campaign placement | ER05/ER06; OP05 → OP06 → OP07; integrate OP08 and ER07 | Wake/Foundry/Array/Orchard introductions occur at their intended milestones; all choices have honest previews. |
| 3 — persistence and fault tests | ER08/ER09; OP09; finish SR03 → SR04 | Interrupted service, old saves and all fault variants are recoverable without duplicating rewards or corrupting campaign saves. |
| 4 — refinement and delivery | ER10 + OP10 → SR05 → SR06 | Native interaction and measured travel/service costs pass; remaining human evidence is explicitly recorded. |

`session.gd`, `main.gd`, `ui.gd`, `save_validation.gd`, `campaign.gd`, `power_budget.gd` and `playtest_checkpoints.gd` have one integration owner at a time. Dedicated new recovery/operations modules and tests can be implemented independently after interfaces are agreed. No art bake or second native game should compete with a measured run; leave any user play session alone.

## Shared task board

| ID | Deliverable | Depends on | Size | Acceptance |
| --- | --- | --- | --- | --- |
| SR01 | Capture current source/dirty-tree baseline; inspect permanent cabinet/service access; reproduce fault cases | None | S | Required changed/untracked sources are recorded; old saves are copied to isolated fixtures; normal menus, zero-fuel crawl, destroyed engine and missing generator behavior are observed rather than inferred. |
| SR02 | Freeze report/action/schema, rescue-floor and propulsion contracts | SR01, ER01, OP01 | M | Both boards agree on live vs projected values, generator/loan behavior, pending combat requests, legacy defaults and exact milestone gates. No cyclic dependency on receiver power, inventory, RNG or route distance in rescue. |
| SR03 | Integrate shared hooks, guarded station access, saves, construction and recorder | SR02; consumes ER/OP slices as they land | L | Actions revalidate authority; old saves retain their settings; new state round-trips; malformed state fails atomically; checkpoint/campaign separation and exact transaction counts pass. |
| SR04 | Add focused checkpoint variants and run combined regressions | ER08/ER09, OP09, SR03 | M | Each variant launches with its displayed supplies/condition/configuration, current site work unfinished, isolated saves and functional restart/return. Existing 19 IDs still work. |
| SR05 | Run native and continuous progression acceptance; refine supported issues | SR04, ER10, OP10 | L | Actual walking, mouse/keyboard and controller behavior where supported, large text, service interruptions and route departures checked. At least one uninterrupted opening→Foundry and one Orchard→ending run recorded; distinguish controlled runs from human playtests. |
| SR06 | Deliver controls, disposition table and source-stamped results | SR05 technical results; human results when available | S | Explain what shipped, measured costs, recovery limits, changes made after tests and remaining evidence. No claim of full human acceptance if no participant was observed. |

## Combined checkpoint and acceptance matrix

Variants extend the existing selector with a small **Scenario** choice and a visible item/configuration manifest; do not renumber existing starts or silently replace their inventories.

| Starting point / variant | What must be demonstrated |
| --- | --- |
| First steps / empty fuel and empty supplies | No power, no scanner module and no collected salvage are needed to reach the manual service port and complete assistance. Resume real salvage/build/scan progress afterward. |
| First steps / destroyed engine + no generators + no stored supplies | No distance spawn, depot, paid recipe, consumable or optional companion is required. The rescue supplies a non-refundable temporary generator only when no usable generator exists. |
| Receiver ready / all generators manually off | Manual restart alone resolves this; no free emergency top-up. Scanner fraction and inventory are unchanged. |
| First boarding defense / damaged machine | Fault guidance waits for a safe moment; paid repairs cost exactly the quoted scrap. A pending rescue does not delete enemies, theft, hooks or scripted combat. |
| Wake / Docked and return | Explore with generator debit stopped; required site mechanisms still work; the departure flow explicitly restores a valid travel plan. |
| Foundry / competing loads | With stock shown in the preview, buy or operate available collector/turret, compare Salvage/Defense, pay service costs, and see actual shedding and fuel burn match the quote. No optional purchase gates departure. |
| Array / damaged supply and insufficient reserve | Priority and route reports identify the affected receiver/helm; no global-capacity false positive or silent enabling of unrecovered equipment. |
| Both Orchard approaches / service stock | Same reachable service access, prices and initial stock; partial purchase/save/reload/departure cannot regenerate it. |
| Battery / partly charged and empty | Backup/charging settings behave as shown. Battery cannot propel the Nomad or power guns, and estimates do not drain it. |
| Quiet drive / multiple generators | Actual output penalty, speed reduction and running-generator fuel costs appear; presets do not silently switch quiet drive. |
| Both Meridian approaches + final bearing / low or zero fuel | Recovery remains reachable, route requirements and checkpoint save remain authoritative, final travel completes with the explicitly selected operating configuration. |

Technical release requires exact transaction/save tests, physical access/input checks and no new material gate on any mandatory expedition. Balance acceptance also requires observed time-to-recover, repeated-assistance frequency, service spending, useful fuel remaining after travel, and comprehension without coaching. Keep the prior continuous-campaign acceptance work open until those observations exist.
