"""Append a galley review through Blender MCP without replacing existing scenes."""
import bpy
from pathlib import Path
from mathutils import Vector
root=Path('C:/Users/hwash/Documents/MachineMoveForward')
with bpy.data.libraries.load(str(root/'assets/galley/galley-kit.blend'),link=False) as (source,target):
    target.scenes=source.scenes[:1]
scene=target.scenes[0];scene.name='Nomad galley refinement review'
for name,x in [('GalleyStove',-1.9),('GalleyCondenser',0),('GalleyPlanter',1.9)]:
    node=next(o for o in scene.objects if o.name.split('.')[0]==name);node.location.x=x
data=bpy.data.cameras.new('Galley review camera');camera=bpy.data.objects.new('Galley review camera',data);scene.collection.objects.link(camera)
camera.location=(4,8,4.6);camera.rotation_euler=(Vector((0,0,.64))-camera.location).to_track_quat('-Z','Y').to_euler()
data.type='ORTHO';data.ortho_scale=6.6;scene.camera=camera
if bpy.context.window:
    bpy.context.window.scene=scene
    for area in bpy.context.window.screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='SOLID'
print({'scene':scene.name,'meshCount':sum(o.type=='MESH' for o in scene.objects),'preservedScenes':len(bpy.data.scenes)-1})
