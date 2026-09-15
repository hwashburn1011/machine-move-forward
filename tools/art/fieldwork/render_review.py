"""Render the authored L-12, charging dock and physical weapon attachments."""
import bpy
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parents[3]/'assets/fieldwork'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'fieldwork-kit.blend'))
bpy.data.objects['L12'].location=(-.78,0,0)
bpy.data.objects['CaretakerDock'].location=(.85,-.15,0)
for i,name in enumerate(['RifleStabilizer','RifleBurstCam','ShotgunChoke','ShotgunScatterBrake']):
    o=bpy.data.objects[name];o.location=(-.9+i*.43,.98,.22);o.scale=(2,2,2)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Fieldwork studio');scene.world.color=(.26,.28,.29)
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.location.z=-.02
material=bpy.data.materials.new('Studio floor');material.diffuse_color=(.08,.095,.11,1);floor.data.materials.append(material)
for at,power,size in [((-3,4,5),850,4),((3,-2,3.5),1000,3),((0,2,2),130,2)]:
    bpy.ops.object.light_add(type='AREA',location=at);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size
    light.rotation_euler=(Vector((0,0,.6))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(-3.2,5,2.9));camera=bpy.context.object
camera.rotation_euler=(Vector((.05,.22,.50))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=3.65;scene.camera=camera
(OUT/'previews').mkdir(exist_ok=True);scene.render.filepath=str(OUT/'previews/fieldwork-kit.png')
bpy.ops.render.render(write_still=True)
