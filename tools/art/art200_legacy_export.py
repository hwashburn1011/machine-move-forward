"""Export the palette master with the pigment explicitly bound to COLOR_0."""
import bpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/art100/legacy/Art100_DesertRefinement.blend'))
rows=json.loads((ROOT/'assets/art100/legacy/manifest.json').read_text())
bpy.ops.object.select_all(action='DESELECT')
for r in rows:
    o=bpy.data.objects[r['id']];o.location=(0,0,0);o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'godot/art/art100-legacy.glb'),export_format='GLB',use_selection=True,export_yup=True,export_normals=True,export_texcoords=True,export_tangents=True,export_materials='EXPORT',export_vertex_color='NAME',export_vertex_color_name='Art200Pigment',export_all_vertex_colors=False)
print('ART200_LEGACY_EXPORTED',flush=True)
