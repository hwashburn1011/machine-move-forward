# Continuing native enhancement goal

Objective: keep improving models, gameplay feel and performance within the story already built. Continue refining existing assets and adding environmental models that make the world feel alive and believable. This is an ongoing goal, not a claim that a single feature pass exhausts possible improvements.

Requirements for eventual completion review:

- Preserve the existing story, ending, gameplay features and assets; do not add new chapters or story lines.
- Inspect actual runtime/model evidence before prioritising changes. Geometry, materials, support, orientation and movement should be coherent with the weathered industrial desert.
- Improve gameplay readability, controls and feel where defects or friction remain. Preserve established damage, progression and input contracts unless a concrete defect requires correction.
- Measure performance against the current revision, keeping resolution, quality, assets and workload explicit. Distinguish average rendering headroom from streaming/frame-time spikes and long-session behaviour.
- Use Blender for authored model work; inspect both Blender renders and in-game results. Retain reproducible sources, runtime assets and attribution.
- Validate saves, campaign progression, interactions, construction, combat and traversal after relevant changes. Keep personal saves/settings and the Three.js implementation safe.
- Before calling the entire goal complete, revisit all these requirements with current evidence and inspect remaining high-value gaps. A green narrow test or a completed iteration is not whole-goal completion.

## Completed iteration: atmosphere and effect allocation

Starting state: `a124e43`, previous campaign-polish work committed and verified. Initial inspection confirms that transient tracers/sparks allocate nodes, mesh resources and materials on each shot, while machine dust currently emits at a fixed rate regardless of movement.

Tasks:

1. Capture a fresh native GPU baseline on the unchanged build.
2. Batch transient tracers and sparks with reusable render resources; retain their geometry, colour, duration, movement and fade. Verify heavy combat/effect output, bounded object growth and GPU rendering.
3. Author weathered wind-driven desert props in Blender: a torn-cloth mast, damaged ventilation assembly and solar hazard beacon. Use distinct named animated parts, support geometry, bolts and surface detail.
4. Add deterministic, sparse placements alongside existing scenery. Keep the original terrain/scenery placement contract, clear travel corridor and elevated exploration unchanged. Add wind/rotor/beacon motion without per-frame scene searches.
5. Couple machine exhaust/dust to speed and engine state; add landing dust at the four actual leg contacts. Keep stopped machinery visually settled.
6. Inspect Blender and native captures, compare performance, run focused/regression tests, then record what improved and what remains.

Later priorities remain open: streaming boundary spikes, dense construction workloads, material/animation coherence, camera readability at stations, long-session memory and full human campaign pacing. They must be inspected rather than assumed solved.

Iteration review: [atmosphere, grounding and effect allocation](atmosphere-review.md). Art review also uncovered and fixed a several-metre CPU/GPU dune-height discrepancy. The full goal remains active; this is a completed, measured iteration rather than a claim that no further improvements are possible.

## Completed iteration: scenery streaming and resource lifetime

Starting state: `e8fea34`. The preceding turn made verified progress and committed its code, authored art and evidence. Fresh accelerated GPU travel found 19–25 ms lateral-boundary construction spikes while live resource counts remained broadly stable over 15 km.

1. Capture boundary-specific timings and resource counts, including lateral reversals and ordinary updates between boundaries. Distinguish accelerated stress from normal gameplay frame rate.
2. Save the pre-change rendered geometry/transform contract for two complete scenery windows. Preserve all original models, seed layouts, density, visibility distances and instancing/shadow settings.
3. Split chunk creation into resumable steps. Prepare an upcoming row and a nearby side band using roughly 0.8 ms per update, with a strict bounded set of at most 13 ready/unfinished chunks. Keep prepared nodes outside the visible scene.
4. Activate complete cached chunks at the original boundaries. Retain useful retired chunks for immediate reversals; synchronously fill the full visible range on unexpected relocation or save load. Discard obsolete work and old-seed caches safely.
5. Reuse already-calculated CPU bounds for ambient-prop clearance rather than reading transforms back from the render server.
6. Validate contract parity, cache bounds, cancellation, both travel directions, seed changes and shutdown. Repeat identical GPU boundary samples, an accelerated resource soak, and relevant gameplay regressions; record costs and limitations.

Follow-up review still includes dense player construction, station-camera readability, visual coherence and normal-speed campaign feel. This iteration does not narrow or complete the overall objective.

Iteration review: [scenery streaming](streaming-review.md). Prepared crossings retain the original rendered layout; bounded-cache and gameplay regressions pass. Profiling also found and removed repeated beacon shader loading. The full goal remains active.

## Completed iteration: camera clearance and machine bookkeeping

Starting state: `d0a6bcb`. Blender MCP reconnection was verified against the preserved wind-worn prop scene. A native corner fixture reproduced the character moving nearly off-screen and weapons remaining opaque during close-body fading.

1. Reproduce camera framing at wall corners, then move the spring-arm sweep origin to the player's eye. Retract shoulder offset with distance while retaining open-space position and aim direction.
2. Include weapons and mounted equipment in the fade cache; register/unregister changing attachments. Restore opacity for cinematic and deck-gun cameras. Avoid repeated writes for unchanged opacity.
3. Measure synthetic 30/300/900-piece CPU workloads before optimization. Remove per-consumer record allocation from power calculation and per-tick string construction from room monitoring.
4. Verify original power allocation over 700 seeded layouts; exercise damage, fuel loss, tier boundaries, demolition, moving equipment, deep cell/edge changes and same-size restores.
5. Inspect native captures and run camera, integration, input, campaign, combat, construction, save and traversal regressions. Record timings and their limits.

Iteration review: [camera and machine simulation](camera-workload-review.md). The full goal remains active. Follow up on decorative stair struts and collision coverage, model/material coherence, representative rendered dense construction and normal-speed play pacing.

## Completed iteration: native machine access refinement

Starting state: `432abe4`. The preceding turn made verified progress on camera framing and simulation cost. Reconnection to Blender MCP remained live. Native captures and triangle-based probes identified braces/corbels crossing the side stairs and four cables protruding into the inner route.

1. Inspect native geometry and the original Blender objects; reproduce body-space interference rather than guessing from a screenshot.
2. Derive a native access module with end-bay outriggers, longitudinal supports, bolted gussets and physical collision. Retain the original deck layout and walking contracts.
3. Refine all 96 stair treads and their rail mounts. Reroute four complete cable components, preserving unrelated geometry, and secure them to the chassis.
4. Reuse original material/texture resources, batch the new detail, and measure its actual GPU cost against the old model.
5. Inspect Blender and native captures; verify all 366 torso/head samples, 400 deck-height samples, collision, materials, camera and gameplay/traversal regressions.

Iteration review: [native machine access](machine-access-review.md). Original story and browser assets remain intact. The full enhancement goal remains active; station readability, animation coherence, rendered dense-construction workloads and longer play pacing remain open priorities.

## Completed iteration: construction load and companion behavior

Starting state: `127df8c`. The previous iteration refined access geometry and verified traversal. A furnished-deck audit exposed periodic L-12 job searches taking over 30 ms on a 369-piece machine.

1. Profile starter, furnished and extended layouts with actual assets, then enable the recovered companion in idle and working states. Inspect station placement at playing distance.
2. Filter serviceable producers before route queries, preserve job and storage ordering, and stop at the first eligible job. Keep route results local to each search.
3. Compare 512 mixed layouts with the old selector and drive complete producer-to-storage trips on the real navigation mesh. Verify stock conservation, blocked stations, loss of power and combat interruption.
4. Correct idle drift, service approach clearance and the unused service-pose state. Cache model pivots, restore drive-wheel movement and ground the authored track contact plane.
5. Inspect native captures, repeat the rendered workload, run relevant game/campaign regressions, and save measured evidence with remaining limitations.

Iteration review: [construction and L-12](caretaker-workload-review.md). Idle search dropped from 33–39 ms to about 0.19 ms while preserving job selection. Real service visits, inventory conservation, obstruction handling and model motion are verified. An intermittent starter/travel spike remains a specific next profiling target. The original scope remains active; this pass does not conclude the model, gameplay or performance review.

## Completed iteration: articulated companion drive and travel tracing

Starting state: `668b91d`. Blender MCP reconnection was verified against the preserved access scene. Three instrumented 24-second travel runs did not reproduce the prior post-startup spike, so it remains explicitly unresolved.

1. Add a reusable diagnostic around test-owned copies of the actual main/player/world/UI/audio callbacks, with streaming/placement timings and frame/GPU samples. Retain both startup and post-warmup results.
2. Inspect the L-12 source and native service captures. Replace its static belts with a Blender-authored shoe containing rounded pads, grip ribs, steel backing and hinge details; preserve the original body/master.
3. Animate 96 shoes through two shared MultiMesh belts and reuse existing materials. Couple each side and its wheels to signed ground displacement, including turns, reverse travel, parking and recovery.
4. Verify closed-path continuity, physical grounding, real service trips and inventory behavior. Inspect Blender/MCP and native views, then compare rendering and animation cost at 60 Hz.
5. Run integration, parity and story regressions, record the visual cost, and retain the open hitch investigation instead of claiming it fixed.

Iteration review: [articulated drive and travel tracing](caretaker-drive-review.md). The model refinement adds about 0.09–0.10 ms GPU and 0.07 ms moving-drive CPU in its close native view; it is a visual improvement, not an FPS optimization. All 335 relevant assertions pass. An isolated frame stall also appeared with the main game/world update disabled; its cause still needs engine/render/host-level tracing. Character animation/material coherence, normal-speed campaign pacing and environmental refinement remain open. The overall goal remains active.

## Completed iteration: autosave latency and player-motion audit

Starting state: `83a7631`. Longer native tracing reproduced a 26.1 ms main-thread autosave tick. Move verified file work into a bounded worker queue with detached data, orderly draining and preserved manual/checkpoint semantics. Protect healthy recovery backups from corrupt primaries. Compare actual save frames and larger synthetic campaigns, and run the gameplay/save/campaign regressions.

Iteration review: [autosave latency and motion audit](autosave-motion-review.md). The matching save frame fell from 30.75 ms to 7.60 ms on the final code, with 386 assertions passing. Separate rendering stalls remain unresolved. A real-controller audit now proves foot sliding and walking against walls; Blender/native locomotion refinement is the next concrete task. The overall goal remains active.

## Completed iteration: grounded native character movement

Starting state: `30df021`. Reconnected Blender MCP and inspected the original S-07 rig. The former stride exceeded the leg chain's reach, while native playback ignored actual displacement.

1. Author 24 feasible eight-direction gait cycles in Blender, preserving character geometry/textures and the original source/browser clips. Retain editable actions, metadata, studio renders and a live review scene.
2. Load only a small native skeletal library. Derive cadence and directional blending from capsule displacement, retain phase and rest when blocked. Keep original controller speeds and combat/jump/cinematic timing.
3. Sample skeletal poses at render rate between physics states, and limit stair IK to support contacts. Keep weapon aiming, moving reload and wrist-terminal poses compatible.
4. Verify all directions, sprint/crouch/analogue movement, wall blocking, transitions and actual gameplay regressions. Compare the old presentation controller and new one in the native GPU scene and inspect the resulting views.

Iteration review: [native locomotion](locomotion-review.md). All 394 relevant assertions pass, and measured interior stance sliding is much lower. Rendering cost is essentially unchanged in the controlled comparison. The native held rifle's simple surfaces/grip fit are a concrete next visual target. The overall goal remains active; wider visual cohesion, long-session/native campaign feel and intermittent stalls remain open, without adding story content.

## Completed iteration: restrained desert life and weather clarity

Starting state: `83304e4`. User steering prioritizes a more believable, quietly active desert and retaining dust storms without a shelter/water penalty.

1. Remove storm-dependent water consumption and reword the forecast around visibility. Verify clear/exposed/sheltered consumption, the weather cycle and old storm saves.
2. Inspect native deck views and soften orange saturation, grain and glint while preserving terrain displacement and original scenery layout.
3. Author seven sparse natural ground details in Blender; ground them on actual dunes, preserve clear routes and use shared batches/materials with gentle pinned-root wind and low sand drift.
4. Inspect source/MCP and native views, verify placement/import contracts, compare GPU cost and check streaming/gameplay regressions.

Iteration review: [desert life](desert-life-review.md). The full storm atmosphere remains, while the extra water drain and shelter warning are removed. Sparse scenery and quieter sand add about 0.03 ms median GPU cost in the measured deck views. The broader enhancement goal remains active; this does not resolve the existing intermittent frame-stall investigation or conclude the full-game review.

## Completed iteration: held weapon detail and coherent grips

Starting state: `265f4c5`. Native close-ups showed plain firearm surfaces, a left hand away from the fore-end, and a tracer origin well behind the barrel.

1. Author two compact replacement guns in Blender with worn PBR surfaces, open bores/vents, layered receivers, connected sights and semantic hand/effect/attachment anchors. Preserve original browser assets and weapon definitions.
2. Solve both arms around a reachable shared hold, following aim and visual recoil. Release to existing reload, terminal, refuel, scripted, turret and death presentation.
3. Mount all four existing accessories at their physical locations, update them immediately on weapon switches, and start tracers at the actual active outlet. Preserve camera hitscan, deterministic spread, ammunition and timing.
4. Inspect source/MCP and native views, check final skeletal poses and real controller movement, measure the rendering/pose cost, and run gameplay/movement/camera regressions.

Iteration review: [weapon presentation](weapon-presentation-review.md). The detailed models keep essentially the same measured GPU cost in a fixed native close view; the new hand solver costs about 0.033 ms median CPU. Existing story and combat rules remain unchanged. The overall goal remains active: this pass does not resolve the intermittent engine/render stalls or conclude the wider visual and long-session gameplay review.

## Completed iteration: grounded salvage and truthful pickup feedback

Starting state: `26d46e4`. A native opening/first-cargo review reproduced floating cargo, an aiming cue for physically impossible throws, and the first receiver message being overwritten.

1. Fit each existing chest's full footprint to the dunes, compensate for lateral travel and cache nearby terrain fits. Preserve pool size, drift, loot cadence and gameplay RNG.
2. Add a restrained cargo bracket and lead diamond based on the existing straight hook flight. Check actual lower-deck visibility through open rails while preserving opaque-wall occlusion.
3. Retain the receiver-repair message and actual item receipt. Park overflow at its mesh-bottom height on real support and preserve its contents through reclaim/save/load.
4. Inspect native opening, off-axis, aligned and pickup captures; check terrain/flight/storage contracts; measure fitting cost and run gameplay/story regressions.

Iteration review: [salvage](salvage-review.md). All 430 relevant assertions pass, including 36,000 terrain-corner observations. Caching roughly halves the new fitting work's measured mean CPU cost, while the original hook mechanics remain unchanged. This visual/readability pass does not add story or resolve the separate intermittent rendering stalls. The overall goal remains active; full-campaign feel and control-hint cohesion remain open.

## Completed iteration: crossfire preparation and camera continuity

Starting state: `dbd3aef`. The preceding turn made verified progress on salvage. A real-time scanner review found an 840 ms entry frame, an immediate 60-degree turn and a 42-degree FOV jump when returning to the player's chosen view.

1. Measure the existing scene with native rendering and repeat without image capture to separate real camera discontinuities from screenshot-induced physics catch-up.
2. Load the existing resources in the background during scanning, assemble one part per tick and activate one hidden prepared set at the original signal. Retain a complete fallback for direct mid-cutscene save restores.
3. Blend entry and return transforms/FOV while keeping the 17-second timeline, original ships, actors, close-up, captions and subsequent raid interval.
4. Verify resource lifetime, cancellation, outstanding requests/shutdown, scanner timing, multiple camera settings and gameplay/camera regressions. Retain native views and matched timing data.

Iteration review: [crossfire](crossfire-review.md). The measured entry frame fell from 839.947 to 20.267 ms; preparation produced no frames above 25 ms in the clean sample. All 341 relevant assertions pass. The full goal remains active, including the visibly simpler battle-ship hulls, full-campaign feel, control hints and unrelated intermittent rendering stalls.

## Completed iteration: detailed opposing ships

Starting state: `7a6711a`. The preceding turn made verified progress on scene loading and camera continuity. Refine the visibly plain existing battle vessels without extending the story.

1. Author two layered, weathered hulls in Blender with fitted armor, recessed vents, supported rails, bridge/service fittings, rounded open exhausts and hollow gun barrels. Preserve crew surfaces and original faction flags.
2. Inspect studio and live MCP views; correct overlapping deck surfaces and armor fit. Preserve editable source parts, export material batches and portable PBR maps.
3. Compare original/refined assets in matching native GPU views, integrate them into the existing background preparation, and inspect the real scanner battle/close-up.
4. Verify exported triangle support, body clearance, semantic anchors, asset budgets, scanner/save/skip timing and actual gameplay regressions.

Iteration review: [opposing ships](ship-refinement-review.md). All 366 selected assertions pass. GPU cost is approximately +0.03 ms in the wide view and −0.07 ms close; the clean scene-entry frame remains about 20 ms. The full goal remains active. A mast near the return camera path and desert scenery intersecting the scripted ship route are the next concrete clearance targets, alongside broader campaign feel, control hints and unrelated intermittent stalls.

## Completed iteration: battle landscape and camera clearance

Starting state: `5152574`. The preceding turn made verified progress on both Blender ship models. Fix their route through ruins and the return camera's machine flythrough without extending the story.

1. Retain CPU scenery bounds and search a clear forward-right route with dune clearance for the existing formation and visible camera path.
2. Prepare the route on a worker during the original scanner delay, account for later travel/steering and validate it again before activation. Handle invalidation, dense scenery, cancellation and saved-cutscene fallback.
3. Use short concealed cuts between the actual deck camera and battle view, preserving the close-up, 17-second duration, captions and raid timing. Keep pause UI available and clear transitions on skip/reset.
4. Verify against rendered MultiMesh geometry and finer dune samples, inspect native views, measure clean activation timing and run scenery/gameplay regressions. Trace and clean up active audio playback at shutdown.

Iteration review: [battle clearance](crossfire-clearance-review.md). All 503 assertions pass. The six sampled routes avoid actual scenery, and the real-time prepared entry takes 21.684 ms versus the preceding 20.379 ms sample. The full goal remains active; full-campaign feel, control hints, remaining visual coherence and unrelated intermittent rendering stalls still require work.

## Completed iteration: secured service drums and imported collision

Starting state: `09244a9`. Inspect the native deck/source before refining the three service drums. They already reach the deck, but lack convincing securing hardware and surface definition.

1. Author three detailed Blender assemblies with rolled steel profiles, capped lids, continuous cylindrical UVs, curved labels, bolted cradles and restraining hoops. Keep original sites and footprint; face the port drum toward its open aisle.
2. Remove only complete drum components from two frozen batches, preserve unrelated coordinates/materials and retain existing access refinements. Export static material batches and inspect studio/MCP/native views.
3. Reproduce and fix the missing triangle-winding conversion in the native frozen-collider import. Verify near-face rays, swept-body contact and actual player walking without adding collision geometry.
4. Run access, camera and gameplay regressions; measure matching native views and retain reproducible evidence. Drain pending audio in the play-parity test's shutdown using the existing helper.

Iteration review: [deck fittings and collision](deck-dressing-review.md). All 457 selected assertions pass. The three detailed props add 0.053–0.064 ms median GPU cost in the measured close views. The full goal remains active; nearby cargo surface coherence, full-campaign feel and the independent intermittent-stall investigation remain open.
