# Nomad engineering, servicing and emergency recovery

Implemented 28 September 2026 in the native Godot game. Technical checks pass; uninterrupted human campaign and economy acceptance remain pending. The [delivery plan](../superpowers/plans/2026-09-28-recovery-and-operations-delivery-plan.md) records the implementation and remaining evidence.

## Where to find the controls

Walk down the permanent side stairs to the **service deck**, one deck below the starting deck. The existing switchgear cabinets are labelled **Engineering / Service**. Press **E / Use** nearby to open their own interface. The cabinet works with the power off. Each installed generator also has a local Start/Stop button.

From the top-deck aisle, take the stairs on the left side. At the service-deck stair foot, cross inward before walking toward the front cabinets; the outer edge has fixed equipment. No player-built stairs or floor are required.

Engineering provides Overview, Modes, Devices and Service. The personal wrist still contains Pack/Log. The helm handles navigation and explicitly resumes the previous travel configuration on a valid departure. It no longer exposes unrestricted engineering tabs. Build → Place still closes the catalog and returns control to placement.

## Campaign introduction

| Moment | What becomes relevant |
| --- | --- |
| First playable deck | Manual generator/device switches, exact repair costs, pooled fuel transfer and emergency service. No unlock or construction bill. |
| Damage after first defense | A contextual reminder points to engine repair; no artificial tutorial damage. |
| Wake docking | Docked stops generator debit during exploration. Cruise is available around the first docking/gyro recovery. |
| Foundry completed | Salvage/Defense modes and optional device priorities. Installed collectors and guns make the tradeoff tangible; purchases remain optional. |
| Foundry and Orchard return stations | After required recoveries, the existing common return console offers its own service menu. Both Orchard approaches share equivalent access and one persistent stock pool. |
| Array and later travel | Existing navigation previews use real source count and current propulsion condition. Crane acquisition prerequisites remain intact. |
| Installed battery / quiet drive | Engineering exposes charging/backup permissions for all banks. Quiet-drive switching stays at its own assembly. |
| Final bearing | Propulsion/navigation readiness is checked; the existing verified checkpoint still precedes commitment. |

## Operating modes

Preview a mode to see the sources it starts/stops and the equipment it serves/disables, then choose **Apply operating mode**. Selecting a preview alone changes nothing. Manual edits become Custom; neither damage nor an encounter silently starts another generator.

- **Cruise:** navigation and installed defense; unnecessary industry off.
- **Docked:** generators and discretionary machinery off at a real dock. Installed permitted batteries can still support navigation briefly. Captive expedition machinery remains independent.
- **Salvage:** navigation, collectors and an installed crane first; guns receive remaining capacity.
- **Defense:** navigation and guns, with discretionary industry off.

Every running generator uses **3.6 fuel per active minute before research modifiers**. Merely reducing demand does not save fuel unless it lets a generator stop. Two running sources cost twice as much. A configured machine's new generator starts stopped, with a construction warning and local Start control.

Turning all sources off stops ordinary propulsion. Restarting restores it subject to engine/leg condition and existing movement rules. An enabled source with zero fuel retains the existing slow emergency crawl; a destroyed engine cannot crawl. A battery never powers propulsion or guns. Quiet drive retains its speed/output/detection tradeoff and has no direct fuel discount.

The shared power calculation supplies live simulation, configuration/build previews and equipment reports. Configured loads receive whole-device allocations in priority order. Untouched older configurations retain their previous group-shedding policy. Routes now check the actual navigation consumer rather than treating any positive generation as enough.

Each route button shows a fuel estimate for its own distance. During an approach the helm uses the remaining distance. These estimates exclude exploration, fights and stops; they are not a promised total trip cost.

## Repairs and fuel

Service shows the existing scrap price for each damaged engine/leg/generator repair. Owned fuel can transfer from the pack and aboard storage in amounts of 1, 5 or all that fits. Whole fuel items are not spent when less than one unit of headroom remains.

Foundry and Orchard each offer **20 pump fuel at 2 scrap per unit**, delivered into the tank. Stock and payment survive save/load and cannot regenerate by reopening the menu or changing the Orchard approach. These are initial balance values; continuous-play observations are still needed. Existing salvage, cache and R-9 rewards are unchanged.

## Emergency service

At a service-deck cabinet, open Service and select **Request emergency service** when stranded. The manual beacon needs no fuel, receiver module, electricity, cutter or companion. Close the panel; after threats clear, hold and release Use for each local action: isolate, connect, restart. A small service drone marks the working port. Pause offers **Cancel emergency service**.

Assistance fills only unresolved deficits: an exhausted tank can reach 20 fuel, an unaffordable critically damaged engine can reach 50% health, and a needed generator can be restored. A missing generator can receive a fixed loan starter, independent of whether inventory alone suggests a new generator is affordable: inventory does not prove there is a usable construction site.

The loan uses ordinary generator fuel/output rules, cannot be copied/dismantled for materials, and withdraws when a real working generator replaces it. It cannot add spare generation alongside ordinary generators. The service grants no loose supplies, story components or objective completion. Existing fuel or an affordable repair remains the normal solution for that fault.

Requests can wait through combat; they do not delete enemies, hooks, theft or scripted encounters. During the safe stationary service procedure, new encounters wait. Damage, lost reach or death interrupts the procedure safely. Completed steps and request IDs persist; repeating a completion callback cannot repeat the award. A later real shortage remains recoverable without a campaign token or increasing fee.

## Focused playtests

The original 19 checkpoint IDs remain. Four named starts were appended rather than adding a second scenario selector, keeping independent save/restart behavior straightforward:

| Checkpoint | Exact purpose |
| --- | --- |
| 20 / Emergency — empty supplies | Zero tank fuel and empty owned supplies; initial generator/engine retained. |
| 21 / Emergency — destroyed machinery | Zero tank/supplies, destroyed engine and no generators; test the loan starter. |
| 22 / Engineering — generators stopped | Receiver ready, normal stock, generators deliberately off; solve with a switch, without assistance. |
| 23 / Engineering — Foundry equipment | Two generators, refinery, collector and both gun types; compare operating modes. |

Checkpoint previews show actual supplies, engine condition, installed equipment, stopped sources and mode. Later starts with optional heavy loads use Cruise so navigation remains available. Checkpoint saves stay separate from campaign saves.

## Validation scope

The new suites test accounting, old/new saves, stale proposals, repeated service callbacks, missing generators, pooled fuel, finite pump stock, actual station reach, input ownership and return to construction. A native review walks from the top deck through the real stairs/service aisle, uses actual keyboard/mouse input, and captures standard and 4:3 large-text interfaces.

The [final evidence report](results/recovery-and-operations-2026-09-28.json) includes source hashes, logs and captures. All runs used runtime fingerprint `1d831f5f685c9c7b4480eeecbf16cc1d4355c5452b59cd78881a9a74adc6963f`, unchanged from each run's beginning to end:

| Validation | Passed checks |
| --- | ---: |
| Focused headless recovery/operations suite | 97 |
| Native Vulkan review on RTX 3070, including those contracts plus walking and input | 117 |
| Construction usability | 79 |
| Objective guidance | 74 |
| Pacing contracts | 25 |
| Campaign integration | 109 |
| All 23 checkpoints | 325 |
| Later expeditions | 85 |
| Asynchronous saves | 31 |

The seven existing suites total **728 checks**. The two focused counts overlap and should not be added as unique checks. No failures or engine/script errors were reported. Historical reports remain historical; these results are stored separately. The source manifest covers code, definitions, scenes, shaders and project configuration, not binary art assets.

Review captures: [reached cabinet](previews/recovery-operations/recovery-cabinet-walking.png), [operating proposal](previews/recovery-operations/recovery-modes.png), [4:3 service panel](previews/recovery-operations/recovery-service-large-4x3.png), and [route costs](previews/recovery-operations/recovery-route-estimates.png).

To repeat the checks from the repository root:

```powershell
python -X utf8 tools/godot/run-recovery-regressions.py
& ./test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script tests/recovery_operations.gd
& ./test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script tests/recovery_native_review.gd
```

These are controlled technical tests. They do not establish that the service prices, 20-fuel emergency reserve, repeated-assistance frequency or whole-campaign pacing are balanced. Uninterrupted opening→Foundry and Orchard→ending observation, an uncoached participant, and broader performance comparisons remain pending; the prior five-priority plan's human acceptance gates remain open.
