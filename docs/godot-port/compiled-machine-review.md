# Precompiled native machine

Starting revision: `3ad034f`. Scope: reduce startup work and retained allocations while keeping the complete existing machine, gameplay and presentation. The native Godot game remains authoritative; the frozen browser game and editable Blender assets are unchanged.

## Tasks and implementation

1. Measure the actual paused title, New Campaign and existing opening. The earlier immediate-play travel fixture bypassed title preparation; its initial slow frame did not establish a normal cinematic-entry defect.
2. Extract the existing finished-machine assembly into an offline recipe. Pack its final nodes and static collision into a compressed native scene. Preserve mesh buffers, imported LODs, shadow meshes, material properties, textures, transforms, physics faces and shared resources.
3. Detach embedded mesh/material resources from obsolete GLB containers. Keep external textures and shaders as shared files. Give each game instance its own mutable canopy/status uniforms while retaining sharing between its four cabinets.
4. Load only the compact non-machine runtime contracts during play. Keep the full collision JSON for authoring and independent validation. Retain full numeric precision; default JSON formatting initially rounded values and failed the exact contract check.
5. Restore the same world-root static bodies and animation bindings after loading. Keep the receiver, progression state, terrain, environment and session-aware setup in runtime code. Preserve the source-assembly fallback when the compiled scene is absent.
6. Add source/artifact hashes, the engine version, a setup-script bake and documented rebuild steps. Text source hashes normalize CRLF to LF so Git checkout line endings cannot cause false stale-source reports. Binary assets remain byte-hashed.
7. Compare independent source/compiled assemblies, inspect four native views, run regressions and repeat native startup/memory measurements in both orders.

The generated scene has 857 packed nodes and 713 embedded resource copies in 25,332,852 bytes. It references external textures/shaders without pulling old GLB containers into memory. The runtime scene retains the final art from all preceding machine refinements; this pass adds no replacement geometry or textures.

## Fidelity checks

The independent resource comparison covers **894 nodes, 511 resource uses and 395 shared resources**, including all machine children and direct world collision bodies. Stored mesh data, LODs, shadow meshes, material properties and collision arrays compare exactly; transforms use engine float tolerances. Only intentional container identities/locality settings are excluded. Separate checks verify independent mutable uniforms between games, shared cabinet lamps within a game, five complete four-leg poses and both docking-gate states.

Four paired 1920×1080 native captures—exterior, upper deck, workshop and side stairs—are **pixel-identical**. Gameplay, shader time and transient GPU particles are frozen for these comparisons. This proves matching output in those views, not every possible animated frame. The selected compiled captures are in `previews/compiled-machine-*.png`; the comparison metrics are retained under `results/compiled-machine-images.json`.

Older equipment tests assumed the finished art and original GLB were the same in-memory resource. Those assertions now compare stored material/mesh content and transforms. Internal instance-sharing assertions remain unchanged. The original canopy-post identity assertion failed before this fixture correction; its complete buffers and placement now pass without reducing geometry tolerances.

Final validation: **909 assertions pass across 18 suites**: compiled assembly, intake, benches, pumps, canopy, switchgear, pressure vessels, cargo cases, deck dressing, access, traversal, integration, parity/navigation, playable controls, camera clearance, desert/weather, opening preparation and opening framing. Final regression logs contain no script errors or resource-leak warnings. This selection checks existing gameplay and save paths; it is not a complete human campaign playthrough. Results are in `results/compiled-machine-regressions.json`.

## Measurements

RTX 3070, 1920×1080, high Forward+/Vulkan, 4× MSAA, VSync off, 60 FPS cap. Profiles run sequentially without another game or Blender render. Each starts a fresh process, waits three seconds at the real title, then plays the original opening and first gameplay frames for 13.5 seconds. Test-only copies instrument the actual setup statements; shipping scripts have no profiling timers.

| Sample order | Assembly | Main ready CPU | First title render | New Campaign call | Opening/play maximum frame |
|---|---|---:|---:|---:|---:|
| Pair 1, first | Source recipe | 3266.836 ms | 3471.926 ms | 2.180 ms | 17.471 ms |
| Pair 1, second | Compiled | 2616.320 ms | 2742.492 ms | 2.203 ms | 17.860 ms |
| Pair 2, first | Compiled | 3040.980 ms | 3259.637 ms | 2.159 ms | 17.362 ms |
| Pair 2, second | Source recipe | 2854.761 ms | 2983.794 ms | 2.196 ms | 17.277 ms |

Ready/first-title timing begins immediately before the main scene's ready call, excluding engine bootstrap and test-script parsing. These are warm filesystem/shader-cache developer runs, not first-install cold starts. The overlapping results do **not** establish a consistent startup speedup. Initial title preparation still produces some frames above 25 ms. Opening/play p95 stays between 16.746 and 16.856 ms at the cap, and all four openings complete.

Memory reduction is consistent across both pairs:

| Title allocation measurement | Source recipe | Compiled | Reduction |
|---|---:|---:|---:|
| Godot-tracked CPU allocations, pair 1 | 208,347,492 B | 157,710,612 B | 50,636,880 B |
| Godot-tracked CPU allocations, pair 2 | 209,670,871 B | 159,037,291 B | 50,633,580 B |
| Video allocations, both pairs | 1,115,347,312 B | 1,103,575,760 B | 11,771,552 B |
| Texture allocations, both pairs | 886,420,992 B | 886,420,992 B | 0 B |
| Resource count, both pairs | 1,949 | 1,912 | 37 |

That is approximately **48.3 MiB fewer tracked CPU allocations** and **11.2 MiB less video memory**, with unchanged texture memory. CPU figures are Godot's static-memory counter, not total process RSS. The reduction comes from avoiding obsolete source containers and full static collision JSON during play, not lowering visual quality. These measurements do not claim improved steady-game FPS or resolution of every intermittent stall.

## Reproduction and remaining limits

Use the import → bake → contract-test sequence in [the native README](../../godot/README.md). After an engine upgrade, rebuild using the new import results before validating. Source hashes are checked in the focused test, not on every player launch.

```powershell
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script res://tests/startup_profile.gd -- --author --label=author
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script res://tests/startup_profile.gd -- --label=compiled
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script res://tests/compiled_machine_review.gd -- --author --label=author
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --path godot --script res://tests/compiled_machine_review.gd -- --label=compiled
```

Test saves are isolated and personal settings are preserved. Raw timing and logs remain in ignored `test-results/godot-native`; compact reports accompany this review. The restrained desert and visibility-only dust storm remain part of the regression selection, including normal water consumption in clear, exposed-storm and sheltered states.

The wider enhancement goal remains active. Full-campaign human play feel, other plain machine fixtures and independently observed startup/intermittent stalls still warrant further inspection. This iteration establishes unchanged machine output with lower retained memory.
