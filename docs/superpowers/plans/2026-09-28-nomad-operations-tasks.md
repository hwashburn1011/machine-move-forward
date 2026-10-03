# Nomad power and operating controls: tasks

Date: 2026-09-28. Status: **OP01–OP09 implemented and technically checked; OP10 controlled native review passed, continuous-play acceptance pending**. Parent: [recovery and operations delivery plan](2026-09-28-recovery-and-operations-delivery-plan.md). This is priority 2. OP01–OP10 use S/M/L for scope, not elapsed time. See the [implemented controls](../../godot-port/recovery-and-operations.md); the requirements below preserve the original acceptance scope.

Implementation notes: `machine_operations.gd` owns proposals and configuration validation; the existing pure `power_budget.gd` serves live/previews with source intent, served demand, battery rates and fuel cost. `engineering.gd` exposes four reachable authored cabinets with guarded local controls. Manual device on/off is available from the opening so an avoidable overload never waits for a Foundry unlock; priority editing and Salvage/Defense still arrive after Foundry. Battery charging/backup permissions apply to the installed bank group. Departures check actual navigation power and restore the previous travel configuration only after required progress checks; the final checkpoint remains before commitment.

Native testing walks the original stairs and supported service aisles with the ordinary controller, then uses actual keyboard/mouse input for preview/apply and Build → Place. An initial test placement at the stair railing was rejected by the existing safe-position restore; the corrected fixture walks from the normal checkpoint spawn. No production movement/collision change was made. Controlled fuel accounting and save/input tests do not establish uncoached comprehension, route economy or broad performance improvements.

## Physical interfaces and introduction

Use an existing accessible switchgear cabinet as the **engineering station**, with three views: Overview, Operating modes and Devices. Basic overview/start/stop/repair information works from the first deck. Teach Docked and Cruise around the Wake; reveal Salvage, Defense and optional priority editing when `relay-foundry` is completed. Battery-specific rows appear only for installed recovered banks after their existing post-Orchard acquisition. Quiet-drive switching remains at its installed assembly.

The helm remains a navigation interface. Its departure preview can explicitly offer **Resume travel configuration and depart**, using the same validated configuration transaction. Detailed preset editing and arbitrary remote repairs do not move into the helm. Each generator retains its own nearby manual switch, refill and repair interface. Remove the current unrestricted Helm↔Machine tab switch once the distinct engineering anchor is functional; direct actions still revalidate station context.

The wrist remains personal Pack/Log. It may show a pinned fault instruction, but it cannot start generators, change device priorities, buy service, repair the Nomad or select operating modes. Build → Place must keep its immediate return to world placement.

## Operating proposals

A preset is an explicit proposal for the installed, unlocked machine, not a stat bonus or an automatic response to combat. Preview changed generator switches, requested consumers, priority order, expected shedding, battery behavior and fuel rate before applying. Preserve a last valid travel configuration for leaving Docked; keep manual edits as **Custom** until the player applies another named proposal.

| Mode | Availability / natural lesson | Initial policy |
| --- | --- | --- |
| Cruise | First Wake return/gyro, alongside the helm | Keep navigation and installed defense ready; low-demand industry defaults off. Choose sufficient generators for the requested loads where possible, showing any shortage. Optional lights/comfort follow a visible low priority. No speed bonus. |
| Docked | First Wake docking | Only applicable when actually docked or in the stationary service procedure. Stop propulsion and ordinary generation/industry/defense loads. Show receiver/helm backup if a permitted charged bank is present; otherwise explain that these are offline. Do not treat the mode itself as a combat sanctuary. Site mechanisms use their own captive supplies. |
| Salvage | Foundry completed and collector unlocked | Keep navigation; prioritize installed collectors and later an installed crane. Retain installed defenses at lower priority if supply permits; explicitly list any disabled/refinery load. No automatic hoist, free cargo or discovery unlock. |
| Defense | Foundry completed and turret unlocked | Keep navigation and installed guns; shed discretionary refinery/collector/crane/comfort loads before defenses. Show repair/fuel limitations. No extra damage, ammunition rule, aim bonus or cancelled enemy behavior. |

Manual controls remain available before the relevant preset lesson. Newly available profiles need no research fee or new collectible. A profile can be previewed without buying its optional equipment; use only installed and recovered devices and clearly state when there is no collector/turret to operate.

Profile application selects a stable minimal prefix of usable generators sufficient for requested loads, ordered by effective capacity then stable instance ID. It never conjures power if the maximum is insufficient. Recompute at commit; after application, damage or new demand causes visible shedding rather than silently starting more fuel-burning generators. Reapplying the proposal can suggest additional generators. A manually changed switch/priority becomes Custom and remains that way through load.

Keep a newly installed generator off while a deliberate operating configuration is active, with a local **Start generator** prompt and a preview including its fuel cost. In untouched legacy/default behavior, installation retains the current running default. New consumer defaults follow the active proposal, then undergo the same real budget calculation; no stale device IDs or free capacity.

## Simulation contract

### Supply, fuel and propulsion

- Store player intent separately from ability: `enabled` can be true while a generator is damaged or out of fuel. Effective running requires enabled, living and supplied. The UI distinguishes those states.
- Generation and fuel debit use the same list of effective sources. At current default modifiers, each running ordinary or loan generator costs **3.6 fuel/minute**. An off generator produces and burns zero. Lower consumer demand saves fuel only when it permits stopping a generator.
- Keep existing condition, research and quiet-drive output modifiers. Do not claim quiet running directly saves fuel; its slower travel can increase fuel per metre. More generators do not grant an unplanned propulsion-speed bonus.
- **Explicit new coupling:** normal powered travel needs at least one enabled, healthy generator (or the ER loan source). If the player turns every source off, target speed becomes zero using normal deceleration. Restore normal movement after restart, subject to engine/legs/fuel/mass and existing dock/approach constraints.
- Preserve the existing zero-fuel 20% emergency crawl when a source is enabled and the engine is functioning; an explicitly stopped system stays stopped. Batteries still cannot propel the Nomad. Engine health zero still prevents travel until repair; the emergency-service design covers that case.
- A missing/destroyed-generator legacy save will now report no propulsion until repaired or assisted. This is an intentional consistency change requiring a migration warning and recovery test, not an unnoticed side effect. Normal healthy old saves retain their effective settings.
- When a tank empties during a tick, generation, burn, movement and reports must follow one defined transition; do not generate unlimited energy from a near-zero fuel remainder or let frame size change the result materially. Pin this integration rule in OP02 and test different time steps.

### Consumers, priorities and batteries

- Keep `MMFPowerBudget` side-effect-free. Pass live or proposed operations state into the same calculation; return explicit `requested`, `served`, `reason`, actual supplied draw and unmet demand per device.
- Preserve existing group-shedding behavior in an untouched legacy/default configuration. A deliberate preset/custom configuration uses three player-facing priority levels: **Essential, Normal, Optional**. Sort by priority then stable consumer ID; allocate whole device draws, skip a device that cannot be supplied and show why. Never allocate fractional operation to a gun, refinery or crane.
- The receiver/helm remain explicit fixed consumers when their existing prerequisites are satisfied. Device on/off requests cannot create missing story hardware. Per-device priority can reduce their priority, but the preview must identify the resulting scan/navigation interruption; route commitment tests the actual required device rather than aggregate capacity.
- Treat refinery, turrets, collector, crane, lights and caretaker dock consistently. State whether fieldwork is currently requested; use the existing on-demand research/workbench load. Workbench crafting keeps its existing station rules rather than gaining an invented power draw.
- Battery hardware remains optional and unchanged in capacity/output: 120 energy per bank, up to 4 output and up to 2/sec charging from genuine unused generation. Backup remains limited to receiver, helm and fieldwork. Initially expose only **allow charging** and **allow navigation backup**; no new engine/gun battery capability or arbitrary reserve slider is required.
- Charge only from actual generation minus served load. Do not charge from battery output, emergency synthetic capacity or an unserved demand estimate. Never charge and discharge the same bank in the same tick; stable bank order and actual limits determine allocation.
- Battery duration derives from the actual enabled navigation draw and available charge; label it approximate. With no backup load, show **No current backup demand**, not infinite travel range. Preview/rendering drains no charge and consumes no RNG.

### Safe application and departures

- Validate generator/device IDs, types, health, current configuration revision and physical station reach on every action. Report changed assumptions before applying a stale preview; do not silently use a different costly set of generators.
- Applying a mode changes only operating intent/priority and necessary stopped/travel state. It does not change route, stock, discoveries, damage, ammo, scanner elapsed time, reward claims, threat timers or quiet-drive selection.
- Docked mode does not teleport, deploy a gangway, overwrite campaign state or stop a moving approach on demand. Leaving a site explicitly previews restoration of the last travel configuration. If that configuration is no longer viable, explain the damaged/offline/fuel cause and allow correction or local assistance.
- Helm **Resume travel configuration and depart** is atomic: preflight both operations and campaign/contact departure; a failed route/departure check leaves both unchanged. Preserve the final-bearing verified checkpoint order and never save a half-applied ending commitment.
- Existing aboard menus remain paused. Generator actions apply immediately, then affect the next active tick. Status refreshes after a switch without an artificial simulation step; no wall-time fuel burn while browsing a paused station.

## Preview presentation

Keep the compact overview readable before exposing the full device table:

1. Active mode/Custom; motion state and any blocking fault.
2. Running sources, generation / served load / requested load, and remaining fuel.
3. Current fuel per active minute and approximate run time at this configuration. Distinguish stopped debit from a viable route.
4. Battery charge, charging or backup draw, approximate navigation reserve, and the devices it can actually support.
5. On a proposed change: list only changed switches/priorities, fuel-rate delta, disabled devices and important restored functions, followed by one **Apply** action.

Route preview estimates must include selected distance, current propulsion condition/mass/speed modifiers and active generator burn. Label travel estimates separately from time spent exploring/fighting; do not silently price every expedition as zero dwell time or claim a net-positive fuel detour from gross cache contents. An unavailable estimate states why instead of dividing by zero or displaying infinity. Service tasks do not debit fuel in paused UI, but off-machine activity with generators on still does.

## Task board

| ID | Deliverable / likely files | Depends on | Size | Acceptance |
| --- | --- | --- | --- | --- |
| OP01 | Current behavior and mode examples; baseline fixtures for `power_budget.gd`, `session.gd`, equipment/UI/build/route reports | SR01 | M | Record exact opening, Foundry mixed-load, damaged multi-generator, battery, quiet-drive and no-generator behavior. Establish the intentional changes and migration defaults for SR02. |
| OP02 | Versioned operations state and one pure configuration evaluator; proposed `machine_operations.gd` plus `power_budget.gd` | SR02 | L | Calculates real source enablement, legacy/configured priority allocation, served/unmet demand, battery limits, fuel debit and propulsion status. Preview and repeated rendering have zero mutation; IDs/order are deterministic and bounded. |
| OP03 | Live generator switching, fuel/propulsion coupling and recovery-source interface | OP02 | L | Stopping one of two generators saves exactly its debit and recomputes supply; stopping all removes normal propulsion; restart works while dark. Zero-fuel crawl, destroyed engine, quiet modifiers, loan exclusivity and exhaustion mid-tick match the contract. |
| OP04 | Distinct engineering cabinet, local generator actions and usable overview | OP03; ER02 reports | M | Native walking/interaction reaches the cabinet without blocking starter/stair/return routes. Tabs/actions require the correct machine station; no wrist route to controls. Local switches and status work with no bus power; failed actions explain why. |
| OP05 | Preset proposals, per-device priorities, stable generator selection and Custom state | OP02, OP04 | L | All four proposals act on actual installed equipment, list shed/restored loads and change only after explicit apply. Stale preview refuses mutation, duplicate clicks apply once; manual edits persist; new/removed/copied installations follow documented defaults and usage rules. |
| OP06 | Milestone teaching and Docked/departure flow | OP05, ER05 contract | M | Wake introduces stopping debit and resuming travel; Foundry completion reveals competing-load controls; legacy saves infer availability from real facts. No forced equipment buy/tutorial modal. Invalid dock/route/ending state cannot partially apply a mode or skip the required save. |
| OP07 | Shared build/equipment/route previews and truthful fuel estimates | OP03, OP05 | M | Build/copy/move previews use proposed intent without mutating live settings. Route estimates handle stopped/no-fuel/damaged states, quiet speed and multiple generators; consumer shortages are named. Estimates distinguish transit from expedition dwell and list actual loan supply where active. |
| OP08 | Battery charging/backup controls and existing quiet-drive integration | OP05, OP07 | M | Recovered/installed gates remain; toggles preserve charge/limits and never back up propulsion/guns. Quiet assembly retains its local switch, preserved selection and real modifiers. New policy and old saves do not create charge or silently fit optional hardware. |
| OP09 | Migration, exact accounting and input/lifecycle regression suite; proposed `tests/machine_operations.gd` | OP03–OP08; SR03 owner | L | Legacy and custom configurations round-trip; malformed state rejects atomically. Different dt values, battery exhaustion, all-off restart, changing damage, part removal/undo, service loan, failed departure and checkpoint isolation pass. Actual station inputs cannot also fire/place/craft. |
| OP10 | Native walkthrough and fuel-use comparison; refinement | OP09, SR04 | M | Compare Cruise/Salvage/Defense on the same installed layout and Docked during a real site visit. Actual debits and served devices match predictions. Verify opening→Wake→Foundry teaching and later battery/quiet controls, 1440×900 and 1200×900 at large text, clear service access and return to Build→Place. |

New file names above describe proposed implementation boundaries. Integrate shared runtime files through the parent plan's single owner.

## Required adversarial cases

- Preview/apply with fuel empty, fractional fuel, no generators, every generator disabled, damaged generators, loan generator active and a newly restored real generator.
- Enough aggregate power but a deliberately disabled or shed receiver/helm; no scanner/route false positive.
- Simultaneous refinery (10), manual gun (3), receiver (1), collector (4), automatic turret (6) and later crane (4), with stable ties and insufficient supply. An apparently green total cannot conceal unserved mandatory equipment.
- Multiple batteries, one damaged bank, empty/full reserves, disabled backup and enabled charging, shortage transitions and different simulation step sizes. Energy accounting remains bounded and deterministic.
- Profile preview followed by damage, construction, part removal, repair, fuel transfer or recovery completion before Apply. Changed assumptions cannot spend unexpected fuel silently.
- Using/refuelling/switching a recent build invalidates full-refund undo; default construction, ordinary cutter recovery and existing copy cost remain intact. No saved preset restores a removed instance or a copied item's state.
- Save/reload while Docked/Custom/all-off or in assistance; pending source switches and partial service remain coherent. No real player save is overwritten by fixtures.
- Active combat with a selected Defense preset: no encounter reset, invulnerability, automatic gun mount or hidden new generator startup. An explicit all-off action remains reversible at the unpowered cabinet.
- Main and optional docks, both Orchard/Meridian branches and final saved commitment: travel restoration fails cleanly if a route requirement/save fails; mode state alone never supplies a story fact.
- Personal wrist Pack/Log, local workbench/refinery/storage and every expedition control preserve their own interface. Changing a preset never traps the player in a menu or consumes the click intended to return to construction.

## Completion evidence

Deliver source-stamped budget/energy/transaction tests, native interface captures, measured fuel comparisons, migration results and concise mode instructions. Ship the simple controls before extra automation or wiring simulation. Per-load duty cycles, arbitrary preset libraries, battery propulsion, remote wrist operation and automatic combat mode changes are outside this pass.
