# Nomad main intake

Original Blender geometry for the existing front intake on the native Godot machine. The frozen Three.js model remains untouched.

- `NomadMainIntake.blend`: editable assembly, packed original textures and studio camera/lights.
- `intake-front.png`, `intake-rear.png`: studio views of the complete assembly.
- `manifest.json`: exact site, source bounds, measured fit and render budget.
- `source-fit.json`: support contact, rotating blade clearance and surrounding machine intersection checks.
- `collision-manifest.json`: composed frozen-mesh removal and replacement collision budget.
- `gltf-validation.json`: Khronos validator results for both exported GLBs.

The intake has 36 closed curved blades, a hollow rolled casing, machined seams, bolted flanges, front/rear wire guards, a finned rear drive with six support vanes, connected conduit, readable maintenance plates and a diffused cyan crown. Curved saddles and bolted isolation shoes meet the middle deck. Geometry is fitted beneath the actual overhead beam. The rendered assembly uses nine material batches, with three original 512-pixel PBR texture sets and automatic imported LODs.

The rotor alone turns around its game Z axis, using the existing travel-distance phase. Pausing and loading retain that behavior. The model adds no interaction, machine output, gameplay rule or light source. A separate 708-triangle collision envelope closes the guarded moving assembly to players, cameras and projectiles, preserving the old disk's blocking behavior without using the detailed render mesh for physics.

[Greenheck's vane-axial application guide](https://content.greenheck.com/public/DAMProd/Original/10003/VaneAxial_Application_Perf_Supplement.pdf) informed the housing, drive and support arrangement. No vendor mesh, drawing or texture is included. This is game art, not an engineering design.

From the repository root in PowerShell:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python-exit-code 1 --python tools/art/native_machine/build_turbine.py
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python-exit-code 1 --python tools/art/native_machine/build_intake_collision.py
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python-exit-code 1 --python tools/art/native_machine/verify_turbine.py
node tools/art/native_machine/validate_turbine.mjs
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --editor --import
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script res://tests/turbine.gd
```

The builder supports `-- --no-render` for geometry-only rebuilds. Authoring runs in a separate Blender process. `review_turbine_mcp.py` appends the editable studio to the connected Blender session without replacing or saving existing scenes.
