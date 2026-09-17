"""Studio comparison of earned modules installed on the actual existing Helm."""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/progression'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'nomad-progress.blend'))
# Import old runtime Helm into the review only, leaving export sources untouched.
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/expansion-v1/staging/navigation-helm.glb'))
for name,x in [('PreservationRecord',-.8),('PreservationSeeds',0),('PreservationCore',.8)]:
    bpy.data.objects[name].location=(x,-1.0,0)
    bpy.data.objects[name].rotation_euler.z=math.pi
for name in ['HelmBearingNeedle','HelmDialFace']:
    obj=bpy.data.objects[name];obj.location=(-.17,-.010,1.276);obj.rotation_euler.x=.41
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Progression studio');scene.world.color=(.24,.26,.30)
for at,energy,size in [((-3,-4,4),750,4),((3,1,3),500,3)]:
    bpy.ops.object.light_add(type='AREA',location=at);o=bpy.context.object;o.data.energy=energy;o.data.size=size
    o.rotation_euler=(Vector((0,0,.6))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.3,-4.2,2.8));cam=bpy.context.object;scene.camera=cam
cam.rotation_euler=(Vector((0,-.30,.62))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO';cam.data.ortho_scale=3.4;scene.view_settings.view_transform='AgX'
(OUT/'previews').mkdir(exist_ok=True);scene.render.filepath=str(OUT/'previews/progression-kit.png')
bpy.ops.render.render(write_still=True)
