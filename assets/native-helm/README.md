# Nomad navigation helm

Original Blender artwork for the existing native Godot helm. Its location, walking envelope, earned upgrades and navigation rules remain in place. The frozen browser model is unchanged.

- `NomadHelm.blend`: 259 editable mesh parts, packed original PBR textures and studio setup.
- `helm-front.png`, `helm-rear.png`: studio views; the unrecovered cartridge uses its service cover.
- `manifest.json`: native placement, bounds, geometry inventory and unchanged bearing pivot.
- `source-fit.json`: support contacts, compressed fascia gasket, full collision envelope and neighbouring triangle checks.
- `gltf-validation.json`: clean Khronos validation, with informational unused-attribute/marker notes.
- `../../godot/art/nomad-helm.glb`: 17 material batches and 63,110 triangles across all fitted/unfitted variants. Only the appropriate variant is visible in play; imported LODs and shadow meshes remain enabled.

The detailed console includes a sealed folded enclosure, grounded mounting plinth and anchors, removable skins, captive hardware, complete rear hinges/latch, screened ventilation, connected supply conduit, a seated sloping fascia, machined selectors, ceramic labels and a guarded bearing pod. Two original 512-pixel PBR sets supply restrained wear. The optional gyro cartridge and blank covers have independent named roots.

The game shows the cartridge and live bearing only after the existing course gyro is recovered. The small status lens is dark when unfitted, green when powered and amber during a real supply shortage. It adds no light source, gameplay unlock, interaction or power draw. Existing earned actuator/governor/Meridian hardware still uses the previous model and mount coordinates.

[JRC's console brochure](https://www.jrc.co.jp/hubfs/jrc-corp/assets/pdf/product/j_sbj-9200.pdf) informed the sloping operator surface, service access and concentrated cable entry. All geometry, labels and textures here are original game artwork; no vendor asset or branding is included.

Rebuild from the repository root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python-exit-code 1 --python tools/art/native_machine/build_helm.py
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python-exit-code 1 --python tools/art/native_machine/verify_helm.py
node tools/art/native_machine/validate_helm.mjs
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --editor --import
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script res://tools/bake_machine.gd
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script res://tests/helm.gd
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script res://tests/compiled_machine.gd
```

The builder supports `-- --no-render` for geometry-only rebuilds. It runs in its own Blender process. `review_helm_mcp.py` appends the editable studio through the existing local MCP client without replacing or saving user scenes. Rebuild the compiled native machine after model or assembly changes; see the native README.
