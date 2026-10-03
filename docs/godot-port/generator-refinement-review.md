# Generator model and truthful instruments

Starting revision: `c02b3e6`. This pass improves one frequently used machine interactable within the existing campaign. The desert atmosphere/water changes are already documented in [desert-life-review.md](desert-life-review.md).

## Changes

The previous native generator had static fuel/power display parts that did not reflect consumption. A new original Blender assembly replaces its native built and preview models: rolled enclosure, gasketed service door, hinges and latch, guarded radiator, restrained reservoir, cap tether, connected fuel lines, contained exhaust, distribution conduit, drip tray, skids and isolation mounts. Weathered ivory, oxide paint, steel and rubber distinguish its components. Packed colour, roughness/metallic and normal maps replace the large mottled material patches.

The physical fuel dial now reads the shared machine reserve. RUN indicates a healthy-enough, fuelled generator; LOW illuminates at 20% or less; SERVICE indicates actual damage. Each unit has its own condition indication while sharing the same fuel reading. Labels and a needle make these states understandable without relying on colour alone. The existing refuelling transaction and canister gesture remain intact.

Named instrument references are cached when equipment is built or loaded. Updates visit only generators, avoid scene-tree searches and skip unchanged values. Demolition and load rebuilds release the cache. Existing save data needs no migration. The model is shared through the normal asset cache, and preview material overrides do not modify the placed equipment.

The source contains **194 editable mesh parts**, exported as **13 material batches / 45,508 triangles** with automatic Godot LODs. It adds no lights, particles, audio or fan processing. [Source and rebuild instructions](../../assets/native-generator/README.md).

## Inspection and corrections

Inspected front and rear Cycles renders, appended the studio through the running Blender MCP, and inspected the model under actual native deck lighting. The first export's smooth handle arches overshot the old collider by about 2 cm; lowered the arches and verified the final 1.2843 m height. Moved two dial labels onto unobstructed areas of the mounting face, including a label originally visible beyond the panel from behind. Native empty/full/service-state images confirm that the needle and lamps agree with the underlying values.

## Rendering cost

RTX 3070, 1920×1080, high Forward+/Vulkan, 4× MSAA, VSync off. Same startup generator at (8, 16.03, 10), scenery and cameras. Each view warms for 2.5 seconds and samples for 5 seconds. Gameplay is frozen; this measures presentation cost for one generator, **not overall gameplay FPS or a stress test of many generators**.

| View | Median GPU before → after | Median frame before → after | Draw calls before → after |
|---|---:|---:|---:|
| Front | 2.727 → 2.788 ms | 3.237 → 3.332 ms | 290 → 294 |
| Rear | 2.831 → 2.915 ms | 3.284 → 3.442 ms | 459 → 463 |
| Deck | 2.920 → 2.938 ms | 3.371 → 3.451 ms | 338 → 341 |

Median GPU addition was **0.018–0.084 ms** in these samples, subject to normal host variation. This is a visual/functionality improvement with a small measured rendering cost. Isolated approximately 30 ms stalls occurred before and after; this pass does not resolve them.

## Validation

**280 distinct assertions passed:** 40 focused generator checks (both headless and rendered), 108 integration checks and 132 parity/audit checks. Final import, test and review logs contain no script errors, warnings or resource leaks.

Focused checks cover grounding, geometry budget, portable materials, unchanged collision shape, semantic anchors, no gameplay/RNG mutation, empty/low/full reserve boundaries, condition and proportional output, real near/far refuelling, shared reserve across units, independent damage, matching non-colliding build preview, actual move/rotation placement, old-format save/load and demolition cleanup. The wider suites exercise campaign, construction and native gameplay behavior. These automated checks are not a full normal-speed campaign playthrough.

Results: `results/generator-{before,after,tests,integration,audit}.json`. Native review images: `previews/generator-*.png`. Raw logs remain in ignored `test-results/godot-native/`.

```powershell
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script tests/generator_presentation.gd
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script tests/generator_review.gd -- --label=current
```

The wider enhancement goal remains active. These captures also expose nearby legacy deck dressing that merits a separate grounding review; it was not replaced as part of this generator asset.
