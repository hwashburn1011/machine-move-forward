"""Render the verified saved source without changing runtime exports."""
import bpy
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[3];output=root/'assets/native-receiver'
bpy.ops.wm.open_mainfile(filepath=str(output/'NomadReceiver.blend'))
scene=bpy.context.scene;camera=scene.camera;target=Vector((0,0,.97))
scene.render.filepath=str(output/'receiver-front.png');bpy.ops.render.render(write_still=True)
camera.location=Vector((-2,3,2));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(output/'receiver-rear.png');bpy.ops.render.render(write_still=True)
