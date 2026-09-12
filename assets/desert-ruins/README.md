# Desert ruins source pack

Original models and textures for Machine Move Forward. Models are authored in metres, Z up in Blender/FBX and Y up in the game GLB. All 14 meshes share one original 2048px PBR texture atlas. Window openings, exposed floors, rebar, wheel wells, empty vehicle cabins, torn tank shells and missing sign panels are modelled geometry.

`source/DesertRuins.blend` contains the staged library and hidden editable component collections. Reveal an archetype's collection to edit its individual parts and bevel modifiers. The assembled copies on the review grid are the exported models; the builder regenerates exports before moving them to that grid. `textures/` holds original base-color, normal and ORM masters. ORM channels are occlusion, roughness and metallic respectively; the browser export uses roughness/metallic, while Unreal also connects occlusion.

`unreal/DesertRuins.uproject` is an Unreal 5.8 project with Python and editor scripting enabled. Run the importer below to create 14 native StaticMesh assets, three textures, a shared material and `/Game/DesertRuins/DesertLibraryReview`. Native binary Content and editor caches are generated locally, excluded from source control. `source/unreal-validation.json` records the actual engine import and metre-scale/material checks.

Rebuild from the repository root (Python requires Pillow and NumPy; Node dependencies come from `npm install`):

```powershell
python tools/art/desert_ruins/textures.py
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --threads 8 --python tools/art/desert_ruins/build.py
node tools/art/desert_ruins/optimize.mjs
& 'C:/Program Files/Epic Games/UE_5.8/Engine/Binaries/Win64/UnrealEditor-Cmd.exe' "$PWD/assets/desert-ruins/unreal/DesertRuins.uproject" -run=pythonscript "-script=$PWD/tools/art/desert_ruins/import_unreal.py" -unattended -nop4 -nosplash -NullRHI
```

The Blender MCP review script appends a separate review scene, preserving already-open scenes:

```powershell
python tools/art/graphics_v2/mcp_client.py code --file tools/art/desert_ruins/stage_mcp.py
```

The optimizer preserves both detail levels and atlas UVs, embeds WebP textures and Meshopt geometry, and writes `public/models/props/ruins/desert-ruins.glb`. Source FBX and uncompressed GLB exports are reproducible outputs under `exports/`. The distant versions use 32% of the source triangles, with identical origins and scale. Detailed budgets are recorded in `source/model-report.json` and `source/optimize-manifest.json`.

## Visual references and provenance

All meshes, weathering maps and fictional sign graphics were created for this project. No reference photograph pixels or downloaded model geometry are included.

- [Kolmanskop's sand-filled buildings](https://www.loveproperty.com/galleryextended/108085/kolmanskop-the-abandoned-ghost-town-swallowed-by-sand): open rooms, missing rafters, exposed plaster and brick, sand burying the ground floor.
- [Rusted car in the Namibian desert, Hub JACQU on Pexels](https://www.pexels.com/photo/rusty-vintage-car-in-namibian-desert-35298584/): chipped paint, empty windows and light sockets, exposed chassis and oxidized metal.
- [US 95, Coaldale, Tim Messick](https://timmessick.wordpress.com/2020/04/18/us-95-coaldale/): roadside billboard skeletons and isolated industrial remnants.

The sign lettering uses the locally installed Bahnschrift font rendered into the original graphics. No font files are distributed. Asset creation uses Blender, Pillow, NumPy, Sharp and Meshoptimizer; no paid asset service or downloaded asset pack is required.
