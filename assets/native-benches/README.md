# Nomad service benches

Original Blender refinement of the six existing middle-deck service benches. Weathered steel/enamel, anchored endframes, a suspended two-drawer housing, folded lower shelf, bolted vise, gasketed cases, latches, handles, parts tray and spanner. Fore and aft benches face their respective central aisles.

- `NomadServiceBench.blend`: editable master, 212 named mesh parts, studio cameras/lights, packed PBR maps.
- `RetainedBenchHardware.blend`: exact remainder of five frozen shared batches after this and previous vessel/cabinet/pump removals.
- `bench-studio.png`, `bench-rear.png`: inspected Blender renders.
- `manifest.json`, `collision-manifest.json`, `source-fit.json`, `gltf-validation.json`: measured export and verification evidence.
- Runtime assets: `godot/art/nomad-service-bench.glb`, `nomad-benches-retained.glb`, `nomad-bench-collision.glb`, plus their manifests.

The render master has five shared material batches and three original 512² PBR materials. Textures use metre-based projections so wear does not stretch across thin steel. Godot generates normal LODs and compressed imports. Six instances share one 252-triangle collision shape; retained workshop ranges compose the previous pump replacement instead of resurrecting its old collision.

## Construction reference and scope

[Bott's steel workbench endframe](https://webcat.bottltd.co.uk/41401009-16v-cubio-height-adjustable-workbench-leg.html) informed the braced industrial construction. Geometry, textures, labels and fittings are original; no vendor mesh, logo or photograph is embedded.

These refine existing decorative workshop furnishings. They do not add a crafting interaction, new resources, story or progression. All original bench sites, worktop heights and complete footprints are retained. The frozen Three.js assets remain unchanged.

## Rebuild and inspect

Run `tools/art/native_machine/build_benches.py` in an isolated background Blender process, then `build_bench_collision.py` and `verify_benches.py`. Validate with `node tools/art/native_machine/validate_benches.mjs`, import the Godot project, and run `res://tests/benches.gd`.

`tools/art/native_machine/review_benches_mcp.py` appends a dedicated review scene through the Blender MCP without replacing existing scenes. `res://tests/benches_review.gd` captures four native views and GPU timings; `--legacy` restores only the bench-related geometry, preserving the preceding machine refinements.

See `docs/godot-port/benches-review.md` for gameplay/collision verification, native previews and matched performance results.
