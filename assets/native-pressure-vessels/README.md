# Nomad pressure receivers

Original Blender refinement of the five existing middle-deck pressure vessels. This is native Godot presentation work; the frozen machine, Three.js source, campaign logic, collisions and interaction behavior are unchanged.

- `NomadPressureVessel.blend`: 144 editable components, original packed PBR maps and two studio review views. Coordinates are metres; the export faces the aisle along game −Z.
- `RetainedWorkshopHardware.blend`: unrelated geometry retained from seven shared frozen batches. The native installer restores each original material.
- `vessel-studio.png` and `vessel-instruments.png`: Blender renders.
- `manifest.json`: placements, trimming hashes, bounds and mesh budgets.
- `source-fit.json`: checks of real shell-to-leg contact, deck contact and the full exported mesh beside the cargo case.
- `gltf-validation.json`: Khronos validator output.

The formed tank has welded head seams, four grounded anchor feet, a connected low drain, spoked handwheel with spindle/packing fittings, recessed marked gauge, riveted identification plate, spring relief casing and a downward-facing open vent. The gauge is a cosmetic instrument with a fixed reading; it introduces no pressure gameplay or interaction. Foot plates stop short of the neighbouring cargo restraint, and the main shell stays within the old 0.285 × 0.304 m radial envelope.

One master supplies all five instances: 27,859 triangles, five opaque material batches, 2,003,176-byte GLB. Mesh and material resources are shared. The added art creates no physics bodies, lights, particles or per-frame scripts. Unused imported material libraries are removed from the editable source, leaving five materials and three packed maps in a 1.41 MB Blender file.

Real construction references: [WIKA 213.53 instrument](https://www.wika.com/en-au/213_53.WIKA) for case, bezel, scale and connection design; [Kaeser receiver fittings](https://us.kaeser.com/compressed-air-resources/kaeser-talks-shop/when-sizing-met-safety.aspx) for readable instrumentation, drain and relief-valve relationships. All geometry, dial markings and textures are original project work; no manufacturer artwork, logos or models were copied. This is fictional game art, not an engineering design.

Build in an isolated Blender process:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --python-exit-code 1 --python tools/art/native_machine/build_vessels.py
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --python-exit-code 1 --python tools/art/native_machine/verify_vessels.py
node tools/art/native_machine/validate_vessels.mjs
```

`review_vessels_mcp.py` appends a separate review scene through the existing MCP client, preserving the user's open scenes. Runtime paths are `godot/art/nomad-pressure-vessel.glb`, `nomad-vessels-retained.glb` and `nomad-vessels.json`. See [native review](../../docs/godot-port/pressure-vessel-review.md) for actual game captures, regression results and GPU measurements.
