# S-07 native locomotion

24 Blender-authored clips: eight compass directions for walking, running and crouched movement. `S07NativeLocomotion.blend` retains the detailed original character geometry and textures, with new editable skeletal actions. No third-party assets were added; the original playable source and browser GLB are unchanged. `locomotion-report.json` records the original source hash, unchanged vertex count, reach error and timing/stride metadata.

The original long strides reached beyond the leg chain and were clamped by the authoring solver. New pelvis heights, stance travel and swing arcs keep every ankle target within reach. Both feet share a continuous phase with a half-cycle offset. Directional clips include actual diagonals, without rewinding forward motion.

Rebuild from the repository root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python tools/art/animation_polish/build_native_motion.py
& test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --headless --path godot --script ../tools/godot/import-locomotion.gd
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python tools/art/animation_polish/render_native_motion.py
```

The staged full GLB lives only in `test-results/`. The native runtime loads `godot/art/s07-locomotion.res`, a compressed skeletal AnimationLibrary of roughly 115 KiB, and a small metadata file. It does not load another character mesh or textures. The original clips remain available for cinematic/jump/reload playback. New movement clips affect presentation only; capsule speeds, collision, damage and weapon timers are unchanged.

`review_native_mcp.py` loads the authored scene/actions into a separate live Blender review scene while retaining existing scenes. The three PNG renders show a supported stride, diagonal stride and crouched sidestep under neutral studio lighting. Runtime captures and measurements are linked from the native review.
