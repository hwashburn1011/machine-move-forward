"""Open the native L-12 derivative in live Blender, retaining existing scenes."""
import bpy, json
from pathlib import Path
ROOT=Path('C:/Users/hwash/Documents/MachineMoveForward')
with bpy.data.libraries.load(str(ROOT/'assets/native-fieldwork/L12ArticulatedDrive.blend'),link=False) as (source,target):
    target.scenes=[source.scenes[0]]
scene=target.scenes[0];scene.name='L12 - articulated drive review';bpy.context.window.scene=scene
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.shading.type='MATERIAL'
print(json.dumps({'scene':scene.name,'objects':len(scene.objects),'previousScenesPreserved':True}))
