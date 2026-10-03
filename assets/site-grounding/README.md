# Terrain-grounded approach sites

This additive collection leaves the existing playable upper buildings untouched. Fifteen lower-building designs cover eighteen approach/docking identities. The opening tower already had a full-height facade, so it receives only a buried footing; the distant Meridian city receives only a buried berm continuation. There are twenty explicit runtime identities in total.

The designs use enclosed lower storeys, transfer slabs, captured window frames, downpipes, pilasters and braced loading towers. The three recovery sites share the same freight-tower infrastructure; their existing earned equipment remains different. The courier site retains the refuge architectural family. No new lower floor is playable and no new interaction, reward or save field is introduced.

## Physical contract

- Existing visitable floor: world Y = 16.03 m; unchanged.
- Highest added geometry: local Y = −0.125271 m. It seats inside the existing slab underside. The native test checks actual transformed vertices, avoiding rotated batch-AABB overestimation.
- Main authored lower facade sole: approximately local Y = −12.20 m.
- Continuous foundation top: local Y = −12.10 m, with 0.10 m structural overlap.
- Every closed foundation reaches world Y = −6.70 m, 0.20 m below the analytic dune minimum.
- Per-footing grade collars sample all nine center/edge/corner points with the actual render-world conversion: X + session.lateral, Z − session.distance. Their lower edge is 0.45 m below the minimum sample and upper edge 0.16 m above the maximum.
- Sampling happens only at attachment. Passing and steering never stretch the facade or change its foundations. Existing docking X behavior is retained. The continuous buried caisson prevents gaps even when the terrain later moves laterally under that convention.
- One compound layer-1 lower-building static body per site. No original roof/floor collider is replaced.

The dune bound is analytic: value noise is a convex interpolation of values in [−1,1], and the fractal average uses normalized positive weights. Broad noise contributes ±5.2 m; squared ridged noise contributes ±1.3 m. The corridor blend combines that bounded value with h×0.08−0.55, whose interval is [−1.07,−0.03]. Therefore the full height remains in [−6.5,6.5] m, including unsampled edges and slopes.

## Sources and verification

- Editable individual parts: `SiteGrounding.blend`.
- Reproducible Blender builder: `tools/art/site_grounding/build.py` (Blender 5.1, background, four threads).
- `finish_source.py` records the narrow first-review fabrication corrections. Its tiny-face cleanup is also part of the main builder; the final builder directly creates the corrected Wake buttresses and depot cleats.
- Shipped kit: `godot/art/native-site-grounding.glb`, 215,976 triangles total across eighteen packed roots/templates; each major lower building uses at most six material batches.
- Shared original mapped industrial palette plus two restrained cast-mineral finishes. Mesh/material resources are prepared once through the existing title asset lifecycle.
- `geometry-review.json`: all finite; no zero-area triangles, inverted-volume candidates or detached support-bounds candidates.
- `gltf-validation.json`: Khronos validation, zero errors and warnings.
- `test-results/site-grounding/grounding-test.json`: 953 checks passed, including all eighteen production destination dispatches, exact vertex clearance, physical foundations, terrain-coordinate agreement, frozen travel geometry, and cache teardown.
- `test-results/site-grounding/upper-preservation.json`: all nineteen recorded upper-asset identity references retain byte-identical GLBs.
- `test-results/site-grounding/native/`: 41 reviewed native images (twenty side views, twenty footing views, and one true Nomad approach). Isolated views hide both the Nomad's fixed and separately parented built presentation; no site-attached geometry is hidden.

Initial diagnostic logs and misleading first fixture captures remain under `test-results/site-grounding/` for traceability. They are superseded by the corrected native capture set.
