# Floor follow-up — 5 October 2026

No additional floor geometry change was justified by this review. The inspected temporal samples did not reproduce broad alternating floor patches on the current assets. This is bounded visual evidence, not a guarantee against every angle, lighting condition or GPU.

## Coverage and observations

The native Forward+ renderer captured 16 moving camera sequences at 1280×720, High with 4× MSAA and the game's normal near/far settings. Coverage includes bare floors, exterior stair landings and constructed overlays on all three permanent decks; Wake, Foundry, Array, Orchard, Meridian, workshop and receiving berth floors. Four further sequences use the real player movement/collision code across deck overlays and the native-to-constructed edge extension. Each walking path passed the harness's minimum 5.5 m travel assertion. These are prepared, stationary-world fixtures, separate from the previous earned campaign.

Root inspected midpoint coverage plus four temporally spaced frames per sequence; constructed deck overlays, Foundry and the edge-extension walk also received six-frame comparisons. Panel seams and overlay boundaries remain coherent in those views. Light/specular changes track the changing camera view. The original low Orchard inspection camera intersected a planter, making that view inadequate. Its evidence was retained, and a raised-camera recapture shows the archive aisle floor clearly. No production camera or model was changed to obtain these views.

The exported Nomad floor mesh audit counted 136,048 triangles with zero degenerate triangles and no coincident upward floor area on any of the three deck elevations (within floating-point tolerance). The audit reuses the existing geometry tool with only its output path redirected. This checks the machine mesh, not every site or every possible player construction.

## Evidence and limits

- Portable receipt: [floor review](results/v1-floor-review-2026-10-05.json), including source and mesh identities.
- Local raw frames, 20 encoded MP4s, temporal contact sheets and logs: `test-results/v1-journal-2026-10-05/floors/current/`.
- Corrected Orchard capture, MP4 and temporal sheet: `test-results/v1-journal-2026-10-05/floors/orchard-review/`.
- Geometry audit and provenance: `machine-floor-export-audit.json` and `geometry-tool.json` in the parent evidence directory.

Capture readback affects timing, so these sequences provide no performance measurement. Review sampled temporal frames rather than claiming an exhaustive frame-by-frame video inspection. The main capture set preceded the final Engineering text-only correction; the Orchard recapture used the final source. Exact source stamps are retained. Floor assets and rendering code were unchanged by that correction. Human play on a moving Nomad and other hardware remains useful for reporting any remaining isolated shimmer.
