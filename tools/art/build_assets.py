"""Build the original Machine Move Forward art pack with Blender 5.1.

Run: blender --background --python tools/art/build_assets.py
Outputs editable .blend sources, GLB runtime assets and a contact-sheet render.
Coordinates below are game metres: X right, Y up, Z length. No external assets.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

# This script runs in a separate background Blender process and never saves user
# preferences. Avoid backup copies when regenerating these disposable sources.
bpy.context.preferences.filepaths.save_version = 0

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "models" / "authored"
SOURCE = ROOT / "assets" / "blender"
PREVIEW = ROOT / "docs" / "art"
for folder in (OUT, SOURCE, PREVIEW):
    folder.mkdir(parents=True, exist_ok=True)


def vec(p):
    return Vector((p[0], -p[2], p[1]))


def linear(v):
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def material(name, color, metal=0.0, rough=0.7, glow=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    rgb = tuple(linear(int(color[i:i + 2], 16) / 255) for i in (0, 2, 4))
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Emission Color'].default_value = (*rgb, 1)
    bsdf.inputs['Emission Strength'].default_value = glow
    return mat


M = {}
for name, color, metal, rough, glow in [
    ('Paint_Sage', '657669', .42, .65, 0),
    ('Paint_Teal', '446e6c', .35, .65, 0),
    ('Paint_Ochre', 'bd8b45', .25, .68, 0),
    ('Paint_Raider', '924c37', .3, .72, 0),
    ('Bare_Steel', '889093', .65, .48, 0),
    ('Dark_Steel', '303b40', .55, .6, 0),
    ('Rubber', '1d2427', .05, .92, 0),
    ('Canvas', '9d9076', 0, .94, 0),
    ('Canvas_Dark', '4d5350', 0, .98, 0),
    ('Ivory', 'cbbd9c', .1, .75, 0),
    ('Rust', '74452d', .35, .95, 0),
    ('Lens_Amber', 'ffc06b', .15, .35, 2.3),
    ('Lens_Red', 'f84f35', .1, .35, 2.2),
]:
    M[name] = material(name, color, metal, rough, glow)


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def empty(name, at=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = vec(at)
    if parent:
        obj.parent = parent
    return obj


def finish(obj, name, mat, parent=None, bone=None, bevel=0):
    obj.name = name
    obj.data.materials.append(M[mat])
    if bevel:
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new('Machined edges', 'BEVEL')
        mod.width, mod.segments = bevel, 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod = obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if parent:
        world = obj.matrix_world.copy()
        obj.parent = parent
        obj.matrix_world = world
    if bone:
        group = obj.vertex_groups.new(name=bone)
        group.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    return obj


def box(name, at, size, mat, parent=None, bone=None, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=vec(at))
    obj = bpy.context.object
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, parent, bone, bevel)


def cylinder(name, a, b, radius, mat, parent=None, bone=None, vertices=12):
    av, bv = vec(a), vec(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius,
                                       depth=(bv - av).length, location=(av + bv) / 2)
    obj = bpy.context.object
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = (bv - av).to_track_quat('Z', 'Y')
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, parent, bone)


def plate(name, points, faces, mat, parent=None, bone=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([vec(p) for p in points], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, name, mat, parent, bone)


def bolts(at, count, axis='x', step=.2, parent=None, bone=None):
    for i in range(count):
        p = list(at)
        p[0 if axis == 'x' else 2] += step * i
        cylinder('Hex fastener', p, (p[0], p[1] + .018, p[2]), .027,
                 'Bare_Steel', parent, bone, vertices=6)


def merge_static_by_parent():
    """Keep animated pivots, merge their rigid children into material primitives."""
    groups = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'MESH':
            groups.setdefault(obj.parent, []).append(obj)
    for parent, meshes in groups.items():
        if not meshes:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        meshes[0].name = (parent.name if parent else 'Asset') + '_Geometry'


def make_turret():
    root = empty('MMF_Turret')
    root['authoredPalette'] = True
    cylinder('Deck fixing ring', (0, .03, 0), (0, .16, 0), .76, 'Dark_Steel', root, vertices=24)
    cylinder('Bearing ring', (0, .16, 0), (0, .25, 0), .58, 'Bare_Steel', root, vertices=24)
    cylinder('Pedestal', (0, .25, 0), (0, .85, 0), .26, 'Paint_Sage', root)
    for s in (-1, 1):
        box('Mounting outrigger', (s * .58, .085, 0), (.38, .16, 1.32), 'Paint_Sage', root)
        bolts((s * .58, .17, -.5), 4, 'z', .33, root)
    yaw = empty('TurretYaw', (0, .85, 0), root)
    cylinder('Rotation collar', (0, .79, 0), (0, .97, 0), .37, 'Paint_Ochre', yaw, vertices=20)
    for s in (-1, 1):
        box('Trunnion cheek', (s * .33, 1.11, 0), (.15, .5, .44), 'Paint_Sage', yaw)
        cylinder('Trunnion bearing', (s * .32, 1.2, 0), (s * .45, 1.2, 0), .15, 'Bare_Steel', yaw)
    pitch = empty('TurretPitch', (0, .35, 0), yaw)
    bpy.context.view_layer.update()
    box('Receiver', (0, 1.2, -.13), (.5, .34, .65), 'Dark_Steel', pitch, bevel=.045)
    box('Receiver top cover', (0, 1.39, -.14), (.54, .065, .64), 'Paint_Sage', pitch)
    cylinder('Heavy barrel jacket', (0, 1.2, -.4), (0, 1.2, -1.06), .104, 'Dark_Steel', pitch, vertices=16)
    cylinder('Barrel', (0, 1.2, -.99), (0, 1.2, -1.27), .052, 'Bare_Steel', pitch)
    cylinder('Muzzle brake', (0, 1.2, -1.22), (0, 1.2, -1.38), .083, 'Dark_Steel', pitch)
    for z in (-.53, -.68, -.83, -.98):
        cylinder('Cooling band', (0, 1.2, z), (0, 1.2, z - .035), .12, 'Bare_Steel', pitch)
    for s in (-1, 1):
        box('Operator shield', (s * .49, 1.3, -.42), (.36, .66, .09), 'Paint_Sage', pitch, bevel=.025)
        box('Shield lower trim', (s * .49, 1.015, -.478), (.36, .1, .018), 'Paint_Ochre', pitch, bevel=.003)
        box('Shield slash', (s * .49, 1.015, -.49), (.1, .1, .01), 'Dark_Steel', pitch, bevel=0)
        cylinder('Rear grip', (s * .22, 1.16, .22), (s * .22, 1.36, .22), .031, 'Rubber', pitch)
    cylinder('Ammo drum', (.29, 1.2, .02), (.55, 1.2, .02), .245, 'Paint_Ochre', pitch, vertices=20)
    cylinder('Drum cap', (.55, 1.2, .02), (.58, 1.2, .02), .19, 'Dark_Steel', pitch)
    box('Reflex sight', (0, 1.46, -.12), (.13, .085, .2), 'Dark_Steel', pitch, bevel=.01)
    box('Sight lens', (0, 1.46, -.01), (.09, .045, .015), 'Lens_Amber', pitch, bevel=.003)
    empty('Muzzle', (0, 0, -1.4), pitch)
    merge_static_by_parent()
    return root


def make_skiff():
    root = empty('MMF_Skiff')
    root['authoredPalette'] = True
    # Six-sided welded hull: a tapering prow gives a readable forward silhouette.
    outline = [(-1, -2.3), (-.55, -3), (.55, -3), (1, -2.3), (1, 2.6), (-1, 2.6)]
    points = [(x, y, z) for y in (.45, 1.14) for x, z in outline]
    faces = [(0, 5, 4, 3, 2, 1), (6, 7, 8, 9, 10, 11)]
    faces += [(i, (i + 1) % 6, (i + 1) % 6 + 6, i + 6) for i in range(6)]
    plate('Welded skiff hull', points, faces, 'Paint_Raider', root)
    box('Deck floor', (0, 1.16, .05), (1.83, .08, 4.56), 'Dark_Steel', root)
    for s in (-1, 1):
        box('Armored track casing', (s * 1.2, .49, .03), (.53, .83, 4.65), 'Dark_Steel', root, bevel=.18)
        box('Track top guard', (s * 1.2, .94, -.02), (.59, .14, 4.86), 'Paint_Raider', root, bevel=.06)
        for z in (-1.9, -.95, 0, .95, 1.9):
            cylinder('Road wheel', (s * 1.14, .48, z), (s * 1.51, .48, z), .32, 'Rubber', root, vertices=16)
            cylinder('Wheel hub', (s * 1.49, .48, z), (s * 1.535, .48, z), .13, 'Bare_Steel', root)
        for i in range(22):
            z = -2.11 + i * .2
            box('Tread cleat', (s * 1.2, .08, z), (.56, .08, .065), 'Bare_Steel', root, bevel=.006)
        box('Hull side armor', (s * .95, 1.01, -.45), (.1, .46, 2.8), 'Paint_Raider', root)
        cylinder('Boarding rail', (s * .9, 1.71, -.4), (s * .9, 1.71, 1.65), .034, 'Bare_Steel', root)
        for z in (-.4, .62, 1.65):
            cylinder('Rail stanchion', (s * .9, 1.18, z), (s * .9, 1.72, z), .033, 'Dark_Steel', root)
        box('Headlight cage', (s * .58, 1.1, -2.52), (.3, .27, .22), 'Dark_Steel', root)
        box('Headlight lens', (s * .58, 1.1, -2.65), (.21, .15, .025), 'Lens_Amber', root, bevel=.008)
        bolts((s * .96, 1.27, -.8), 6, 'z', .45, root)
    box('Sloped prow bumper', (0, .86, -2.87), (1.17, .21, .22), 'Paint_Ochre', root)
    # The pilot is on the forward deck; the two raiders have room aft of them.
    box('Pilot seat back', (0, 1.5, -1.11), (.55, .65, .16), 'Canvas_Dark', root)
    box('Pilot seat cushion', (0, 1.27, -1.39), (.58, .18, .54), 'Canvas_Dark', root)
    box('Control console', (0, 1.7, -2.0), (.76, .48, .31), 'Paint_Raider', root)
    box('Console display', (0, 1.88, -1.83), (.26, .12, .024), 'Lens_Amber', root, bevel=.005)
    for s in (-1, 1):
        cylinder('Control handle', (s * .23, 1.59, -1.77), (s * .23, 1.8, -1.77), .035, 'Rubber', root)
    box('Engine cowling', (0, 1.45, 2.05), (1.61, .64, .93), 'Paint_Raider', root, bevel=.07)
    for x in (-.5, -.3, -.1, .1, .3, .5):
        box('Engine cooling louvre', (x, 1.79, 2.03), (.07, .025, .66), 'Dark_Steel', root, bevel=.006)
    cylinder('Exhaust riser', (.62, 1.65, 2.26), (.62, 2.42, 2.26), .07, 'Dark_Steel', root)
    cylinder('Exhaust cap', (.62, 2.4, 2.26), (.62, 2.46, 2.26), .11, 'Bare_Steel', root)
    cylinder('Antenna', (-.72, 1.6, 2.2), (-.72, 3.1, 2.2), .018, 'Dark_Steel', root, vertices=8)
    box('Antenna pennant', (-.53, 2.89, 2.2), (.36, .25, .02), 'Paint_Ochre', root, bevel=.004)
    for x in (-.37, .1):
        box('Lash-down crate', (x, 1.4, 1.29), (.36, .39, .5), 'Canvas', root, bevel=.02)
        box('Crate strap', (x, 1.61, 1.29), (.06, .015, .5), 'Canvas_Dark', root, bevel=.002)
    empty('CrewSeatLeft', (-.59, 1.2, .35), root)
    empty('CrewSeatRight', (.59, 1.2, .35), root)
    empty('PilotSeat', (0, 1.2, -1.45), root)
    cylinder('Bow gun mount', (0, 1.88, -1.95), (0, 2.02, -1.95), .19, 'Dark_Steel', root)
    gun_yaw = empty('SkiffGunYaw', (0, 2.04, -1.95), root)
    gun_pitch = empty('SkiffGunPitch', (0, 0, 0), gun_yaw)
    bpy.context.view_layer.update()
    box('Light gun receiver', (0, 2.04, -1.99), (.31, .23, .5), 'Dark_Steel', gun_pitch, bevel=.03)
    box('Light gun cover', (0, 2.17, -1.99), (.34, .06, .5), 'Paint_Ochre', gun_pitch, bevel=.01)
    cylinder('Light gun barrel', (0, 2.04, -2.2), (0, 2.04, -3.03), .056, 'Bare_Steel', gun_pitch)
    for z in (-2.35, -2.55, -2.75):
        cylinder('Light gun cooling band', (0, 2.04, z), (0, 2.04, z - .06), .079, 'Dark_Steel', gun_pitch)
    box('Belt feed housing', (.26, 2.02, -1.97), (.22, .28, .36), 'Paint_Raider', gun_pitch)
    empty('SkiffMuzzle', (0, 0, -1.1), gun_pitch)
    merge_static_by_parent()
    return root


def make_character(robot=False):
    name = 'MMF_Scavenger' if robot else 'MMF_Raider'
    root = empty(name)
    root['authoredPalette'] = True
    # One skinned mesh, rigid weights on armor and cloth segments, 16 useful bones.
    bone_specs = [
        ('Root', (0, 0, 0), (0, .15, 0), None),
        ('Hips', (0, .98, 0), (0, 1.12, 0), 'Root'),
        ('Spine', (0, 1.12, 0), (0, 1.53, 0), 'Hips'),
        ('Head', (0, 1.55, 0), (0, 1.86, 0), 'Spine'),
    ]
    for suffix, sign in (('L', -1), ('R', 1)):
        bone_specs.extend([
            (f'Thigh.{suffix}', (sign * .16, .99, 0), (sign * .16, .58, 0), 'Hips'),
            (f'Shin.{suffix}', (sign * .16, .58, 0), (sign * .16, .15, 0), f'Thigh.{suffix}'),
            (f'Foot.{suffix}', (sign * .16, .15, 0), (sign * .16, .1, .22), f'Shin.{suffix}'),
            (f'UpperArm.{suffix}', (sign * .32, 1.49, 0), (sign * .38, 1.17, 0), 'Spine'),
            (f'Forearm.{suffix}', (sign * .38, 1.17, 0), (sign * .4, .95, .06), f'UpperArm.{suffix}'),
            (f'Hand.{suffix}', (sign * .4, .95, .06), (sign * .4, .84, .08), f'Forearm.{suffix}'),
        ])
    torso_mat = 'Paint_Raider' if robot else 'Canvas_Dark'
    limb_mat = 'Dark_Steel' if robot else 'Canvas'
    box('Core chest', (0, 1.34, 0), (.5, .45, .31), torso_mat, root, 'Spine', .065)
    box('Pelvis', (0, 1.0, 0), (.4, .19, .27), 'Dark_Steel' if robot else 'Canvas_Dark', root, 'Hips', .045)
    box('Breastplate', (0, 1.39, .188), (.41, .31, .065), 'Paint_Ochre' if robot else 'Paint_Raider', root, 'Spine', .023)
    box('Belt', (0, 1.07, .02), (.45, .075, .34), 'Dark_Steel', root, 'Hips', .008)
    for x in (-.15, .15):
        box('Belt pouch', (x, 1.045, .22), (.12, .14, .085), 'Canvas', root, 'Hips', .012)
    if robot:
        box('Angular sensor head', (0, 1.73, .045), (.33, .27, .32), 'Paint_Raider', root, 'Head', .055)
        box('Eye socket', (0, 1.75, .21), (.29, .09, .055), 'Dark_Steel', root, 'Head', .012)
        box('Optic strip', (0, 1.75, .24), (.19, .032, .012), 'Lens_Red', root, 'Head', .005)
        box('Jaw guard', (0, 1.62, .17), (.24, .075, .11), 'Bare_Steel', root, 'Head', .014)
        cylinder('Head aerial', (.12, 1.82, -.04), (.16, 2.01, -.04), .015, 'Dark_Steel', root, 'Head', 8)
        box('Power pack', (0, 1.37, -.25), (.31, .34, .15), 'Dark_Steel', root, 'Spine', .035)
        for x in (-.1, 0, .1):
            cylinder('Power cell', (x, 1.22, -.335), (x, 1.51, -.335), .033, 'Paint_Ochre', root, 'Spine')
    else:
        box('Wrapped head', (0, 1.74, 0), (.3, .32, .28), 'Canvas', root, 'Head', .062)
        box('Face mask', (0, 1.67, .158), (.22, .13, .085), 'Dark_Steel', root, 'Head', .025)
        box('Goggle band', (0, 1.78, .012), (.315, .083, .294), 'Canvas_Dark', root, 'Head', .018)
        for x in (-.078, .078):
            box('Goggle casing', (x, 1.79, .174), (.135, .078, .035), 'Dark_Steel', root, 'Head', .023)
            box('Goggle lens', (x, 1.79, .195), (.085, .041, .012), 'Lens_Amber', root, 'Head', .014)
        box('Neck scarf', (0, 1.57, .015), (.37, .12, .36), 'Paint_Raider', root, 'Head', .04)
        box('Scarf tail', (-.2, 1.32, -.22), (.13, .43, .06), 'Paint_Raider', root, 'Spine', .009)
        box('Backpack', (0, 1.32, -.26), (.36, .43, .2), 'Canvas', root, 'Spine', .052)
        box('Backpack flap', (0, 1.51, -.28), (.39, .085, .24), 'Canvas_Dark', root, 'Spine', .015)
    for suffix, sign in (('L', -1), ('R', 1)):
        thigh, shin, foot = f'Thigh.{suffix}', f'Shin.{suffix}', f'Foot.{suffix}'
        upper, fore, hand = f'UpperArm.{suffix}', f'Forearm.{suffix}', f'Hand.{suffix}'
        box('Upper leg', (sign * .16, .79, 0), (.18, .34, .21), limb_mat, root, thigh, .035)
        box('Knee pad', (sign * .16, .585, .105), (.2, .145, .1), 'Paint_Raider' if robot else 'Dark_Steel', root, shin, .024)
        box('Shin guard', (sign * .16, .365, .05), (.175, .34, .17), 'Paint_Ochre' if robot else 'Canvas_Dark', root, shin, .03)
        box('Boot', (sign * .16, .105, .085), (.23, .17, .39), 'Dark_Steel' if robot else 'Rubber', root, foot, .035)
        box('Toe cap', (sign * .16, .13, .23), (.235, .09, .1), 'Bare_Steel', root, foot, .019)
        cylinder('Arm joint', (sign * .28, 1.47, 0), (sign * .37, 1.47, 0), .115, 'Dark_Steel', root, upper)
        box('Upper arm', (sign * .365, 1.31, 0), (.16, .26, .19), limb_mat, root, upper, .033)
        box('Forearm', (sign * .395, 1.07, .027), (.16, .21, .19), 'Paint_Raider' if robot else 'Canvas_Dark', root, fore, .028)
        box('Hand', (sign * .405, .905, .072), (.14, .135, .16), 'Dark_Steel', root, hand, .026)
        if robot or sign == -1:
            box('Shoulder plate', (sign * .37, 1.5, .02), (.23, .14, .3), 'Paint_Ochre' if robot else 'Paint_Raider', root, upper, .035)
        if robot:
            cylinder('Shin actuator', (sign * .235, .52, -.06), (sign * .235, .22, -.06), .028, 'Bare_Steel', root, shin)
    # Join while retaining vertex groups, so each animation has only one skin.
    bpy.ops.object.select_all(action='DESELECT')
    meshes = [o for o in root.children if o.type == 'MESH']
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    mesh = meshes[0]
    mesh.name = name + '_Skin'
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    arm = bpy.data.armatures.new(name + '_Skeleton')
    rig = bpy.data.objects.new('Armature', arm)
    bpy.context.collection.objects.link(rig)
    rig.parent = root
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for bone_name, head, tail, parent in bone_specs:
        bone = arm.edit_bones.new(bone_name)
        bone.head, bone.tail = vec(head), vec(tail)
        if parent:
            bone.parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh.parent = rig
    mod = mesh.modifiers.new('Armor skeleton', 'ARMATURE')
    mod.object = rig
    rig.animation_data_create()
    for clip, frames in [('Idle', 48), ('Walking', 32), ('Running', 22), ('Climb', 32), ('Punch', 20), ('Death', 32)]:
        action = bpy.data.actions.new(clip)
        action.use_fake_user = True
        rig.animation_data.action = action
        for frame in range(0, frames + 1, 2):
            t = frame / frames
            for bone in rig.pose.bones:
                bone.rotation_mode = 'XYZ'
                bone.rotation_euler = (0, 0, 0)
                bone.location = (0, 0, 0)
            if clip in ('Walking', 'Running'):
                swing = math.sin(t * math.tau) * (.52 if clip == 'Walking' else .85)
                for suffix, sign in [('L', 1), ('R', -1)]:
                    rig.pose.bones[f'Thigh.{suffix}'].rotation_euler.x = sign * swing
                    rig.pose.bones[f'Shin.{suffix}'].rotation_euler.x = -max(0, sign * swing) * .9
                    rig.pose.bones[f'UpperArm.{suffix}'].rotation_euler.x = -sign * swing * .75
                    rig.pose.bones[f'Forearm.{suffix}'].rotation_euler.x = -.18
                rig.pose.bones['Hips'].location.y = abs(math.sin(t * math.tau)) * .028
            elif clip == 'Climb':
                # Bent knees and alternating arm pulls while traversing the cable.
                swing = math.sin(t * math.tau)
                rig.pose.bones['Spine'].rotation_euler.x = -.18
                for suffix, sign in [('L', 1), ('R', -1)]:
                    rig.pose.bones[f'UpperArm.{suffix}'].rotation_euler.x = -1.9 + sign * swing * .12
                    rig.pose.bones[f'Forearm.{suffix}'].rotation_euler.x = -.55 - sign * swing * .12
                    rig.pose.bones[f'Thigh.{suffix}'].rotation_euler.x = .5 + sign * swing * .2
                    rig.pose.bones[f'Shin.{suffix}'].rotation_euler.x = -.85
            elif clip == 'Idle':
                rig.pose.bones['Spine'].rotation_euler.x = math.sin(t * math.tau) * .017
                rig.pose.bones['Head'].rotation_euler.y = math.sin(t * math.tau) * .035
            elif clip == 'Punch':
                k = math.sin(math.pi * min(1, t / .7))
                rig.pose.bones['UpperArm.R'].rotation_euler.x = -k * 1.55
                rig.pose.bones['Forearm.R'].rotation_euler.x = -.2 * (1 - k)
                rig.pose.bones['Spine'].rotation_euler.y = k * .15
            elif clip == 'Death':
                k = min(1, t * 1.4)
                rig.pose.bones['Root'].rotation_euler.x = -k * 1.48
                rig.pose.bones['Root'].location.y = k * .13
                rig.pose.bones['Head'].rotation_euler.x = .3 * k
            if clip in ('Walking', 'Running'):
                # Ground the lowest actual boot in each pose. The bind-pose
                # foot offset cannot compensate for a flexed knee in mid-stride.
                bpy.context.view_layer.update()
                evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
                lowest = min((evaluated.matrix_world @ v.co).z for v in evaluated.data.vertices)
                rig.pose.bones['Root'].location.y = .02 - lowest
            for bone in rig.pose.bones:
                bone.keyframe_insert('rotation_euler', frame=frame)
                bone.keyframe_insert('location', frame=frame)
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.rotation_euler = (0, 0, 0)
        bone.location = (0, 0, 0)
    return root


def save_asset(stem, animated=False):
    bpy.context.scene.frame_set(0)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / f'{stem}.blend'))
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / f'{stem}.glb'), export_format='GLB',
        export_yup=True, export_extras=True, export_animations=animated,
        export_animation_mode='ACTIONS', export_force_sampling=True,
        export_skins=True, export_cameras=False, export_lights=False,
        export_copyright='Original Machine Move Forward project artwork; generated with Blender.',
    )


def main():
    manifest = []
    for stem, factory, animated in [
        ('manual-turret', make_turret, False),
        ('raider-skiff', make_skiff, False),
        ('scavenger', lambda: make_character(True), True),
        ('raider', lambda: make_character(False), True),
    ]:
        clear()
        factory()
        bpy.context.view_layer.update()
        save_asset(stem, animated)
        meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
        triangles = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
        manifest.append({'asset': stem, 'triangles': triangles,
                         'bytes': (OUT / f'{stem}.glb').stat().st_size,
                         'animations': ['Idle', 'Walking', 'Running', 'Climb', 'Punch', 'Death'] if animated else []})
        print('MMF_ASSET', json.dumps(manifest[-1]))

    # One staged turntable view to inspect scale, silhouette, surfaces and palette.
    clear()
    for stem, at, angle in [
        ('raider-skiff', (1.25, 0, -.4), -.12),
        ('manual-turret', (-2.75, 0, 1.1), -.15),
        ('scavenger', (-1.4, 0, 2.8), 3.59),
        ('raider', (-.28, 0, 2.9), 3.59),
    ]:
        before = set(bpy.context.scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(OUT / f'{stem}.glb'))
        new = set(bpy.context.scene.objects) - before
        carrier = empty(stem + '_Display', at)
        carrier.rotation_euler.z = angle
        for obj in new:
            if obj.parent is None:
                obj.parent = carrier
        for obj in new:
            if obj.animation_data:
                obj.animation_data.action = None
            if obj.type == 'ARMATURE':
                for b in obj.pose.bones:
                    b.rotation_euler = (0, 0, 0)
                    b.location = (0, 0, 0)

    M['Stage'] = material('Stage', '77786c', 0, .88)
    box('Studio floor', (0, -.16, 0), (200, .25, 200), 'Stage', bevel=0)
    world = bpy.context.scene.world or bpy.data.worlds.new('Desert studio')
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.15, .2, .26, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .55
    for name, pos, energy, size, color in [
        ('Warm key', (-4, 8, 4), 1800, 6, (1, .82, .64)),
        ('Cool fill', (6, 5, 1), 1300, 5, (.61, .8, 1)),
        ('Edge light', (0, 6, -6), 2100, 4, (1, .92, .8)),
    ]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.shape, data.size, data.color = energy, 'DISK', size, color
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = vec(pos)
        obj.rotation_euler = (-obj.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data = bpy.data.cameras.new('Art review camera')
    camera = bpy.data.objects.new('Art review camera', camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = vec((-8.5, 6.6, -10.5))
    target = vec((0, .85, .4))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.type, camera_data.ortho_scale = 'ORTHO', 11.6
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 40
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'AgX'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(PREVIEW / 'authored-pack.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'art-review.blend'))
    bpy.ops.render.render(write_still=True)
    (PREVIEW / 'asset-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('MMF_ART_COMPLETE', str(PREVIEW / 'authored-pack.png'))


if __name__ == "__main__":
    main()
