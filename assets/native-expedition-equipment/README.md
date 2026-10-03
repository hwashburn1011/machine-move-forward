# Native expedition equipment

Original editable Blender assemblies for the optional later expedition progression.

- `expedition-equipment.blend`: crane, battery bank, quiet-running assembly, heavy cargo and recovery platform at their independent origins.
- `equipment-review.png`: staged source review of the four equipment/cargo assemblies.
- `manifest.json`: triangle counts (7,268 crane; 7,452 battery; 6,212 quiet assembly; 2,300 cargo; 8,984 platform).
- Runtime export: `../../godot/art/expedition-equipment.glb`.
- Builder: `../../tools/art/expedition_equipment/build.py`, using `tools/art/glass_orchard/common.py`. Run with Blender 5.1 in background mode and `--python` pointing to that builder. Import the GLB with the project's Godot version afterward.

The runtime instances the named assembly for each recovered build piece. The
platform and equipment use explicit collision shapes, with an open return gangway.
Crane cable motion, battery charge and quiet mode are gameplay state; the source
GLB contains the fixed hardware. Native render and gameplay evidence is linked
from `../../docs/godot-port/later-expeditions.md`.
