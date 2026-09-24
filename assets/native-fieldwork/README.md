# L-12 articulated drive

Native derivative of the project's original `assets/fieldwork/fieldwork-kit.blend`. The original source, browser runtime and 57 non-track body meshes remain unchanged. No third-party models or textures are used.

- `L12ArticulatedDrive.blend`: editable review assembly, lights, camera and 96 linked track shoes.
- `l12-drive-review.png` / `l12-drive-detail.png`: inspected Blender Cycles renders.
- `drive-report.json`: source hash, preservation checks and geometry counts.
- `../../godot/art/l12-track-shoe.glb`: one exported shoe, two named material slots, no duplicate texture payload (about 90 KB).

Rebuild in an isolated Blender process:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python tools/art/fieldwork/refine_tracks.py
```

Open the derivative through the connected Blender MCP without replacing existing scenes:

```powershell
C:/Python311/python.exe tools/art/graphics_v2/mcp_client.py code --file tools/art/fieldwork/review_tracks_mcp.py
```

Each belt uses 48 equally spaced shoes around a 2.228 m closed path. Shoes have separated rubber pads, rounded contact ribs, steel backing and visible hinge retainers. The full authored shoe has 2,388 triangles; the runtime import retains Godot's normal LOD generation. Two MultiMesh nodes share one mesh and the existing rubber/metal material resources. Body clearance, navigation, service timing and inventory rules are unchanged. Native code animates both belts and six wheel pivots from actual grounded travel and turn displacement, with teleport/airborne suppression.
