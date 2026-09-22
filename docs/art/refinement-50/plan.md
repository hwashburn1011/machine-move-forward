# Grounding, performance and 50-model refinement — 2026-09-22

## Delivery order
1. Fix construction attachment and level surfaces, protruding braces, disconnected workshop parts. Build/runtime collision must agree; existing saves retain cells and contents.
2. Measure CPU, GPU submission, frame-time spikes, camera turns and populated combat on the same high-quality settings. Remove redundant work and allocations; preserve render resolution, effects, shadows, meshes, physics, timing and gameplay.
3. Refine the 14 existing desert models and create 36 distinct additional artifacts in Blender (50 total). Export editable source and optimized textured GLBs, integrate all into seeded scenery, render individual reviews and repeat game/performance checks.

## Acceptance
- No relative drift between built floors and the moving hull; flush mesh/collider surfaces on all three levels; save/restore and build preview consistent.
- Workshop equipment faces access aisles and has bases, fasteners and connected services. Braces terminate below the deck and within the frame.
- Measure performance before/after using the same local production build harness, seed, resolution and quality. Report measured limits honestly.
- Exactly 50 named complete models, counted once (no counting LODs, individual bolts or recolors). Grounded pivots, smooth manufactured curves, broken edges where appropriate, bevels, PBR surfaces, near/distant exports. Runtime instancing remains bounded.
- No progression additions or changed difficulty. Existing saved campaigns work.

## Grounding completed
Construction now uses the hull scene transform and a shared driven physics body. Floor meshes/colliders extend below the deck plane. Depth bias prevents coplanar overlay flicker. Interaction positions follow the actual world pose.
Blender source now contains fitted inboard braces, four complete electrical/service cabinets, aisle-facing machinery banks, bench/skid bases and motor saddles, connected valve stems, continuous steam risers and supported overhead headers.
Tests cover all three deck levels, 90 pose changes, preview, raycasts, save restoration and shared-body lifetime. In-game 120-pose sweep measured zero visual drift and under 0.006 mm collision error; a capsule traversed the extension normally. Four Blender closeups and five in-game captures are in test-results/grounded-*.

## Model checklist
Completed: the [50-item manifest](../../../assets/desert-ruins/source/model-report.json), [rendered catalog](index.html) and [delivery/verification report](README.md) contain the final models and evidence. Existing: house, shop, apartment, tower, factory, overpass, car, bus, tanker, billboard, water sign, road sign, pylon, water tower.
New: pickup, ambulance, forklift, survey rover, rail bogie, container wagon, fuel trailer, culvert, transformer, roadside fuel pump, utility cabinet, telecom cabinet, condenser, satellite dish, light tower, generator, compressor, hydrant, bulk fuel tank, cargo pallet, cable spool, road barrier, signal gantry, bus shelter, crane pedestal, motorcycle, ventilation turbine, pump skid, scrapyard magnet, radar tower, fallen antenna, bunker entrance, grain silo, storm drain, street lamp, rail crossing.
