"""Append a source review through the running Blender MCP without deleting scenes."""
import bpy, math
from pathlib import Path
from mathutils import Vector
root=Path('C:/Users/hwash/Documents/MachineMoveForward')
with bpy.data.libraries.load(str(root/'assets/progression/nomad-progress.blend'),link=False) as (source,target):
    target.scenes=source.scenes[:1]
scene=target.scenes[0];scene.name='Nomad earned progression review'
if bpy.context.window:bpy.context.window.scene=scene
for name,x in [('PreservationRecord',-.8),('PreservationSeeds',0),('PreservationCore',.8)]:
    obj=next(o for o in scene.objects if o.name.split('.')[0]==name);obj.location=(x,-1,0);obj.rotation_euler.z=math.pi
for name in ['HelmBearingNeedle','HelmDialFace']:
    obj=next(o for o in scene.objects if o.name.split('.')[0]==name);obj.location=(-.17,-.010,1.276);obj.rotation_euler.x=.41
bpy.ops.import_scene.gltf(filepath=str(root/'assets/expansion-v1/staging/navigation-helm.glb'))
data=bpy.data.cameras.new('Progression review camera');cam=bpy.data.objects.new('Progression review camera',data);scene.collection.objects.link(cam)
cam.location=(2.3,-4.2,2.8);cam.rotation_euler=(Vector((0,-.30,.62))-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=3.4;scene.camera=cam
if bpy.context.window:
    for area in bpy.context.window.screen.areas:
        if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL'
print({'scene':scene.name,'meshes':sum(o.type=='MESH' for o in scene.objects),'preservedScenes':len(bpy.data.scenes)-1})
