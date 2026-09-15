"""Append an Orchard review through Blender MCP without replacing open scenes."""
import bpy
from pathlib import Path
from mathutils import Vector
root=Path('C:/Users/hwash/Documents/MachineMoveForward')
with bpy.data.libraries.load(str(root/'assets/meridian/last-garden-meridian.blend'),link=False) as (source,target):
    target.scenes=source.scenes[:1]
scene=target.scenes[0];scene.name='Meridian campaign review'
camera_data=bpy.data.cameras.new('Meridian review camera')
camera=bpy.data.objects.new('Meridian review camera',camera_data);scene.collection.objects.link(camera)
camera.location=(-27,30,27);camera.rotation_euler=(Vector((0,0,1.5))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO';camera_data.ortho_scale=33;scene.camera=camera
if bpy.context.window:
    bpy.context.window.scene=scene
    for area in bpy.context.window.screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
print({'scene':scene.name,'objects':len(scene.objects),'all_scene_count':len(bpy.data.scenes)})
