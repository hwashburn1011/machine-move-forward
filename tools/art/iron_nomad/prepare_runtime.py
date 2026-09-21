"""Derive the playable Nomad without changing the delivered reference master.

Opens two internal stairwells, reserves the starter equipment, and exports an
exact static collision shell in game coordinates. Runtime owns deck/ramp floors.
Run with Blender --background --python tools/art/iron_nomad/prepare_runtime.py.
"""
import bpy, json, sys, os, runpy
from pathlib import Path
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BASE = ROOT / 'assets/iron-nomad'
OUT = BASE / 'gameplay'
for folder in ['source', 'exports', 'optimized']:
    (OUT / folder).mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(HERE))
import kit
profile = json.loads((ROOT / 'src/data/iron-nomad.json').read_text())
sx, sz, sy = profile['scale']
oy = profile['offsetY']
def game(v): return Vector((-v.x*sx, v.z*sz+oy, v.y*sy))
def source(v): return (-v[0]/sx, v[2]/sy, (v[1]-oy)/sz)
bpy.ops.wm.open_mainfile(filepath=str(BASE / 'source/IronNomad_Master.blend'))
scene = bpy.context.scene
root = bpy.data.objects['IronNomad_FourLegWalker']
if root.get('gameplayLayout'):
    raise RuntimeError('Playable derivation requires the untouched reference master')
root['gameplayLayout'] = profile['layout']
def remove(o): bpy.data.objects.remove(o, do_unlink=True)
for o in list(scene.objects):
    if 'steel floor panel' in o.name or 'Workshop inner rear partition' in o.name:
        remove(o)
bpy.data.objects['Twin_Exhaust_Furnaces'].location.y += 1.5
bpy.data.objects['Twin_Exhaust_Furnaces'].location.x += 2
scene.view_layers[0].update()
def bounds(o):
    pts = [game(o.matrix_world @ Vector(v)) for v in o.bound_box]
    return Vector(tuple(min(v[i] for v in pts) for i in range(3))), Vector(tuple(max(v[i] for v in pts) for i in range(3)))
# Rebuild every deck at the v3 dimensions, keeping machinery assemblies intact.
from expand_decks import expand_reference
from build_deck_access import build_access
expand_reference(scene, root, profile, game, source)
module, box = build_access(scene, root, profile, kit, game, source)
from refine_service_details import refine_services
service_report = refine_services(scene, root, profile, kit, game, source)
(OUT / "source/service-detail-report.json").write_text(json.dumps(service_report, indent=2))

def cut(name, at, size, candidates):
    cutter=box(name,at,size,bevel=0); bpy.context.view_layer.update()
    lo,hi=bounds(cutter)
    count=0
    for o in candidates:
        if o.type!='MESH' or o==cutter: continue
        a,b=bounds(o)
        if any(b[i]<=lo[i] or a[i]>=hi[i] for i in range(3)): continue
        bpy.context.view_layer.objects.active=o
        if o.data.users > 1: o.data=o.data.copy()
        mod=o.modifiers.new('Playable clearance','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
        bpy.ops.object.modifier_apply(modifier=mod.name); count+=1
    remove(cutter); print(name,count,flush=True)

for y in [12.43,16.03]:
    candidates=[o for o in scene.objects if any(s in o.name.lower() for s in ['beam','girder','flange','partition'])]
    cut('Internal stair structural clearance',(-2,y-.35,0),(2.22,1.15,5.1),candidates)
rails=[o for o in scene.objects if any(s in o.name.lower() for s in ['guardrail','toe guard']) and o.parent!=module]
cut('Starboard expedition gate',(profile['walkable']['upper']['halfWidth'],16.6,0),(.7,1.5,2.3),rails)
# Side stairs open into each floor through full-height doorways.
for y in [8.83,12.43,16.03]:
    for z in [-3.7,3.7]:
        candidates=[o for o in scene.objects if o.parent!=module and any(s in o.name.lower() for s in ['plate','panel','hull','beam','girder','bulkhead'])]
        cut('Port walkway doorway',(-11,y+1.15,z),(1.5,2.3,2.6),candidates)
scene.view_layers[0].update()
# The finite runtime housings and triangle export share these exact evaluated
# bounds; regenerate alongside geometry instead of retaining v1 obstructions.
shared_path=ROOT/'src/data/iron-nomad-shared-solids.json'
shared=json.loads(shared_path.read_text())
for solid in shared:
    lo,hi=bounds(scene.objects[solid['sourceObject']]);solid['min']=list(lo);solid['max']=list(hi)
shared_path.write_text(json.dumps(shared,indent=2))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source/IronNomad_Master.blend'))
contract=json.loads((BASE/'source/manifest.json').read_text())
contract['layout']=profile['layout']
contract['proxies']=[]
contract['runtimeCollisionAsset']='iron-nomad-collision.glb'
contract['collisionCoordinates']='Game Y-up metres; deck/ramp/rail support comes from iron-nomad-side-stairs.json and runtime Machine geometry'
(OUT/'source/manifest.json').write_text(json.dumps(contract,indent=2))

# One exporter owns the authored/runtime collision boundary.
from export_collision import export_collision
export_collision(scene)
os.environ['MMF_NOMAD_OUT']=str(OUT)
runpy.run_path(str(HERE/'export.py'),run_name='__main__')
