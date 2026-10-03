# Construction usability delivery

Implemented 2026-09-28. The controlled native construction/wrist review and final frozen construction regression pass. No human playtest or performance improvement is claimed here.

## Player behavior

- Open construction with **B**, choose a part and **PLACE**. The catalog is separate from the personal wrist and physical station screens.
- While placing, **Y** copies an aimed installed blueprint and its orientation. Placing that copy pays ordinary costs and creates empty, newly initialized equipment. It never copies cargo, battery charge or an instance ID. C remains the existing secondary crouch key.
- **Z** undoes the most recent eligible paid placement or relocation; the catalog also has an Undo button. Both actions can be remapped. Repeating a held key cannot consume several undo records.
- The journal holds up to ten operations for two minutes of active simulation. A placement refund uses the exact amounts actually paid. A move reversal preserves the same live part and its current untouched contents, and costs/refunds nothing.
- Full bags, changed/used storage, damage, dependencies, occupied walking space and protected return routes prevent unsafe reversals. Load/new campaign/checkpoint boundaries, combat and demolition clear history. History is not saved.
- Hull pieces, passive decorations, crates and boarding extensions are supported. Workbenches/refineries are eligible until actual successful use. Autonomous equipment without complete use tracking—generators, batteries, guns, collectors, cranes and quiet drives—explicitly directs the player to ordinary cutter dismantling instead of offering a full-price refund.
- Grid/edge hysteresis keeps slight aim motion from flickering between candidates. Automatic deck targeting can use a visible deck surface; explicit deck controls remain authoritative.
- The preview shows a footprint/clearance outline and distinguishes invalid placement from advisory warnings. Material counts and projected power come from the real inventory and power rules. Commit rechecks current geometry, reach and resources.

## Implementation and ownership

The construction worker changed `godot/scripts/building.gd` and added `construction_history.gd`, `build_preview.gd`, `power_budget.gd` and `tests/construction_usability.gd`. The lead integrated shared session, inventory revision, UI, input and lifecycle hooks. `MMFPowerBudget.calculate` is now shared by live power and previews; charge advancement remains in `MMFSession.update_power`.

Successful place/move/undo emits one immutable `construction_committed` event. Preview, copy and invalid operations emit no resource transaction. The optional local recorder consumes the event through the lead's hook. Pins retain semantic recipe/blueprint IDs across construction operations.

Clearance initially used an axis-aligned stair bounding box, which falsely blocked the existing workshop route. It now tests the actual authored oriented collider. The unchanged workshop traversal fixture passes its paid eight-part construction and input-driven climb/return.

## Evidence and limits

| Verification | Result | Evidence |
| --- | --- | --- |
| Focused authority and real input events | 79 passed, no failures | [Construction result](results/construction-usability-2026-09-28.json), [run log](../../test-results/final-frozen-construction_usability.log) |
| Existing remapped controls/interactions | 66 passed | [Run log](../../test-results/construction-controls_interactions-final.log) |
| Paid workshop construction and walking both ways | 23 passed | [Run log](../../test-results/construction-workshop_first_visit-refined.log) |
| Existing machine/stair/gangway traversal | Passed | [Run log](../../test-results/construction-traversal.log) |
| Current wrist mount, inventory, large text and crouch | 45 passed; screen visually clear of forearm geometry | [Run log](../../test-results/five-priority-wrist-native-review.log) |
| Native objective/pin, separate catalog, paid place/copy/undo and walking | 21 passed; eight screenshots inspected | [Native report](results/five-priority-ui-review-2026-09-28.json), [run log](../../test-results/five-priority-ui-native-review.log) |

The final construction report records matching start/end source fingerprints: `05ed64e1d551778300593de28241cdbb6e4a282c1180280f767e0dbf29d319f5`, with 79 checks and no failures. The earlier unstable development run has been superseded. Final verification exposed a fixture race: a copy key arrived before newly created colliders entered the physics space. The fixture now waits for that synchronization and verifies the exact aimed crate; no production change was needed. [Final run log](../../test-results/final-frozen-construction_usability.log). Native evidence below retains its separately measured source fingerprint.

The focused suite includes split pack/store payment, blueprint price changes after payment, full-bag atomic refusal and retry, store use then emptying, loaded-store relocation, copying without item duplication, damage then repair, expiry/LIFO/bounds, support-chain and active-gangway refusal, personal-menu/input isolation, used workbench ineligibility, failed crafting rollback preserving storage revision, actual remapped key events, stable snap boundaries, occupied equipment and read-only power/energy projection.

The controlled native review used the ordinary player camera and an isolated playtest save namespace. At 1440×900 and 1200×900 with text scale 1.3, objective/pin text and the personal-only wrist remain readable, catalog PLACE remains visible, and the wrist screen has no forearm occlusion. A real mouse click exits the catalog into placement without firing; paid placement, Y copy followed by a second paid placement, Z exact refund, and subsequent keyboard walking all pass. The green clearance outline and amber refinery power warning are visible with deck, material and action hints. Screenshots are linked individually in the native report.

The native report records stable source fingerprint `d334485bfded0f9371cd922701eb723e99afc98388b92f465ffc797aed4ade59`. It is controlled input/layout evidence, not an uncoached human playtest or timing benchmark; concurrent headless correctness runs prevent performance inference. Other aspect-ratio extremes and subjective construction feel remain acceptance limits. C05 still requires uninterrupted human observation.

## Separate opening resource audit

[The synthetic opening ledger](results/opening-resource-ledger-2026-09-28.json) runs ordinary session transactions for 500 seeded cases. It is accounting evidence, not 500 gameplay runs. Its 9,949 accounting assertions must not be added to a gameplay regression total.

The current minimum opening bill is 228 scrap: three supporting floors, refinery, workbench, six refining batches, scanner module and manual deck gun. The initial generator/floor already exist. Twelve refined components pay for the workbench, module and gun. The campaign starts with 260 scrap before the first legitimate cargo reward.

Across 100 seeds per case, ordinary completion leaves 66–90 scrap; an extra supported crate leaves 35–67; repairing a half-health refinery leaves 58–82. The isolated zero-fuel scenario collects 2–8 actual cargo rewards (median 3) to fund the unchanged scan. It does not establish how long or how safely collecting that cargo takes.

The missed-cargo case skips reward collections only. Spawn and other gameplay also consume shared RNG; the audit does not model those calls, their timing or resulting world sequence. It does not simulate real throws, travel delays, encounters or later campaign rewards. Resource abundance at checkpoints is not used. No timer, reward or fuel-rate tuning follows from these results alone.

The ledger's recorded stable source fingerprint is `547230bfae2e3e391dc205a82bfbeb3d223ab4f1301208549cea5a4c282e6111`; later integrated runs must retain their own fingerprint instead of reusing it.
