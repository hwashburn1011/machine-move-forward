"""Append a review scene via Blender MCP, preserving every existing scene."""
import bpy
from pathlib import Path
from mathutils import Vector
root=Path('C:/Users/hwash/Documents/MachineMoveForward')
with bpy.data.libraries.load(str(root/'assets/home-life/home-furnishings.blend'),link=False) as (source,target):target.scenes=source.scenes[:1]
scene=target.scenes[0];scene.name='Nomad home furnishings review'
for name,x,y in [('HomeChair',-1.1,0),('HomeTable',.6,0),('HomeRug',0,-1.7),('HomeShelf',2.2,0)]:
    node=next(o for o in scene.objects if o.name.split('.')[0]==name);node.location=(x,y,0)
camera_data=bpy.data.cameras.new('Nomad home review camera');camera=bpy.data.objects.new('Nomad home review camera',camera_data);scene.collection.objects.link(camera)
camera.location=(-3,6,4.2);camera.rotation_euler=(Vector((.5,-.4,.55))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO';camera_data.ortho_scale=5.6;scene.camera=camera
if bpy.context.window:
    bpy.context.window.scene=scene
    for area in bpy.context.window.screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='SOLID'
print({'scene':scene.name,'objects':len(scene.objects),'all_scene_count':len(bpy.data.scenes)})
