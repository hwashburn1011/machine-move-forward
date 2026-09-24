# Main intake refinement

Starting revision: `80b55d2`. Scope: refine the existing Nomad intake, ground its supports and align collision with the new assembly. No new story, machine function, interactions or progression.

## Implemented tasks

1. Inspect the original Blender source, frozen native hierarchy and actual front/rear deck views. The old back is an opaque disk, the blades are coarse strips and the lower casing intersects the middle deck.
2. Author a complete original Blender assembly: 36 closed curved blades, rolled hollow casing, formed rims, bolted flanges, removable wire guards, supported rear drive, cooling ribs, connected supply conduit, fitted service plates and restrained cyan lighting. Retain editable source and original packed PBR maps.
3. Fit isolation pads, mounting shoes and curved saddles to the deck. Full exported triangle checks expose an overhead crossmember intersection; fit the entire round assembly down by 5% in the authoring data to clear it. Correct the two small plate mounting gaps found during source checks.
4. Replace only the original dedicated intake subtree. Preserve the previous vessel, cabinet, pump, bench and canopy improvements and all frozen assets. Keep the rotor's existing travel-distance timing, with its axis corrected for the new game-space hierarchy; save/load and menu pause retain the phase.
5. Remove precisely 12,724 obsolete intake collision triangles from frozen collider 75, composed with the earlier pump and bench removals. Preserve every other triangle and its winding. Use one 708-triangle guarded envelope, reducing collision by 12,016 triangles without submitting the detailed render mesh to physics.
6. Verify floor contact, rotating blade clearance, adjacent structure, imported geometry, actual service-aisle walking and ray contact. Review through Blender MCP and native captures. Run gameplay, weather, camera and previous equipment regressions, then compare sequential matched native views.

## Art and behavior

The [editable source and rebuild instructions](../../assets/native-turbine/README.md) include 530 authored mesh parts batched into nine render meshes. Three original 512-pixel PBR sets provide restrained weathering; the cyan crown is emissive without adding a light. Imported mesh LODs and shadow meshes remain enabled.

The rotor has approximately 24 mm radial clearance from the casing bore. Complete blade/static mesh comparisons cover its unique ten-degree rotation interval in half-degree steps; the 36 repeated blades span the whole turn. The final exported model has no intersecting triangles with the surrounding frozen structure above the floor-contact plane.

The guards use a simplified closed collision envelope for walking, camera and projectile queries. This retains the previous opaque disk's blocking behavior; the visible holes do not introduce a new shooting-through mechanic. The front faces outside the deck, so movement tests exercise the real rear aisle and side passage rather than an invented front platform.

## Validation and measured cost

Final results and fixed-view timing are recorded beside this review under `results/intake-*.json`; native views are under `previews/intake-*.png`. The studio screenshots are separate art inspections. Both exported GLBs validate with zero errors or warnings. The imported render model has 162,127 triangles and no collapsed faces; the runtime GLB is 9,960,460 bytes.

RTX 3070, 1920×1080, high Forward+/Vulkan, 4× MSAA, VSync off. Four fixed cameras, 2 seconds warmup and 4 seconds measurement each. Physics is frozen; captures occur after timing.

| View | Original median GPU | Refined median GPU | Original median frame | Refined median frame | Draw calls |
|---|---:|---:|---:|---:|---:|
| Front | 2.885 ms | 3.083 ms | 3.379 ms | 3.658 ms | 813 → 815 |
| Rear | 2.707 ms | 3.140 ms | 3.191 ms | 3.677 ms | 511 → 515 |
| Side | 3.216 ms | 3.408 ms | 3.699 ms | 3.935 ms | 1186 → 1191 |
| Wide exterior | 3.277 ms | 3.315 ms | 3.749 ms | 3.861 ms | 1041 → 1044 |

Added median GPU cost is 0.038–0.433 ms in these views. The rear now exposes detailed open machinery where the original was an opaque disk. This is a visual and collision refinement, not a measured overall FPS improvement; fixed-view GPU comparisons do not establish full gameplay performance.

Focused checks cover replacement completeness, grounded bounds, batched PBR geometry, guard/shoe ray contact, cleared floor-level collision, exact retained physics, fixed shaft and housing, travel phase, save restoration, menu pause and actual rear/side walking. The broader selection covers prior pumps/benches, machine access, traversal, integration, parity/navigation, desert/weather and camera clearance.

The first broader run passed its gameplay assertions but exposed intermittent audio-retirement warnings in two older test fixtures. Their fixed 0.1-second shutdown delay now uses the existing weak-reference audio-drain helper and deferred exit; the gameplay code is unchanged. Those suites were rerun after the fixture correction.

Final selected result: **508 assertions pass** (27 intake, 87 benches, 45 pumps, 13 access, 13 traversal, 108 integration, 132 parity/navigation, 28 desert/weather and 55 camera). Final import, focused, regression and matched-view logs contain no script errors or resource-leak warnings. These checks do not replace a complete human campaign playthrough.

A separate 65-second native travel sample continuously turns the camera and covers about 477 m. After the first three seconds, frame median/p95/maximum are 3.630/5.608/10.438 ms; the unchanged baseline was 3.723/4.820/7.749 ms. Neither sample has a later frame above 16.67 ms, but both show five slow startup frames, including initial frames of 152.142 ms before and 162.332 ms after. This sample therefore supports adequate steady-travel headroom, not an FPS improvement or a fix for startup/intermittent stalls. The latter remain open. One final main-loop tick reaches 4.673 ms and no profiled streaming step crosses its reporting threshold.

Reproduce focused checks:

```powershell
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script res://tests/turbine.gd
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script res://tests/turbine_review.gd -- --legacy --label=before
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script res://tests/turbine_review.gd -- --label=after
```

The legacy comparison restores only the complete original intake; both assemblies remain resident in both runs, and the other current machine refinements remain installed. Run rendering profiles sequentially without another game or Blender render. Test saves are isolated from player saves.

The earlier [restrained desert pass](desert-life-review.md) remains in place. Its focused regression checks normal water consumption across clear, storm and sheltered states, restored mid-storm saves, visibility-only messaging and the full weather cycle. The dust storm remains; its shelter/water penalty does not.

The wider enhancement goal remains active. Other simple machine fixtures, full-campaign feel and startup/intermittent stalls still warrant further inspection. This is verified model, collision and validation progress within the existing story.
