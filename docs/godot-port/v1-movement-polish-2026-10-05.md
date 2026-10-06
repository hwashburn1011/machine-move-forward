# Player movement presentation — 5 October 2026

## Existing behavior and identified gap

The player already has displacement-driven eight-direction gait blending, shared walk/run/crouch phase, authored foot contacts, render-rate skeletal interpolation and grounded foot IK. This pass retains those systems. Controller input already responds immediately and should continue to do so.

Source inspection identified a narrower presentation gap: starts, stops and turns changed gait and facing without transient body follow-through; landing switched directly from the jump clip into grounded gait without impact settling. This is a presentation observation from source, not evidence of uncoached player dissatisfaction.

## Changes

- Small critically damped torso impulses follow changes in actual horizontal displacement. Constant-speed movement settles back to the existing authored gait. Combined additive lean is capped at four degrees; the underlying authored gait retains its own pose.
- An actual airborne-to-grounded transition drives bounded pelvis compression from pre-impact downward speed. Ordinary jump testing measured about 4.18 cm; the absolute cap is 6.5 cm. Foot IK remains responsible for supporting the feet.
- Lean and compression interpolate between physics samples. They do not move the capsule, change input acceleration or modify the camera.
- Torso weight is reduced while aiming/firing and crouching. The existing arm/weapon solve follows the additive torso pose.
- Teleport, terminal/menu animation handoff and scripted/cinematic movement clear the transient offsets. A ground-recovery displacement cannot be treated as a landing or giant acceleration impulse.

Changes are confined to `player.gd`, `player_locomotion.gd` and `player_pose.gd`; no save fields, movement speeds, gravity, step-up dimensions, collision, weapon timing or damage values changed.

## Headless verification

- New `player_weight.gd`: **16 checks passed** using native input and physics plus presentation invariants. Measured start/stop lean approximately 1.94°, turn lateral response approximately 1.40°, and ordinary-jump landing compression 0.04180 m. Checks cover immediate response, stopping without controller drift, settling, airborne handoff, capsule support, render interpolation, unchanged session/controller state, teleport and menu/scripted resets. Report fingerprint at this run: `7364de4dedbdad6117150ff7f5aae08e69bc845f7ded2ed932da95384b72f5ac`.
- Existing `player_locomotion.gd`: **39 checks passed**, including all twelve directional/gait speeds, planted-foot drift below 0.2 m/s, blocked motion, phase continuity, reload, jump, menu and cinematic handoffs.
- Existing `weapon_presentation.gd`: **68 checks passed**, including final skeletal hand/grip/weapon behavior during actual movement.
- Existing `machine_access.gd`: **13 checks passed**, including supported stair clearance and 400 deck/bypass samples. These geometry fixtures are not a new human stair-walking test.

Evidence and prior report copies: `test-results/v1-movement-polish-2026-10-05/`. Checks are prepared native fixtures, not a new earned campaign or human feel assessment. Other workers are editing independent presentation systems; these results do not imply a shared final source freeze.

## Native motion review

Prepared `player_weight_review.gd` records actual input on a supported striped deck using a full-body inspection camera at 1440×810. Sequence: idle, walk start/stop, sprint start/turn/stop, crouched diagonal movement, jump/landing, aimed strafe/stop. PNG frames and timestamps distinguish the real rendered sequence from synthetic animation samples.

The first rendered diagnostic produced **176 frames**, covered every sequence stage and recorded **zero ground recoveries** without script/engine errors. Its global runtime changed during other workers' independent edits, from `e83c8b9796546c9999111b11d9bdc5da5d743f34d5fef61b4149fbf7f3d1a735` to `7b8609cd851ab90cd7f0ae89fb4e601eda5b717804e70897790a5491dc50ee00`. The harness correctly exited unsuccessfully for source instability; this is diagnostic evidence, not frozen acceptance. No player runtime file was edited by this worker during capture.

Ordered rendered inspection included walk and landing frames 126/128/131. The jump transitions into supported boots with about 4.15 cm pelvis compression and settles upright; the rifle remains held through the transition. No further model/controller edit was indicated. The review is available as `visual/movement-diagnostic.mp4`, encoded with the captured frame timestamps rather than treating irregular PNG capture intervals as a fixed-rate movie. PNG write overhead makes this unsuitable as a performance benchmark.

The subsequent component acceptance capture passed (exit 0) with **181 frames**, all fourteen sequence stages, **zero ground recoveries**, and identical start/end fingerprint `c084dfa83351dfb6449ce9221e70cf2b675e948300ebdd65dc13f9de8fdfe2b8`. Its log contains no script/engine errors. Evidence is preserved separately in `visual-final/review.json`, frame PNGs, `visual-final/movement-review.mp4` and `visual-final.log`. The movie uses the captured timestamps. This accepts the movement component at that exact source state; independent intro refinement was still pending, so it is not a claim of whole-build final acceptance.

Selected ordered frames 64 (sprint turn), 130 (descending), 131 (landing), 135 (settled) and 152 (aimed strafe) were visually inspected. The torso follow-through stays restrained, landing returns the boots to the support plane, and the weapon remains held. The sampled landing peak is 3.88 cm (sparse rendered capture can miss the approximately 4.18 cm physics peak). This is ordered-frame inspection of a native prepared fixture, not an uncoached human playtest or a real-time viewing of every frame. No movement runtime changes followed the 136 passing focused checks, and no additional change was indicated by these frames.
