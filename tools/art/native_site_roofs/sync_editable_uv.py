"""Keep the editable Foundry master's UV scale consistent with its export.

UV-only source update: native export, original geometry and collision untouched.
The normal builder now performs this operation before each source save too.
"""
import bpy,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'tools/art/native_site_roofs'));import roofkit
path=ROOT/'assets/blender/expansion-v1/relay-foundry.blend'
bpy.ops.wm.open_mainfile(filepath=str(path));bpy.context.view_layer.update()
for o in bpy.context.scene.objects:
    if o.type=='MESH':roofkit.planar_uv(o)
bpy.ops.wm.save_as_mainfile(filepath=str(path),compress=True)
print('EDITABLE_FOUNDRY_UV_SYNCED')
