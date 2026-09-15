"""Studio review of actual galley source. No source transforms are saved."""
import bpy
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/galley'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'galley-kit.blend'))
for name,x in [('GalleyStove',-1.9),('GalleyCondenser',0),('GalleyPlanter',1.9)]:bpy.data.objects[name].location.x=x
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Galley studio');scene.world.color=(.20,.23,.27)
for at,energy,size in [((-4,5,6),1100,5),((3,-3,4),900,4)]:
    bpy.ops.object.light_add(type='AREA',location=at);o=bpy.context.object;o.data.energy=energy;o.data.size=size
    o.rotation_euler=(Vector((0,0,.6))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(4,8,4.6));cam=bpy.context.object;scene.camera=cam
cam.rotation_euler=(Vector((0,0,.64))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO';cam.data.ortho_scale=6.6;scene.view_settings.view_transform='AgX'
(OUT/'previews').mkdir(exist_ok=True)
scene.render.filepath=str(OUT/'previews/galley-kit.png');bpy.ops.render.render(write_still=True)
