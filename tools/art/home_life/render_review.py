"""Four furnishings in a studio; source origins stay untouched."""
import bpy
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parents[3]/'assets/home-life'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'home-furnishings.blend'))
for name,x,y in [('HomeChair',-1.1,0),('HomeTable',.6,0),('HomeRug',0,-1.7),('HomeShelf',2.2,0)]:
    bpy.data.objects[name].location=(x,y,0)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Home studio');scene.world.color=(.25,.28,.32)
bpy.ops.object.light_add(type='AREA',location=(-3,-4,6));key=bpy.context.object;key.data.energy=800;key.data.size=5
key.rotation_euler=(Vector((0,0,.5))-key.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.light_add(type='AREA',location=(4,2,4));fill=bpy.context.object;fill.data.energy=1000;fill.data.size=4
fill.rotation_euler=(Vector((0,0,.5))-fill.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(-3,6,4.2));cam=bpy.context.object;scene.camera=cam
cam.rotation_euler=(Vector((.5,-.4,.55))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO';cam.data.ortho_scale=5.6;scene.view_settings.view_transform='AgX'
(OUT/'previews').mkdir(exist_ok=True)
scene.render.filepath=str(OUT/'previews/home-furnishings.png');bpy.ops.render.render(write_still=True)
