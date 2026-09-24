# Nomad repaired canvas canopy

An original Blender replacement for the existing native machine's weather canopy. The four original grounded posts and feet stay in place. The smaller fabric corners connect to those posts through fitted clamps, clevis eyes, captive tensioners and folded webbing loops.

- `NomadCanvasCanopy.blend`: 68 editable mesh parts, portable fabric maps and studio cameras/lights.
- `RetainedBannerAndServiceMetal.blend`: unchanged portions of the frozen batches that also contained the old canvas and its corner hardware.
- `canopy-studio.png`, `canopy-detail.png`: authored geometry review renders.
- `manifest.json`, `gltf-validation.json`: dimensions, trim provenance, export budgets and format validation.
- Runtime: `godot/art/nomad-canopy.glb`, `nomad-canopy-retained.glb`, placement/trim JSON and a coarse camera envelope.

The canopy has five sewn panels, folded hems, reinforced corners, three repairs, lock stitching, gentle sag, small tension wrinkles and original weathered canvas textures. Geometry totals **31,532 triangles in three material batches**. Its GLB is **2,664,500 bytes**. The nominal lowest surface is **18.47848 m**, above the existing 16.03 m deck.

`CanvasTint` is explicitly exported as `COLOR_0`: RGB carries repair/hem variation and alpha carries motion weights. The native opaque shader uses those weights to keep the four corners fixed. Wind displacement is at most 1.575 cm in clear weather and 3.5 cm in a full storm. The same UV-space displacement keeps seams and patches attached. Simulation time pauses with menus. This is an inexpensive authored billow, not a physical cloth simulation.

The static camera envelope has 960 triangles, follows the canopy's shape and sits 5 cm below its nominal surface. Physics layer 6 (mask value 32) is used for camera obstruction; the player, weapon queries and enemy navigation exclude it. This fixes the camera passing through the canvas when looking down under the awning. Gameplay collision, machine layout, shelter/water rules and story remain unchanged.

Construction references: Sailrite's [canvas repair guide](https://www.sailrite.com/Canvas-Repair-Rips-Tears) informed sewn repair patches; its [boom-tent tutorial](https://www.sailrite.com/How-to-Make-a-Mainsail-Cover-Boom-Tent) informed practical fabric attachment. All geometry and texture maps are original. No reference photographs, manufacturer meshes or branding are bundled.

From the repository root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python tools/art/native_machine/build_canopy.py
node tools/art/native_machine/validate_canopy.mjs
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --editor --path godot --quit
& C:/Python311/python.exe tools/art/graphics_v2/mcp_client.py code --file tools/art/native_machine/review_canopy_mcp.py
```

The authoring process is isolated. The MCP review appends a separate scene, preserving the user's other open Blender scenes. Original Three.js masters and the frozen native machine remain unchanged. See the [native review](../../docs/godot-port/canopy-review.md) for measurements and camera evidence.
