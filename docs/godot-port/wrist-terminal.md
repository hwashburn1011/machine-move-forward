# Physical wrist terminal and aiming feedback

Implemented 25 September 2026 in the native Godot edition. The menu now lives
on an original instrument mounted to S-07's actual left forearm. Opening the
terminal lowers the weapon, raises and pronates the arm, and moves a separate
camera into reading position. Inventory, storage, construction, workshop,
machine, navigation, records, and destination consoles use the existing page
controls and transaction authorities inside a SubViewport. Title, pause,
settings, and the campaign library retain independent access.

The green display uses text lists, selected rows, a live machine schematic,
and narrow page/status lines. It supports mouse projection onto the glass,
wheel scrolling, arrow/Enter selection, Page Up/Down reading, and Alt+arrow
page changes. Ordinary left/right also change pages except when an adjustable
field has focus. Helm and calibration sliders retain their arrow controls.
Text scale, reduced motion, subtle scanlines, and restrained screen glow are
saved through the existing preferences. The screen redraws on interaction
and at 10 Hz for live values, then disables rendering and returns to dark
glass on close.

The aiming reticle has a center dot, modest brackets, aim/recoil spacing, and
a brief soft-red diagonal confirmation. `ui.confirm_player_hit()` is called
by the attributed player attack boundary. Informational `combat_hit()` text
does not pulse it. The mounted deck gun projects its actual barrel impact
point into the elevated sight view. Construction and salvage keep their own
target cues.

## Source and evidence

- [Editable Blender hardware and build notes](../../assets/native-story/wrist-terminal/README.md)
- [Reproducible Blender builder](../../tools/art/native_story/build_wrist_terminal.py)
- [Wrist display, camera, and input controller](../../godot/scripts/wrist_terminal.gd)
- [Integrated native regression](../../godot/tests/wrist_terminal.gd)
- [Native validation report](results/wrist-terminal-2026-09-25.json)
- [Inventory on the actual arm](previews/wrist-terminal-inventory-2026-09-25.png)
- [Live machine schematic](previews/wrist-terminal-machine-2026-09-25.png)
- [Construction catalog](previews/wrist-terminal-build-2026-09-25.png)
- [4:3 screen layout](previews/wrist-terminal-4x3-2026-09-25.png)
- [Larger text](previews/wrist-terminal-large-text-2026-09-25.png)
- [Salvage cutter hand mount](previews/wrist-terminal-cutter-2026-09-25.png)

The authored hardware has 12 meshes and 15,922 triangles. Runtime material
overrides raise housing roughness and soften specular highlights for reading
under the existing sunset lighting. Text is dynamic; none is baked into the
Blender screen. S-07's existing violet plasma strips remain unchanged: the
source character material is `S07_Violet_Plasma`, not a missing display texture.

## Verification

The Vulkan run passed all **45 checks** using isolated campaign storage and
test-mode preferences. Tests drive normal Tab/Escape, mouse, wheel, and
keyboard events; confirm inventory use and storage transfer; cover helm
slider input; inspect all migrated pages; check screen projection at 16:9,
16:10, 4:3, and ultrawide; and exercise closing through damage, death, native
save restoration, and an interrupted reload. Native screenshots were inspected
for clipping and text readability. The existing controls suite also passed
66 checks, with its reload action delayed until the new 0.22-second physical
closing handoff completes.

On the local RTX 3070, 24 uncontended Vulkan samples at a 1440×810 window
measured a **0.019 ms median GPU / 0.055 ms median CPU** for a forced redraw
of the 1120×792 screen. The main native arm/machine view measured **2.183 ms
median GPU** while the onboard simulation was paused. These are rendering
measurements for this scene and hardware, not a whole-game performance claim.
Closed screens disable their viewport. Measurement APIs follow the
[Godot RenderingServer reference](https://docs.godotengine.org/en/stable/classes/class_renderingserver.html#class-renderingserver-method-viewport-set-measure-render-time).

Re-run from the repository root:

```powershell
& 'test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe' --path godot --script res://tests/wrist_terminal.gd
```

Add `--headless` for logic checks. Rendered output and the latest raw report
are written beneath `test-results/godot-native/`; the documented evidence above
preserves the reviewed run. The check suite is a controlled native fixture,
not a complete campaign playthrough.
