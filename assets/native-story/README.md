# Native story instruments

Original Blender 5.1 artwork for Machine Move Forward. No external model downloads or new third-party textures were used. The builder reuses this repository's original geometry helpers and creates simple portable PBR materials.

Seven named assemblies: `GyroPanel`, `PowerRouter`, `ArrayTuner`, `Isolator`, `ArchiveConsole`, `WristHousing`, `SeedTerrarium`.

- `StoryInstruments.blend`: editable source; the named parts share origin coordinates for independent runtime instancing.
- `instrument-contact-sheet.png`: front/three-quarter inspection rendered through the connected Blender MCP server.
- `manifest.json`: geometry inventory (44 material batches, 75,972 triangles across all seven assemblies).
- `../../godot/art/story-instruments.glb`: 2.1 MB runtime source, with static geometry merged per material within each named assembly. The game instantiates only the required parts.

Rebuild from the repository root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python tools/art/native_story/build.py
```

The optional `tools/art/native_story/review_mcp.py` loads the source into a separate review scene on port 9876 and renders the contact sheet without replacing existing scenes. Native menus use scalable Godot Controls; physical instrument cases, switches, fasteners, displays, cuffs and cultivation hardware are authored in Blender. Existing Godot import creates the runtime mesh cache automatically.
