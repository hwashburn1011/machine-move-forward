"""Author the player's desert engineer rig and a grounded gait with Blender.

Rigid armour shares the defense pack's style, but teal/ivory identify the player.
Two-bone arm posing keeps a stable weapon grip; a dedicated hand frame is baked
in each clip, so the existing generic hand-mounted weapon code needs no offsets.
"""
import sys
import math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_assets import bpy, vec, M, material, clear, make_character, save_asset
from mathutils import Vector, Matrix


def aim_bone(bone, direction):
    transform = bone.matrix.copy()
    q = bone.vector.normalized().rotation_difference(direction.normalized())
    rotation = q @ transform.to_quaternion()
    bone.matrix = Matrix.LocRotScale(transform.translation, rotation, Vector((1, 1, 1)))
    bpy.context.view_layer.update()


def arm_ik(rig, suffix, target):
    upper, fore = rig.pose.bones['UpperArm.' + suffix], rig.pose.bones['Forearm.' + suffix]
    shoulder = upper.head.copy()
    axis = target - shoulder
    distance = min(axis.length, upper.length + fore.length - .005)
    axis.normalize()
    along = (upper.length**2 - fore.length**2 + distance**2) / (2 * distance)
    outward = vec((1 if suffix == 'R' else -1, -.8, -.1))
    pole = outward - axis * outward.dot(axis)
    pole.normalize()
    elbow = shoulder + axis * along + pole * math.sqrt(max(0, upper.length**2 - along**2))
    aim_bone(upper, elbow - shoulder)
    aim_bone(fore, target - fore.head)
    hand = rig.pose.bones['Hand.' + suffix]
    # +Y of hand = finger/weapon +Z, +Z of hand = thumb/world up.
    frame = Matrix((vec((-1, 0, 0)), vec((0, 0, 1)), vec((0, 1, 0)))).transposed()
    hand.matrix = Matrix.LocRotScale(hand.head.copy(), frame.to_quaternion(), Vector((1, 1, 1)))
    bpy.context.view_layer.update()


clear()
M['Paint_Raider'] = material('Player_Paint_Teal', '446e6c', .3, .72)
M['Lens_Amber'] = material('Player_Visor', '8fd1ce', .1, .5, .7)
M['Canvas'] = material('Player_Canvas', 'c3b494', 0, .95)
root = make_character(False)
root.name = 'MMF_Player'
root['forwardAxis'] = '+Z'
root['authoredPlayer'] = True
rig = next(o for o in root.children if o.type == 'ARMATURE')
mesh = next(o for o in rig.children if o.type == 'MESH')
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)
rig.animation_data_clear()
rig.animation_data_create()

for clip, frames in [('Idle', 60), ('Walking', 32), ('Running', 24)]:
    action = bpy.data.actions.new(clip)
    action.use_fake_user = True
    rig.animation_data.action = action
    for frame in range(0, frames + 1, 2):
        t = frame / frames
        for bone in rig.pose.bones:
            bone.rotation_mode = 'XYZ'
            bone.rotation_euler = (0, 0, 0)
            bone.location = (0, 0, 0)
        if clip != 'Idle':
            swing = math.sin(t * math.tau) * (.53 if clip == 'Walking' else .8)
            for suffix, sign in [('L', 1), ('R', -1)]:
                rig.pose.bones['Thigh.' + suffix].rotation_euler.x = sign * swing
                rig.pose.bones['Shin.' + suffix].rotation_euler.x = -max(0, sign * swing) * .85
            rig.pose.bones['Spine'].rotation_euler.x = -.04 if clip == 'Walking' else -.09
        else:
            rig.pose.bones['Spine'].rotation_euler.x = math.sin(t * math.tau) * .01
        bpy.context.view_layer.update()
        # Correct each sampled pose to the lowest actual boot vertices, not bind bounds.
        dg = bpy.context.evaluated_depsgraph_get()
        evaluated = mesh.evaluated_get(dg)
        lowest = min((evaluated.matrix_world @ v.co).z for v in evaluated.data.vertices)
        rig.pose.bones['Root'].location.y = .02 - lowest
        bpy.context.view_layer.update()
        lift = rig.pose.bones['Root'].location.y
        arm_ik(rig, 'R', vec((.09, 1.27 + lift, .21)))
        arm_ik(rig, 'L', vec((.04, 1.32 + lift, .40)))
        for bone in rig.pose.bones:
            bone.keyframe_insert('rotation_euler', frame=frame)
            bone.keyframe_insert('location', frame=frame)
    # Linear interpolation keeps periodic poses within the measured ground envelope.
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                channelbag = strip.channelbag(slot)
                if channelbag:
                    for curve in channelbag.fcurves:
                        for point in curve.keyframe_points:
                            point.interpolation = 'LINEAR'
rig.animation_data.action = None
for bone in rig.pose.bones:
    bone.rotation_euler = (0, 0, 0)
    bone.location = (0, 0, 0)
save_asset('player', True)
print('MMF_PLAYER_COMPLETE')
