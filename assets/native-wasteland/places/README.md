# Original wasteland places

Five original background landmarks for elevated views from the moving Nomad. Geometry and the four packed weathering textures are generated locally; no third-party models or textures are used.

| Exact root mesh ID | X / Y / Z extent, metres | Triangles |
| --- | --- | ---: |
| `wasteland-diner` | 12.489 / 6.108 / 8.409 | 2,602 |
| `wasteland-greenhouse` | 14.784 / 5.942 / 10.313 | 3,636 |
| `wasteland-service-station` | 13.957 / 6.186 / 10.338 | 1,526 |
| `wasteland-observatory` | 16.200 / 8.700 / 14.243 | 3,600 |
| `wasteland-passenger-coach` | 13.439 / 4.070 / 6.247 | 2,836 |

The kit totals **14,200 triangles**, with exactly five root mesh nodes and four shared materials: Scoured lime and dust, Oxidized charcoal steel, Bleached petrol enamel, and Weathered red oxide. All four base-color maps are embedded in the GLB. Their subtle irregular mottling uses seeded smooth random fields, fine grain and sparse clustered chips; the earlier periodic sine/stripe pattern was removed after native review. Materials use opaque, double-sided surfaces with roughness 0.93 so fractured thin sheets remain visible from either side.

`wasteland-places.blend` is the editable canonical source, with the five objects overlapping at their independent ground origins. Select one object and isolate it to edit. All root transforms are identity; export uses Godot Y-up. Mesh IDs have no parent empties or hidden transform wrappers. The sand skirts and debris extend to each reported footprint. These are visual scenery meshes; collision, travel placement and density belong to native integration.

Distinctive silhouettes include open diner windows and booths beneath a torn roof; a vaulted greenhouse skeleton with empty beds and a tipped gutter; a damaged service canopy with pumps and fallen roof panel; a fractured radome exposing its receiver; and a passenger coach with bogies, missing roof sections and seats visible through real window openings. The contact sheet turns only the observatory's review instance to expose its broken side; the saved source and GLB retain identity transforms.

Rebuild from the repository root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --threads 8 --python tools/art/wasteland_places/build.py
```

This writes `godot/art/wasteland-places.glb`, the source `.blend`, four original PNG wear maps, `mesh-report.json`, and `contact-sheet.png`. Rendering uses Cycles CPU. The exported GLB's JSON was inspected for exact root mesh names, five scene children, absent root transforms, four material definitions and four embedded images. Native Godot import and placement review are handled by the integration task.
