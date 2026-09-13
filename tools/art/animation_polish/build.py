"""Author new in-place clips on copies of the current Blender characters.

The game GLB is promoted by append_clips.mjs: only the new animation data is
appended to the original runtime model, preserving every original combat track.
Run Blender --background --python this_file -- s07|bastion|warden|revenant|sovereign.
"""
import ast
import bpy
import hashlib
import json
import math
import sys
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion, Euler

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'assets/animation-polish'
for folder in ['source', 'exports', 'review']:
    (OUT / folder).mkdir(parents=True, exist_ok=True)
kind = sys.argv[sys.argv.index('--') + 1]
player = kind == 's07'
source = ROOT / ('assets/gunner-s07/game/S07_Playable.blend' if player else
                 f'assets/mech-enemies/gameplay/{kind}_combat.blend')
bpy.ops.wm.open_mainfile(filepath=str(source))
scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
body = next(o for o in scene.objects if o.type == 'MESH')
original_actions = {a.name: a for a in bpy.data.actions}
helper_file = ROOT / ('tools/art/gunner_s07/game_export.py' if player else
                      'tools/art/mech_enemies/game_export.py')
tree = ast.parse(helper_file.read_text(encoding='utf-8'))
weapons = [(None, b.name) for b in rig.data.bones if b.name.startswith('equipment_')]
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef)
                             and n.name in ['orient', 'limb', 'pose']], type_ignores=[]),
             'original_pose_helpers', 'exec'))
scene.render.fps = 30
rig.animation_data_create()
rig.animation_data.action = None
for pb in rig.pose.bones:
    pb.rotation_mode = 'QUATERNION'


def smooth(a, b, t):
    x = max(0.0, min(1.0, (t-a)/(b-a)))
    return x*x*(3-2*x)


def joint_turn(name, axis, angle):
    if name in rig.pose.bones:
        pb = rig.pose.bones[name]
        pb.rotation_quaternion = pb.rotation_quaternion @ Quaternion(axis, angle)


def locomotion(t, mode, direction):
    """Linear stance travel with an eased swing arc; direction never rewinds a clip."""
    base = 'crouch_walk' if mode == 'crouch_walk' else mode
    pose(t, base, True)
    run = mode == 'run'
    crouch = mode == 'crouch_walk'
    ux, uy = {'fwd': (0, -1), 'back': (0, 1), 'left': (1, 0), 'right': (-1, 0)}[direction]
    lateral = abs(ux) > 0
    stride = (1.38 if run else 1.10 if not crouch else .63) * (.72 if lateral else .82 if direction == 'back' else 1)
    duty = .50 if run else .62 if crouch else .58
    lift = .19 if run else .09 if crouch else .125
    for side, sign in [('r', -1), ('l', 1)]:
        phase = (t + (.5 if sign == 1 else 0)) % 1
        if phase < duty:
            along = .5 - phase/duty
            height = 0
        else:
            u = (phase-duty)/(1-duty)
            along = -.5 + smooth(0, 1, u)
            height = math.sin(math.pi*u)**1.2 * lift
        x = sign*(.205 if lateral else .19) + ux*along*stride
        y = uy*along*stride
        ankle = limb('thigh_'+side, 'calf_'+side, (x, y, .15+height),
                     (sign*.30, -.8, .55))
        toe = Vector((ux*.028, -.19, -.045))
        # A restrained toe lift at the leading part of swing clears the tread.
        if phase > duty:
            toe.z += .065*math.sin(math.pi*(phase-duty)/(1-duty))
        orient('foot_'+side, ankle, ankle+toe)
    # The upper-body weapon frame remains stable while the pelvis has weight shift.
    joint_turn('pelvis', (0, 1, 0), .028*math.sin(t*math.tau)*(1 if ux >= 0 else -1))


def reload_pose(t, shotgun):
    pose(0, 'idle', True)
    # Right hand carries the gun; left hand reaches the belt, seats a magazine,
    # and operates the receiver. Existing gameplay uses one timed reload for both.
    tilt = smooth(.02, .18, t)*(1-smooth(.79, .99, t))
    right = Vector((-.225, -.32, 1.26))
    right += Vector((.03, .025, -.025))*tilt
    w = limb('upperarm_r', 'lowerarm_r', right, (-.66, -.05, 1.19))
    orient('hand_r', w, w+Vector((0, -.075, -.05)))
    home = Vector((.015, -.61, 1.265))
    belt = Vector((.25, -.13, .88))
    mag = Vector((-.15, -.405 if shotgun else -.355, 1.16))
    receiver = Vector((-.15, -.38, 1.30))
    if t < .20:
        left = home.lerp(belt, smooth(.02, .20, t))
    elif t < .40:
        left = belt.lerp(mag, smooth(.20, .40, t))
    elif t < .58:
        left = mag + Vector((0, .008, .045))*math.sin((t-.40)/.18*math.pi)
    elif t < .75:
        left = mag.lerp(receiver, smooth(.58, .75, t))
    elif t < .86:
        left = receiver + Vector((0, .045, 0))*math.sin((t-.75)/.11*math.pi)
    else:
        left = receiver.lerp(home, smooth(.86, 1, t))
    w = limb('upperarm_l', 'lowerarm_l', left, (.64, -.12, 1.20))
    orient('hand_l', w, w+Vector((0, -.06, -.035)))
    joint_turn('head', (1, 0, 0), -.055*tilt)


def mech_pose(t, mode):
    if mode == 'polish_attack':
        pose(t, 'attack')
        if kind in ['warden', 'bastion']:
            # Immediate release pose followed by a damped, braced return.
            kick = math.exp(-t*(11 if kind == 'warden' else 8))*math.cos(t*math.pi*5)
            pb = rig.pose.bones['equipment_0']
            pb.matrix = Matrix.Translation((0, .025*kick, .008*kick)) @ pb.matrix
            joint_turn('spine_02', (1, 0, 0), .018*kick)
        elif kind == 'revenant':
            # Gameplay hits immediately. Start at contact, then draw blade back
            # across the body into the guard; never postpone the damage tick.
            contact = 1-smooth(.0, .68, t)
            for side, sign in [('r', -1), ('l', 1)]:
                end = (sign*(.43-.10*contact), -.16-.33*contact, 1.00+.25*contact)
                wrist = limb('upperarm_'+side, 'lowerarm_'+side, end, (sign*.65, -.15, 1.20))
                orient('hand_'+side, wrist, wrist+Vector((0, -.07, -.05)))
                rot = Euler((.5-1.0*contact, .14*contact*sign, sign*(.35-.60*contact))).to_matrix().to_4x4()
                bone = 'equipment_'+str(0 if side == 'r' else 1)
                if bone in rig.pose.bones:
                    rig.pose.bones[bone].matrix = Matrix.Translation(wrist+Vector((0, -.025, -.055))-rot.to_3x3()@Vector((0, .125, 0)))@rot
        else:
            pb = rig.pose.bones['equipment_0']
            recoil = math.exp(-t*9)*.055
            pb.matrix = Matrix.Translation((0, recoil, .01*math.sin(t*math.pi))) @ pb.matrix
    elif mode == 'polish_hit':
        pose(0, 'idle')
        # Export absolute pose; runtime masks this short reaction to chest/head.
        amount = math.sin(math.pi*min(1, t*2))*max(0, 1-t)
        strength = {'bastion': .04, 'warden': .09, 'revenant': .12, 'sovereign': .055}[kind]
        for name in ['spine', 'spine_01', 'spine_02', 'chest']:
            joint_turn(name, (1, 0, 0), strength*amount)
        joint_turn('head', (0, 0, 1), strength*.6*amount)
    else:
        pose(0, 'idle')
        # A fall is pivoted around the planted feet then settles on the deck.
        # Heavy units buckle first; blade unit rolls; commander folds to a knee.
        settle = smooth(.0, .98, t)
        root = rig.pose.bones['root']
        if kind == 'bastion':
            angle = 1.44*smooth(.12, .90, t)
            fall = Matrix.Translation((.05*settle, .16*settle, .16*settle)) @ Quaternion((0, 1, 0), angle).to_matrix().to_4x4()
        elif kind == 'revenant':
            angle = -1.45*smooth(.02, .78, t)
            fall = Matrix.Translation((-.08*settle, -.12*settle, .18*settle)) @ Quaternion((0, 1, 0), angle).to_matrix().to_4x4()
        elif kind == 'warden':
            angle = 1.42*smooth(.08, .86, t)
            fall = Matrix.Translation((0, .06*settle, .16*settle)) @ Quaternion((0, 1, 0), angle).to_matrix().to_4x4()
        else:
            angle = -1.40*smooth(.20, .97, t)
            fall = Matrix.Translation((-.05*settle, .10*settle, .16*settle)) @ Quaternion((0, 1, 0), angle).to_matrix().to_4x4()
        root.matrix = fall @ rig.data.bones['root'].matrix_local
    bpy.context.view_layer.update()


added = []
def animate(name, frames, sample):
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    for frame in range(frames+1):
        # Flush the previous sample before helpers assign armature-space joints.
        # Otherwise Blender converts the next pelvis pose through yesterday's
        # falling root, writing a compensating rotation into the child tracks.
        for pb in rig.pose.bones:
            pb.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()
        sample(frame/frames)
        for pb in rig.pose.bones:
            pb.keyframe_insert('location', frame=frame)
            pb.keyframe_insert('rotation_quaternion', frame=frame)
    added.append({'name': name, 'duration': frames/30, 'frames': frames+1})

if player:
    for mode, frames in [('walk', 16), ('run', 12), ('crouch_walk', 16)]:
        for direction in ['fwd', 'back', 'left', 'right']:
            animate(f'armed_{mode}_{direction}', frames,
                    lambda t, m=mode, d=direction: locomotion(t, m, d))
    animate('reload_rifle', 60, lambda t: reload_pose(t, False))
    animate('reload_shotgun', 72, lambda t: reload_pose(t, True))
else:
    for mode, frames in [('polish_attack', 24), ('polish_hit', 12), ('polish_death', 42)]:
        animate(mode, frames, lambda t, m=mode: mech_pose(t, m))

rig.animation_data.action = None
for pb in rig.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
scene.frame_start = 0
scene.frame_end = 72
bpy.context.view_layer.update()
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source'/f'{kind}_polish.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'exports'/f'{kind}.glb'), export_format='GLB',
                         use_selection=True, export_yup=True, export_extras=True,
                         export_animations=True, export_animation_mode='ACTIONS',
                         export_force_sampling=True, export_skins=True, export_tangents=False,
                         export_cameras=False, export_lights=False)
report = {'kind': kind, 'source': str(source.relative_to(ROOT)),
          'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
          'bones': [b.name for b in rig.data.bones], 'clipsAdded': added,
          'originalClipsPreserved': list(original_actions),
          'meshVertices': sum(len(o.data.vertices) for o in scene.objects if o.type == 'MESH')}
(OUT/'source'/f'{kind}_manifest.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print('POLISH AUTHORING COMPLETE', json.dumps(report), flush=True)
