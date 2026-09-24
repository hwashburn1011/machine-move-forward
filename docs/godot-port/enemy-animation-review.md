# Native enemy animation playback

Starting revision: `6a30597`. The receiver iteration made verified progress. Review the existing enemies next, preserving their models, story roles, difficulty, navigation and combat timelines.

## Findings and tasks

1. Inspect the six actual imported rigs and capture native walking/death views. Both older robots contain `Walking`, `Running`, `Punch` and `Death`; the native caller requested `walk`, `run`, `attack` and `polish_death`. The baseline observation confirms both stayed in `Idle` for all four requests. Native captures also show them standing after lethal damage.
2. Resolve existing clip aliases once per enemy, set locomotion loops and one-shot strikes/deaths explicitly, and protect strikes from routine movement requests. Keep death terminal until the original five-second removal. Reuse the existing authored models and clips; no art is replaced or reduced.
3. Reproduce the four detailed mechs' `polish_hit` being replaced on the next controller tick. Apply the existing Blender clip's rotation deltas to chest, neck and head through a skeleton modifier. Preserve the active locomotion/strike, root and legs, freeze with pause, clear on death and disable the modifier after the reaction.
4. Move ranged recoil playback from warning start to the actual shot call. Preserve the original warning, burst spacing, damage and cooldown; each actual burst shot can restart recoil.
5. Derive movement animation and footfall eligibility from actual swept body displacement. Blocked bodies rest, partial movement slows playback, and detouring bodies face their travel direction. Keep the original controller movement, collisions, path queries and separation.
6. Record the previous controller's complete tick/event contract and compare the revised controller against it. Test evaluated skeleton poses, real navigation into a barrier, pause, corpse lifetime, warning/shot boundaries and broader gameplay. Inspect native captures and measure the same rendered roster sequentially.

## Implementation and source art

`enemy_animation.gd` caches the imported clip lookup and owns presentation state only. The old global animation-list search is removed from repeated movement requests. `enemy_hit_pose.gd` samples the existing `polish_hit` asset, subtracting its first rotation sample before applying it to the current chest/head pose. No new AnimationTree, model copy, light, texture or mesh is added. Only detailed mechs with the existing hit clip get a modifier, and it sleeps between reactions.

The clips remain those authored in `tools/art/animation_polish/build.py` and retained under `assets/animation-polish/`; the older two enemies use their original Blender animations. This pass repairs native playback rather than claiming new model authorship or new stride animation. Displacement scaling reduces blocked/partial-speed mismatch; it does not establish exact foot locking for every enemy gait or stair.

The modifier follows Godot's documented [post-animation skeleton processing](https://docs.godotengine.org/en/stable/classes/class_skeletonmodifier3d.html) and samples the existing [rotation tracks](https://docs.godotengine.org/en/stable/classes/class_animation.html#class-animation-method-rotation-track-interpolate). The focused test reads both evaluated bone poses and the actual `modification_processed` signal.

## Verification

The combat fixture records **1,680 physics ticks** from the original controller: six enemy types plus the raider sabotage role. It compares position, phase, cooldown, windup, pending shots, player/subsystem health, exact hit/shot events, armour damage, lethal state, collision and seeded drops. All **42 contract comparisons pass**. Snapshot numbers are normalized through JSON before comparison so integer/float serialization differences do not appear as false behavior changes.

The **113 focused animation checks** cover clip resolution/loops, evaluated walking feet and fallen head position, protected strikes, chest/head-only hit motion, actual skeleton processing, pause/resume, modifier shutdown, original corpse lifetime, all six real controllers navigating into a blocking wall, stationary footfalls and actual ranged warning/shot ticks. Tests use isolated save directories and do not write personal settings.

The first broad run used accelerated `--fixed-fps 60`. That is suitable for the deterministic combat fixture, but it advanced an existing audio test's 0.3-second simulation delay before the real mixer had finished its sound. The audio test and the parity audit's short shutdown wait both passed cleanly when rerun at ordinary timing; no production audio code is changed for this fixture issue.

Final result: **767 assertions passed across 12 suites**: animation 113, combat contract 42, integration 108, parity audit 132, controls/interactions 66, play parity 58, story presentation 59, crossfire handoff 66, traversal 13, audio lifecycle 50, desert/weather 28 and opening handoff 32. Final import, regression and native review logs contain no script errors or resource-leak warnings. Curated observations and results are retained under `results/enemy-*.json`; final views are under `previews/enemy-*.png`.

## Rendered review

RTX 3070, 1920×1080, high Forward+/Vulkan, 4× MSAA, VSync off. Six actual native enemies on a separate review deck; simulation is frozen while the authored animation plays. Each view warms for two seconds and samples for four seconds. Screenshots are taken after timing. The two runs are sequential with no competing renderer.

| View | Before median GPU | After median GPU | Before median frame | After median frame | Draw calls |
|---|---:|---:|---:|---:|---:|
| Walking roster | 3.383 ms | 3.367 ms | 3.932 ms | 3.943 ms | 603 |
| Fallen roster | 3.344 ms | 3.326 ms | 3.855 ms | 3.839 ms | 643 |

The differences are within small host variation; this does **not** establish an overall FPS improvement. The views demonstrate the repaired older robots' locomotion and deaths. The optional `--live` fixture uses real enemies on the current machine deck without advancing the campaign director; it produces a separate presentation capture, not a gameplay performance measurement.

Run from the repository root:

```powershell
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --fixed-fps 60 --path godot --script res://tests/enemy_animation.gd
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --fixed-fps 60 --path godot --script res://tests/enemy_combat_contract.gd
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script res://tests/enemy_animation_review.gd -- --label=after
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script res://tests/enemy_animation_review.gd -- --label=after --live
```

To regenerate the historical combat contract, extract `godot/scripts/enemy.gd` from `6a30597` into an ignored file and pass its `res://` path with `--source=... --record=res://tests/fixtures/enemy-combat.json`. The fixture removes only the global class declaration and inserts event observations into the actual hit/shot functions. Normal checks never regenerate their expectation.

The broad enhancement goal remains active. These captures expose a remaining free-floating commander orb after death and the much simpler surfaces of the two legacy robots. Weapon/tracer alignment, richer enemy gait/boarding motion, full-campaign human play feel and older startup/intermittent stalls remain separate review targets.
