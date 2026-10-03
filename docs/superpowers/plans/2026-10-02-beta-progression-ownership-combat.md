# V1 beta: progression, ownership, and combat

Date: 2026-10-02. Status: first playable delivery implemented and verified. The user approved these three priorities and asked to plan them, then begin. This plan covers the native Godot edition and preserves the completed Art200 collection, existing campaign saves, and all prior work in the working tree.

## Outcomes and order

1. **Campaign flow:** a new player can follow the next achievable task, understand useful upgrades, conserve fuel while exploring, and continue after setbacks. Validate earned resources and real simulation time separately from human comprehension.
2. **Personal ownership:** ordinary salvage feeds an optional restoration project, then restrained repainting of owned equipment and selected machine panels. Quiet sessions produce visible improvements without a new mandatory progression bill.
3. **Distinct danger:** existing enemy roles communicate intent; Gatekeeper G-01 has recognizable hardware, a readable attack cycle, fair escalation, and a persistent cosmetic acknowledgment for every legitimate resolution.

## First playable delivery

| Work | Concrete implementation | Acceptance |
| --- | --- | --- |
| P1: opening guidance | Replace the historical 12-component refining quota with the next actual workbench/module requirement. Salvaged components count; destroyed stations and spent materials produce truthful next steps. | Pure guidance, old saves valid, actual recipe/build costs, no extra material gate. |
| P2: journey preparation | Show current running cost and fuel horizon at the helm; explain stopped/docked operation. Add conditional recovery/upgrade acknowledgments through the existing radio queue. | No automatic spending or mode switching; no fictional NPC knowledge; captions remain bounded and persistent. |
| P3: earned campaign evidence | Build a fresh-save normal-clock scripted soak, starting with opening through Wake, then supporting later continuation where practical. Collect spawned cargo, buy/craft/refuel through gameplay authorities and retain saves and transaction evidence. | No checkpoint stock, grants, direct story/distance/clock rewrites, time acceleration, or invulnerability. Clearly identify automated actor shortcuts. Human comprehension and full uninterrupted campaign acceptance remain separate gates. |
| O1: Patchcoat restoration | Recover three finish-parts from ordinary unopened cargo; after repairing the scanner, restore a tool set at a workbench for those parts and six scrap. | Optional, idempotent transaction; full bags retain rewards; no changes to the existing resource RNG sequence. |
| O2: painting | Use the existing paint trolley as a physical finish console. Repaint eligible furnishings/generators and two named machine enamel zones using the muted Art200 palette. Charge two scrap for a changed committed finish; preview/cancel/no-op cost nothing. | Instance-local materials retain wear/labels/metal; bounded state survives saves, movement and rebuilds; no preview state leaks. Existing 50 blueprints remain available. |
| O3: ownership and rewards | Expose existing safe relocation for starter generator/furnishings; retain cutter access and support checks. G-01 clearance grants a service-mark cosmetic. Three optional keepsake projects refinish an owned radio cabinet, memory board or field chair for one recovered finish part and four scrap each. | No movable structural hull or disconnected machine parts; no duplicate refunds/rewards or attached keepsake receipts; no mandatory trophy or paint cost. |
| C1: enemy intent | Add bounded tells for existing ranged, lunge, spin-up, shield and sabotage/theft roles. | Tell timing reflects actual AI; no altered damage/drop/animation identities or per-frame resource churn. |
| C2: signature guardian | Fit authored G-01 relay/shutter hardware to the existing carrier. Shroud opens with the real cooling window. Distinct lock/salvo/cooling cues and readable warning geometry. After two cycles and half hull, use a cross salvo with longer warning and recovery. | Original hull health retained; dodge, engine disable, weapon disable, hull destruction and decoy remain valid; death grants a fresh lock; no late impacts after cancellation. |
| C3: lasting acknowledgment | Persist the first destroyed/disarmed/evaded outcome once and expose the service mark. | All legitimate approaches earn the cosmetic; evasion still awards no destruction cargo; old saves default to no invented outcome. |

## Ownership and integration

- Root owns shared session/save validation, objective/journey/UI/main/building integration, delivery evidence, and native visual/performance scheduling.
- Customization agent owns the new personalization module, material presentation helper, focused tests, and optional preview tools.
- Combat agent owns guardian/tell/presentation modules, narrowly scoped enemy/craft/audio hooks, dedicated art, and focused tests.
- Campaign audit agent owns the new earned-supply soak fixture and launcher. It does not alter progression or resource tuning to make its test pass.
- No concurrent rendering benchmarks. The live Blender session remains under root control. Source changes freeze before final combined tests and timings.

## Verification and release gates

Preserved baseline: `test-results/beta-next/runtime-before.zip` with 328 source files and a SHA-256 manifest; dirty-tree inventory saved alongside it. Historical Art200 reports remain unchanged.

Run focused transaction/save/guidance/combat tests, then affected campaign/construction/salvage regressions on a frozen source hash. Inspect native UI, paint, enemy tells and guardian captures. Run extended rendered workloads with multiple drones and dense construction; report frame outliers, memory/cache growth and save timings, with hardware and workload stated. Rebuild any compiled machine source manifest only if an actual bake dependency changes.

The first delivery is complete only when its implemented rows have evidence and remaining gates are explicit. A successful scripted actor does not certify uncoached story comprehension, final difficulty, a complete natural campaign playthrough, low-spec hardware performance, or V1 release readiness.

## Delivery receipt

P1–P3, O1–O3 and C1–C3 are implemented within the first-delivery scope. The frozen runtime passed 10,951 checks across 27 suites, 42 native visual views, one continuous normal-clock earned opening-through-Wake case, 15 sequential rendering workloads, and personalized save profiles at 2/300/900 pieces. [Player guide and measured results](../../godot-port/beta-progression-ownership-combat.md) and [machine-readable evidence](../../godot-port/results/beta-next-2026-10-02.json) record the details and limitations. Later natural campaign/human/hardware acceptance remains open.

Next authorized work: regroup the three decks into purposeful spaces with open interior building room, guide major installations into sensible connections, protect player access and cargo clearance, then revise weapon/ambient audio and replace intrusive warnings with credible machine and wrist-terminal presentation. That work receives its own plan and verification; it does not retroactively alter this delivery's frozen evidence.
