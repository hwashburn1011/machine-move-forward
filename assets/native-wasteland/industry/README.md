# Ruined industry kit

Five original, metre-scale scenery models for the native wasteland. No third-party geometry or textures were used. The GLB has five top-level mesh nodes with identity transforms and ground origins; Godot +Y is up. Dust, paint loss, oxidation, and mineral staining are baked vertex colors across four shared rough materials.

| Mesh ID | Triangles | Features |
| --- | ---: | --- |
| wasteland-excavator | 3,102 | Open crawler loops, road wheels, windowless cab, folded boom, hydraulic cylinders, torn bucket |
| wasteland-wind-turbine | 2,248 | Snapped hollow mast, fallen nacelle, collapsed ladder, two long blades and a broken stub |
| wasteland-cooling-tower | 3,268 | Low breached shell, fractured rim, exposed rebar, crossed legs, basin pipes and fallen concrete |
| wasteland-tunnel | 2,120 | Shattered arch sections, missing roof, exposed reinforcement, broken roadbed and guardrails |
| wasteland-solar-farm | 4,092 | Missing cells, bent panel frames, fallen array, rusted pump, tank and control cabinet |

Total: **14,830 triangles**. Exact Godot-space bounds and export verification are in `manifest.json`.

- Runtime export: `godot/art/wasteland-industry.glb`
- Editable source: `WastelandIndustry.blend`
- CPU Blender review: `contact-sheet.png`
- Reproducible builder: `tools/art/wasteland_industry/build.py`

From the repository root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python tools/art/wasteland_industry/build.py
```

The builder exports each model at its ground origin, validates the GLB contract, then arranges the source meshes into a gallery for the saved `.blend` and contact sheet. Review ground, labels, camera, and lighting are added after export and are excluded from the game asset. Tiny below-ground fragments are deliberate burial allowances.

Native import note: the installed Godot 4.7.2 importer retained every `COLOR_0` array but left `vertex_color_use_as_albedo` disabled on the first shared material. The scenery loader must enable that flag on materials whose mesh surfaces contain vertex colors. These colors are linear; leave `vertex_color_is_srgb` disabled. `tools/art/wasteland_industry/inspect_native.gd` prints the raw imported surface flags and color samples for diagnosis.
