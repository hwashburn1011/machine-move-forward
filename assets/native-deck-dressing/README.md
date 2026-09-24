# Secured Nomad service drums

Three original Blender refinements for the native Godot machine. These replace the existing upper-deck service drums at their original positions. They are static scenery, with no new interaction or resource rules.

- `NomadServiceDrums.blend`: editable studio with 60 named mesh parts per drum, packed PBR textures, camera and lighting.
- `RetainedCargoFittings.blend`: the unchanged non-drum geometry from the affected frozen cargo batch, with its original materials.
- `service-drums.png`: inspected Cycles studio render.
- `manifest.json`: source revision, exact coordinate-preservation audit, placements and export statistics.
- `../../godot/art/nomad-service-drums.glb`: three assemblies, 49,776 triangles across 15 mesh/material batches, with imported LODs.
- `../../godot/art/nomad-cargo-fittings.glb`: 84 retained triangles; runtime reuses the original cargo material resource.

Each drum has a shaped steel shell, rolled lips, strengthening swages, recessed lid, two capped bungs, continuous cylindrical UVs, curved identification lettering, bolted feet and a securing hoop. Two use faded oxide paint, one faded olive. The port-side label/latch faces the open positive-Z aisle; the other two face negative Z.

The exported assemblies use game metres and Y-up. Deck contacts start at Y=16.03 m; each local assembly is approximately 0.572 × 0.862 × 0.608 m. Placement and footprint stay inside the original drum/bead envelope. The initial impression that the old drums floated was disproved by a source audit: their bodies already reached the deck. The refinement makes that attachment visibly credible.

The builder extracts only complete drum components from two frozen batches, asserts exact preservation of all remaining coordinates, and never changes the frozen machine or browser masters. Runtime replaces those batches and adds the new kit. Godot's imported vertex compression introduces at most 0.382 mm of difference in the retained fittings; the Blender coordinates are identical.

Rebuild from the repository root in an isolated Blender process:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python tools/art/native_machine/build_dressing.py
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --editor --import
```

The builder resets only its own background scene and reuses this project's original geometry helpers and PBR recipe. No downloaded models or textures are required. Append a separate interactive review scene through the connected Blender MCP, preserving existing scenes:

```powershell
& C:/Python311/python.exe tools/art/graphics_v2/mcp_client.py code --file tools/art/native_machine/review_dressing_mcp.py
```

See [native review and measured cost](../../docs/godot-port/deck-dressing-review.md) for gameplay/collision verification, screenshots and limitations.
