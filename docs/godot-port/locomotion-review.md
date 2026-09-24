# Grounded native character locomotion

Continues the [enhancement goal](enhancement-goal.md) from `30df021`. Blender MCP reconnection was verified, then source-rig inspection explained the native foot sliding: the old stride sometimes placed the ankle beyond the 0.862 m leg chain's reach. The native player also selected clips from input and always played them at 1×, including when a wall prevented movement.

## Authored movement and runtime behavior

The new [packed Blender source](../../assets/native-motion/S07NativeLocomotion.blend) contains 24 directional cycles: forward/backward, both sides and four diagonals for walk, run and crouch. Feasible pelvis heights, linear support travel and eased swing arcs keep all target ankles within reach (maximum authoring error below 0.000001 m). Geometry, textures, sockets and the original character source remain unchanged. Three neutral studio renders and a [rebuild guide](../../assets/native-motion/README.md) accompany the editable actions. The finished source is also open in a separate Blender MCP review scene, preserving the prior scenes.

The runtime loads a 115 KiB compressed AnimationLibrary and stride metadata, without a second mesh or texture set. Actual capsule displacement sets cadence and direction. Two neighboring authored directions blend with stride-aware weights. A shared phase survives direction/gait changes; zero-weight branches skip skeletal evaluation. Normal 4.5 m/s movement reads as a jog, lower analogue/obstructed speeds walk, and 7.5 m/s sprint keeps its original speed. Crouching remains 2.2 m/s. A blocked or released controller settles into idle.

Physics determines the step phase; each rendered frame samples between physics states, including angle and transition weights. This avoids holding limbs at 60 Hz on higher-refresh displays. Teleports reset the interpolation interval. Existing upper-body reload/aim/terminal modifiers remain active; stair IK is now weighted to the support phase, allowing the swing foot to lift. Jump and cinematic playback retain their original clips and timing. Damage, weapon timers, collision and controller movement speeds are unchanged.

## Contact checks

Real 60 Hz controller input on a supported flat test deck, using actual skeletal foot positions. These are interior stance-contact observations, not a perceptual whole-body score or a test of every stair angle. Each gait excludes its own support/swing transition. The refined audit explicitly evaluates the physical endpoint of the render-interpolated pose.

| Movement | Before median stance-foot drift | Refined |
| --- | ---: | ---: |
| Forward | 1.861 m/s | 0.043 m/s |
| Right strafe | 2.604 m/s | 0.010 m/s |
| Forward/right | 3.463 m/s | 0.028 m/s |
| Sprint | 3.502 m/s | 0.056 m/s |
| Crouch forward | 0.764 m/s | 0.002 m/s |

All eight directions, forward/diagonal sprint and both tested crouch directions remain below 0.2 m/s median interior stance drift. The blocked case has zero capsule travel and zero cadence, with idle selected; it has no moving stance samples. [Original audit](results/player-motion-audit.json) and [new checks](results/locomotion-tests.json) retain sample counts and exact results.

## Native views and rendering cost

The [forward](previews/locomotion-forward.png), [diagonal](previews/locomotion-diagonal.png) and [crouch](previews/locomotion-crouch.png) captures use an unobstructed test platform inside the actual native world, with its lighting, character, weapon and materials. The platform exists only in the diagnostic. Initial deck captures revealed an obstructed test route, so those timings were discarded and the final comparison requires actual sprint speed above 7.4 m/s for at least 90% of sampled frames. All four final samples measured 100%.

RTX 3070, 1920×1080, high Forward+/Vulkan, 4x MSAA, VSync off. Each controller warms for two seconds and measures six; two pairs use the same world, view and periodic relocation. The baseline reproduces the old input-selected playback behavior with both libraries resident; this is a presentation comparison, not a complete previous-binary campaign benchmark.

| Controller | Median frame | Frame p95 | Maximum frame | Median GPU |
| --- | ---: | ---: | ---: | ---: |
| Previous behavior 1 | 2.471 ms | 3.336 ms | 23.009 ms | 2.010 ms |
| Refined 1 | 2.447 ms | 3.575 ms | 5.809 ms | 2.015 ms |
| Previous behavior 2 | 2.434 ms | 2.897 ms | 3.536 ms | 2.019 ms |
| Refined 2 | 2.440 ms | 2.902 ms | 3.249 ms | 2.030 ms |

Rendering cost is essentially unchanged in this controlled view: the new GPU medians differ by 0.005–0.011 ms. This is an animation-quality improvement, not a claimed FPS optimization. Full [results](results/locomotion-profile.json) include coarse engine CPU monitors; those include other active work and are not isolated animation timings. The first baseline's 23 ms outlier is retained, not assumed solved by animation changes. The later interruption guards affect cinematic/forced-motion/death/turret states, outside this sustained-sprint workload.

## Validation and continuing review

39 focused checks cover actual movement/contact in twelve moving cases, wall blocking, analogue speed, stopping, phase continuity, intermediate render poses, moving reload, jump/landing, terminal pause, cinematic/forced-motion handoff and teleport recovery. Integration (108), navigation/parity audit (132), story polish (58), and native GPU physical-input gameplay parity (57) pass: 394 assertions across these suites. Personal saves/settings remain isolated; the regression logs contain no engine errors/warnings. The original source hash and all 62,158 mesh vertices are preserved by the Blender authoring check.

No story, progression or new input requirement was added. The native views also make the held rifle's simple surfaces and grip fit a useful next model-cohesion target. Broader material review, normal-speed campaign feel and the separate intermittent frame-stall investigation remain open. This is a bounded improvement within the active goal.
