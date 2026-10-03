# Roofs and stable floors

This pass repairs the reported flashing on the Nomad's three decks and visitable buildings, and adds credible shelter above enclosed work areas. Native visual, physics and performance verification is complete at source `65a30803dde2ff8c862ab586b7aaebb339eba306005a474041c2c6acf97a987c`. The [consolidated evidence](results/roofs-floor-stability-2026-10-02.json) records the frozen inputs and results before Windows release metadata is added.

## Floor surfaces

The Nomad's port bypass connectors and stair landings overlapped existing deck strips. The access module now partitions those surfaces without changing their combined footprint, permanent deck elevations or stair openings. It removes 26.2 square metres of duplicate coverage and retains 1,596 other meshes in the editable source. An independent audit of exported triangles finds no competing upward faces at any of the three deck elevations.

Player-built floors on a fully supported permanent deck become seated 12 mm wear plates. Tiles crossing the hull edge retain structural depth, while fully external extensions keep their original height and thickness. Visuals and physical colliders use the same classification. Saved piece identity, position, health, paint and inventory costs remain unchanged; loading an existing floor applies the corrected presentation automatically.

Wake's loaded wreck had 2.4192 square metres of dark seam faces exactly level with its deck. Those strips now form one closed, supported 8 mm seam network with rounded edges. The rest of the shipping mesh, materials, textures and functional nodes are preserved. Other visitable floors were audited using their actual loaded assets rather than unused authoring alternatives.

## Supported roofs

Relay Foundry receives a high pitched industrial roof on its existing gantry, with folded panels, purlins, fastening plates, gutters and a wind-torn rear section. The opening is represented in both visible geometry and collision. The west loading apron stays open. Its floor cassettes are also separated coherently from the foundation.

Shared Workshop receives shelter over its rear workbenches while keeping its central aisle and raised archive approach clear. Quiet Array's vault and Glass Orchard's archive receive seated roof supports and edge details. Open antenna, garden and chase spaces retain their purpose.

Wake's two overlapping roof sheets now form a supported lap. Their projected coverage is unchanged; exact physical faces block retained sheets and leave the broken openings clear. The additions use shared, muted materials and six baked physical shapes. Title preparation warms their resources before arrival. This work does not add progression requirements or alter a saved story outcome.

The visual review also corrected mirrored lettering at Shared Workshop, Glass Orchard and Meridian. Orchard's entrance text sits on its existing sign face. Meridian's previously suspended garden text receives a signboard bolted to its existing posts, with 2.445 metres of clearance below it.

## Verification record

Evidence is retained under `test-results/roof-floor`, including the original reference, source backups, matching moving-camera captures, native physics checks and isolated performance workloads. Earlier machine-space/audio and progression/combat reports remain frozen.

The final source passed 19 suite runs, including 55 floor checks in each author/compiled configuration, 121 roof checks, physical traversal of seven expedition setups, paid construction, saves, machine composition and real crane deliveries. Two obsolete fixtures were corrected: departure now explicitly supplies its required powered receiver state, and workshop construction waits for walking-access validation before committing the ordinary paid action. Their initial failures remain in the evidence folder.

Ten paired shallow-camera clips reproduce the problem and verify the repairs. The original constructed plate disappears or breaks into triangular patches; the repaired plate remains intact in all 48 paired frames inspected by the floor reviewer. Four additional real-input walking clips cross the new cap and hull-edge transitions for six metres each. Seventeen native roof and lettering views record supports, usable headroom, torn edges and mounted signs.

A controlled Foundry texture-filter comparison did not materially improve the reported flashing. The base material settings remain unchanged. Ordinary shadows, mesh detail and depth settings remain active during verification.

Nine sequential native workloads passed at 1920×1080, High Forward+ Vulkan, 4× MSAA, uncapped with VSync off, on the RTX 3070 / i9-11900KF. Eight 18-second samples cover travel, construction, all 50 furnishings, combat and four revised destinations; a 45-second workload exercises recovered machinery and real freight deliveries. The worst 95th-percentile frame time was 7.175 ms. One construction frame reached 37.738 ms; no frame exceeded 50 ms. Logs contain no engine warnings or errors, and source, asset, collider and fixture hashes remained unchanged.

These checks use scripted cameras and player input on this computer. They do not establish human visual acceptance or performance on other hardware.
