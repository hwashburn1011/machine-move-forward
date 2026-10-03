# L-12 track refinement and travel tracing

Continues the [enhancement goal](enhancement-goal.md) from `668b91d`. Blender MCP was reconnected and verified against the preserved machine-access scene. The previous companion pass restored the wheels, but its tread belts were still static during travel.

## Authored model and movement

The native derivative replaces four static rubber/grip batches with 96 equally spaced track shoes. Each shoe has a forged backing, separated rubber contact pads, raised grip ribs and detailed hinge ends. The two belts share one mesh through MultiMesh instances and bind the exact existing rubber/metal materials. No additional texture payload is loaded. All 57 other body meshes and the original fieldwork master are preserved; the source hash and vertex checks are recorded in the [asset report](../../assets/native-fieldwork/drive-report.json).

Each belt follows its own contact-centre displacement, including rotation of the chassis. Forward/reverse motion moves the shoes in opposite directions; turning in place counter-rotates the tracks. The six existing wheels follow the matching belt's signed distance. Pausing, parking, airborne movement and recovery relocations do not spin the drive. The lowest authored shoe surface determines deck contact. Collision dimensions, pathfinding, movement speed, service timers, job selection and inventory transfer remain unchanged.

The editable [Blender assembly](../../assets/native-fieldwork/L12ArticulatedDrive.blend), [overall render](../../assets/native-fieldwork/l12-drive-review.png) and [detail render](../../assets/native-fieldwork/l12-drive-detail.png) were inspected. The derivative is also open in a separate live Blender review scene through MCP. Native [service](previews/caretaker-articulated-service.png) and [deck](previews/caretaker-articulated-deck.png) captures verify the actual game's materials, lighting, scale and ground contact.

## Measured cost

The comparison uses RTX 3070, 1920×1080, high Forward+/Vulkan, 4x MSAA, no VSync, the same native deck/camera and one L-12. Both models are resident; only the selected model is visible. World/gameplay updates are disabled to isolate the visual change. A 60 Hz physics callback moves and turns the robot identically in both variants. Each sample warms for two seconds and measures six seconds; legacy/refined pairs repeat twice.

| Variant | Median GPU | Median drive CPU per tick | Frame median | Frame p95 | Maximum frame |
| --- | ---: | ---: | ---: | ---: | ---: |
| Legacy 1 | 2.634 ms | 0.007 ms | 3.280 ms | 3.947 ms | 187.592 ms |
| Refined 1 | 2.735 ms | 0.078 ms | 3.241 ms | 3.965 ms | 4.717 ms |
| Legacy 2 | 2.661 ms | 0.005 ms | 3.192 ms | 3.856 ms | 5.811 ms |
| Refined 2 | 2.746 ms | 0.076 ms | 3.207 ms | 3.931 ms | 4.256 ms |

The visual refinement costs about 0.09–0.10 ms GPU and 0.07 ms additional CPU per moving physics tick in this view. Both variants report 520 scene draw calls. This is a small measured visual cost, not a performance improvement. The authored shoes contain more geometric detail; aggregate primitive monitors/automatic LODs are not used to claim a reduction in model complexity. Stationary belts avoid redundant transform writes.

The first legacy sample contains an isolated 187.592 ms frame with the main game/world physics disabled. Its cause is unverified. It is retained in the report rather than discarded or attributed to the new art. Full [comparison data](results/caretaker-drive-profile.json) includes maxima and sample counts. This fixed view does not establish worst-case campaign performance on every PC.

## Intermittent travel hitch

A new diagnostic instruments test-owned copies of the actual main loop and the player, world, UI, audio and companion callbacks. It preserves the current main-loop statement order and adds no instrumentation to shipping scripts. It also records streaming-step and ambient-placement timings alongside frame/GPU timings.

Three 24-second runs on the pre-art `668b91d` build travelled about 174 m each. After the initial three seconds, maximum frame intervals were 7.651, 7.236 and 8.712 ms; maximum instrumented main ticks were 1.982, 2.281 and 2.553 ms. The previously observed 33–49 ms travel hitch did not recur in those traces. Initial rendering still produced much larger first-frame stalls. These traces therefore narrow the evidence but do **not** identify or fix the intermittent hitch. The [trace summary](results/travel-trace-summary.json) records the runs and their startup events; full per-frame logs remain in `test-results/godot-native/`.

## Validation and continuing work

The expanded caretaker suite passes 37 checks, including closed-path continuity, forward/reverse travel, counter-rotation, parking, teleport/airborne suppression, shared resources, real navigation, service visits, supply conservation and deck contact. It retains the 512-layout selector comparison from the previous pass. Integration (108), the broader parity/navigation audit (132) and story polish (58) also pass: 335 assertions across these suites. Final native captures, the 60 Hz drive comparison and import complete without Godot warnings/errors. Local logs remain in `test-results/godot-native/`.

The overall goal remains active. Continue tracing stalls outside the measured callbacks, reviewing character animation/material coherence, and testing normal-speed campaign pacing and environmental presentation. No new story or progression was added in this iteration.
