# Nomad electrical cabinets

Original Blender refinement of the four existing middle-deck electrical cabinets, with small native lamps showing existing machine state. No story, power rules, collision or additional interaction system is introduced.

- `NomadSwitchgear.blend`: 207 editable parts, five materials and three packed original PBR maps; approximately 1.47 MB. Game coordinates are metres and the authored controls face local −Z.
- `RetainedWorkshopStructure.blend`: exact remaining frozen workshop vertices after removing these cabinets and the two shared pressure-vessel subsets removed by the previous pass.
- `switchgear-studio.png`, `switchgear-rear.png`: Blender review renders. The native custom shader supplies the live lamp colors; the Blender preview uses neutral green lenses.
- `manifest.json`: four sites/orientations, original complete bounds, trim hashes and budgets.
- `source-fit.json`: plinth/body/lid contact and 36 complete exported-mesh comparisons against nearby fixed cases and pressure vessels.
- `gltf-validation.json`: Khronos validator output.

The master contains folded enclosure and door returns, a continuous door gasket, three knuckled hinges, two quarter-turn locks, a folded handle, labelled pilot-light and selector assemblies, a recessed distribution diagram, sloping vent louvers, a bolted plinth and a connected rear conduit with sealed glands at both ends. The main roof sits above the body without coincident faces. Small bevels retain enough width to survive native vertex compression.

The runtime master is 54,220 triangles, five material batches and a 3,153,512-byte GLB. All four instances share the same five meshes/materials. Lamps share one opaque shader with three one-hot vertex-color channels; no dynamic lights or physics bodies are added.

Native lamp behavior:

| Lamp | Existing condition |
|---|---|
| SUPPLY, green | Generation capacity exceeds 0.001 |
| LOAD SHED, amber | Powered cabinet, and demand exceeds capacity by more than 0.001 |
| ENGINE DAMAGE, amber | Powered cabinet, and engine health is below its existing maximum by more than 0.01 |

Unpowered cabinets are dark. Sampling runs every 250 ms of simulation time and changes the shared shader uniform only when the three-bit state changes. Pausing freezes sampling; the readout never changes resources, health, demand, generation or saves. The physical selector knobs and door hardware remain cosmetic; the established interaction/menu flow stays intact.

Construction references: [Rittal steel enclosure](https://www.rittal.com/com-en/products/PG20231215SCH101/PG20231512SCH301/PRO0023?variantId=1376500) for sealed doors, hinges, cam locks and gland plates; [Schneider Harmony operators](https://productinfo.se.com/nadigest/5c51d645347bdf0001f1f280/Master/17719_MAIN%20%28bookmap%29_0000052086.xml/%24/XB4-XB5CommonOperatorsCompletewithContactBlocksCPT_0000051349) for mounted selector, pilot-light and legend arrangements. All geometry, labels, diagram and textures are original; no manufacturer model, artwork or logo was copied.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --python-exit-code 1 --python tools/art/native_machine/build_switchgear.py
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --python-exit-code 1 --python tools/art/native_machine/verify_switchgear.py
node tools/art/native_machine/validate_switchgear.mjs
```

Authoring runs in a separate Blender process. `review_switchgear_mcp.py` appends a dedicated review scene through the existing local MCP connection, preserving all user scenes. Runtime art is `godot/art/nomad-switchgear.glb`, `nomad-switchgear-retained.glb` and `nomad-switchgear.json`. See [native review](../../docs/godot-port/switchgear-review.md) for actual game captures and measurements.
