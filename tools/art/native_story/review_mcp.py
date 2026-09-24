"""Load our instrument source into its own MCP scene; preserve existing scenes."""
import bpy, json
from pathlib import Path
from mathutils import Vector
root=Path('C:/Users/hwash/Documents/MachineMoveForward')
with bpy.data.libraries.load(str(root/'assets/native-story/StoryInstruments.blend'),link=False) as (source,loaded):
    loaded.scenes=[source.scenes[0]]
scene=loaded.scenes[0];scene.name='Nomad - campaign instrument review'
bpy.context.window.scene=scene
parts=[o for o in scene.objects if o.type=='EMPTY' and o.parent is None]
for i,p in enumerate(parts):p.location=((i%4)*.82,0,(1-i//4)*.85)
scene.world=bpy.data.worlds.new('Instrument review studio');scene.world.color=(.12,.12,.12)
bpy.ops.object.camera_add(location=(1.2,4.8,2.5));camera=bpy.context.object
target=Vector((1.2,0,.85));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=3.55;scene.camera=camera
for location,power,size in [((0,3,4),500,4),((3,-1,3),650,3)]:
    bpy.ops.object.light_add(type='AREA',location=location);lamp=bpy.context.object;lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=size
    lamp.rotation_euler=(target-lamp.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.filepath=str(root/'assets/native-story/instrument-contact-sheet.png')
bpy.ops.render.render(write_still=True,scene=scene.name)
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D': area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL'
print(json.dumps({'parts':[p.name for p in parts],'scene':scene.name,'previous_scenes_preserved':True}))
