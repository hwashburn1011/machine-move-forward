# Native machine access and grounded detail

Continues the [enhancement goal](enhancement-goal.md) from `432abe4`. The preceding camera pass exposed diagonal members crossing the exterior stair view. Native mesh queries and the editable Blender master confirmed genuine character-space interference, rather than a camera-only issue.

## Refined geometry

Blender MCP inspection identified six `Bypass knee support` members, two `Supported catwalk corbel` members, a side utility cable and three exposed side wires. Three middle-deck knees crossed the lower flight; the corbels occupied openings where no continuous catwalk plate remained. The cable bundles protruded into the inner edge of the route.

The new native access module preserves 1,148 original source objects and the established three-deck layout. End-bay triangulated outriggers carry the bypass through longitudinal stringers, with welded gussets, bolted hangers and visible fasteners. No new brace crosses either climbing flight. Sixteen support members have matching simple box collision for character/camera contacts; the existing deck, stair ramp and railing collision remains authoritative.

All 96 existing internal/external treads gain beveled anti-slip lips, raised traction ribs, worn safety inserts and captive bolts. Exterior rail posts receive welded feet. The four interfering cables are moved inboard by 0.65/0.45 m and supplied with chassis clamps. Their Blender export refuses partial-face selections and verifies that every unselected vertex stays unchanged.

The module restores planar source deck geometry. Across 400 deck/bypass samples, the old optimized visible mesh deviated from the nominal floor by up to 5.77 mm; the replacement deviates by about 0.002 mm. Platform size, stair running heights and gameplay collision are preserved.

Editable sources and inspection renders are in [assets/native-machine](../../assets/native-machine/README.md). The original Blender masters, browser implementation and frozen native bake remain unchanged. Native startup replaces only the access module and the two affected cable batches.

## Materials and rendering cost

The access module uses five material batches instead of four. Four reuse the original native material/texture resources by identity; the fifth is a small flat safety-paint material. Cable replacements likewise reuse their original materials. The runtime exports contain no duplicate copies of the shared texture maps. Godot's standard import generates LODs and shadow meshes.

Source bevels and new grip/fastener detail increase access triangles from 40,434 to 136,416. This is a deliberate visible-detail increase, not a performance improvement claim. The two cable batches retain 3,866 triangles in total.

RTX 3070, 1920×1080, Forward+/Vulkan, 4x MSAA, VSync disabled. A fixed exterior-stair view runs baseline/refined/refined/baseline, each with a three-second warmup and five-second sample. Gameplay motion and the character are frozen/hidden to isolate this rendering comparison. Both variants remain resident, so these measurements do not quantify total memory overhead.

| Metric | Baseline runs | Refined runs |
| --- | ---: | ---: |
| Median frame time | 3.447 / 3.360 ms | 3.678 / 3.675 ms |
| Median GPU time | 2.884 / 2.895 ms | 3.185 / 3.186 ms |
| Frame-time p95 | 4.254 / 4.083 ms | 4.622 / 4.637 ms |
| Draw submissions | 623 | 626 |

The additional detail costs approximately 0.30 ms of GPU time in this view. It remains comfortably below a 16.7 ms frame budget on this machine, but this isolated view does not prove every gameplay situation sustains 60 FPS.

## Verification

`machine_access.gd` creates temporary collision from the actual visible triangles. It reproduces 42 intersecting torso/head samples in the old access module. All 366 sampled positions across both refined exterior flights are now clear, including the rest of the visible machine. This volume intentionally excludes expected foot/tread contact; actual input-driven traversal tests cover walking and landings separately.

The same suite checks 400 deck/bypass heights, original material identity, removal of coincident old geometry, five render batches and support collision placement. Native camera captures and three Blender Cycles renders were inspected. The final editable module is also loaded into a separate Blender MCP review scene with earlier scenes preserved.

The verification pass covers 435 passing assertions: integration (108), input parity (57), broader gameplay parity (132), campaign polish (58), traversal (13), access geometry (13), and GPU-rendered camera clearance (54). Both exterior flights, their landings, the outer bypass and the expedition gangway remain traversable. The new asset import completes without warnings or errors.

Input parity initially reported intermittent retained objects at engine shutdown after its assertions passed. Its teardown now allows queued deletion to finish and defers engine exit until the asynchronous test function returns. This is a test-harness change, not a change to gameplay timing.

Evidence: [geometry/clearance report](results/machine-access.json), [GPU comparison](results/access-benchmark.json). Generated native before/after images remain under `test-results/godot-native/access-stairs-before.png` and `access-stairs-after.png` locally.

The broader goal remains active. This is a focused access/model pass. Interactive station readability, broader character animation review, representative rendered dense construction and normal-speed campaign play still deserve further review.
