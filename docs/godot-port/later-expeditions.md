# Later expeditions and robot survival

Completed locally on 25 September 2026 for the native Godot edition. The opening,
scanner recovery, The Wake and Relay Foundry keep their existing sequence.

## Where to find the additions

| Feature | Availability | How to use it |
| --- | --- | --- |
| Route radar | Complete Quiet Array and recover its course actuator | Power the receiver, open **Signal**, select one of three numbered contacts, then **Intercept**. Bearing, distance, approximate fuel, range and patrol information describe the selected signal. **Pass By** keeps the other choices. |
| Salvage crane | After Quiet Array and restoring the optional rooftop workshop | Intercept the **Recovery gantry**. Isolate its feed, release the locks, then recover the assembly. Return aboard and install it from **Build** for 45 scrap and 5 components. Approach the crane and press **E** to hoist heavy cargo within 34 m. It needs 4 power and a clear cable path. |
| Battery bank | After Glass Orchard | Recover it at the **Silent substation** and install for 35 scrap and 6 components. Spare generation charges up to 120 units at up to 2 units/s. During a supply shortage it provides up to 4 power to the receiver, helm and fieldwork tools; it does not run engines or guns. |
| Quiet-running assembly | After Glass Orchard, a previous equipment recovery, and 600 m of further travel | Recover it at the **Screened relay**, install for 40 scrap and 8 components, then toggle it with **E** at its controls. Travel is 35% slower and each generator produces 4 less power. Visible scout detection takes twice as long; an existing lock or pursuit continues. |

Equipment discoveries are optional and recur until recovered. Each recovery is
saved separately from its paid installation. The crane site supplies a heavy
trial crate; later travel also supplies heavy cargo. A full bag leaves cargo
waiting in the hoist, including after save/load. The handheld hook and automatic
collector cannot lift heavy cargo.

Radar sweeps, selection, travel, expiration, missed contacts and recovery steps
persist. Patrol-marked routes trigger actual scout encounters. Normal movement
can cross the gantry, reach its controls, and return aboard. The selected fixture
route arrived within 0.097 m of its lateral target. On larger terminal text,
scroll to reach the remaining contacts and interception controls.

## Robot survival and existing campaigns

Hunger, thirst, consumption, food recipes, production and related sprint/healing
penalties are removed. Health, fuel, damage, repair kits and structural repairs
remain. Water in legacy inventory, containers, pending cargo and rewards becomes
fuel; rations and greens become scrap. Converted stacks fit their original slots,
including full bags. Stored output on retired installations remains recoverable
before dismantling. Reloading the converted save does not convert or award it twice.

Condensers, planters and stoves no longer appear in Build. Existing installations
can be emptied or dismantled with the cutter. The seed display and human history
remain, with no watering or food production. L-12 follows the player as a companion;
the proposed logistics expansion was not added. Existing campaigns receive only
the radar and discovery eligibility justified by their completed milestones.

## Verification

The [focused suite](../../godot/tests/later_expeditions.gd) passed **84 checks** both
headlessly and with the native Vulkan renderer on the RTX 3070. It exercises
milestone gates, power loss, candidate selection and expiry, real route steering,
walking across the site, ordered recovery, paid installation, heavy cargo overflow
and persistence, battery charging/backup, real scout detection, and malformed or
legacy save migration. It uses isolated test campaign storage.

The [combined results](results/later-expeditions-regressions.json) record **826 checks
across 17 suites**, all passing, and include the
existing campaign, save, controls, wrist terminal, combat, salvage, loot, weather,
power, workshop, friendly encounter and companion suites. The separate real-time
pacing sample ran for 65 seconds and passed. These are controlled native fixtures;
a full manual campaign playthrough and long-term balance review remain separate.

Reviewed native captures:

- [Three-contact radar](previews/later-radar.png)
- [Large text at 4:3](previews/later-radar-large-4x3.png)
- [Recovery platform](previews/later-recovery.png)
- [Installed crane](previews/later-crane.png)
- [Battery bank](previews/later-battery-bank.png)
- [Quiet-running hardware](previews/later-quiet-drive.png)

Editable Blender source and its build recipe are documented in
[the equipment asset folder](../../assets/native-expedition-equipment/README.md).
The [focused report](results/later-expeditions.json) records the renderer and route
error. Re-run from the repository root:

```powershell
& 'test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe' --path godot --script res://tests/later_expeditions.gd
```

Add `--headless` for logic-only checks. Fresh reports and screenshots go to
`test-results/godot-native/`. Tests never replace the player's campaign saves.
