"""Open a separate Blender MCP review scene; retain all existing user scenes."""
import bpy, json
from pathlib import Path
from mathutils import Vector
root = Path(r'C:\Users\hwash\Documents\MachineMoveForward')
before = set(bpy.data.actions)
with bpy.data.libraries.load(str(root/'assets/animation-polish/source/s07_polish.blend')) as (source, dest):
    dest.scenes = source.scenes
    dest.actions = source.actions
scene = dest.scenes[0]
scene.name = 'S07 animation polish review'
bpy.context.window.scene = scene
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
actions = {a.name.split('.')[0]:a for a in set(bpy.data.actions)-before}
def add_light(name, at, energy, color, size):
    light = bpy.data.lights.new(name, 'AREA'); light.energy=energy; light.color=color; light.shape='DISK'; light.size=size
    obj=bpy.data.objects.new(name,light); scene.collection.objects.link(obj); obj.location=at
    obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
add_light('Polish key',(3,-4,5),650,(1,.78,.56),4)
add_light('Polish fill',(-3,-2,3),450,(.45,.69,1),3)
add_light('Polish rim',(0,3,4),850,(1,.52,.22),2)
camera=bpy.data.objects.new('Polish inspection camera',bpy.data.cameras.new('Polish inspection camera'))
scene.collection.objects.link(camera)
camera.location=(3,-5,2.6); camera.rotation_euler=(Vector((0,0,1.02))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'; camera.data.ortho_scale=2.65; scene.camera=camera
world=bpy.data.worlds.new('Polish neutral backdrop'); scene.world=world
world.use_nodes=True; world.node_tree.nodes['Background'].inputs[0].default_value=(.035,.045,.06,1); world.node_tree.nodes['Background'].inputs[1].default_value=.45
scene.render.engine='CYCLES'; scene.cycles.samples=24; scene.cycles.use_denoising=True
scene.render.resolution_x=1000; scene.render.resolution_y=1100; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
out=root/'assets/animation-polish/review'; out.mkdir(exist_ok=True)
for clip, frame in [('armed_walk_left',6),('reload_rifle',28),('reload_shotgun',37)]:
    rig.animation_data.action=actions[clip]
    if rig.animation_data.action.slots: rig.animation_data.action_slot=rig.animation_data.action.slots[0]
    scene.frame_set(frame); bpy.context.view_layer.update()
    scene.render.filepath=str(out/f's07-{clip}-{frame}.png')
    bpy.ops.render.render(write_still=True)
print(json.dumps({'scene':scene.name,'actions':list(actions),'rendered':3,'original_scenes_preserved':True}))
