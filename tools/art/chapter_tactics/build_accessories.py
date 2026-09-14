"""Retain the reference Sovereign orb; author a matching exposed Bastion cooling pack."""
import bpy
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'assets/chapter-tactics'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(str(ROOT / 'assets/mech-enemies/source/sovereign.blend'), link=False) as (source, dest):
    dest.objects = [name for name in source.objects if 'Drone' in name]
for obj in dest.objects:
    if obj: bpy.context.collection.objects.link(obj)
bpy.context.view_layer.update()
equipment = bpy.data.objects.get('Sovereign_Drone')
assert equipment, 'The reference drone must be present in the authored Sovereign'
parts = [o for o in equipment.children_recursive if o.type == 'MESH']
assert parts
equipment_inverse = equipment.matrix_world.inverted()
for obj in parts:
    matrix = equipment_inverse @ obj.matrix_world
    obj.parent = None
    obj.matrix_world = matrix
for obj in list(bpy.context.scene.objects):
    if obj not in parts:
        bpy.data.objects.remove(obj, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in parts: obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
drone = bpy.context.object
drone.name = 'SupportDrone'
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
coords = [drone.matrix_world @ Vector(v) for v in drone.bound_box]
low = Vector([min(v[i] for v in coords) for i in range(3)])
high = Vector([max(v[i] for v in coords) for i in range(3)])
centre = (low + high) / 2
scale = .48 / max(high - low)
for vertex in drone.data.vertices:
    vertex.co = ((drone.matrix_world @ vertex.co) - centre) * scale
drone.matrix_world.identity()
drone['source'] = 'Reference-matched Sovereign armored optical orb; independently targetable'

def material(name, color, metal, rough, glow=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    p.inputs['Emission Color'].default_value = (*color, 1)
    p.inputs['Emission Strength'].default_value = glow
    return mat

steel = material('MECH_VentSteel', (.12, .135, .145), .85, .42)
paint = material('MECH_VentPaint', (.28, .23, .14), .65, .68)
dark = material('MECH_VentRecess', (.018, .023, .027), .45, .8)
hot = material('MECH_VentHeat', (1, .20, .015), .2, .4, 4)
vent = bpy.data.objects.new('CoolingVent', None)
bpy.context.collection.objects.link(vent)

def box(name, position, dimensions, mat, bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Machined edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for face in obj.data.polygons: face.use_smooth = True
    obj.parent = vent
    return obj

# Blender -Y faces forward, matching the character source. Runtime is glTF -Z.
box('Cooling pack cast housing', (0, 0, 0), (.42, .18, .38), paint, .027)
box('Inset heat chamber', (0, -.102, 0), (.34, .03, .29), dark)
for i in range(6):
    box('Exposed amber radiator', (0, -.125, -.112 + i*.045), (.285, .022, .019), hot, .004)
for x in [-.17, .17]:
    box('Radiator retaining rail', (x, -.14, 0), (.025, .025, .29), steel, .006)
    for z in [-.12, .12]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=.015, location=(x, -.16, z))
        obj = bpy.context.object
        obj.name = 'Captive mounting bolt'
        obj.data.materials.append(steel)
        obj.parent = vent
for z in [-.167, .167]:
    box('Armored vent rim', (0, -.125, z), (.35, .03, .022), steel)

# Join by material: five meshes for the whole accessory pack, shared by all instances.
for mat in [steel, paint, dark, hot]:
    meshes = [o for o in vent.children if o.type == 'MESH' and o.data.materials[0] == mat]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes: obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    bpy.context.object.name = mat.name
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'tactical-accessories.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/authored/tactical-accessories.glb'), export_format='GLB', export_animations=False)
print('TACTICAL ACCESSORIES COMPLETE', flush=True)
