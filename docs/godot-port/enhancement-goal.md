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

## Current iteration: atmosphere and effect allocation

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
