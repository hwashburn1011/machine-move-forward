# Galley kit

`galley-kit.blend` is the original Blender source for the three named roots `GalleyStove`, `GalleyCondenser`, and `GalleyPlanter`. The public optimized export is `public/models/authored/galley-kit.glb`; the runtime loads it as one critical model and maps each root to the matching build piece ID. Existing `Array_*` materials are palette-shared with the other authored kits. No external assets are used.

Rebuild from the repository root with Blender 5.1 and the project's Node dependencies:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python tools/art/galley/build.py
node tools/art/galley/optimize.mjs
node tools/art/galley/validate.mjs
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python tools/art/galley/render.py
```

The validator runs glTF structural validation plus independent GLB JSON/accessor checks. It confirms all three roots are unique, at local origin, within a 2 m cell footprint, below 16,000 triangles each and 40,000 triangles total, and agrees with `bounds.json` measured from Blender. Texture dimensions are capped at 512 where textures are unique; palette textures are reused through the existing `Array_*` sharing path.

The runtime collision boxes remain the existing `pieceColliders()` definitions. The stove flue and planter crop intentionally extend above their movement colliders as cosmetic geometry. The source FBX/export is ready for Unreal review; this repository does not claim an Unreal import.
