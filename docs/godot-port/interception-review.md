# Visible interception and scout escape

Implemented 25 September 2026 for the native Godot edition.

The existing encounter director now alternates ordinary raid opportunities with a searching scout after the first defense. It preserves quiet travel and safe docking. There is no second independent raid scheduler.

## Carrier encounters

Ordinary carriers overtake from behind or intercept from ahead, with deterministic port/starboard variants. An audible positional engine and a warning precede contact. Arrival uses path progress rather than a Z-coordinate threshold. The skiff approach takes 18 seconds; the heavy gunboat takes 23. Hover height stays near the Nomad's top deck so correctly placed front/rear guns can shoot over its real safety rails. Hull armor and gun damage/cadence remain unchanged.

The gameplay ships use the crossfire design's original hull, Order markings, vents, propulsion and bow details adapted around full-size crew decks and weapon assemblies. The editable Blender source, builder, optimized GLB and reviewed preview are in `assets/native-raiders/interception/`.

Grapples visibly launch for 1.1 seconds, attach and tension before boarding. Existing capsule-tested traversal selects an unobstructed landing lane; new geometry appearing during travel is checked as well. The Revenant prepares for 1.1 seconds, commits to a 1.65-second visible leap and recovers for 0.95 seconds on landing. The same shootable enemy and health are retained. Its capsule is checked along the entire arc and during movement. A detached leaper survives destruction of its carrier; a still-attached passenger does not.

Fatal hull damage stops weapons and transfers, clears hooks, produces fire, secondary bursts, debris and a falling hull, and removes the wreck after 4.5 seconds. Surviving boarders remain. Repeated destruction cannot repeat rewards. A visible retreating hull remains shootable. Escaping a patrol does not grant destroyed-cargo rewards.

Automatic guns acquire actual hull/component/scout colliders through the same obstruction and owned-damage protection boundary as other owned weapons. Automatic damage does not create player hit confirmation.

## Scout and escape

A visible scout searches for up to 38 seconds. Unobstructed sight builds detection over 18 seconds, followed by a five-second broadcast warning. Solid cover reduces detection. A successful broadcast sends a carrier through the existing encounter owner.

The player can shoot the scout, use a workbench-crafted signal decoy (four scrap and two components), or use unlocked steering to actually move 16 m out of its search lane. Selecting a heading without movement cannot resolve the encounter. Scout outcomes are persisted in the campaign and successful avoidance restores a 450 m quiet interval. Saving is blocked while a live search or decoy is active.

A decoy also disrupts a carrier's tracking. An approaching or unattached gunboat breaks contact; an attached grapple must still be cut. Existing boarders are not silently removed by a decoy.

## Verification

The fixtures use isolated saves and actual gameplay objects. They do not constitute an unrestricted manual campaign playthrough.

- `tools/godot/interception-regression.gd`: all four approach routes; clear lanes; eight-hit normal hull; one-time rewards; bounded wreck removal; detached Revenant identity, health and landing; scout disable, decoy consumption and actual lateral avoidance.
- `tools/godot/interception-defenses.gd`: 20 passing checks covering destruction during grapple launch, traversal and retreat; sword preparation; automatic hull/component damage and owned-wall obstruction; decoy-plus-cut escape.
- `godot/tests/boarding.gd`: 69 passing checks including full capsules, heavy crew, actual deck support, alternate and entirely blocked lanes, cable attachments, pose grips, falling bodies, pause and cleanup.
- `godot/tests/raider_craft.gd`: 87 passing checks covering geometry budgets, preserved gameplay regions, seats, weapon articulation, material isolation and crew footing.
- `tools/godot/interception-review.gd`: real-time rendered interception through the mounted deck-gun handler with held fire and scripted hull tracking, followed by normal-speed grapple/leap and destruction captures.

The old frozen `boarding-contract.json` records the former immediate-Z-arrival/timing/reward contract. It is historical evidence, not acceptance for this intentionally revised encounter lifecycle. Updated focused fixtures retain the relevant physical, damage and cleanup checks.

With a three-second allowance to mount a suitable gun, the rendered fixture destroyed the normal carrier with eight connecting hits at 8.83 seconds (18-second contact), and the gunboat with twelve at 13.00 seconds (23-second contact). Hull surfaces enter range before their center points. These measurements establish an available interception window; they do not assume human aiming accuracy or guarantee a win from a gun obstructed by construction.

Final measured reports and native captures are written to `test-results/godot-native/interception-*.json` and `interception-*.png`. The fixed-scene RTX 3070 run at 1440×810 and a 60 Hz cap measured about 16.7 ms median frames; GPU time is separately reported per scenario. It is a bounded encounter measurement, not a general performance promise.

Reviewed evidence: [measured interception](results/interception-review-2026-09-25.json), [grapple and Revenant leap](previews/interception-leap-2026-09-25.png), [carrier destruction](previews/interception-destruction-2026-09-25.png), and [searching scout](previews/interception-scout-2026-09-25.png). The final mounted-gun view uses the raised camera and a reticle projected onto the actual barrel impact point; nearby lights and construction can still obstruct a poorly chosen gun position.
