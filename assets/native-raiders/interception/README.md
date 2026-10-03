# Interception craft

These are gameplay adaptations of the original `assets/native-ships/CrossfireShips.blend` RobotWarship and `assets/native-raiders/RaiderCraft.blend` assemblies. No downloaded models or textures were used.

The Machine Order armor panels, cooling banks, navigation strips, propulsion plenums, bow fittings and hull markings come from the crossfire master. The smaller craft retain full-size crew decks, seat anchors, mechanical guns, engine machinery and articulated muzzle anchors. Hull geometry is baked to the gameplay dimensions; enemy actors are not scaled with the hull.

- `InterceptionCraft.blend`: individually editable source assemblies and studio camera.
- `interception-craft.png`: reviewed source preview.
- `manifest.json`: provenance and hull adaptation dimensions.
- Runtime: `godot/art/interception-craft.glb`.
- Rebuild: `tools/art/native_enemies/build_interception_craft.py` in an isolated Blender process. Pass `-- --no-render` to skip the studio render.

The export reduces repetitive hull detail while retaining articulated weapons. Native verification measures 54,364 triangles in the skiff and 53,263 in the gunboat, with no collapsed triangles, 24 material surfaces per craft, and no art-created gameplay colliders or real-time lights. Existing hull/component collision remains explicit in `combat.gd`; ship crew stand on the preserved 1.224 m local deck plane.
