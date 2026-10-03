# Salvage cutter and optional survivors

The native game now has a guaranteed onboard salvage cutter, R-9's optional refuge exchange, and a rooftop workshop whose raised cache is reached using player construction. These add ordinary survival choices without assigning S-07 a heroic campaign role or changing the provisional ending.

## Playing the additions

The ochre locker beside the opening landing point supplies the cutter for free, including in older campaigns. Interact with it, select the cutter with **3** or Inventory, point at an owned piece within 3.2 metres, and hold **X** for 1.4 seconds. The target and dependent pieces are highlighted, with progress and recovered materials in the interaction prompt. Changing targets, moving out of reach, opening a menu, taking damage, or changing equipment cancels the hold. Existing contents preservation and demolition refunds remain one transaction; full recipient storage refuses removal. The permanent chassis is never a dismantle target. Selecting rifle/shotgun puts the cutter away. Key hints use saved remappings.

Once existing navigation permits optional stops, the regular contact schedule includes **A light still on** and **Shared workshop**. The refuge robot accepts three spare components individually. Hold the relay service control after supplying them, then recover four water and three fuel. Contributions and any unclaimed reward persist. A later quiet transmission reports that a traveler found the refuge's light; no human character is spawned. The cot, water vessel and charger establish coexistence, with an optional written water ledger.

The workshop's primary arrival gangway is always available while docked. Isolate the bus, retrieve its fuse, and hold the restart control to release the main cache. Nearby labels describe the next requirement; console lights change from dark to amber to green as power is restored. A shared human/robot shift note is optional. Its separate raised cache needs an upper platform and a **Boarding extension** facing the authored doorway. The illuminated docking square marks the intended mount. Build stairs and supported upper floors toward it; the physical bridge is four metres long, costs 12 scrap and two components, and has working collision on its deck and rails. A wall-supported upper floor chain must connect back to the machine. The entry interlock retracts when connected, and closes after a bridge is moved, turned, or removed. Relocation and dismantling cannot sever the bridge from the destination side. The existing off-machine departure restriction remains authoritative.

Interacting with **Show upper-deck build plan** enables an optional cyan projection of the next missing piece. The eight-piece example uses three lower plates, a side support wall, stairs, two upper plates and the extension. From a bare starting layout it costs 82 scrap and two components; existing matching pieces reduce the displayed remaining cost. Choosing the named part sets the suggested deck and rotation, then the player aims and places it through ordinary construction. Reach, clearance, support and material payment remain unchanged. Alternate supported layouts still open the entrance. The primary gangway stays usable throughout, and neither the plan nor the upper cache is required to leave.

The technical authored socket is cell `(7, 1, 3)`, rotations `1` or `3`; this implementation coordinate is kept out of the gameplay instructions. Both caches retain overflow and progress across saves. This is an initial compact expedition; a timed first-time five-to-ten-minute pacing study remains to be done, since the construction time depends on the player's existing platform.

## Assets and implementation

Original editable Blender sources, contact-sheet renders and instructions are under `assets/native-survivor/`; `tools/art/native_survivor/build.py` reproduces all five optimized GLBs in `godot/art/`. Compressed source files range from 179–446 KB including packed original wear textures. The cutter has a grip origin and contact marker; the workshop has named primary/secondary entrances and a separate physical interlock door. A bounded material review replaced bright clean alloy/enamel with dark, rough oxidized surfaces and faded ochre. Original baked mottling and chips survive glTF export. The revised native view removes the initial refuge deck/cot glare without changing any geometry or colliders.

`salvage_tool.gd` owns acquisition, selection, reach, highlight and hold feedback. `building.gd` retains demolition authority and adds preview/support checks plus a layout revision changed by every visual/placement/demolition mutation. `survivor_site.gd` supplies the authored sites and local actions; `workshop_guide.gd` supplies the optional construction projection using a weak reference to the site. `opportunities.gd` retains scheduling, docking, departure and interaction authority. `survivor_content.gd` validates the optional native save block. Main/session/control/equipment/UI integration is shared with the concurrent combat and wrist-terminal work.

## Verification

The later support-panel correction moves the guide's wall to the outboard
edge of the added platform. The former placement intersected two permanent
machine colliders; the corrected placement intersects none. The native route
suite now passes **23/23 checks**, including this clearance check and walking
up and back. [Corrected view](previews/workshop-panel-fixed.png) and
[targeted results](results/workshop-panel-clearance.json) include the shorter
`[Tab] Terminal` HUD prompt.

`godot/tests/survivor_content.gd` passes **40 checks with Vulkan Forward+ on the local RTX 3070**, including actual relocation transactions, return-bridge protection, character facing while the cutter works, and acknowledgment only after leaving the refuge. The rendered run exits cleanly without leaks or warnings. An earlier headless run emitted one engine dummy-renderer `material_get_instance_shader_parameters` warning at teardown; it did not reproduce with Vulkan. The test uses `native-survivor-content-tests` saves and does not write personal settings.

`godot/tests/workshop_first_visit.gd` passes **22 checks headlessly and with Vulkan Forward+**, using an isolated save directory. It constructs all eight projected pieces through the real paid placement transaction, checks the exact ordinary material cost, then uses normal keyboard movement to climb from the Nomad to the raised workshop and return. This caught a real capsule step-up problem at the top stair/floor transition that the earlier upper-deck-only crossing test missed. The player controller now checks support under the leading capsule footprint, with the existing bounded rise and full ceiling/horizontal clearance sweeps. Both rendered suites exit cleanly after site/audio/resource cleanup.

Coverage includes old-save migration; acquisition and selected-tool persistence; malformed progress rejection; real camera and operator raycasts; partial/completed/repeated dismantle holds; menu and distance cancellation; full-storage preservation; dependent wall/lamp preview; normal keyboard movement over both physical gangways; a real E-key component exchange; partial exchange and reward persistence; duplicate-reward prevention; delayed radio deduplication; ordered workshop power steps; clear bridge placement; orientation cache invalidation; collision coverage across the gap; safe return and departure; and native round-trip restoration.

The earlier `audit_parity.gd` run passed **132 checks**, covering crafting/storage, construction transactions, save compatibility, receiver research, attachments, automatic/manual guns and actual navigation routes. [Focused results](results/survivor-content.json), [full construction and route results](results/workshop-first-visit.json), [existing audit results](results/survivor-audit-parity.json), [native cutter feedback](previews/survivor-cutter.png), [native refuge view](previews/survivor-refuge.png), [native workshop/bridge view](previews/survivor-workshop.png), [optional build guide](previews/workshop-build-guide.png), and [completed walking route](previews/workshop-built-route.png) are retained. The native screenshots were inspected; they are controlled fixtures with supplied construction materials, not claims of a complete unassisted campaign playthrough.

Run from the repository root:

```powershell
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script res://tests/survivor_content.gd
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script res://tests/workshop_first_visit.gd
```

Omit `--headless` to regenerate the native views. Asset changes require an editor import before running.
