"""Render close model inspections through the live Blender MCP review scene."""
import bpy
from pathlib import Path
from mathutils import Vector
scene=bpy.data.scenes['Desert ruins - original scenery library']
out=Path('C:/Users/hwash/Documents/MachineMoveForward/docs/art/desert-ruins')
previous=(scene.camera,scene.render.resolution_x,scene.render.resolution_y,scene.render.filepath)
data=bpy.data.cameras.new('Temporary detail review camera')
camera=bpy.data.objects.new('Temporary detail review camera',data);scene.collection.objects.link(camera)
try:
    scene.camera=camera;scene.render.resolution_x=1440;scene.render.resolution_y=1000
    data.type='ORTHO';data.ortho_scale=16
    for name,file in [('ruin-house','blender-house.png'),('wreck-tanker','blender-wreck.png')]:
        model=scene.objects[name];target=model.location+Vector((0,0,2))
        camera.location=target+Vector((13,-19,11))
        camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(out/file)
        bpy.ops.render.render(write_still=True,scene=scene.name)
        print('Inspected model render',name,file)
finally:
    scene.camera,scene.render.resolution_x,scene.render.resolution_y,scene.render.filepath=previous
    bpy.data.objects.remove(camera,do_unlink=True);bpy.data.cameras.remove(data)
