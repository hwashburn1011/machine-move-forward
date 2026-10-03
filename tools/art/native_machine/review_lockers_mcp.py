"""Append the cargo studio through Blender MCP without replacing user scenes."""
import bpy,json
from pathlib import Path
root=Path(r'C:/Users/hwash/Documents/MachineMoveForward')
with bpy.data.libraries.load(str(root/'assets/native-cargo-lockers/NomadCargoLocker.blend'),link=False) as (source,target):
    target.scenes=source.scenes
scene=target.scenes[0];scene.name='Nomad - sealed cargo cases';bpy.context.window.scene=scene
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL'
print(json.dumps({'scene':scene.name,'existingScenesPreserved':True}))
