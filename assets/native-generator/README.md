# Nomad generator

Original native Godot presentation asset. The retained Three.js generator and source assets are unchanged.

- `NomadGenerator.blend`: editable studio with 194 individually named mesh parts, packed materials, camera and lights. Open this to modify the enclosure, radiator, lines, fittings and instruments.
- `generator-studio.png` and `generator-rear.png`: inspected Cycles renders.
- `manifest.json`: export statistics and semantic anchors.
- Native asset: `../../godot/art/native-generator.glb`, 45,508 triangles, 13 mesh/material batches, approximately 4.9 MB. Godot imports mesh LODs and extracts the embedded maps alongside the GLB.

The root uses metres and game Y-up after glTF export. Ground contacts start at Y=0; overall height is 1.2843 m. Geometry stays inside the existing 1.7 × 1.3 × 1.44 m collision envelope. Static geometry is joined by material only in the exported derivative; the Blender source retains editable parts.

`FuelNeedle` rotates around local Z from −110° empty to +110° full. `RunLamp`, `ReserveLamp` and `ServiceLamp` contain emissive lenses over fixed dark sockets. `FuelPort` marks the filler cap. The runtime reads the existing shared fuel reserve and each generator's condition; there are no additional resources or gameplay rules.

Rebuild from the repository root in an isolated process:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python tools/art/native_generator/build.py
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --editor --import
```

The builder resets only its own background scene. It reuses the project's geometry helpers and original portable PBR recipe. No downloaded geometry or textures are required. The MCP review script appends a separate studio, preserving all existing interactive Blender scenes:

```powershell
& C:/Python311/python.exe tools/art/graphics_v2/mcp_client.py code --file tools/art/native_generator/review_mcp.py
```
