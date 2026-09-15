"""Export evaluated Nomad collision, excluding runtime-owned solid housings.

Can be run alone in background Blender against the existing gameplay source.
This does not rebuild or modify the visible model or the user's open scene.
"""
import bpy
import json
import shutil
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'assets/iron-nomad/gameplay'


def export_collision(scene):
    profile = json.loads((ROOT / 'src/data/iron-nomad.json').read_text())
    shared = json.loads((ROOT / 'src/data/iron-nomad-shared-solids.json').read_text())
    shared_by_name = {solid['sourceObject']: solid for solid in shared}
    sx, sz, sy = profile['scale']
    oy = profile['offsetY']

    def game(v):
        return Vector((-v.x * sx, v.z * sz + oy, v.y * sy))

    def bounds(obj):
        pts = [game(obj.matrix_world @ Vector(v)) for v in obj.bound_box]
        return (Vector(tuple(min(v[i] for v in pts) for i in range(3))),
                Vector(tuple(max(v[i] for v in pts) for i in range(3))))

    def owner(obj):
        parent = obj.parent
        while parent and not parent.get('module'):
            parent = parent.parent
        return parent.name if parent else ''

    scene.view_layers[0].update()
    # Fail loudly if an artist changes a shared housing without its runtime proxy.
    for name, solid in shared_by_name.items():
        obj = scene.objects.get(name)
        if obj is None:
            raise ValueError(f'Missing shared solid: {name}')
        lo, hi = bounds(obj)
        if any(abs(lo[i] - solid['min'][i]) > .003 or
               abs(hi[i] - solid['max'][i]) > .003 for i in range(3)):
            raise ValueError(f'Shared solid bounds changed: {name}: {lo}, {hi}')

    vertices, faces, obstacles, used = [], [], [], []
    dg = bpy.context.evaluated_depsgraph_get()
    for obj in list(scene.objects):
        if obj.type != 'MESH':
            continue
        own, name = owner(obj), obj.name.lower()
        if own.startswith('Leg_') or own in [
            'Gameplay_Decks_And_Access', 'Canvas_and_Rigging',
            'Lamps_and_UtilityTowers', 'Communications_Masts',
        ]:
            continue
        if any(s in name for s in ['walking ledge', 'bolt', 'rivet', 'cable',
                                  'wire', 'paint chip', 'decals', 'label', 'rope',
                                  'lamp', 'light', 'antenna']):
            continue
        lo, hi = bounds(obj)
        size = hi - lo
        if size.x * size.y * size.z < .035 and 'stair tread' not in name:
            continue
        # Keep build/navigation reservations for runtime-owned solids, but do
        # not send their coincident triangle surfaces to Rapier a second time.
        if obj.name not in shared_by_name:
            mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), depsgraph=dg)
            mesh.calc_loop_triangles()
            start = len(vertices)
            vertices.extend(tuple(game(obj.matrix_world @ v.co)) for v in mesh.vertices)
            faces.extend(tuple(start + j for j in t.vertices) for t in mesh.loop_triangles)
            bpy.data.meshes.remove(mesh)
            used.append(obj.name)
        if size.x > .4 and size.z > .4 and own not in [
            'Chassis_StructuralFrame', 'Decks_and_PerimeterCatwalks', 'External_Stairs_Ladders',
        ]:
            for level in [-2, -1, 0]:
                floor = profile['deckSurface'] + 3 * level
                if hi.y > floor + .35 and lo.y < floor + 1.9:
                    obstacles.append({'level': level, 'minX': round(lo.x, 3),
                                      'maxX': round(hi.x, 3), 'minZ': round(lo.z, 3),
                                      'maxZ': round(hi.z, 3)})

    collision = bpy.data.scenes.new('Playable collision in game coordinates')
    bpy.context.window.scene = collision
    mesh = bpy.data.meshes.new('Nomad static collision')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('IronNomad_StaticCollision', mesh)
    collision.collection.objects.link(obj)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    target = OUT / 'exports/iron-nomad-collision.glb'
    bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB',
                             use_selection=True, use_active_scene=True, export_yup=False,
                             export_materials='NONE', export_animations=False)
    shutil.copyfile(target, ROOT / 'public/models/authored/iron-nomad-collision.glb')
    (ROOT / 'src/data/iron-nomad-obstacles.json').write_text(
        json.dumps(obstacles, separators=(',', ':')))
    (OUT / 'source/gameplay-manifest.json').write_text(json.dumps({
        'profile': profile, 'collisionTriangles': len(faces), 'collisionObjects': used,
        'runtimeSolids': shared,
    }, indent=2))
    print('COLLISION COMPLETE', len(faces), len(used), 'shared solids', len(shared), flush=True)


if __name__ == '__main__':
    bpy.ops.wm.open_mainfile(filepath=str(OUT / 'source/IronNomad_Master.blend'))
    export_collision(bpy.context.scene)
