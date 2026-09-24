"""Author feasible, directional native S-07 gait cycles without changing geometry.

Blender --background --python tools/art/animation_polish/build_native_motion.py
The retained browser source is read only. Native import converts the staged GLB
to an AnimationLibrary, so the runtime does not load a second character mesh.
"""
import ast, bpy, hashlib, json, math
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT/'assets/native-motion'
STAGE = ROOT/'test-results/godot-native/motion'
OUT.mkdir(parents=True, exist_ok=True)
STAGE.mkdir(parents=True, exist_ok=True)
source = ROOT/'assets/gunner-s07/game/S07_Playable.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
body = next(o for o in scene.objects if o.type == 'MESH')
original_vertices = [tuple(v.co) for v in body.data.vertices]
tree = ast.parse((ROOT/'tools/art/gunner_s07/game_export.py').read_text())
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef)
                             and n.name in ['orient', 'limb', 'pose']], type_ignores=[]),
             'retained_pose_helpers', 'exec'))
rig.animation_data_clear()
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
for pb in rig.pose.bones: pb.rotation_mode='QUATERNION'
scene.render.fps=60
directions = {'fwd':(0,-1), 'fwd_right':(-1,-1), 'right':(-1,0), 'back_right':(-1,1),
              'back':(0,1), 'back_left':(1,1), 'left':(1,0), 'fwd_left':(1,-1)}
profiles = {'walk':dict(stride=.86, duty=.52, period=.6, drop=.16, lift=.115),
            'run':dict(stride=1.04, duty=.34, period=.5, drop=.205, lift=.19),
            'crouch_walk':dict(stride=.58, duty=.62, period=.7, drop=.29, lift=.085)}
reach_errors=[]
clips=[]

def smooth(t):
    t=max(0,min(1,t));return t*t*(3-2*t)

def sample(t, mode, direction):
    pose(t, mode, True)
    cfg=profiles[mode]
    unit=Vector((*directions[direction],0)).normalized()
    factor=1-.26*abs(unit.x)-.18*max(0,unit.y)
    stride=cfg['stride']*factor
    # Pelvis height leaves real knee bend at both ends of stance. The old .55 m
    # foot reach could not be reached by this .862 m leg and was being clamped.
    bob=(.018 if mode=='run' else .009)*math.sin(t*math.tau*2)
    rig.pose.bones['pelvis'].matrix=Matrix.Translation((.012*math.sin(t*math.tau),0,bob-cfg['drop']))@rig.data.bones['pelvis'].matrix_local
    bpy.context.view_layer.update()
    for side,sign in [('r',-1),('l',1)]:
        phase=(t+(.5 if sign==1 else 0))%1
        if phase<cfg['duty']:
            along=.5-phase/cfg['duty'];height=0
        else:
            u=(phase-cfg['duty'])/(1-cfg['duty'])
            along=-.5+smooth(u);height=math.sin(math.pi*u)**1.25*cfg['lift']
        target=Vector((sign*.195,0,.15+height))+unit*along*stride
        ankle=limb('thigh_'+side,'calf_'+side,target,(sign*.34,-.85,.5))
        reach_errors.append((target-ankle).length)
        toe=Vector((unit.x*.025,-.19,-.045))
        if phase>cfg['duty']:toe.z+=.045*math.sin(math.pi*(phase-cfg['duty'])/(1-cfg['duty']))
        orient('foot_'+side,ankle,ankle+toe)
    # Preserve the weapon/shoulder relationship with a small forward lean.
    for bone in ['spine_01','spine_02']:
        pb=rig.pose.bones.get(bone)
        if pb: pb.rotation_quaternion=pb.rotation_quaternion@Quaternion((1,0,0),.035 if mode=='run' else .015)
    bpy.context.view_layer.update()
    return stride

for mode,cfg in profiles.items():
    frames=round(cfg['period']*60)
    for direction in directions:
        name=f'native_{mode}_{direction}'
        action=bpy.data.actions.new(name);action.use_fake_user=True
        rig.animation_data_create();rig.animation_data.action=action
        for frame in range(frames+1):
            for pb in rig.pose.bones: pb.matrix_basis=Matrix.Identity(4)
            bpy.context.view_layer.update()
            stride=sample(frame/frames,mode,direction)
            for pb in rig.pose.bones:
                pb.keyframe_insert('location',frame=frame)
                pb.keyframe_insert('rotation_quaternion',frame=frame)
        clips.append(dict(name=name,gait=mode,direction=direction,stride=stride,duty=cfg['duty'],period=frames/60))

rig.animation_data.action=None
for pb in rig.pose.bones:pb.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
assert original_vertices==[tuple(v.co) for v in body.data.vertices]
assert max(reach_errors)<.004, max(reach_errors)
scene.frame_start=0;scene.frame_end=42
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'S07NativeLocomotion.blend'),compress=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(STAGE/'s07-locomotion.glb'),export_format='GLB',
                         use_selection=True,export_yup=True,export_animations=True,
                         export_animation_mode='ACTIONS',export_force_sampling=True,
                         export_skins=True,export_tangents=False,export_cameras=False,export_lights=False)
report=dict(source=str(source.relative_to(ROOT)),sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
            originalGeometryPreserved=True,meshVertices=len(original_vertices),maxFootReachError=max(reach_errors),clips=clips)
(OUT/'locomotion-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('NATIVE_LOCOMOTION_AUTHORED',json.dumps(report),flush=True)
