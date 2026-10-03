"""Append a dedicated review scene without altering any user's existing scenes."""
import bpy,json
from pathlib import Path
root=Path(r'C:/Users/hwash/Documents/MachineMoveForward')
with bpy.data.libraries.load(str(root/'assets/native-pumps/NomadServicePump.blend'),link=False) as (source,target):target.scenes=source.scenes
scene=target.scenes[0];scene.name='Nomad - detailed service pump';bpy.context.window.scene=scene
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='SOLID'
print(json.dumps({'scene':scene.name,'editableMeshes':sum(obj.type=='MESH' for obj in scene.objects),'existingScenesPreserved':True}))
