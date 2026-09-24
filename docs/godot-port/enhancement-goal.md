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
