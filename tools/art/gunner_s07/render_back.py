import bpy,math
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[3];out=root/'assets/gunner-s07';scene=bpy.context.scene
bpy.data.objects['Neutral studio cyclorama'].rotation_euler.z=math.pi
rig=bpy.data.objects['S07_Rig'];rig.data.pose_position='REST'
for o in bpy.data.objects:
 if o.parent and o.parent.name=='S07_Weapon':o.hide_render=True
cam=bpy.data.objects['03 • Back equipment'];cam.location=(3,6,3);cam.rotation_euler=(Vector((.25,.07,1.10))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=65;scene.camera=cam
scene.render.resolution_x=1200;scene.render.resolution_y=1600;scene.render.resolution_percentage=100;scene.cycles.samples=80;scene.render.filepath=str(out/'preview/03_S07_back_equipment.png');bpy.ops.render.render(write_still=True)
