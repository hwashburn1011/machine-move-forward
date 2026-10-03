# Native Nomad access refinement

Original project-owned Blender work derived from the existing editable Nomad. No downloaded models or new story content.

- `NomadNativeAccess.blend`: 2,048 individually editable meshes, inherited weathered materials, original deck/rail/stair geometry, new end supports, grip details and cable clamps. Coordinates are game metres, converted to Blender Z-up. It is a module for the complete machine, not a freestanding building.
- `NomadServiceCables.blend`: two existing native material batches with four complete cable components moved inboard. All other vertices in those batches are retained exactly.
- `access-stairs.png`, `access-treads.png`, `access-support.png`: Cycles inspection renders of the access module.
- `manifest.json`, `cable-manifest.json`: geometry and provenance records.

Six old diagonal bypass braces are replaced by end-bay outriggers and longitudinal stringers. Two obsolete corbels across the stair openings are removed. All 96 existing treads gain anti-slip lips/ribs, worn safety inserts and captive bolts. Rail posts receive mounting feet; 16 structural members receive simple matching collision.

Rebuild from the repository root with Blender 5.1:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python tools/art/native_machine/build_access.py
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python tools/art/native_machine/build_cables.py
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python tools/art/native_machine/render_access.py
```

The build reads the existing gameplay Blender master and frozen native `machine.glb`; it does not rewrite either source or the browser game. Runtime exports live in `godot/art/`. `MMFMachineAccess` replaces the old module and two cable meshes, supplies the original shared materials, and installs support collision. The standalone runtime GLBs deliberately carry placeholder materials for shared surfaces; load them through the native installer for the original textures, or open the fully textured Blender sources for editing.

`tools/art/native_machine/review_mcp.py` appends a review scene through the local Blender MCP socket while preserving existing scenes. The inspection scripts record the original interference locations. See [native review and validation](../../docs/godot-port/machine-access-review.md) for coverage and measured rendering cost.
