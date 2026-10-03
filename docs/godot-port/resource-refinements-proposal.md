# Narrow native resource refinements — implemented design record

Prepared and integrated 2026-09-28 from [later resource accounting](later-resource-audit.md). The lead applied the four-file change with the strict explicit powered-entry variant discussed below. Quantities, rewards, spawn intervals, fuel rates, reload rules and equipment costs stay unchanged. This document preserves the design proposal and intended regression cases; current verification belongs to the implementation handoff and result reports.

## Reviewed patch (implementation uses strict powered entries)

Four files, no save-format bump or exported-data regeneration:

```diff
--- a/godot/scripts/native_progression.gd
+++ b/godot/scripts/native_progression.gd
@@
 const RETIRED_PIECES=["condenser","planter","stove"]
+# Ammo items remain valid legacy inventory; native reloads use no reserve.
+const RETIRED_RECIPES=["craft-rifle-ammo","craft-shotgun-ammo"]
@@
 static func apply(data: Dictionary):
     data.STARTING_INVENTORY=supplies(data.STARTING_INVENTORY)
     data.RECIPES=data.RECIPES.filter(func(recipe):
-        return recipe.output.itemId not in RETIRED_ITEMS and not recipe.inputs.keys().any(func(id):return id in RETIRED_ITEMS))
+        return recipe.id not in RETIRED_RECIPES and recipe.output.itemId not in RETIRED_ITEMS and not recipe.inputs.keys().any(func(id):return id in RETIRED_ITEMS))
@@
+static func retired_recipe_pin(value) -> bool:
+    return value is Dictionary and value.size()==2 and value.get("kind")=="recipe" and value.get("id") is String and value.id in RETIRED_RECIPES
+
 static func runtime_contract(runtime: Dictionary):
--- a/godot/scripts/save_validation.gd
+++ b/godot/scripts/save_validation.gd
@@
 static func polish_state(value,data: Dictionary) -> bool:
     if not value is Dictionary: return false
-    if not MMFObjectiveGuide.valid_pin(value.get("pin",{}),data):return false
+    var pin=value.get("pin",{})
+    if not MMFObjectiveGuide.valid_pin(pin,data) and not MMFNativeProgression.retired_recipe_pin(pin):return false
--- a/godot/scripts/session.gd
+++ b/godot/scripts/session.gd
@@
     polish.merge(raw.get("polish",{}).duplicate(true),true)
     polish["pin"]=polish.get("pin",{})
+    if MMFNativeProgression.retired_recipe_pin(polish.pin):polish.pin={}
     polish.activities=MMFExpeditionMechanisms.migrate_activities(polish.activities,story)
--- a/godot/scripts/salvage.gd
+++ b/godot/scripts/salvage.gd
@@
 func spawn():
-    if "salvage-crane" in game.session.expedition_gear.recovered and int(game.session.distance/90)%4==0:
+    var crane_ready="salvage-crane" in game.session.expedition_gear.recovered and game.session.structures.any(func(p):return p.definitionId=="salvage-crane" and p.health>0 and game.session.powered.get(p.instanceId,false))
+    if crane_ready and int(game.session.distance/90)%4==0:
         if spawn_heavy(Vector3(20,2,-42)):return
```

Patch indentation above is illustrative; implementation should retain each file's tab indentation.

`MMFNativeProgression.available(session,id)` already checks recovery and positive installed health, but not power. The implemented stream predicate additionally requires `powered.get(instanceId,false)` for the same living crane, so an absent power result cannot accidentally enable heavy cargo. The normal main loop calls `session.tick()`/`update_power()` before `salvage.update()`/`spawn()`; tests that directly spawn explicitly update the budget. No global station helper behavior changed.

The powered condition intentionally keeps ordinary hookable cargo available while the installed crane is unpowered. If power or crane condition is lost after a heavy crate already spawns, that existing crate remains intact and ordinary subsequent qualifying opportunities fall back to normal cargo. Clear cable path/range and free storage remain operation-time checks, not spawn rules.

## Compatibility and affected consumers

- `native_progression.apply` is the native catalog boundary. Filter only the two recipe IDs; retain `ITEMS`, ammo stack sizes, existing inventory/stores/loot, weapon `reserveAmmo`, magazine contents and save fields unchanged. Existing crafted ammunition is neither deleted nor converted/refunded. Calling the filter repeatedly is idempotent. Scanner, refining, repair-kit, extended-magazine and signal-decoy recipes remain available.
- `terminal_workshop.render` enumerates the filtered `RECIPES`; `session.craft` rejects a missing recipe before payment. `ui.browse` already replaces a stale selection with its first valid entry before calling recipe details, so no new UI-specific exception is needed. Existing inventory/storage/details continue to display retained ammo items.
- `objective_guide.valid_pin` should continue rejecting unavailable recipes for new pin actions/checklists. Save validation runs **before** restore-time polish normalization, so filtering alone would invalidate an older save pinned to either ammo recipe. The exact allowlist in the proposed validator permits only `{kind:"recipe", id:<one retired ID>}`; restore then clears that obsolete pin on its copied state. Unknown IDs, wrong kinds/types, extra keys and malformed surrounding save data remain rejected atomically. Other manual pins survive unchanged. No current opening/progression objective pins these recipes.
- `main.load_game` and checkpoint restoration create a trial session and use `restore_native`; both gain the same pin compatibility. Checkpoint stock and ordinary save schemas need no changes. `save_validation` remains the shared owner; no bypass at the UI is sufficient.
- `salvage.spawn` changes only future replacements in the normal stream. `gear_site` explicitly calls `spawn_heavy(...,true)` on crane recovery/update; leave that API and `trialSpawned` untouched so the demonstration can appear before installation. `salvage.restore` retains old heavy/elevated/claimed cargo without imposing the new stream gate or rewriting rewards.
- Hand hook, automatic collectors, hoist range/path/power checks, cargo pooling, overflow, saved cargo and crane installation prices remain unchanged. Normal crates take the existing RNG draws when replacing a formerly heavy opportunity; do not claim the later whole-world RNG sequence is identical across versions. No extra random draw is introduced outside that existing ordinary path.
- Existing suites with relevant coverage: `objective_guidance.gd` (strict pins), `later_expeditions.gd` (native migration, crane recovery/trial/hoist/overflow), `playtest_checkpoints.gd` (local recipes and saves), `audit_parity.gd` (craft rollback and weapons), `opening_resource_ledger.gd` (opening costs). They should keep their original assertions. The patch itself needs no change to exported JSON, asset generation, player, combat, guidance semantics, gear site or checkpoint production code.

## Focused regression cases after slot release

Dedicated [native_resource_refinements.gd](../../godot/tests/native_resource_refinements.gd) exercises the outcomes below; its [81-check result](results/native-resource-refinements-2026-09-28.json) passed. The test compares complete durable JSON values across integer/float restoration and checks world positions with Vector3 precision tolerance. It does not claim a human playthrough or fuel-balance measurement.

1. Native session catalog omits only rifle/shell crafting (plus already retired food); remaining recipes match their previous definitions, output and price. Applying native definitions twice leaves the same catalog.
2. With functional workbench and ample stock, direct craft calls for both retired IDs return false and the complete resource snapshot is unchanged. Workbench rows omit those IDs and recover from a stale selected recipe without indexing an empty array. Scanner/repair-kit/decoy crafting still consumes its normal inputs and emits its normal transaction.
3. Restore an old save containing both ammo stacks in pack and crate, ammo world loot, nondefault weapon magazine/reserve values and each retired pin in turn. Validation succeeds; only the pin clears, input dictionary remains unchanged, and a JSON save/reload preserves all stock/weapon values exactly. A remaining recipe pin and a build pin survive unchanged.
4. Reject unknown recipe pin, retired ID with `kind:"build"`, non-string ID, extra field and malformed surrounding polish/inventory; verify no live-session mutation. Retired recipe cannot be newly pinned after migration.
5. Real player reload from an empty magazine with zero reserve and zero ammo items refills normally; repeat with saved ammo items present and verify none are consumed. Retain existing shot/reload timing and turret rules.
6. At a qualifying fourth opportunity with a free crate slot, no recovery, recovery-only, zero-health installed crane, removed crane and installed-but-unpowered crane each produce an ordinary unopened hookable crate. Explicitly refresh power for direct calls. A recovered, healthy, powered crane produces exactly the existing heavy payload; the other three opportunities remain ordinary.
7. Multiple cranes: one valid powered crane is sufficient; damaged/unpowered others do not accidentally block it. Full pool spawns nothing and overwrites no active cargo. Dismantling or losing power after a heavy spawn preserves that crate and changes only later opportunities.
8. Recovery-site sequence still creates its elevated heavy trial with no crane installed; repeat interaction does not duplicate it. Save/restore existing elevated/stream heavy cargo without an installed crane preserves type, contents and unclaimed state. Existing later-expeditions trial hoist/overflow assertions remain mandatory.

The unchanged later-expeditions suite passed all 85 checks after the focused suite, including its paid installation, real trial hoist and full-storage recovery assertions. The shared owner runs guidance and checkpoint/menu integration coverage separately. Focused source stamp remained `0f69a800743efd9d270a4871b0372a5b5b3e6820e14c0ddb8d5ede93a5271967` from start to finish. Both delegated engine processes exited successfully before the isolated native timing slot. No broad import or additional art review was required for these logic-only changes.
