# Expansion art — original Blender assets

Five original models built for the approved gameplay expansion. Astra owns the
geometry and art direction; Luna owns the gameplay integration. They use the
existing weathered industrial palette, rolled edges, smooth cylinders, service
panels, and separate animated mechanisms. No downloaded models, paid assets,
external texture licenses, or AI raster images are required.

| Asset | Triangles | Draw primitives | Optimized GLB |
| --- | ---: | ---: | ---: |
| Navigation helm | 7,072 | 7 | 975,248 bytes |
| Relay Foundry | 40,524 | 11 | 1,704,328 bytes |
| Raider gunboat | 35,428 | 12 | 1,698,212 bytes |
| Automatic collector | 19,048 | 11 | 1,240,972 bytes |
| Automatic turret | 10,832 | 13 | 1,047,388 bytes |

The complete set is 112,904 triangles and 6,666,148 bytes (6.36 MiB). Original
Blender sources and PNG texture masters remain in `assets/blender/expansion-v1`
and `assets/expansion-v1/staging`. The optimized files in
`assets/expansion-v1/optimized` are copied to `public/models/authored` unchanged.

Geometry uses lossless Meshopt compression. Base-color WebP textures retain 1K
resolution; normal and packed roughness/metalness maps use 512px lossless WebP.
This saves download size, not texture residency: each unique source asset has an
estimated 32 MiB of texture data including mipmaps. Device instance resource
sharing and complete-game performance are checked during gameplay integration.

## Authoring and physical contracts

Game units are metres, Y-up, with base anchors at Y=0. Blender's source axes are
converted on export. Required marker names and world positions are recorded in
the staging manifests and in `asset-validation.json`.

- Helm: 1.16 × 0.72m base, 1.35m tall, facing +Z; fixed machine anchor
  (-1.8, 3.69, -5.6). Gyro cartridge and power lens remain independent nodes.
- Foundry: 14 × 10m main floor, clear western entry and central walking aisle;
  the 1m bridge extends to X=-8. Machinery follows the authored collision boxes.
  Specialist cartridges and journal positions match campaign data.
- Gunboat: 3.4 × 9m envelope; enclosed hull, distinct elevated gun and drive
  units. `GunboatGunYaw → GunboatGunPitch → GunboatMuzzle` preserves articulation.
  Neutral muzzle is (0, 3.6, -3.5); damage anchors match the physics targets.
- Collector: 1.56m square base, wound cable drum and guarded fairlead; drum,
  guide, hook exit, rear service interaction, controller, and lamp are separate.
- Automatic turret: 1.34m square base, short barrel and asymmetric tracker;
  yaw at Y=.78, pitch at local Y=.37, muzzle at local (0,.02,-.67).

Three additive review scenes were staged through the running Blender MCP on
port 9876: `MMF_Expansion_V1_Devices`, `MMF_Expansion_V1_Gunboat`, and
`MMF_Expansion_V1_Foundry`. The user's original scene, three objects, and unsaved
filepath were preserved. The review scenes are also saved in
`assets/blender/expansion-v1/expansion-review.blend`.

## Verification and reproduction

Blender 5.1 generated every source and export. A local edit-mesh unwrap crash was
avoided by assigning consistent metre-scaled UVs directly to mesh loops. The
builder evaluates transforms before parenting curved details to animated nodes.

Run from the repository root:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --factory-startup --threads 1 --python-exit-code 2 --python tools/art/expansion_v1/build_assets.py
node tools/art/expansion_v1/optimize.mjs
node tools/art/expansion_v1/validate_khronos.mjs
node tools/art/expansion_v1/review.mjs
```

The browser fixture expects the Vite server on port 5193. It decodes the actual
optimized GLBs using the game's loader and inspects vertex finiteness, UVs,
textures, bounds, triangle budgets, and named markers. All five assets pass.
Khronos validation reports zero errors and no unresolved issues; retained notices
are Meshopt support and generated tangent-space/unused-node notices.

Front and rear browser renders accompany this document. These isolated asset
renders establish visual and asset correctness; the complete gameplay and
hardware acceptance results belong to the expansion execution ledger.
