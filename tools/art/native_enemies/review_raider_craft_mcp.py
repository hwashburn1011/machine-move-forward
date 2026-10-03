import bpy
from pathlib import Path
path=Path(r'C:\Users\hwash\Documents\MachineMoveForward\assets\native-raiders\RaiderCraft.blend')
with bpy.data.libraries.load(str(path),link=False) as (src,dst):dst.scenes=[src.scenes[0]]
scene=dst.scenes[0];scene.name='Nomad - raider craft review';bpy.context.window.scene=scene
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL'
print('RAIDER_MCP',scene.name,len([o for o in scene.objects if o.type=='MESH']))
