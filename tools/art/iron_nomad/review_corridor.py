"""Create a cutaway review of the corrected middle-deck workbench assemblies."""
import bpy, json, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'test-results/nomad-corridor-review'
OUT.mkdir(parents=True, exist_ok=True)
profile = json.loads((ROOT / 'src/data/iron-nomad.json').read_text())
sx, sz, sy = profile['scale']
oy = profile['offsetY']
def source(v): return Vector((-v[0]/sx, v[2]/sy, (v[1]-oy)/sz))
def game(v): return Vector((-v.x*sx, v.z*sz+oy, v.y*sy))

bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'assets/iron-nomad/gameplay/source/IronNomad_Master.blend'))
scene = bpy.context.scene
scene.name = 'Nomad middle deck - corrected workbench review'
scene.view_layers[0].update()
assembly = []
for obj in list(scene.objects):
    if obj.type not in ['MESH', 'CURVE', 'FONT']: continue
    points = [game(obj.matrix_world @ Vector(v)) for v in obj.bound_box]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    # Review cutaway only. The editable/runtime sources remain complete.
    obj.hide_render = low.y > 14.2 or high.y < 11.55
    if any(s in obj.name.lower() for s in ['bench top', 'bench pedestal']):
        assembly.append({'name': obj.name, 'min': list(low), 'max': list(high)})
world = bpy.data.worlds.new('Workshop inspection neutral sky')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (.18, .22, .28, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
scene.world = world
for name, at, watts, color in [
    ('Inspection key', (0, 17, 0), 1800, (1, .81, .62)),
    ('Inspection front fill', (1, 14, -5), 1200, (.65, .8, 1)),
]:
    data = bpy.data.lights.new(name, 'AREA'); data.energy = watts; data.shape = 'DISK'; data.size = 7
    data.color = color
    obj = bpy.data.objects.new(name, data); scene.collection.objects.link(obj)
    obj.location = source(at)
    obj.rotation_euler = (source((0, 12.3, 3.1))-obj.location).to_track_quat('-Z', 'Y').to_euler()
data = bpy.data.cameras.new('Middle deck review camera')
camera = bpy.data.objects.new('Middle deck review camera', data); scene.collection.objects.link(camera)
camera.location = source((.1, 14.7, -3.7))
camera.rotation_euler = (source((.05, 12.3, 3.3))-camera.location).to_track_quat('-Z', 'Y').to_euler()
data.lens = 28; data.clip_start = .05
scene.camera = camera
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 24
scene.cycles.use_denoising = True; scene.cycles.max_bounces = 4
scene.render.threads_mode = 'FIXED'; scene.render.threads = 6
scene.render.resolution_x = 1200; scene.render.resolution_y = 800; scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'; scene.render.filepath = str(OUT / 'workshop.png')
scene.view_settings.view_transform = 'AgX'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'NomadCorridorReview.blend'))
(OUT / 'assemblies.json').write_text(json.dumps(assembly, indent=2))
if '--no-render' not in sys.argv: bpy.ops.render.render(write_still=True)
print('NOMAD_CORRIDOR_REVIEW', str(OUT), flush=True)
