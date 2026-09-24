# Nomad service pumps

Original Blender refinement of the two existing middle-deck pump skids. The assemblies remain decorative machinery at their original sites; no new interaction, power consumer, repair task or story content is introduced.

- `NomadServicePump.blend`: 257 editable parts, five materials and nine packed original 512² PBR maps; about 3.43 MB.
- `RetainedPumpHardware.blend`: original workshop and undercarriage geometry after removing complete obsolete pump components. The preceding vessel/cabinet removals and the access pass's 45 cm side-cable reroute are preserved.
- `pump-studio.png`, `pump-rear.png`: inspected Blender renders.
- `manifest.json`, `collision-manifest.json`: placement, trim and geometry budgets.
- `source-fit.json`: support contact, correctly aligned longitudinal fins, service-fitting bounds and full exported-mesh clearance against neighbouring frozen machine surfaces. Expected deck contact faces are excluded from the clearance comparison.
- `gltf-validation.json`: validation of all three exported GLBs.

The model includes a finned motor with a fitted fan cowl and open grille, sealed terminal box, covered coupling, formed cast pump casing, flange gaskets and fasteners, a connected three-spoke isolation wheel, suction and discharge routes ending at sealed deck fittings, a terminated electrical lead, bolted mounting rails and a continuous isolation pad. All labels and textures are original. Inspection corrected misoriented fins and aligned the motor feet with their actual supporting rails.

The shared full-resolution master is 77,981 triangles in five material batches and a 5,860,704-byte GLB. Both instances reuse its meshes and materials; Godot retains generated LODs and mesh compression. It adds no dynamic lights, particles, scripts per component or per-frame animation work.

The old loose hoses extended into newly empty space. Their collision is removed along with the old pump bodies: 4,000 complete triangles are trimmed from the frozen shared physics mesh. Two instances of one 1,199-triangle coarse collision shape follow the new pump silhouette. All remaining frozen collision vertices and winding are verified against the original data. The small skid remains a physically supported step, with the motor blocking forward movement.

Construction reference: [Grundfos end-suction pump brochure](https://www.grundfos.com/content/dam/local/en-gb/page-assets/end-suction-fast-track/documents/grundfos-end-suction-pumps-brochure.pdf), particularly the horizontal shaft, axial inlet, radial discharge, motor support and casing/flange arrangements. This is a fictional Nomad assembly; no manufacturer mesh, logo, texture or artwork is incorporated.

Rebuild from the project root:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --python-exit-code 1 --python tools/art/native_machine/build_pumps.py
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --python-exit-code 1 --python tools/art/native_machine/verify_pumps.py
node tools/art/native_machine/validate_pumps.mjs
```

The builder uses an isolated Blender process. `review_pumps_mcp.py` appends a dedicated scene to the user's running Blender session without replacing existing scenes. Runtime files are `godot/art/nomad-service-pump.glb`, `nomad-pumps-retained.glb`, `nomad-pump-collision.glb` and their two manifests. See the [native review](../../docs/godot-port/pumps-review.md) for screenshots, tests and measured rendering cost.
