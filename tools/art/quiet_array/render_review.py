"""Render a review of the original Quiet Array source without modifying its asset."""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/quiet-array'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'QuietArray.blend'))
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=1400;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Array review world')
scene.world.color=(.23,.28,.32)
bpy.ops.object.light_add(type='SUN',location=(0,0,20));sun=bpy.context.object
sun.rotation_euler=(.42,-.65,-.35);sun.data.energy=3;sun.data.angle=.15
bpy.ops.object.light_add(type='AREA',location=(-12,15,12));lamp=bpy.context.object
lamp.data.energy=4500;lamp.data.shape='DISK';lamp.data.size=15
lamp.rotation_euler=(Vector((0,0,4))-lamp.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(-26,31,24));cam=bpy.context.object;scene.camera=cam
cam.rotation_euler=(Vector((0,0,3))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO';cam.data.ortho_scale=38
scene.view_settings.view_transform='AgX'
(OUT/'previews').mkdir(exist_ok=True)
scene.render.filepath=str(OUT/'previews/quiet-array-overview.png');bpy.ops.render.render(write_still=True)
cam.location=(-12,15,7)
cam.rotation_euler=(Vector((1,-1,2))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='PERSP';cam.data.lens=33
scene.render.filepath=str(OUT/'previews/quiet-array-deck.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'QuietArrayReview.blend'))
