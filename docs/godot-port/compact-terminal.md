# Compact wrist menu

Updated 25 September 2026. The native wrist terminal now presents short lists,
quantities, condition bars, and original line drawings. Descriptions appear
for the selected item or behind a Details action. The existing forearm model,
projected mouse input, and game transactions remain in use.

- **Pack:** one row per item type, total quantities, supply/parts/gear filters,
  health/water/food meters, and selected-item use or equip actions.
- **Craft:** separate crafting, research, and weapon categories. Requirements,
  costs, and comparisons belong to the selected entry.
- **Build and Nomad:** compact part/unit rows, the interactive deck schematic,
  condition meters, and selected construction/service actions.
- **Signal and Log:** short status and contact summaries, journal titles, and
  transmission titles. Open a record to read the full text; Back returns to
  the originating page.
- **Storage:** aggregated item counts and inline take, deposit, and sort actions.

Arrow keys select list entries. Enter focuses the selected entry's first
available action; a second Enter activates it. Mouse selection, wheel and
Page Up/Down scrolling, and Alt+left/right page navigation still work.
Larger text can require scrolling; focused actions scroll into view.

Native Vulkan screenshots:

- [Inventory](previews/compact-terminal-inventory.png)
- [Crafting](previews/compact-terminal-workshop.png)
- [Build catalog](previews/compact-terminal-build.png)
- [Record list](previews/compact-terminal-records-populated.png)
- [Larger text at 4:3](previews/compact-terminal-large-4x3.png)

Validation: **45/45 rendered wrist checks**, **66/66 controls checks**, and
**59/59 story/interface checks** passed. The wrist fixture drives clicks on
the actual 3D screen, keyboard selection and inventory use, storage transfers,
scrolling, aspect changes, text scaling, and device lifecycle. Controls and
story checks ran headless. See the [saved reports](results/compact-terminal.json).
These controlled fixtures are not a complete campaign playthrough.

The screenshot fixture is
[`tools/godot/compact-terminal-review.gd`](../../tools/godot/compact-terminal-review.gd).
It uses isolated test saves and representative inventory/record data. The
shipped menus always read the current session.
