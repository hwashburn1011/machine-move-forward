# Nomad sealed cargo cases

Original Blender refinement of the four fixed cargo lockers on the native machine. The existing storage/inventory systems and browser assets are unchanged; these remain sealed environmental cases.

- `NomadCargoLocker.blend`: editable master with 157 named mesh parts, original packed PBR maps, studio camera and lights.
- `cargo-studio.png`, `cargo-rear.png`: inspected Cycles front/rear views.
- `RetainedPressureAccumulators.blend`: the untouched pressure fittings from the shared frozen cargo batch, with original materials.
- `manifest.json`: exact trim audit, original positions, inward-facing orientations and export statistics.
- `../../godot/art/nomad-cargo-locker.glb`: 24,790 triangles in four material batches; all four runtime instances share these resources. Godot imports mesh LODs.
- `../../godot/art/nomad-pressure-fittings.glb`: 220 retained triangles. The runtime reuses the original material resource.

Each case has a gasketed lid with an open-centre perimeter rim, pressed panel ribs, rounded corner guards, captured draw latches, interleaved hinge knuckles, folded carry handles in inset cups, rivets, readable identification and bolted deck restraints. Coating wear uses original 1024-pixel colour, normal and roughness/metallic maps, concentrated at panel edges. Geometry, maps and fictional markings are authored here; no external artwork or model files are bundled.

The practical hardware reference is the [ZARGES K470 case](https://zargesusa.com/products/k470-40568), particularly its reinforced corners and closures. This is a fictional Nomad case, not a replica or branded product.

The master exports in metres, Y-up, with its skids at Y=0. Bounds are approximately 1.108 × 0.851 × 1.028 m including handles. The four sites remain at the original deck heights 8.83, 12.43 and 16.03 m; their opening faces point toward the internal aisles. The clipped corners improve clearance beside the middle-deck pressure vessel without moving the crate or its original collision.

Rebuild from the repository root in an isolated Blender process:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python tools/art/native_machine/build_lockers.py
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --editor --import
```

The builder removes complete old locker/drum components from four frozen material batches and asserts exact preservation of the remaining pressure fittings. It never edits the frozen machine or browser master. The existing detailed drums remain their own asset. Runtime installs the combined replacement directly, without first creating obsolete drum/handle derivatives.

Append a separate review studio through Blender MCP, preserving existing interactive scenes:

```powershell
& C:/Python311/python.exe tools/art/graphics_v2/mcp_client.py code --file tools/art/native_machine/review_lockers_mcp.py
```

See [native review and measured cost](../../docs/godot-port/cargo-locker-review.md) for collision, clearance, sharing and runtime verification.
