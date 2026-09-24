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

## Completed iteration: shared detailed cargo cases

Starting state: `9d2672d`. The preceding turn made verified progress on service drums and imported collision. Review all four neighbouring fixed cargo cases before replacing their plain surfaces and sparse hardware.

1. Audit native/source bounds, placements and nearby pressure-vessel clearance. Author an editable Blender master with real closure hardware, rounded/clipped corners, pressed panels, original PBR wear and deck restraints.
2. Inspect studio, MCP and native views, then correct the corner guards, lid recess, numerical bevel slivers and dark stencil readability. Preserve original sites and make opening faces point toward the aisles.
3. Install one shared four-batch model at four sites. Consolidate batch removal while preserving original pressure fittings/materials and the previous drum/access/cable refinements. Keep collision and gameplay intact.
4. Verify physical walking and ray contact, measured vessel clearance, grounding, resource sharing, camera and gameplay regressions. Retain matching GPU samples and review artifacts.

Iteration review: [fixed cargo cases](cargo-locker-review.md). All 513 selected assertions pass. The broader goal remains active; adjacent pressure-vessel/switchgear detail, full-campaign feel and independent frame stalls remain open.

## Completed iteration: responsive opening preparation

Starting state: `f1df64a`. The preceding turn made verified progress on cargo cases. A fresh 65-second travel trace did not reproduce a late stall, but the actual title-to-New Campaign path blocked for 589 ms while loading its opening set.

1. Measure real title entry, both robot explosions and the existing handoff without screenshot readbacks. Retain the independent travel trace and its limits.
2. Load the same rooftop and pursuers on an engine worker during the title; assemble hidden parts incrementally and reuse them at launch. Keep immediate clicks cancellable and simulation paused until ready.
3. Verify cancelled requests, Continue/library restores, unfinished-opening fallback, repeated clicks, scene reload, shutdown, unchanged campaign state and original timeline events.
4. Inspect native opening captures, run gameplay/camera/crossfire regressions, and retain matched frame evidence.

Iteration review: [opening preparation](opening-preparation-review.md). Entry CPU fell from 589.359 to 2.903 ms and the measured maximum opening run frame fell from 616.471 to 18.834 ms. All 449 selected assertions pass. The broad goal remains active: the captures expose poor rooftop-wall framing after the jump and simple rooftop fixtures, alongside the already identified machine fittings and older unreproduced intermittent stalls. No story or gameplay timing was added or changed.

## Completed iteration: visible opening action and refined rooftop

Starting state: `d2408ee`. The preceding turn made verified progress on opening preparation. Address the actual obstructed camera and plain building exposed by its native captures.

1. Frame the existing chase, jump and return fire from clear views, then reveal the Nomad and conceal the final camera cut. Preserve every actor trajectory, original event and duration.
2. Reuse the real two-handed weapon solver for elevated cinematic aim, smooth turning, target changes, recoil and lowering. Release overrides outside the opening.
3. Build the existing rooftop in Blender with fitted windows, weathered concrete, supported pressure/vent/antenna assemblies and detailed door hardware. Inspect studio/MCP/native output, correct intersections and retain editable source with six runtime material batches.
4. Check actual rendered triangle clearance, original chase corridors, full-body framing, final skeleton aim, camera handoff and gameplay regressions. Compare native GPU cost and real opening timing without screenshot interference.

Iteration review: [opening polish](opening-polish-review.md). All 474 selected assertions pass. The three asset comparison views change median GPU time by −0.015, −0.014 and +0.051 ms; the real-time opening still starts in 2.112 ms with an 18.460 ms maximum frame in the clean 60 FPS sample. This is verified progress within the existing story. The overall goal remains active, including adjacent pressure fittings, canopy fabric, full-campaign feel and older intermittent stalls that have not yet been reproduced reliably.

## Completed iteration: repaired canvas and camera clearance

Starting state: `67d01a1`. The preceding turn made verified progress on opening presentation. Native views show the main canopy as a plain sheet; inspect its actual support and refine its existing fabric assembly.

1. Audit the Blender master and frozen batches, preserving all four grounded posts and unrelated banner/service hardware.
2. Author sewn canvas panels, restrained wrinkles/weathering, folded hems, reinforced corners, repairs and fitted tensioners in Blender. Retain editable source and batch the runtime art.
3. Add subtle shader billow that keeps corners/seams attached and pauses with the game. Correct exported vertex-color channel selection using actual imported data.
4. Reproduce 14 camera penetrations across 64 views beneath the canopy. Add a coarse camera-only surface, exclude it from walking/shooting/navigation, and verify all views against neutral/extreme fabric heights.
5. Inspect native and MCP output, compare GPU cost, run gameplay/control regressions, and trace final real-time travel. Use the established audio-drain helper for test shutdowns.

Iteration review: [canopy](canopy-review.md). All 494 selected assertions pass; no tested camera paths cross the fabric. Detailed canvas adds 0.066–0.197 ms median GPU in matched fixed views. The separate final travel trace has a 9.885 ms maximum after its initial three seconds, while still showing an initial 267.265 ms render frame. This is verified model/control progress, not a claim that the broader performance investigation is complete. The overall goal remains active: nearby pressure fittings, full-campaign feel and independently observed intermittent stalls remain open.

## Completed iteration: grounded receivers and readable instruments

Starting state: `9e84cbd`. The preceding turn made verified progress on the canopy. Inspect the five existing middle-deck pressure vessels, their frozen shared batches and their proximity to the refined cargo case.

1. Author one detailed Blender receiver with formed heads, grounded anchors, welded seams, a connected drain, readable recessed gauge, spoked valve wheel and relief fittings. Preserve its existing sites, main shell envelope and aisle orientation.
2. Review studio, native and MCP views. Correct mirrored printing, connect the legs to the curved shell, and fix a 23 mm overlap between one foot and the cargo restraint found by full exported triangle checks.
3. Install five shared instances with five material batches, preserving unrelated workshop vertices and original materials. Leave frozen assets, physics, gameplay and story intact.
4. Verify original collision with real movement/rays, shared resources, native text facing, source support contact, complete adjacent mesh clearance and regressions. Measure sequential matched GPU runs and preserve final native captures.

Iteration review: [pressure vessels](pressure-vessel-review.md). All 537 selected assertions pass, both exported GLBs validate cleanly, and final receiver/case geometry has no intersections. The added detail costs 0.032–0.094 ms median GPU in four fixed native views. This is verified progress within the existing game. The broad goal remains active: nearby switchgear and workshop equipment still expose simple fittings, and full-campaign feel plus independently observed frame stalls need further work.

## Completed iteration: fitted electrical cabinets and live indicators

Starting state: `2a0fa07`. The preceding turn made verified progress on pressure vessels. Refine the four adjacent plain electrical cabinets and let their lamps convey existing machine state.

1. Author one detailed Blender master with formed enclosure edges, a sealing gasket, knuckled hinges, locks, a folded handle, readable legends, louvers, grounded anchors and connected cable glands. Preserve all four existing sites, aisle orientations and collision footprints.
2. Inspect studio, MCP and native captures; correct coincident roof faces, gland alignment and compressed bevel slivers. Preserve unrelated vertices/materials in six shared batches, including the previous pressure-vessel remainders and stable node names.
3. Share five runtime mesh/material batches and one opaque indicator shader. Read existing supply, excess demand and engine damage at four Hz of simulation time; leave power, repair, interaction and save rules intact.
4. Verify actual player/raycast clearance, all 36 adjacent cargo/vessel mesh comparisons, real refuelling/repair/load transitions, pause/resume, shared resources, native vertex colors and zero imported degenerate triangles. Run selected gameplay/control regressions and sequential fixed-view GPU measurements.

Iteration review: [electrical cabinets](switchgear-review.md). All 613 selected assertions pass and both GLBs validate with zero errors/warnings. The four detailed cabinets add 0.067–0.154 ms median GPU in matching native views. This is verified art and feedback progress, not a claim of improved gameplay FPS or complete campaign validation. The broad goal remains active: adjacent workbenches and pumps remain visually simple, and full-campaign feel plus independently observed intermittent frame stalls still need further work.

## Completed iteration: complete service pumps and matching physics

Starting state: `bad213b`. The preceding turn made verified progress on electrical cabinets. Native inspection exposes simple motors, loosely mounted valves and unfinished pipe ends on both existing service pumps.

1. Build an original Blender master with a finned motor, open fan guard, sealed terminal, cast casing, bolted flanges, connected handwheel, fitted supports and fully terminated service routes. Keep both original sites and the complete assembly footprint.
2. Review studio, native and MCP views. Correct misoriented fins, align motor feet to their rails, soften overly polished fittings with worn PBR metal and improve the motor label contrast.
3. Preserve nine shared render batches, previous cabinet/vessel removals and the access pass's side-cable reroute. Share five render resources between the two new instances.
4. Reproduce obsolete hose collision in cleared floor space. Remove precisely 4,000 old pump triangles, retain every unrelated frozen triangle and winding, and install two shared 1,199-triangle collision shapes matching the new skids, bodies and pipework.
5. Verify real movement, skid contact, cleared hose space, complete retained physics, zero intersections with neighbouring machine geometry, grounded support/connection bounds, shared resources and gameplay/camera regressions. Measure matching sequential GPU runs and preserve final evidence.

Iteration review: [service pumps](pumps-review.md). All 656 selected assertions pass and all three GLBs validate cleanly. Matching fixed native views show 0.043–0.183 ms added median GPU cost; collision complexity falls by 1,602 triangles overall. This is verified model and collision progress, not a measured full-game FPS improvement. The goal remains active: nearby workbenches and other simple equipment still need refinement, alongside full-campaign feel and the older intermittent stalls that have not been reproduced reliably.

## Completed iteration: fitted service benches and companion path recovery

Starting state: `d4f74bc`. The preceding turn made verified progress on pumps. Inspect the six existing service benches, whose plain cases float above simple slab tops and pedestals.

1. Author one original Blender master with anchored frames, drawers, fitted shelf, complete vise, gasketed cases, closure hardware and hand tools. Preserve all sites, complete footprints and worktop heights, and face each bench toward its usable aisle.
2. Inspect studio, MCP and native views. Close small support gaps, terminate crossmembers at their leg joints, and apply restrained PBR wear with consistent metre-based texture scale. Batch 212 editable parts into five shared render resources.
3. Preserve all unrelated vertices/materials in the five measured shared batches and compose previous vessel/cabinet/pump refinements. Remove precisely 1,656 old bench collision triangles while preserving the prior pump removal and every other frozen triangle; share one 252-triangle shape across six benches.
4. Verify actual walking, worktop/leg contact, cleared pedestal/case space, rigid gait attachment, source support contact and 72 complete neighbour triangle comparisons. Measure four matching native GPU views.
5. Investigate the broader audit's reproducible L12 navigation failure. Fix its horizontal movement cutoff trapping it just outside the 3D waypoint radius; cap final-step travel without changing its speed limit. Verify the original route, blocking walls, lost routes, automation inventory and real rendered track contact. Correct the visual test's handling of headless placeholder MultiMesh data.

Iteration review: [service benches](benches-review.md). All 779 selected assertions pass, the three GLBs validate cleanly, and the original L12 route succeeds without relaxing its test. Added median GPU cost is 0.036–0.265 ms across fixed native views; bench collision loses a net 144 triangles. This is verified model, collision and navigation progress within the existing story. The broad goal remains active: other simple machine fixtures, full-campaign feel and older intermittent frame stalls still need further investigation.

## Completed iteration: grounded main intake and guarded rotor

Starting state: `80b55d2`. The preceding turn made verified progress on service benches and L12 navigation. Inspect the main front intake, whose rear is an opaque disk and whose lower casing cuts through the middle deck.

1. Author one original Blender assembly with 36 curved closed blades, hollow rolled casing, machined seams, complete front/rear guards, a supported finned drive, connected conduit, maintenance plates and diffused cyan crown. Retain the editable source and batch 530 parts into nine runtime meshes.
2. Fit curved saddles and bolted shoes to the floor. Correct small plate mounting gaps. Full mesh checks reveal the crown intersects an overhead beam; bake a 5% size adjustment to clear it while preserving floor contact and the original complete footprint.
3. Replace only the dedicated frozen intake subtree. Preserve the earlier workshop refinements. Correct the rotor's axis for the new game-space hierarchy while retaining travel phase, pause and save/load behavior.
4. Remove exactly 12,724 old intake collision triangles, composing the prior pump/bench trims. Preserve all other frozen vertices and winding. Install one 708-triangle guarded envelope and verify actual rear-aisle/side walking, ray contact and cleared floor space.
5. Check blade/static and neighbouring mesh clearance, imported geometry, native and MCP presentation, camera, navigation, existing equipment and desert/weather regressions. Fix older test shutdown races with the existing audio-drain helper. Compare sequential fixed-camera GPU views and actual 65-second travel samples.

Iteration review: [main intake](intake-review.md). All 508 selected assertions pass and both GLBs validate cleanly. Added median GPU cost is 0.038–0.433 ms in matching fixed views; collision loses a net 12,016 triangles. The final travel trace stays below 10.438 ms per frame after its first three seconds, while an initial 162.332 ms frame remains unresolved. The sparse desert models and visibility-only dust storm remain verified, with no shelter/water multiplier. This is verified art, collision and validation progress, not an overall FPS improvement or whole-goal completion. The goal remains active: other plain machine fixtures, full-campaign feel and startup/intermittent stalls remain open.

## Completed iteration: precompiled machine and lower retained memory

Starting state: `3ad034f`. The preceding turn made verified progress on the intake. Investigate the actual normal title/start path and the cost of assembling successive refinements at every launch.

1. Profile title preparation, New Campaign and the existing opening in a fresh native process. Distinguish title startup from the immediate-play travel fixture; the normal opening already stays near its 60 FPS cap after preparation.
2. Compile the exact finished machine and static physics into a compressed native scene. Detach final embedded resources from obsolete source containers while retaining complete mesh data, imported LODs, shadow meshes, textures, collision and resource sharing.
3. Load compact runtime contracts without the full static collision JSON. Preserve full JSON numeric precision, animation bindings, world-root gates and independent per-game shader state. Retain editable source, an offline authoring recipe, source hashes, setup integration and rebuild instructions.
4. Compare 894 nodes and all stored resource data, verify articulation/indicators/canvas/gates, inspect four pixel-identical native views and run 18 gameplay/art regression suites. Update old resource-identity assertions to compare exact content and placement.
5. Measure native startup and title allocations twice in opposite orders. Preserve timing variability and counter limits rather than claiming an unproven FPS improvement.

Iteration review: [compiled machine](compiled-machine-review.md). All **909 assertions pass**. Both comparison pairs retain approximately **48.3 MiB fewer Godot-tracked CPU allocations** and **11.2 MiB less video memory**, with unchanged textures and geometry. Startup times overlap; this does not establish a consistent launch speedup. All four openings complete, with maximum sampled opening/play frames of 17.277–17.860 ms at the 60 FPS cap. Desert/weather checks still confirm normal water use regardless of storm exposure or shelter. This is verified memory and build-pipeline progress within the existing story. The broad goal remains active: other plain fixtures, full-campaign human play feel and independently observed startup/intermittent stalls remain open.

## Completed iteration: detailed helm and correct operator interaction

Starting state: `d78eb84`. The preceding turn made verified progress on retained machine memory. Inspect the existing helm, whose simple casing and baked earned hardware do not reflect native campaign state. Reproduce the obsolete interaction point more than three metres from its visible position.

1. Author an original Blender helm with a sealed folded casing, grounded anchors, fitted doors/hinges/latch, screened ventilation, terminated conduit, seated sloping fascia, machined selectors, readable legends and separate cartridge/blank variants. Preserve the original footprint and upgrade pivots.
2. Review studio, MCP and native views. Close actual panel gaps, fit the rear plate flush and relocate permanent identification away from the existing Meridian attachment. Verify support contact, complete neighbouring mesh clearance and identification/upgrade clearance.
3. Derive E interaction and receiver arbitration from the actual visible machine fixtures. Remove baked earned hardware, show each real unlock once, and display existing gyro power with a restrained dark/green/amber lens. Keep controls, reach, collisions, power draw, saves and story rules intact.
4. Recompile the native machine and verify exact source equivalence, actual walking/ray contact, real E input, power loss/recovery, needle motion, earlier/full progress restore and broader gameplay regressions. Make offline bake write failures exit cleanly; verify a real locked-file failure preserves the prior scene.
5. Rerun desert/weather checks: sparse grounded Blender details and subtle wind remain present, with no shelter/water penalty. Compare four final native helm views sequentially and retain review evidence.

Iteration review: [helm](helm-review.md). All **584 assertions pass** across ten selected suites. The 259-part Blender source exports to 17 batches / 63,110 triangles; validation has no errors or warnings, and the physical envelope remains unchanged. Matched median GPU differences range from −0.055 to +0.068 ms, not evidence of a gameplay FPS improvement. This is verified model and interaction progress. The broad goal remains active: other plain fixtures, full-campaign human play feel and independently observed startup/intermittent stalls remain open.

## Completed iteration: aisle-facing receiver and accurate scan feedback

Starting state: `77c4798`. The preceding turn made verified progress on the helm. Inspect the nearby receiver: its controls face the outer railing, its post ends short of the tray and its lead has no visible termination.

1. Author an original Blender receiver with a grounded bolted base, connected pedestal/tray, formed sealed casing, protected handles, machined controls, detailed cartridge/socket, screened vents and terminated power/antenna connections. Preserve its original site and collision footprint; face its controls toward the aisle.
2. Inspect source, native and live MCP views. Correct panel seams and handle overshoot, then verify support contacts, whole-machine geometry clearance and earned-instrument clearance. Preserve editable source with 208 parts and a 15-batch runtime model.
3. Display the actual scan phase, coherence and pause reason on its physical screen at four Hz of simulation time. Preserve discovery, module requirements, scan/stabilization timing, power, E interaction and saved state. Keep earned instruments at their existing sites and turn them toward the same aisle.
4. Remove microscopic collapsed faces from the two retained reward models, retain fine vertex precision and preserve their original local root transforms for other destination uses. Verify real imported geometry, walking/rays, E input, power loss, threats, offboard pause, save/load and the existing battle trigger.
5. Rebuild the compiled manifest, run broader regressions, inspect the final Blender and native assemblies and compare four matched native GPU views. Use the established audio-drain helper to remove a crossfire test shutdown race.

Iteration review: [receiver](receiver-review.md). All **662 assertions pass** across 11 selected suites, both GLBs validate with no errors or warnings, and the combined receiver/rewards have no collapsed imported triangles. Added median GPU cost is 0.072–0.114 ms across fixed native views. Desert/weather checks still confirm sparse natural scenery and visibility-only storms with no shelter/water penalty. This is verified model and feedback progress within the existing story. The broad goal remains active: other fixtures, full-campaign human play feel and independently observed startup/intermittent stalls remain open.
