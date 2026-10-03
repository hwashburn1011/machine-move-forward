"""Three neutral-light inspections of the authored native gait."""
import bpy, json
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[3]
out=root/'assets/native-motion'
bpy.ops.wm.open_mainfile(filepath=str(out/'S07NativeLocomotion.blend'))
scene=bpy.context.scene;rig=next(o for o in scene.objects if o.type=='ARMATURE')
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Motion studio');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.10,.13,.17,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.4
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.01))
floor=bpy.context.object;floor.name='Review floor'
mat=bpy.data.materials.new('Neutral review floor');mat.diffuse_color=(.10,.13,.17,1);floor.data.materials.append(mat)
for at,energy,color,size in [((3,-4,5),850,(1,.84,.69),4),((-3,-2,3),600,(.56,.74,1),3),((0,3,4),800,(1,.6,.27),2)]:
    bpy.ops.object.light_add(type='AREA',location=at);light=bpy.context.object
    light.data.energy=energy;light.data.color=color;light.data.size=size
    light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(3,-5,2.2));camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,.98))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=2.55;scene.camera=camera
for clip,frame in [('native_run_fwd',5),('native_run_fwd_right',20),('native_crouch_walk_right',8)]:
    rig.animation_data.action=bpy.data.actions[clip]
    rig.animation_data.action_slot=rig.animation_data.action.slots[0]
    scene.frame_set(frame);bpy.context.view_layer.update()
    scene.render.filepath=str(out/(clip+'.png'));bpy.ops.render.render(write_still=True)
print('NATIVE_MOTION_RENDERED',flush=True)
