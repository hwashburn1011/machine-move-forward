"""Reproducible Blender source reviews; never modifies the production blends."""
import bpy, math
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parents[3]/'assets/meridian'
views=[('last-garden-meridian',(-25,30,29),(0,0,3),33),
       ('meridian-horizon',(-72,-80,58),(0,0,18),110)]
for name,eye,target,scale in views:
    bpy.ops.wm.open_mainfile(filepath=str(OUT/(name+'.blend')))
    scene=bpy.context.scene
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.resolution_x=1400;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('Orchard review world');scene.world.color=(.27,.31,.34)
    growing=bpy.data.objects.get('Growing')
    if growing:
        for obj in growing.children_recursive:obj.hide_render=True
    bpy.ops.object.light_add(type='SUN',location=(0,0,20));sun=bpy.context.object
    sun.rotation_euler=(.42,-.65,-.35);sun.data.energy=3;sun.data.angle=.15
    bpy.ops.object.light_add(type='AREA',location=(-10,12,12));lamp=bpy.context.object
    lamp.data.energy=4200;lamp.data.size=15
    lamp.rotation_euler=(Vector(target)-lamp.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=eye);cam=bpy.context.object;scene.camera=cam
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=scale;scene.view_settings.view_transform='AgX'
    (OUT/'previews').mkdir(exist_ok=True)
    scene.render.filepath=str(OUT/'previews'/(name+'.png'));bpy.ops.render.render(write_still=True)
