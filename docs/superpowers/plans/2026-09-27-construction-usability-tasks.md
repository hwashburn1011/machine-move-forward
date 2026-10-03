# Construction usability: implementation tasks

Date: 2026-09-27; updated 2026-09-28. Status: **construction implementation, final frozen regression and controlled native UI review pass; human acceptance remains outstanding**. This is priority 2 of the five-part improvement plan. Relative effort uses S/M/L for scope, not elapsed-time promises.

## Delivery status — 2026-09-28

[Implementation details and evidence](../../godot-port/construction-usability.md) distinguish technical checks from remaining human acceptance. [The final focused report](../../godot-port/results/construction-usability-2026-09-28.json) records 79 passing cases with matching start/end source fingerprint `05ed64e1d551778300593de28241cdbb6e4a282c1180280f767e0dbf29d319f5`.

[The native review](../../godot-port/results/five-priority-ui-review-2026-09-28.json) records 21 passing checks on stable source `d334485bfded0f9371cd922701eb723e99afc98388b92f465ffc797aed4ade59`. Eight screenshots were visually inspected at 1440×900 and 1200×900 (text scale 1.3). Existing wrist native checks separately pass 45 cases, including large text and crouch. These are controlled input/layout checks, not human or performance evidence.

| Task | Status | Current evidence / remaining work |
| --- | --- | --- |
| B01 | Accepted | C01 baseline captured; contracts and exact shared-file ownership agreed with lead. |
| B02 | Review | Immutable exact-paid receipts, successful-operation signal and ordinary paid commit integrated; split-container/failure/ID checks pass. |
| B03 | Review | Bounded ephemeral undo, atomic full refund, live-instance relocation, support/use/lifecycle protection implemented. Full-output craft rollback preserves bag revision. Autonomous types without complete use tracking explicitly remain on cutter dismantling. |
| B04 | Review | Z undo / Y copy, remapped actions, echo rejection and catalog controls integrated by lead; 66 existing control checks and focused real-input cases pass. Native mouse PLACE, paid copy, undo and walking pass. Y preserves legacy C crouch. |
| B05 | Review | Blueprint-only copy implemented; loaded-crate test proves ordinary cost, fresh ID and no contents duplication. |
| B06 | Review | Cell/edge hysteresis and visible-surface automatic deck targeting implemented; explicit deck/guide behavior and boundary cases pass. |
| B07 | Review | Footprint/clearance outline, actual oriented actor-collider protection and advisory aisle warnings implemented. Green outline and amber power/clearance feedback are readable in the native capture; wider aspect-ratio extremes and subjective clarity remain acceptance limits. |
| B08 | Review | Shared pure power budget plus exact cost/owned/missing report implemented; live projection and zero mutation tests pass. |
| B09 | Review | Lead integrated persistent deck/material/power/control feedback with personal wrist and local stations preserved. PLACE, personal pin, controls and material/power text visually accepted at 1440×900 and 1200×900 with large text; original wider size matrix remains an acceptance limit. |
| B10 | Technical review passed; human evidence pending | Final focused 79, controls 66, workshop 23, traversal, native UI 21 and wrist 45 passes recorded separately. Native paid placement/copy/undo and subsequent walking pass. Combined affected regression passes 517 checks; preview workload timing is reported separately by F. Wider aspect ratios and C05 human observation remain acceptance limits. |

Parent: [five-priority delivery plan](2026-09-27-five-priority-delivery-plan.md).

## Outcome and scope

Players can correct a recent eligible construction mistake, select another copy of an existing blueprint, aim steadily at the intended deck/edge, and understand material, walking-space, and power consequences before placing. All changes use ordinary costs, unlocks, reach, safety, and support rules. The construction catalog remains separate from the personal wrist pack/log and from physical station interfaces.

This pass does not add demolition undo, whole-machine snapshots, free cloning, automatic bridge construction, arbitrary freeform placement, or a new wiring simulation. Existing save files and the heavily modified working tree are inputs to preserve.

## Inspected baseline evidence — before implementation

These are existing features, not new deliverables:

| Evidence | Existing behavior | Remaining gap |
| --- | --- | --- |
| `godot/scripts/building.gd:79`, `:129`, `:159` | Placement preview, 2 m grid, edge anchors, deck selection, 90-degree rotation, 12 m reach; actual click recomputes validation and ordinary payment. | Aim rounds directly to cells/edges; no stable candidate policy, undo journal, or copy action. |
| `godot/scripts/building.gd:230` | Unlock, footprint, support, stairs, fixed-equipment and active gangway rules; boarding extension checks its walking volume. | Preview exposes one failure string/color, not footprint/clearance/power consequences. Generic passage clearance is not described. |
| `godot/scripts/building.gd:106` | Relocate non-structural equipment while building, retaining instance identity. | No rollback of a relocation; selecting another copy requires returning to the catalog. |
| `godot/scripts/building.gd:317`, `:338`, `:373` | Dismantling cascades to dependents, returns 60% of definition cost, preserves contents or refuses overflow; destruction may drop overflow. | This is a salvage mechanic, not a safe full-price reversal. Floor connectivity needs a stricter hypothetical-removal check for undo. |
| `godot/scripts/session.gd:66`, `:79`, `:106` | Resources pool across player inventory and stores; paid `create_piece` allocates a unique ID and initial state. `pay` returns only success. | Exact payment provenance and successful-operation receipts do not exist. |
| `godot/scripts/session.gd:252` | Power accounts for generator condition/fuel, upgrade modifiers, priority shedding, and battery navigation backup. | Preview must reuse these rules without changing live charge, fuel, state, or time. |
| `godot/scripts/session.gd:368`, `:380` | Native snapshots persist structures/stores and restore repairs stale piece-ID counters. | Undo should deliberately remain outside snapshots and clear across load/new campaign/checkpoint boundaries. |
| `godot/scripts/terminal_pages.gd:27`, `godot/scripts/main.gd:184` | Separate catalog shows material counts and fixed-visible PLACE action; closing immediately returns the player camera and suppresses fire. | Add context actions without undoing the recent menu/input fix. |
| `godot/scripts/controls.gd:4`, `godot/scripts/ui.gd:629` | Keyboard remapping, action-token hints, and persistent placement controls already exist. | Extend the existing controls and prompt; do not create a second input map or hardcoded hint strings. |
| `godot/scripts/workshop_guide.gd:5`, `:62` | Optional eight-part upper-workshop guide selects starting deck/orientation and charges all normal build costs. | Improved snapping and undo must preserve its optional nature and refresh its next step after a reversed build. |

Existing regression coverage includes paid PLACE click/camera recovery in `playtest_checkpoints.gd`, remapped rotation/cancel in `controls_interactions.gd`, ordinary paid bridge construction plus walking both ways in `workshop_first_visit.gd`, and cascade/content preservation in `integration.gd`. These tests were inspected for planning; this document does not claim a fresh test run.

## Agreed implementation contracts

All API names below are **proposals** to settle in C02, before parallel edits.

1. **One authoritative build transaction.** `commit_placement()` remains the gameplay entry point. A proposed `commit_build_operation()` performs final validation, payment/state mutation and receipt creation atomically; visuals/layout invalidation and one successful-operation event follow success. Invalid aim, rejected cost, repeated input or cancelled selection produces neither a receipt nor a refund. Free initial/checkpoint setup is never undoable. Do not alter all callers of `create_piece` just to create undo history.
2. **One read-only presentation result.** A proposed `placement_report(spec, ignore_id)` returns candidate identity, blocking reason codes/text, non-blocking warnings, cost/owned/missing, deck/rotation, walking bounds and projected power. Catalog, build HUD and G01–G08 material/objective guidance consume this result. Stable blueprint/recipe IDs identify pins; copying, moving, undoing and catalog filtering never rename or silently replace a pin. Counts refresh after a committed transaction.
3. **One ephemeral construction journal.** Proposed `MMFConstructionHistory` owns receipts and usage revisions, not the campaign save. Receipt fields include operation ID, session generation, simulation timestamp, instance ID, before/after placement spec, immutable paid quantities with contributing bag IDs, and state/usage revision. It holds no live dictionary aliases and no whole-session snapshot. Monotonic piece IDs are never decremented or reused by undo.
4. **Side effects are explicit.** After successful place/move/undo, invalidate building layout, combat navigation and home/support caches once, update power, and let the workshop guide recompute on `layout_revision`. A proposed `construction_committed` event carries operation kind, blueprint, immutable paid/refunded quantities and result; P01–P09's optional local recorder subscribes. Do not add another recorder or per-frame telemetry.
5. **Shared-file integration has one owner at a time.** `main.gd`, `ui.gd`, `session.gd`, `controls.gd`, `player.gd` and checkpoint save lifecycle are coordinated in C02. Construction owns new dedicated history/preview modules and their tests; cross-cutting hooks land through the integrator. C03 owns any persistent schema migration; the current proposal needs none for history.

## Undo policy to implement and test

Offer **Undo last build** for the latest eligible placement or relocation, with a maximum of ten receipts and a 120-second window measured in active simulation time. Paused menus do not consume the window. These are initial design constants and can be tuned after C04. No redo in this pass.

- Only player-paid placement and committed player relocation enter history. Copy merely selects a blueprint and adds no history until an ordinary paid placement succeeds. Each click creates at most one receipt; keyboard auto-repeat must not undo multiple operations.
- Undo is a construction-context action: available in the separate catalog and while aiming a placement. It is unavailable in personal/station menus, cinematics, death, turret control and active combat. Check eligibility again at invocation, including reach and return-route safety. Taking damage/starting combat clears history, so combat cannot be rewound for materials.
- A placement reversal removes **only that exact instance** and refunds exactly its recorded paid resource quantities, regardless of current definition costs. No 60% salvage calculation, no refund for free pieces and no resource multiplication. No cascade occurs as a side effect of undo.
- In a cloned layout, removal must leave every remaining piece supported and keep required stairs, active dock/workshop return paths and permanent service access valid. Refuse if another piece depends on the target, if the player/NPC occupies its clearance/support volume, or if the active return route would be removed. `cascade()` alone is insufficient because it does not establish full horizontal floor connectivity. Undo children first in normal LIFO order.
- Functional use makes a placement ineligible: crafting/service through that station, refuelling/producing power, collecting/transferring contents, battery charge/discharge, firing a turret, operating the crane/quiet drive, resting, assigning a keepsake, or a caretaker job. Record a monotonically increasing ephemeral usage revision when the function actually happens. Opening a read-only catalog does not count. Passive floors/walls need not be permanently invalidated just because someone walked past; current occupancy, support and route checks still apply.
- Damage invalidates a receipt even if later repaired. A piece's state, health and store fingerprint must also match the expected post-operation state. Mutation-then-reversal must be detected by usage revision, not only equality of current values. If a functional-use path cannot yet report usage reliably, exclude that piece type from full-refund undo until it can; explain the ineligibility in the UI instead of offering an unsafe action.
- A relocation reversal moves the **same live instance** back to its original cell/edge/rotation and pays/refunds nothing. It must pass current placement/clearance checks at the original location. State, health, contents and usage must remain unchanged since the move. A loaded crate can be moved and reversed while untouched: retain its exact live inventory; never restore a stale inventory snapshot. No movement of a structural support is newly enabled by this pass.
- Preflight refunds against cloned destination bags. Prefer still-existing original contributing bags, then the normal bag order, excluding any removed container. The exact quantities matter; restoring old slot positions does not. If all refunded items cannot fit, refuse without removing the piece, altering inventory, producing world drops or consuming the receipt. Store changes used for payment cannot be overwritten by rollback.
- Undo never restores clock, fuel, health, research, rewards, objectives, cargo, threat, RNG or route state. A successfully reversed receipt is consumed exactly once. Expired, used, damaged or missing-target top receipts are discarded with a clear reason and do not silently undo an older operation on the same keypress; transient refusals such as insufficient refund room remain retryable.
- Clear history on load/import, new campaign, scene replacement, checkpoint launch/restart/return, death, combat start, scene transition and manual dismantling/destruction. Saving alone may retain in-memory history; loading that save starts empty. Ordinary catalog switches and placing another part preserve recent history. No history or usage revision is serialized into saves.

## Task list

The status table above is authoritative for current completion. The task definitions below preserve the original acceptance scope. C01 is the existing dirty-tree/baseline manifest; C02 is shared contracts and ownership; C03 covers save migration/round-trip; C04 is integrated checkpoint/native review; C05 is uncoached human campaign acceptance; C06 is handoff.

### B01 — Lock construction contracts and baseline cases (S)

**Depends on:** C01, C02. **Own:** this plan; new `godot/tests/construction_usability.gd` test scaffold and fixtures; integrator-approved touch points only.

Capture representative ordinary placement, failed payment, relocation and cutter demolition states. Record exact counts/instance IDs rather than image-only assertions. Confirm input ownership and proposed report/receipt fields with guidance and pacing owners. Keep demo/checkpoint save directories isolated.

**Acceptance:** baseline test cases expose the current missing undo/copy behavior as explicitly pending, not as passing; existing menu separation and actual PLACE-click test remain unchanged. Document approved interfaces before B02/B05/B06 proceed in parallel.

### B02 — Record atomic paid construction operations (M)

**Depends on:** B01. **Own:** new `godot/scripts/construction_history.gd`; `building.gd` commit hooks; narrowly scoped `session.gd` payment receipt helper via integrator.

Add a receipt-producing resource payment path that preserves current bag order and all-or-nothing behavior, without snapshotting the campaign. Record paid placements and successful relocations only. Copy dictionaries deeply; preserve IDs and no-op on failed transactions. Emit the agreed successful-operation event and refresh derived systems exactly once after success.

**Acceptance:** resources spread between pack and two stores are charged exactly once; insufficient cost changes no slots or structures; free initial/checkpoint pieces create no receipt; two queued click events cannot operate on one transaction twice; receipt quantities do not change when definition or inventory dictionaries change. Test all three: place, move and rejected move.

### B03 — Implement safe history eligibility and atomic reversal (L)

**Depends on:** B02. **Own:** `construction_history.gd`; `building.gd` removal/move safety helpers; new focused construction tests. **Coordinated hooks:** main lifecycle, station service/crafting, inventory transfers, salvage collectors, power/battery, home/caretaker and equipment use.

Implement the policy above, including structural dependency simulation, receipt lifetime, monotonic usage invalidation, full refund capacity preflight and preserve-live-state relocation. Route undo through its own transaction, not `demolish()` and not `load_payload()`. Clear history at every lifecycle boundary explicitly. Publish an eligibility result with a concise reason for the UI.

**Acceptance:** paid empty crate/floor place → undo restores exact resources and removes one ID; occupied crate cannot be refunded; loaded crate move → undo retains identical live contents and ID; damage→repair and use→reset remain ineligible; dependent fixtures and unsupported floor chains block undo; full bags cause a zero-mutation refusal; freed room permits retry; active workshop off-machine return cannot be cut; undo does not reset objectives, drops, RNG, time or fuel; save/load/checkpoint round-trips contain no actionable history; a second undo cannot refund the consumed receipt. Include 10-entry/expiry/LIFO cases. C03 verifies legacy native saves.

### B04 — Expose undo and remapped construction actions (M)

**Depends on:** B03; C02 UI ownership window. **Own:** `controls.gd`, `terminal_pages.gd`, build input/HUD integration; small `main.gd`/`player.gd` arbitration changes through integrator.

Add semantic `build_undo` and `build_copy` actions; implemented defaults are Z and Y. The initial C proposal was rejected because C is an existing secondary crouch alias. Use existing unique-key normalization/swapping and `{key:...}` hints. Show the latest reversible operation/refund or refusal in the Build catalog and a compact contextual undo hint during placement. Consume handled actions and reject key-repeat. Preserve existing Escape/cancel, RMB cancel, Q/use rotation, V relocate/shoulder context and click suppression.

**Acceptance:** new actions remap and survive settings load; legacy bindings remain reachable; undo while in wrist/storage/console does nothing; build key still escapes personal wrist to the catalog; one physical PLACE click closes the catalog and never fires or places twice; undo does not rotate, interact, move the camera shoulder or select a recipe. Pin IDs persist across all actions.

### B05 — Copy an aimed blueprint without copying contents (S)

**Depends on:** B01, B04 input contract (implementation may be prepared in parallel with B03). **Own:** `building.gd` copy helper; focused tests.

While in construction placement, copy a reachable aimed player-built piece into selection: definition ID, orientation and applicable deck/edge anchoring only. Validate recognized definition and current unlocks. Catalog hints explain how to enter construction and copy. Keep copy separate from relocation (`moving` remains empty); subsequent placements go through the normal paid commit.

**Acceptance:** copying a full crate yields an empty new crate with a new ID and charges ordinary cost; copying a charged battery, damaged turret or decorated shelf never clones charge, damage, ammo/contents or keepsake state; copy itself changes no inventory/structure count; locked/unrecognized/fixed-chassis targets produce an informative refusal; copying does not replace the user's pinned recipe/part. Cancelling has no transaction effect.

### B06 — Stabilize grid, edge and deck targeting (M)

**Depends on:** B01, B02 report contract. **Own:** new `godot/scripts/build_preview.gd`; target selection in `building.gd`; guide adapter in `workshop_guide.gd`.

Extract deterministic candidate calculation from visual mutation. Add small documented hysteresis around cell/edge boundaries so slight mouse motion does not oscillate between targets. Reset candidate memory on changed blueprint/manual deck/move target, cancellation and scene load. In automatic-deck mode, prefer an actually visible build-deck surface under aim when supported; retain the existing plane fallback. Explicit deck selection remains authoritative and always visible. An optional workshop guide may bias a nearby matching blueprint within a small snap radius; it never chooses a distant/occluded target or commits for the player.

**Acceptance:** seeded aim samples around grid corners hold stable until crossing the release threshold; deliberate movement changes target promptly; edge axis/negative coordinates/all four rotations behave consistently; upper deck does not silently snap to a hidden lower floor; manual deck always wins; candidate outside 12 m is rejected; commit uses the latest camera/rotation and the same candidate rules as preview. Normal paid workshop route still builds and walks both ways.

### B07 — Explain footprint and walking clearance (M)

**Depends on:** B06; C02 camera/collision agreement with combat/movement owner. **Own:** `build_preview.gd`, `building.gd` validation/report; preview visuals and focused tests.

Render a lightweight footprint and walking-space outline using the existing runtime colliders plus authored passage/interaction envelopes. Red means an authoritative blocker; amber means a useful but non-binding clearance warning; green means currently valid. Preserve current stairwell/boarding hard rules and add player/NPC overlap protection appropriate to the real capsule. Show a single actionable primary reason plus concise warnings. Advisory access envelopes for general stations must not retroactively reject older valid layouts or pretend to prove full navigation connectivity.

**Acceptance:** red blocker and commit refusal agree; an amber narrow passage can be placed if otherwise valid; player capsule overlap is rejected without cost; stair/bridge walking volume matches traversal tests; candidate ignores its own moved collider only, not neighboring equipment; full-size native screenshots show clearance and text at 16:9 and 4:3/large text. Preserve current authored workshop access and permanent chassis rules.

### B08 — Preview material and power consequences consistently (M)

**Depends on:** B02, B06; guidance report contract in C02. **Own:** `build_preview.gd`; pure power projection helper extracted/shared from `session.gd` through integrator; catalog/HUD hookup through UI owner.

Show required/owned/missing resources for the selected operation, distinguishing free relocation from paid copy/placement. Display added draw/capacity, projected spare capacity and affected priority groups, including no-fuel/damaged generators and navigation-only battery backup. Reuse authoritative power rules in a side-effect-free evaluation; never insert a temporary piece into the live session. Insufficient power is a warning unless an existing authoritative build rule forbids the placement. Leave exact power balance/reward tuning to P01–P09.

**Acceptance:** material totals match ordinary pack+store payment; move cost is zero; projected shedding agrees with real power after commit for representative generator/refinery/turret/lamp and battery cases; 100 repeated previews leave fuel, charge, clock, resources and RNG byte-identical; pin counts refresh after place/undo without changing their semantic ID. Invalid power projection cannot crash placement.

### B09 — Integrate compact, persistent construction feedback (M)

**Depends on:** B04–B08; guidance HUD integration window. **Own:** final `ui.gd` build prompt integration, `terminal_pages.gd`, optional dedicated build HUD helper.

Extend the existing visible placement controls with selected part, deck/rotation, primary reason, compact materials and power/clearance status. Keep detail expansion optional. At most one owner composes the HUD with pinned guidance, objective markers and combat prompts; hide construction overlays when placement ends. Accessible text/symbols must explain validity without relying on preview color alone. Construction stays outside the wrist, and station tabs remain contextual.

**Acceptance:** no clipped PLACE/UNDO actions at 1280×960 and 1920×1080, including largest existing text scale; gamepad support is not implied by these keyboard/mouse tests; open/close transitions restore camera/mouse exactly as current tests require; no stale build hint obscures combat or station interaction; remapped labels contain no literal tokens or old keys.

### B10 — Checkpoint acceptance and performance regression review (M)

**Depends on:** B03–B09; feeds C04–C06 and supplies additional regression cases for the C03 migration owner. **Own:** construction tests and construction evidence section in a results artifact; shared review scripts/docs only through integrator.

Use `first-steps` for ordinary costs and mistakes; `scanner` for generator/station power; `workshop` for eight-part navigation/dependencies; `battery` for stateful equipment; `defense` to verify combat cancellation and history invalidation. Test both normal campaign payloads and isolated playtest namespaces. Preserve current campaign sentinel checks. Include an ordinary uninterrupted construction interval after checkpoint tests so repeated menu transitions and changing inventory are exercised together.

**Acceptance:** run focused construction/history tests plus `controls_interactions`, `playtest_checkpoints`, `workshop_first_visit`, `integration`, `traversal`, and relevant station/power tests; use the central suite selection for any additional changed paths. Native capture shows actual input, placement/undo and subsequent walking. Compare frame timing with C01 baseline on a populated ship: cache stable geometry/power reports on candidate/layout/resource/power revisions, perform bounded dynamic occupancy checks, and never rebake navigation just for a preview. Report p50/p95/p99 and worst frame; acceptance is no reproducible preview-induced stall, with any measurable regression investigated before C04. C05 asks a player to place, copy, correct and connect the workshop without coaching; record wrong placements, corrections, refusals and completion path rather than declaring usability from automation alone.

## Suggested parallel assignment

After C01/C02, one construction authority agent owns B02/B03 and a presentation agent can prepare the isolated B06/B07 preview module against the agreed contract. B05 is small and can be done by either after the input contract settles. The root/integration owner merges B04/B08/B09 shared-file edits serially with guidance and combat changes. B10 is an independent verification/review assignment after integration, not concurrent edits to the same building/UI code. Keep the number of agents aligned with available slots across all five priorities.

## Risks to resolve before handoff

- **Refund exploits:** mutation signatures must include use history, not only the current state; never copy a container's old contents over its live inventory. Explicit exclusions are safer than uninstrumented eligible stateful types.
- **Support correctness:** existing dismantle cascade and `supported_floor` answer different questions. The hypothetical-removal validator must reject disconnection of remaining floors without mutating live structures or recursively cycling through invalid old-save layouts.
- **Input leakage:** current UI-close camera fix is a required regression contract. Build copy/undo must be consumed in their context before combat/reload/use handling.
- **Visual truth:** a green footprint promises authoritative placement validity only, not global path reachability. Mark advisory passage/power outcomes as warnings with plain explanations.
- **Performance:** avoid allocating meshes, cloning whole sessions, walking the whole scene tree, or rebuilding navigation each preview frame. Shared report caches must invalidate on real resource/power/layout changes and still revalidate when the user commits.
- **Ownership:** no parallel agent rewrites `main.gd`, `ui.gd`, `session.gd` or `player.gd` while another owns them. Preserve the current dirty tree and checkpoint save isolation throughout.
