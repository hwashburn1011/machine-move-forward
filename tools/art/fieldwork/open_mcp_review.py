"""Append an original asset review without replacing the user's Blender scenes."""
import bpy
from pathlib import Path
from mathutils import Vector
root=Path('C:/Users/hwash/Documents/MachineMoveForward')
with bpy.data.libraries.load(str(root/'assets/fieldwork/fieldwork-kit.blend'),link=False) as (source,target):
    target.scenes=source.scenes[:1]
scene=target.scenes[0];scene.name='Nomad L-12 fieldwork review'
for name,x,y in [('L12',-.78,0),('CaretakerDock',.85,-.15),('RifleStabilizer',-.9,.98),('RifleBurstCam',-.47,.98),('ShotgunChoke',-.04,.98),('ShotgunScatterBrake',.39,.98)]:
    node=next(o for o in scene.objects if o.name.split('.')[0]==name)
    node.location=(x,y,0 if name in ['L12','CaretakerDock'] else .22)
    if name not in ['L12','CaretakerDock']:node.scale=(2,2,2)
data=bpy.data.cameras.new('Fieldwork review camera');camera=bpy.data.objects.new('Fieldwork review camera',data);scene.collection.objects.link(camera)
camera.location=(-3.2,5,2.9);camera.rotation_euler=(Vector((.05,.22,.5))-camera.location).to_track_quat('-Z','Y').to_euler()
data.type='ORTHO';data.ortho_scale=3.65;scene.camera=camera
if bpy.context.window:
    bpy.context.window.scene=scene
    for area in bpy.context.window.screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='SOLID'
print({'scene':scene.name,'objects':len(scene.objects),'all_scene_count':len(bpy.data.scenes)})
