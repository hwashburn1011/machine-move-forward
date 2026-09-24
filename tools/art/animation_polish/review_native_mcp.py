"""Keep the finished S-07 locomotion source reviewable in the connected Blender."""
import bpy, json
from pathlib import Path
from mathutils import Vector
root=Path(r'C:/Users/hwash/Documents/MachineMoveForward')
before=set(bpy.data.actions)
with bpy.data.libraries.load(str(root/'assets/native-motion/S07NativeLocomotion.blend'),link=False) as (source,target):
    target.scenes=source.scenes;target.actions=source.actions
scene=target.scenes[0];scene.name='S07 - grounded directional locomotion';bpy.context.window.scene=scene
rig=next(o for o in scene.objects if o.type=='ARMATURE')
actions={a.name.split('.')[0]:a for a in set(bpy.data.actions)-before}
rig.animation_data_create();rig.animation_data.action=actions['native_run_fwd_right']
rig.animation_data.action_slot=rig.animation_data.action.slots[0]
scene.frame_start=0;scene.frame_end=29;scene.frame_set(5)
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        view=area.spaces.active.region_3d
        view.view_distance=3.6;view.view_location=Vector((0,0,1))
        view.view_rotation=(Vector((0,0,1))-Vector((3,-5,2.5))).to_track_quat('-Z','Y')
        area.spaces.active.shading.type='MATERIAL'
print(json.dumps({'scene':scene.name,'authoredClips':len(actions),'previousScenesPreserved':True,'frame':scene.frame_current}))
