# Deck gun and construction follow-up — 5 October 2026

FP04 uses three cached finish variants on the manual deck gun’s six existing steel/paint surfaces. The pedestal loses its bright silver reflection; the working metal retains restrained highlights. Original albedo, roughness and normal maps remain, with a small normal-strength adjustment. Rubber, glass, geometry, transforms, collisions and animation pivots are unchanged. Materials are reused between instances; there are no extra surfaces or draw calls. This preserves existing authored wear rather than adding a general dirt overlay.

Native before/after images use the same lighting and camera. Approach and pedestal detail views show the change. The catalog was inspected at 1920×1080 and 1280×720. The first review exposed collapsed generic pager buttons; their minimum widths and no-wrap treatment were corrected and recaptured. The rejected version remains in `construction/visual/rejected-collapsed-pager/`.

FP06 was reproduced using ordinary Build/choose/rotate/aimed-commit callbacks, with real validation and an active world. The measured interval contains no screenshots, route planner or observation captures. The checkpoint, inventory allowance and invulnerability are test fixtures; this is not an earned human playthrough.

All four baseline frames above 33 ms aligned with catalog opening: 34.205, 35.115, 40.507 and 40.458 ms. Opening the catalog synchronously took 21.513–25.929 ms. Successful aimed placement took 1.066 ms. The correction builds at most 18 part rows at a time, keeping the full ordered catalog, filters, favorites, selected details and keyboard paging available. Placement, support and access guards are unchanged.

The initial paged diagnostic reduced opening calls to 9.439–10.170 ms; maximum frame time was 18.604 ms, with no frames above 33 ms. Shared source was changing during these diagnostic runs, so this is causal evidence for bounded catalog work, not final whole-build performance acceptance. The final frozen workload receipt records the integrated result separately. Neither this reproduction nor its fix retroactively identifies the unattributed 39.513 ms frame from the earlier presentation benchmark, or all pauses in the instrumented full-playthrough actor.

Evidence:

- `docs/godot-port/results/v1-construction-hitch-diagnostic-2026-10-05.json`: exact actions, frame times, source identities and the copied adapter’s readiness-metadata limitation.
- `test-results/v1-playthrough-fixes-20261005/construction/catalog-finish.json`: functional paging, focus, original maps/geometry and material sharing contract.
- `test-results/v1-playthrough-fixes-20261005/construction/visual/review.json`: six final native views, stable source `e6d35e6c27a8f9ed1914d54014add207b6826df4c42c7b29ef60c57d3f8c1acb`.
- `tools/godot/profile-v1-construction.py`: repeatable 36-second action trace in a short isolated shader/save profile. OS and driver caches remain uncontrolled.

Final frozen construction trace: p95 6.398 ms, p99 7.368 ms, maximum 19.958 ms; no frames above 20 ms. Four catalog openings took 9.929–11.439 ms. This trace remained stable at e6d35 before only the final optional-stop display labels changed. The final release/performance receipts preserve that lineage. No hardware-wide or universal hitch-free claim is made; no personal save data is used.
