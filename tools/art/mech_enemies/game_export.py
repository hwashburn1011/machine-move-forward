"""Derive animated combat assets from the reviewed Blender masters.

Run Blender --background --factory-startup --python this_file -- bastion.
Original source meshes and portable collection exports are never overwritten.
"""
import ast
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion, Euler

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'assets/mech-enemies/gameplay'
OUT.mkdir(exist_ok=True)
kind = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'assets/mech-enemies/source' / f'{kind}.blend'))
scene = bpy.context.scene
rig = bpy.data.objects[kind + '_Rig']
parts = [o for o in scene.objects if o.type == 'MESH' and o.parent == rig]
gear = [o for o in scene.objects if o.type == 'EMPTY' and
        (o.name.startswith('Weapon_') or o.name == 'Sovereign_Drone')]
# Reuse the reviewed export's geometry join and reduction, without executing it.
tree = ast.parse((Path(__file__).parent / 'export.py').read_text(encoding='utf-8'))
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef)
                             and n.name in ['select', 'joined', 'reduce', 'stats']], type_ignores=[]), 'export_helpers', 'exec'))
rig.scale = (1, 1, 1)
rig.animation_data_clear()
rig.data.pose_position = 'POSE'
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
for pb in rig.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
    pb.rotation_mode = 'QUATERNION'
bpy.context.view_layer.update()
body = joined(parts, kind + '_CombatBody')
# Preserve broad armor, fingers, cloth and silhouette; small fasteners are reduced.
reduce(body, .23 if kind == 'warden' else .27 if kind == 'sovereign' else .30)
weapons = []
for i, root in enumerate(gear):
    root.matrix_world = Matrix.Identity(4)
    bpy.context.view_layer.update()
    item = joined([o for o in root.children if o.type == 'MESH'], 'CombatEquipment')
    reduce(item, .32 if kind == 'bastion' else .42)
    item.vertex_groups.clear()
    bone = 'equipment_' + str(i)
    vg = item.vertex_groups.new(name=bone)
    vg.add(list(range(len(item.data.vertices))), 1, 'REPLACE')
    weapons.append((item, bone))
select([rig])
bpy.ops.object.mode_set(mode='EDIT')
for _, name in weapons:
    b = rig.data.edit_bones.new(name)
    b.head = (0, 0, 0)
    b.tail = (0, .15, 0)
    b.parent = rig.data.edit_bones['pelvis']
bpy.ops.object.mode_set(mode='OBJECT')
select([body] + [o for o, _ in weapons])
bpy.ops.object.join()
body = bpy.context.object
# Joining unifies repeated body/equipment materials into one draw per material.
old = list(body.data.materials)
unique = list(dict.fromkeys(old))
indices = [unique.index(old[p.material_index]) for p in body.data.polygons]
body.data.materials.clear()
for m in unique:
    body.data.materials.append(m)
for p, i in zip(body.data.polygons, indices):
    p.material_index = i
body.parent = rig
body.matrix_basis = Matrix.Identity(4)
mod = body.modifiers.new('Combat skeleton', 'ARMATURE')
mod.object = rig
for o in list(scene.objects):
    if o not in [body, rig]:
        bpy.data.objects.remove(o, do_unlink=True)
rig['authoredPalette'] = True
rig['mechId'] = kind
rig['standingHeight'] = 2.02 if kind == 'bastion' else 2.08
rig['forwardAxis'] = '+Z in glTF'

def orient(name, head, tail):
    pb = rig.pose.bones[name]
    rest = rig.data.bones[name]
    q = (rest.tail_local - rest.head_local).rotation_difference(Vector(tail) - Vector(head)) @ rest.matrix_local.to_quaternion()
    pb.matrix = Matrix.Translation(Vector(head)) @ q.to_matrix().to_4x4()
    bpy.context.view_layer.update()

def limb(a, b, end, pole):
    start = rig.pose.bones[a].head.copy()
    delta = Vector(end) - start
    l1, l2 = rig.data.bones[a].length, rig.data.bones[b].length
    distance = max(.001, min(delta.length, l1 + l2 - .003))
    direction = delta.normalized()
    along = (l1*l1 - l2*l2 + distance*distance) / (2*distance)
    height = math.sqrt(max(0, l1*l1 - along*along))
    p = Vector(pole) - start
    elbow = start + direction*along + (p - direction*p.dot(direction)).normalized()*height
    wrist = start + direction*distance
    orient(a, start, elbow)
    orient(b, elbow, wrist)
    return wrist

def pose(t, mode):
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
        pb.rotation_mode = 'QUATERNION'
    moving = mode in ['walk', 'run']
    blade = kind == 'revenant'
    heavy = kind == 'bastion'
    down = .11 if blade else .04
    bob = (.018*math.cos(t*math.tau*2) if moving else .005*math.sin(t*math.tau))
    z = bob-down
    pelvis = rig.pose.bones['pelvis']
    pelvis.matrix = Matrix.Translation((0, 0, z)) @ rig.data.bones['pelvis'].matrix_local
    bpy.context.view_layer.update()
    hip = .28 if heavy else .16
    for side, s in [('r', -1), ('l', 1)]:
        phase = (t + (.5 if s == 1 else 0)) % 1
        stride = (.28 if mode == 'run' else .22) if moving else 0
        lift = max(0, math.sin(phase*math.tau)) * (.13 if mode == 'run' else .08) if moving else 0
        w = limb('thigh_'+side, 'calf_'+side, (s*hip, math.cos(phase*math.tau)*stride, .155+lift), (s*hip, -.7, .5))
        orient('foot_'+side, w, w+Vector((0, -.20, -.07)))
    matrices = []
    if kind in ['bastion', 'warden']:
        position = (0, -.30, 1.30+z) if heavy else (-.10, -.30, 1.39+z)
        # Two-handed braced carry. Recoil returns to this same pose.
        kick = max(0, 1-t*5)*.045 if mode == 'attack' else 0
        mat = Matrix.Translation(Vector(position)+Vector((0, kick, 0)))
        matrices.append(mat)
        grips = [(0, .22, -.10), (.08, -.20, -.10)] if heavy else [(0, .091, -.09), (0, -.29, -.04)]
        for (side, s), grip in zip([('r', -1), ('l', 1)], grips):
            w = limb('upperarm_'+side, 'lowerarm_'+side, mat@Vector(grip), (s*(.88 if heavy else .60), -.12, 1.18+z))
            orient('hand_'+side, w, w+Vector((0, -.02, -.10)))
    else:
        for side, s in [('r', -1), ('l', 1)]:
            swing = math.sin(t*math.tau)*.06 if moving else 0
            slash = math.sin(math.pi*min(1, t/.7)) if mode == 'attack' and blade else 0
            end = (s*(.47-.16*slash), -.12-.40*slash+s*swing, 1.02+z+.24*slash)
            if kind == 'sovereign' and side == 'l':
                end = (.48, -.24, 1.39+z)
            w = limb('upperarm_'+side, 'lowerarm_'+side, end, (s*.63, -.08, 1.2+z))
            orient('hand_'+side, w, w+Vector((0, -.07, -.06)))
            if blade:
                rotation = Euler((.6-.9*slash, 0, s*(.48-.65*slash))).to_matrix().to_4x4()
                matrices.append(Matrix.Translation(w+Vector((0, -.025, -.055))-rotation.to_3x3()@Vector((0, .125, 0)))@rotation)
        if kind == 'sovereign':
            matrices.append(Matrix.Translation((.56, -.23, 1.70+z+.035*math.sin(t*math.tau))))
    for (_, name), mat in zip(weapons, matrices):
        rig.pose.bones[name].matrix = mat
    for pb in rig.pose.bones:
        if pb.name.startswith('finger_'):
            pb.rotation_quaternion = Quaternion((1, 0, 0), -.70)
    if mode == 'death':
        f = min(1, t*1.6)
        # Kneel then roll onto the side, pivoting around the feet, held at end.
        fall = Matrix.Translation((0, 0, .24*f)) @ Quaternion((0, 1, 0), f*1.48).to_matrix().to_4x4()
        rig.pose.bones['root'].matrix = fall @ rig.data.bones['root'].matrix_local
    bpy.context.view_layer.update()

scene.render.fps = 30
for mode, frames in [('idle', 60), ('walk', 30), ('run', 22), ('attack', 24), ('death', 42)]:
    action = bpy.data.actions.new(mode)
    action.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = action
    for frame in range(frames+1):
        pose(frame/frames, mode)
        for pb in rig.pose.bones:
            pb.keyframe_insert('location', frame=frame)
            pb.keyframe_insert('rotation_quaternion', frame=frame)
rig.animation_data.action = None
pose(0, 'idle')
# Socket travels on the same animated equipment bone as the actual barrel.
muzzle = bpy.data.objects.new('EnemyMuzzle', None)
scene.collection.objects.link(muzzle)
muzzle.parent = rig
muzzle.parent_type = 'BONE'
muzzle.parent_bone = weapons[0][1]
tip = {'bastion': (0, -1.195, 0), 'warden': (0, -1.27, .01),
       'revenant': (0, -.94, 0), 'sovereign': (0, -.12, 0)}[kind]
muzzle.matrix_world = rig.pose.bones[weapons[0][1]].matrix @ Matrix.Translation(tip)
bpy.context.view_layer.update()
for pb in rig.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
scene.frame_start = 0
scene.frame_end = 60
select([rig, body, muzzle])
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f'{kind}_combat.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT / f'{kind}.glb'), export_format='GLB', use_selection=True,
    export_yup=True, export_extras=True, export_animations=True, export_animation_mode='ACTIONS',
    export_force_sampling=True, export_skins=True, export_tangents=True, export_cameras=False, export_lights=False)
(OUT / f'{kind}_manifest.json').write_text(json.dumps({'id': kind, **stats(body),
    'bones': len(rig.data.bones), 'clips': ['idle', 'walk', 'run', 'attack', 'death']}, indent=2), encoding='utf-8')
print('COMBAT EXPORT COMPLETE', kind, flush=True)
