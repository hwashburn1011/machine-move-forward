# S-07 Linekeeper field terminal

Original forearm hardware authored for Machine Move Forward. The editable
source is `S07-FieldTerminal.blend`; the native runtime export is
`godot/art/wrist-terminal.glb`. It uses 12 meshes and 15,922 triangles. No
external design, texture, logo or screen artwork is included.

Rebuild with Blender 5.x from the repository root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe' --background --python tools/art/native_story/build_wrist_terminal.py
```

The builder saves the source and GLB before arranging the studio preview. It
uses metres, Godot Y-up coordinates, and a +Z display normal. `ScreenSurface`
is a separate UV-mapped mesh. `ScreenCenter`, `ScreenTopLeft`,
`ScreenBottomRight`, `ForearmMount`, `SelectorDial`, and `TactileKey1` through
`TactileKey3` are stable runtime anchors/controls. The screen contains no baked
text: `MMFWristTerminal` applies a live UI viewport texture.

The menu camera frames the actual bone-mounted model in the normal world.
Pointer events are intersected with the display plane and mapped into that
viewport. Existing page controls retain the inventory, crafting, research,
storage and equipment authorities. Settings persist text scale, reduced
opening motion, optional scanlines, and restrained glow through the existing
settings file. Closed displays disable their viewport; open displays refresh
on interaction and at 10 Hz for live instrument values.
