"""Review the authored native stair kit through the live Blender MCP session."""
import bpy,json
from pathlib import Path
from mathutils import Vector
ROOT=Path('C:/Users/hwash/Documents/MachineMoveForward')
with bpy.data.libraries.load(str(ROOT/'assets/native-machine/NomadNativeAccess.blend'),link=False) as (source,target):
    target.scenes=[source.scenes[0]]
scene=target.scenes[0];scene.name='Nomad - refined access review';bpy.context.window.scene=scene
def xyz(p):return Vector((p[0],-p[2],p[1]))
camera=bpy.data.objects.new('Access review camera',bpy.data.cameras.new('Access review lens'));scene.collection.objects.link(camera)
camera.location=xyz((-18,12,-6.5));camera.rotation_euler=(xyz((-12,10.8,.2))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=32;scene.camera=camera
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL'
print(json.dumps({'scene':scene.name,'meshes':sum(o.type=='MESH' for o in scene.objects),'previousScenesPreserved':True}))
