# Native raider craft

Original Blender replacement models for the existing skiff and gunboat. No third-party meshes or textures. `RaiderCraft.blend` retains both editable assemblies, packed original PBR maps, studio lights and camera. `raider-craft.png` is the source render. The native export is `../../godot/art/raider-craft.glb`.

| Assembly | Editable mesh parts | Triangles | Native mesh nodes | Material surfaces |
|---|---:|---:|---:|---:|
| RaiderSkiff | 398 | 45,728 | 3 | 16 |
| RaiderGunboat | 400 | 49,519 | 4 | 17 |

The shared export is 8,828,040 bytes. Portable tangent buffers are included; four zero-length Blender tangents are reconstructed from adjacent valid UV triangles. The validator reports no errors or warnings. Microscopic collapsed bevel faces are removed after transforms, and the native import retains vertex precision and generated LODs.

Tapered sealed hulls carry recessed lift ducts, closed impeller blades, bolted armor cassettes, protected lamps, supported service equipment, fitted hoses, open exhausts and articulated guns. The skiff's usable deck top is Y=1.224 m. Existing crew, muzzle and damage marker positions are retained; gameplay collision stays in the native controller. Visual fans are recessed static geometry, not a flight simulation.

Rebuild from the repository root in a separate Blender process:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --python tools/art/native_enemies/build_raider_craft.py
node tools/art/native_enemies/validate_raider_craft.mjs
```

The builder uses the repository's original geometry and material helpers. `-- --no-render` skips the studio render. The MCP review script appends a scene to the open Blender session without replacing existing work:

```powershell
& C:\Python311\python.exe tools/art/graphics_v2/mcp_client.py code --file tools/art/native_enemies/review_raider_craft_mcp.py
```

See [native review](../../docs/godot-port/raider-craft-review.md) for rendered gameplay views, tests and measured cost. Existing browser assets are unchanged.
