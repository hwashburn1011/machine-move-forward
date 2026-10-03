# Refined native legacy enemies

Original Blender refinements of the existing Dust Raider and Wasteland Scavenger. The raider retains its masked field-clothing silhouette; the scavenger retains its articulated utility-frame silhouette. No third-party models or textures are used.

`raider.blend` and `scavenger.blend` retain individual editable parts, their original 16-joint rigs, packed original material maps and studio cameras/lights. The PNGs are source renders. Per-model manifests record part counts, triangles, material surfaces and export sizes; `validation.json` contains the glTF validator results.

The raider gains a contoured two-filter respirator, fitted goggle band, formed asymmetric armor, woven clothing/webbing, closed pouches, connected sole treads, fitted retaining hardware and markings. The scavenger gains recessed optics, neck bellows, overlapping chest plates, supported limb plates, machined joint retainers, cable terminations and a radiator identification rail. Worn paint, cloth and metal use portable base, ORM and normal maps. Small amber optics use an emissive material without realtime lights.

The two exports are `../../godot/art/legacy-raider.glb` and `legacy-scavenger.glb`. They supply geometry to an offline native compiler. The compiler preserves each original Godot node graph, skeleton, skin binding, animation library and original visual fit, replaces only the mesh, and detaches imported subresources so obsolete GLB containers are not loaded at runtime. Identical texture files share native resources. Each character renders as one skinned mesh; original behavior, collision and gameplay definitions stay in the existing controller.

Rebuild from the repository root in an isolated Blender process:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --python tools/art/native_enemies/build_legacy_refinement.py -- --no-render
node tools/art/native_enemies/validate_legacy_enemies.mjs
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --editor --import
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script res://tools/bake_legacy_enemies.gd
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script res://tools/bake_enemy_footing.gd --fixed-fps 60
```

`--kind=raider` or `--kind=scavenger` selects one assembly. Omit `--no-render` to render during authoring, or use `render_legacy.py` afterward for OptiX studio renders. The native setup script includes compilation before the footing bake. Fine vertex precision is retained in both import configurations; generated LODs remain enabled. Invalid zero tangents are repaired from adjacent valid UV triangles. The exporter promotes its identity-space skin to a glTF scene root only after checking all ancestor transforms.

`review_legacy_mcp.py` appends both source scenes to the connected Blender session without replacing existing scenes. Its workspace path can be adjusted for another checkout. Native review, test evidence and measured rendering cost are recorded in [the game review](../../docs/godot-port/legacy-enemy-review.md). The retained Three.js assets are unchanged.
