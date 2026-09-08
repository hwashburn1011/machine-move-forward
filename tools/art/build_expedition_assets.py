"""Original expedition artwork. Run with Blender --background --python this file.

Uses the same metre-space helpers and muted industrial palette as the defense pack.
The wreck's geometry deliberately mirrors src/data/story.ts's box collider contract.
"""
import sys
import math
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_assets import (bpy, Vector, ROOT, OUT, SOURCE, PREVIEW, M, vec, material,
                          clear, empty, box, cylinder, merge_static_by_parent, save_asset)


def lettering(name, text, at, size, parent, facing='front'):
    data = bpy.data.curves.new(name, 'FONT')
    data.body, data.size, data.align_x, data.extrude = text, size, 'CENTER', .0005
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = vec(at)
    # Text local +Z points toward game -Z for a front panel; floor faces game +Y.
    obj.rotation_euler = (math.pi / 2, 0, math.pi) if facing == 'front' else (0, 0, 0)
    obj.data.materials.append(M['Ivory'])
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.parent = parent
    obj.select_set(False)
    return obj


def make_radio():
    root = empty('MMF_SalvagedRadio')
    root['authoredPalette'] = True
    # The salvaged box gets a simple bolted deck stand; no buildable grid footprint.
    box('Bolted stand foot', (0, .055, 0), (.58, .11, .42), 'Dark_Steel', root)
    cylinder('Stand', (0, .1, 0), (0, .83, 0), .07, 'Bare_Steel', root)
    box('Mounting tray', (0, .85, 0), (.7, .055, .43), 'Dark_Steel', root, bevel=.01)
    box('Olive receiver case', (0, 1.07, 0), (.68, .4, .37), 'Paint_Sage', root, bevel=.04)
    box('Inset black face', (0, 1.07, -.19), (.60, .30, .025), 'Dark_Steel', root, bevel=.016)
    box('Tuning glass', (-.10, 1.13, -.209), (.31, .09, .014), 'Canvas_Dark', root, bevel=.008)
    for i in range(11):
        box('Frequency tick', (-.235 + i * .027, 1.137, -.22), (.004, .028 if i % 2 else .045, .004), 'Ivory', root, bevel=0)
    box('Needle', (-.08, 1.13, -.224), (.008, .073, .006), 'Paint_Ochre', root, bevel=0)
    for x, radius in [(.20, .057), (-.23, .027), (-.13, .027)]:
        cylinder('Tuning dial', (x, 1.02, -.215), (x, 1.02, -.254), radius, 'Rubber', root, vertices=16)
        box('Dial index', (x, 1.02 + radius * .5, -.257), (.006, radius * .5, .004), 'Ivory', root, bevel=0)
    for i in range(5):
        box('Speaker grille', (.045 + i * .024, 1.055, -.222), (.010, .17, .008), 'Bare_Steel', root, bevel=.003)
    lamp = empty('SignalLamp', (.24, 1.17, -.223), root)
    bpy.context.view_layer.update()
    box('Signal bulb', (.24, 1.17, -.223), (.025, .025, .012), 'Lens_Amber', lamp, bevel=.006)
    cylinder('Whip antenna', (.25, 1.27, .10), (.32, 1.88, .10), .009, 'Bare_Steel', root, vertices=8)
    cylinder('Antenna socket', (.25, 1.24, .10), (.26, 1.34, .10), .025, 'Rubber', root)
    for x in [-.27, .27]:
        cylinder('Carry handle side', (x, 1.23, 0), (x, 1.36, 0), .014, 'Bare_Steel', root)
    cylinder('Carry handle grip', (-.27, 1.36, 0), (.27, 1.36, 0), .02, 'Rubber', root)
    for x in [-.24, .24]:
        for z in [-.15, .15]:
            cylinder('Foot bolt', (x, .11, z), (x, .13, z), .018, 'Bare_Steel', root, vertices=6)
    lettering('Receiver nameplate', 'RELAY / 07', (-.07, .938, -.211), .032, root)
    merge_static_by_parent()
    return root


def make_wreck():
    root = empty('MMF_ExpeditionWreck')
    root['authoredPalette'] = True
    root['floorSurfaceY'] = 0
    box('Walkable deck', (0, -.10, 0), (12, .2, 18), 'Paint_Sage', root, bevel=0)
    # Structural ribs below the deck make this read as a stranded walker section.
    for x in [-5.2, 0, 5.2]:
        box('Underframe beam', (x, -.6, 0), (.45, .95, 17.6), 'Rust', root, bevel=.04)
    for z in [-7, -3, 3, 7]:
        box('Underframe cross member', (0, -.38, z), (11.6, .48, .4), 'Dark_Steel', root)
    for x in [-4.5, 4.5]:
        for z in [-6.5, 6.5]:
            cylinder('Broken support', (x, -.4, z), (x * 1.12, -3.8, z + .4), .37, 'Rust', root)
            box('Sunken foot', (x * 1.12, -3.7, z + .4), (1.5, .25, 1.7), 'Dark_Steel', root)
    # Wall faces and door openings match the collider list exactly.
    for x in [-5.9, 2]:
        for z in [-5, 5]:
            box('Entry wall' if x < 0 else 'Engineering bulkhead', (x, 1.25, z), (.2, 2.5, 8), 'Paint_Sage', root, bevel=0)
    box('Outer starboard wall', (5.9, 1.25, 0), (.2, 2.5, 18), 'Rust', root, bevel=0)
    for z in [-8.9, 8.9]:
        box('End bulkhead', (0, 1.25, z), (12, 2.5, .2), 'Paint_Sage', root, bevel=0)
    # Headers start at 2.5m, well above capsule clearance; roof is intentionally torn away.
    for x in [-5.9, 2]:
        box('Door lintel', (x, 2.63, 0), (.25, .26, 2.2), 'Paint_Ochre', root, bevel=.012)
        for z in [-1.10, 1.10]:
            box('Door jamb stripe', (x - .12, 1.15, z), (.025, 2.3, .09), 'Paint_Ochre', root, bevel=0)
    for z in [-8.78, 8.78]:
        for x in [-5, -2.5, 0, 2.5, 5]:
            box('Wall stiffener', (x, 1.25, z), (.1, 2.5, .05), 'Dark_Steel', root, bevel=.01)
    for x in [-5.78, 5.78]:
        for z in [-7.5, -4, 4, 7.5]:
            box('Side stiffener', (x, 1.25, z), (.05, 2.5, .1), 'Dark_Steel', root, bevel=.01)
    # Flush floor seams and lane paint never create invisible trip hazards.
    for x in range(-4, 6, 2):
        box('Deck joint', (x, .002, 0), (.015, .003, 17.6), 'Dark_Steel', root, bevel=0)
    for z in [-6, -3, 3, 6]:
        box('Deck joint', (0, .002, z), (11.6, .003, .015), 'Dark_Steel', root, bevel=0)
    for z in [-.78, .78]:
        box('Clear gangway lane', (-.2, .005, z), (10.8, .005, .065), 'Paint_Ochre', root, bevel=0)
    # Three solid props have exact matching colliders; all other dressings hug walls.
    for name, at, size in [('Salvage crates', (-1, .55, -5.8), (2.2, 1.1, 2.2)),
                           ('Aft cargo chest', (-2, .4, 5.8), (2.8, .8, 1.6))]:
        box(name, at, size, 'Canvas_Dark', root, bevel=.03)
        for dx in [-size[0] * .32, size[0] * .32]:
            box('Cargo binding', (at[0] + dx, at[1], at[2]), (.06, size[1] + .014, size[2] + .014), 'Paint_Ochre', root, bevel=.003)
    box('Gyro pedestal', (4.5, .45, 3), (.9, .9, .9), 'Dark_Steel', root, bevel=.04)
    box('Pedestal cap', (4.5, .89, 3), (.88, .02, .88), 'Bare_Steel', root, bevel=.01)
    gyro = empty('CourseGyro', (4.5, .92, 3), root)
    bpy.context.view_layer.update()
    cylinder('Gyro spindle', (4.5, .92, 3), (4.5, 1.34, 3), .095, 'Paint_Ochre', gyro)
    for y, radius in [(1.01, .27), (1.16, .33), (1.31, .22)]:
        cylinder('Gyro disc', (4.5, y, 3), (4.5, y + .045, 3), radius, 'Bare_Steel', gyro, vertices=24)
    box('Gyro status', (4.5, 1.37, 3), (.12, .06, .12), 'Lens_Amber', gyro, bevel=.025)
    # Damaged overhead arch: readable silhouette without blocking the camera in rooms.
    for x in [-4.8, 4.8]:
        cylinder('Fractured canopy upright', (x, 2.5, -7.7), (x, 4.1, -7.7), .08, 'Dark_Steel', root)
    box('Torn canopy beam', (0, 4.05, -7.7), (9.8, .18, .2), 'Rust', root)
    for x in [-4.4, -3.6, -2.8]:
        box('Remaining canopy strip', (x, 3.98, -7.9), (.67, .035, 1.5), 'Paint_Sage', root, bevel=.005)
    # Optional journals are recognizable amber slates, kept on the solid cargo props.
    for ident, at in [('JournalCargo', (-1, 1.115, -5.8)), ('JournalCrew', (-2, .815, 5.8))]:
        slate = empty(ident, at, root)
        bpy.context.view_layer.update()
        box('Log slate', at, (.38, .025, .29), 'Paint_Ochre', slate, bevel=.012)
        box('Log face', (at[0], at[1] + .017, at[2]), (.30, .006, .21), 'Canvas_Dark', slate, bevel=.006)
    route = empty('JournalRoute', (-5.74, 1.05, -2), root)
    bpy.context.view_layer.update()
    box('Route sheet backing', (-5.755, 1.05, -2), (.025, .44, .32), 'Paint_Ochre', route, bevel=.012)
    box('Route sheet', (-5.738, 1.05, -2), (.006, .36, .25), 'Ivory', route, bevel=.005)
    for y in [.95, 1.03, 1.11]:
        box('Route annotation', (-5.733, y, -2), (.005, .012, .17), 'Canvas_Dark', route, bevel=0)
    # External machinery gives the stranded hull a distinctive damaged silhouette.
    for z in [-5.2, 5.2]:
        cylinder('Seized auxiliary drum', (6.02, .9, z), (6.7, .9, z), .68, 'Dark_Steel', root, vertices=20)
        cylinder('Drum end plate', (6.7, .9, z), (6.74, .9, z), .52, 'Rust', root, vertices=20)
        for y in [.5, 1.3]:
            cylinder('Bypass pipe', (6.25, y, z - 1.4), (6.25, y, z + 1.4), .06, 'Bare_Steel', root)
    for z in [-7, -4, 4, 7]:
        box('Exterior repair patch', (-6.012, .75, z), (.026, 1.1, .75), 'Rust', root, bevel=.012)
    for x, z, width in [(-4, -8.92, 2.4), (1, 8.92, 1.7), (4, 8.92, .8)]:
        box('Oxidized end patch', (x, .65, z), (width, .9, .024), 'Rust', root, bevel=.008)
    lettering('Cargo floor marking', '07 / RELAY TENDER', (-1.5, .009, -3.2), .42, root, 'floor')
    lettering('Engineering floor marking', 'GYRO', (4, .009, 1.7), .34, root, 'floor')
    gangway = empty('Gangway', (-6.5, -.08, 0), root)
    bpy.context.view_layer.update()
    box('Gangway plate', (-6.5, -.08, 0), (1, .16, 2), 'Dark_Steel', gangway, bevel=0)
    for z in [-.9, .9]:
        box('Gangway edge paint', (-6.5, .003, z), (1, .006, .10), 'Paint_Ochre', gangway, bevel=0)
    for x in [-6.8, -6.5, -6.2]:
        box('Gangway grip strip', (x, .006, 0), (.025, .008, 1.7), 'Bare_Steel', gangway, bevel=0)
    merge_static_by_parent()
    return root


def render_review():
    clear()
    for stem, at, scale in [('expedition-wreck', (0, 0, 0), 1), ('salvaged-radio', (-9, 0, -4), 2.6)]:
        before = set(bpy.context.scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(OUT / f'{stem}.glb'))
        carrier = empty(stem + '_Review', at)
        carrier.scale = (scale, scale, scale)
        for obj in set(bpy.context.scene.objects) - before:
            if obj is not carrier and obj.parent is None:
                obj.parent = carrier
    M['Stage'] = material('Stage', '77786c', 0, .88)
    box('Studio ground', (0, -3.85, 0), (200, .1, 200), 'Stage', bevel=0)
    world = bpy.context.scene.world or bpy.data.worlds.new('Desert studio')
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.15, .20, .26, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .6
    for name, pos, power, size, color in [('Key', (-14, 20, -12), 7500, 13, (1, .85, .66)),
                                           ('Fill', (12, 14, 2), 6000, 12, (.63, .8, 1)),
                                           ('Edge', (0, 14, 18), 6000, 10, (1, .92, .8))]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.shape, data.size, data.color = power, 'DISK', size, color
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = vec(pos)
        obj.rotation_euler = (-obj.location).to_track_quat('-Z', 'Y').to_euler()
    camera = bpy.data.objects.new('Expedition review camera', bpy.data.cameras.new('Expedition review camera'))
    bpy.context.collection.objects.link(camera)
    camera.location = vec((-21, 23, -26))
    camera.rotation_euler = (vec((-1, .1, 0)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type, camera.data.ortho_scale = 'ORTHO', 30
    scene = bpy.context.scene
    scene.camera, scene.render.engine = camera, 'CYCLES'
    scene.cycles.samples, scene.cycles.use_denoising = 32, True
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1600, 1100, 100
    scene.view_settings.view_transform = 'AgX'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(PREVIEW / 'expedition-pack.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'expedition-review.blend'))
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    manifest = []
    for stem, factory in [('salvaged-radio', make_radio), ('expedition-wreck', make_wreck)]:
        clear()
        factory()
        bpy.context.view_layer.update()
        save_asset(stem)
        manifest.append({'asset': stem, 'bytes': (OUT / f'{stem}.glb').stat().st_size,
                         'triangles': sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type == 'MESH')})
    (PREVIEW / 'expedition-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('MMF_EXPEDITION_ASSETS', json.dumps(manifest))
    render_review()
