"""V3 reference-to-game layout. Move equipment as assemblies; stretch the frame."""
import bpy
from mathutils import Vector


def expand_reference(scene, root, profile, game, source):
    def bounds(obj):
        points = [game(obj.matrix_world @ Vector(v)) for v in obj.bound_box]
        return Vector([min(p[i] for p in points) for i in range(3)]), Vector([max(p[i] for p in points) for i in range(3)])

    def lineage(obj):
        while obj and obj != root:
            yield obj
            obj = obj.parent

    def belongs(obj, names):
        return any(parent.name in names for parent in lineage(obj))

    scene.view_layers[0].update()
    removed = []
    for obj in list(scene.objects):
        if belongs(obj, ['Decks_and_PerimeterCatwalks', 'External_Stairs_Ladders']):
            removed.append(obj)
        elif obj.type in ['MESH', 'CURVE', 'FONT']:
            lo, hi = bounds(obj)
            # Remove the entire lower prow wall, its fasteners, conduit and signs.
            if belongs(obj, ['Hull_WeatheredPanels', 'Reference_Refinement_Details']) and hi.z < -7.7 and lo.y > 8.5 and hi.y < 11.65:
                removed.append(obj)
            elif 'steel floor panel' in obj.name or 'Workshop inner rear partition' in obj.name:
                removed.append(obj)
            elif 14.7 < (lo.y + hi.y) / 2 < 17 and lo.z > 4.5 and any(word in obj.name.lower() for word in ['cargo locker', 'cargo box', 'cargo restraint', 'locker carry handle']):
                removed.append(obj)
    # Children first keeps ancestry valid while the removal list is prepared.
    for obj in reversed(removed):
        if obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)
    scene.view_layers[0].update()

    for obj in list(scene.objects):
        if obj.type in ['CURVE', 'FONT']:
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.convert(target='MESH')
    scene.view_layers[0].update()
    worlds = {obj: obj.matrix_world.copy() for obj in scene.objects}
    boxes = {obj: bounds(obj) for obj in scene.objects if obj.type == 'MESH'}
    centers = {obj: (lo + hi) / 2 for obj, (lo, hi) in boxes.items()}
    xfactor, zfactor = profile['deckHalfWidth'] / 6, profile['deckHalfLength'] / 8

    def lift(y):
        return 0 if y < 11.6 else .6 if y < 14.6 else 1.2

    def structural(point):
        return Vector((point.x * xfactor, point.y + min(1.2, max(0, (point.y - 8.83) * .2)), point.z * zfactor))

    def rigid_delta(point, target=None):
        destination = target if target is not None else Vector((point.x * xfactor, point.y + lift(point.y), point.z * zfactor))
        return Vector(source(destination)) - Vector(source(point))

    # Preserve whole assemblies, including each lamp/gauge/pipe relative to its housing.
    rigid = {}
    for obj in scene.objects:
        if obj.name in ['Front_Turbine_Housing', 'CommandHouse_and_Navigation', 'CargoCrane_Yaw'] or obj.name.startswith(('Furnace_', 'Floodlight tower', 'Communications mast', 'Lattice mast', 'Microwave aerial dish')):
            if obj.type == 'EMPTY':
                at = game(worlds[obj].translation)
                target = Vector((at.x * xfactor, profile['deckSurface'], at.z * zfactor)) if obj.name == 'CargoCrane_Yaw' else None
                rigid[obj] = rigid_delta(at, target)

    banner = scene.objects.get('Hanging_Chevron_Banner')
    if banner:
        center = game(worlds[banner].translation)
        rigid[banner] = rigid_delta(center, Vector((-11.15, center.y + 1.2, 7.8)))

    bench = [obj for obj in centers if obj.name.lower().startswith('workshop bench top')]
    pumps = [obj for obj in centers if obj.name.lower().startswith('workshop pump skid')]
    tanks = [obj for obj in centers if obj.name.lower().startswith('vertical pressure vessel')]
    banks = [obj for obj in centers if obj.name.lower().startswith('machine backing')]
    lockers = [obj for obj in centers if obj.name.lower().startswith('secured weatherproof cargo locker')]
    drums = [obj for obj in centers if obj.name.lower().startswith('service drum')]
    gearboxes = [obj for obj in centers if obj.name.lower().startswith('suspended undercarriage reduction gearbox')]
    cabinets = [obj for obj in scene.objects if obj.type == 'EMPTY' and obj.name.startswith('Small utility cabinet')]
    desired = {}
    for obj in lockers + drums + gearboxes:
        center = centers[obj]
        target = Vector((center.x * xfactor, center.y + lift(center.y), center.z * zfactor))
        if obj in lockers + drums:
            lo, hi = boxes[obj]
            floor = min([8.83, 12.43, 16.03], key=lambda y: abs(y - (lo.y + lift(center.y))))
            target.y = floor + (hi.y - lo.y) / 2
        desired[obj] = target
    for obj in bench:
        center = centers[obj]
        x = 6.5 if center.x > 2 else -7.2 if center.x < -2 else 1.5
        desired[obj] = Vector((x, center.y + .6, -7 if center.z < 0 else 7.2))
    for obj in pumps:
        center = centers[obj]
        desired[obj] = Vector((4.5, center.y + .6, -2.8 if center.z < 0 else 2.8))
    for index, obj in enumerate(sorted(tanks, key=lambda item: centers[item].x)):
        center = centers[obj]
        desired[obj] = Vector((-8 + 4 * index, center.y + .6, 10.4))
    for index, obj in enumerate(sorted(banks, key=lambda item: centers[item].z)):
        center = centers[obj]
        desired[obj] = Vector((-9.5, center.y + .6, [-10.4, -6.8, 6.8, 10.4][index]))

    def assembly(obj):
        names = ' '.join(parent.name.lower() for parent in lineage(obj))
        if any(word in names for word in ['workshop bench', 'bench pedestal', 'service tool case']):
            return bench
        if any(word in names for word in ['workshop pump', 'pump cooling', 'volute pump', 'bent pump', 'discharge flanged', 'pump isolation', 'workshop loose']):
            return pumps
        if any(word in names for word in ['pressure vessel', 'pressure tank crown', 'tank pressure', 'pressure handwheel', 'instrument gauge', 'gauge needle']):
            return tanks
        if any(word in names for word in ['machine backing', 'starboard workshop machine vent', 'bay equipment status']):
            return banks
        if any(word in names for word in ['secured weatherproof cargo locker', 'cargo locker steel band', 'locker carry handle']):
            return lockers
        if any(word in names for word in ['service drum', 'drum strengthening bead']):
            return drums
        if any(word in names for word in ['suspended undercarriage reduction gearbox', 'belly-mounted drive motor', 'drive motor cooling fin', 'belly hydraulic return', 'underbody bundled control loom', 'heavy hanging service chain']):
            return gearboxes
        return []

    # Lamps, vents and instrument faces are rigid devices, not hull framing.
    for obj in scene.objects:
        if obj.type != 'EMPTY' or obj in rigid:
            continue
        if any(child.name.startswith('Weatherproof lamp housing') for child in obj.children) or obj.name.startswith(('Small utility cabinet', 'Starboard workshop machine vent')):
            family = assembly(obj)
            at = game(worlds[obj].translation)
            if family:
                closest = min(family, key=lambda item: (centers[item] - at).length_squared)
                rigid[obj] = rigid_delta(centers[closest], desired[closest])
            else:
                rigid[obj] = rigid_delta(at)

    leg_members = set()
    leg_deltas = {}
    for name in ['FrontLeft', 'FrontRight', 'RearLeft', 'RearRight']:
        hip = scene.objects.get('Leg_' + name + '_Hip')
        if not hip:
            continue
        point = game(worlds[hip].translation)
        delta = rigid_delta(point, Vector((point.x * xfactor, point.y, point.z * zfactor)))
        for obj in scene.objects:
            if obj.parent == root and obj.name.startswith('Leg_' + name + '_'):
                leg_deltas[obj] = delta
                leg_members.update([obj, *obj.children_recursive])

    targets = {}
    structure_words = ['beam', 'girder', 'column', 'post', 'partition', 'wall', 'hull', 'bulkhead', 'weather plate', 'floor', 'catwalk', 'guardrail', 'canvas', 'canopy', 'banner', 'cable', 'rope', 'hose', 'wire', 'conduit', 'manifold', 'utility main', 'tray', 'underfloor pressure accumulator']
    moved_assemblies = []
    for obj in scene.objects:
        if obj in leg_members:
            continue
        world = worlds[obj].copy()
        owned = next((parent for parent in reversed(list(lineage(obj))) if parent in rigid), None)
        if owned:
            world.translation += rigid[owned]
        elif obj in centers:
            # Detail objects authored outside their logical parent still move
            # with that assembly, keeping clamps and support posts attached.
            if obj.name.startswith(('Command tower segmented riser', 'Antenna cable clamp')):
                world.translation += rigid[scene.objects['CommandHouse_and_Navigation']]
                targets[obj] = world
                continue
            if obj.name.startswith(('Lookout tower cross brace', 'Lookout shelter support', 'Lookout shelter bracing')):
                world.translation += rigid[scene.objects['Lattice mast 0']]
                targets[obj] = world
                continue
            if obj.name.startswith('Cabinet control switch') and cabinets:
                closest = min(cabinets, key=lambda item: (game(worlds[item].translation) - centers[obj]).length_squared)
                world.translation += rigid[closest]
                targets[obj] = world
                continue
            family = assembly(obj)
            if family:
                closest = min(family, key=lambda item: (centers[item] - centers[obj]).length_squared)
                world.translation += rigid_delta(centers[closest], desired[closest])
            elif any(word in obj.name.lower() for word in structure_words) or belongs(obj, ['Chassis_StructuralFrame', 'Hull_WeatheredPanels', 'Canvas_and_Rigging']):
                if obj.data.users > 1:
                    obj.data = obj.data.copy()
                inverse = world.inverted()
                for vertex in obj.data.vertices:
                    vertex.co = inverse @ Vector(source(structural(game(world @ vertex.co))))
                obj.data.update()
            else:
                world.translation += rigid_delta(centers[obj])
        elif obj != root:
            world.translation = source(structural(game(world.translation)))
        targets[obj] = world
    for obj, delta in leg_deltas.items():
        world = worlds[obj].copy()
        world.translation += delta
        targets[obj] = world

    def depth(obj):
        return len(list(lineage(obj)))
    for obj in sorted(targets, key=depth):
        obj.matrix_world = targets[obj]
    scene.view_layers[0].update()
    for obj, target in desired.items():
        moved_assemblies.append({'name': obj.name, 'target': list(target)})
    print('V3_LAYOUT', {'removed': len(removed), 'equipment': moved_assemblies}, flush=True)
