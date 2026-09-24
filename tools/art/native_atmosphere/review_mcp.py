"""Append our new kit into an isolated Blender MCP review scene."""
import bpy, json
from pathlib import Path
from mathutils import Vector

root=Path('C:/Users/hwash/Documents/MachineMoveForward')
with bpy.data.libraries.load(str(root/'assets/native-atmosphere/WindWornProps.blend'),link=False) as (source,loaded):
    loaded.scenes=[source.scenes[0]]
scene=loaded.scenes[0];scene.name='Nomad - wind-worn prop review';bpy.context.window.scene=scene
parts=[o for o in scene.objects if o.type=='EMPTY' and o.parent is None]
for index,part in enumerate(parts):part.location=((index-1)*2.6,0,0)
scene.world=bpy.data.worlds.new('Wind-worn review studio');scene.world.color=(.18,.18,.18)
bpy.ops.object.camera_add(location=(4,8,3.3));camera=bpy.context.object;target=Vector((0,0,1.6))
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=8.2;scene.camera=camera
for at,power in [((0,2,6),1100),((-4,-3,4),1600)]:
    bpy.ops.object.light_add(type='AREA',location=at);lamp=bpy.context.object;lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=5
    lamp.rotation_euler=(target-lamp.location).to_track_quat('-Z','Y').to_euler()
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL'
print(json.dumps({'parts':[p.name for p in parts],'scene':scene.name,'previous_scenes_preserved':True}))
