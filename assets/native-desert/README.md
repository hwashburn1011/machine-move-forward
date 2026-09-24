# Sparse desert ground kit

Seven original Blender-authored assemblies: two dry branch shrubs, a bent root snag, a wind-shaped grass tuft, two scoured stones and a gravel fan. No downloaded models or textures. The pieces are intentionally small and sparse, with weathered vertex colour and metre-scale roots suitable for partial burial.

- `DesertGroundLife.blend`: editable source and studio review scene.
- `desert-ground-life.png`: Blender Cycles review of all seven pieces.
- `manifest.json`: exported mesh counts and dimensions.
- Runtime: `godot/art/desert-ground-life.glb`.
- Generator: `tools/art/native_desert/build.py`, run in a separate Blender process with `--background --python-exit-code 1 --python ...`.
- Live MCP review: `tools/art/native_desert/review_mcp.py` appends a separate scene without replacing existing work.

The generator exports models at their ground origins before arranging the source studio display. Regenerate exports through the script rather than exporting the studio arrangement directly. Native shader wind uses the exported, V-flipped `RootFlex` UV: roots have V=1; tips have lower V. Stone colours are linear vertex data and must be enabled in an importing material.

Design references: [NPS wind-shaped landforms](https://home.nps.gov/subjects/geology/aeolian-landforms.htm), [White Sands shrubs](https://www.nps.gov/whsa/learn/nature/treesandshrubs.htm) and [widely spaced Mojave vegetation](https://home.nps.gov/jotr/learn/nature/deserts.htm). These informed low density, multiple slender stems and wind-worn surfaces; this is fictional arid scenery rather than a botanical species reconstruction.
