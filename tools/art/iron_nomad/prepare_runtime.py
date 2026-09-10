"""Derive the playable Nomad without changing the delivered reference master.

Opens two internal stairwells, reserves the starter equipment, and exports an
exact static collision shell in game coordinates. Runtime owns deck/ramp floors.
Run with Blender --background --python tools/art/iron_nomad/prepare_runtime.py.
"""
import bpy, json, sys, os, runpy, shutil
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
for o in list(scene.objects):
    if o.type not in ['MESH', 'CURVE']: continue
    lo, hi = bounds(o); c=(lo+hi)*.5
    if 11.7 < c.y < 14.2 and 2.7 < c.z < 3.9 and -3.1 < c.x < .1:
        if any(s in o.name.lower() for s in ['bench', 'pressure', 'tank crown', 'instrument gauge', 'gauge needle', 'service tool case']):
            o.location.x -= 2.6/sx
    if 11.7 < c.y < 14.2 and .2 < c.z < 2.7 and -3.1 < c.x < -.2:
        if any(s in o.name.lower() for s in ['pump', 'discharge', 'service hose']):
            o.location.x -= 3.5/sx
    if c.y > 14.7 and c.y < 17 and c.z > 4.6 and (abs(c.x-4)<1.5 or abs(c.x)<1.65):
        if any(s in o.name.lower() for s in ['cargo locker', 'cargo box', 'locker', 'cargo restraint']): remove(o)

module = kit.group('Gameplay_Decks_And_Access', parent=root); module['module']=True
def mat(part):
    return next(m for m in bpy.data.materials if part in m.name)
steel=mat('Charcoal_Steel'); brass=mat('Worn_HandrailBrass')
def box(name, at, size, material=steel, parent=module, bevel=.012):
    return kit.box(name, source(at), (size[0]/sx,size[2]/sy,size[1]/sz), material, parent, bevel=bevel)
for level in [-2,-1,0]:
    y=profile['deckSurface']+level*3
    rects=[(-6,6,-8,8)] if level==-2 else [(-6,-3,-8,8),(-1,6,-8,8),(-3,-1,-8,-2),(-3,-1,2,8)]
    for n,(x0,x1,z0,z1) in enumerate(rects):
        box(f'Playable deck {level} section {n}',((x0+x1)/2,y-.09,(z0+z1)/2),(x1-x0,.18,z1-z0))
    if level < 0:
        for i in range(20):
            top=y+(i+1)*.15
            box(f'Internal stair {level} tread {i}',(-2,top-.04,-2+(i+.5)*.2),(1.92,.08,.21))
    if level > -2:
        for x in [-3.05,-.95]:
            for h in [.45,.98]: box('Stairwell guardrail',(x,y+h,0),(.045,.045,4.15),brass)
            for z in [-2,0,2]: box('Stairwell guard post',(x,y+.5,z),(.06,1,.06),brass)

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

for y in [11.83,14.83]:
    candidates=[o for o in scene.objects if any(s in o.name.lower() for s in ['beam','girder','flange','partition'])]
    cut('Internal stair structural clearance',(-2,y-.35,0),(2.22,1.15,4.3),candidates)
rails=[o for o in scene.objects if any(s in o.name.lower() for s in ['guardrail','toe guard']) and o.parent!=module]
cut('Starboard expedition gate',(6.975,15.4,0),(.7,1.5,2.3),rails)
scene.view_layers[0].update()
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source/IronNomad_Master.blend'))
shutil.copyfile(BASE/'source/manifest.json', OUT/'source/manifest.json')

# Static collision is evaluated from substantial authored surfaces, with bolts,
# textiles and moving limbs omitted. No invisible coarse box across an open bay.
def owner(o):
    p=o.parent
    while p and not p.get('module'): p=p.parent
    return p.name if p else ''
vertices=[]; faces=[]; obstacles=[]; used=[]
dg=bpy.context.evaluated_depsgraph_get()
for o in list(scene.objects):
    if o.type!='MESH': continue
    own=owner(o); name=o.name.lower()
    if own.startswith('Leg_') or own in ['Gameplay_Decks_And_Access','Canvas_and_Rigging','Lamps_and_UtilityTowers','Communications_Masts']: continue
    if any(s in name for s in ['walking ledge','bolt','rivet','cable','wire','paint chip','decals','label','rope','lamp','light','antenna']): continue
    lo,hi=bounds(o); size=hi-lo
    if size.x*size.y*size.z < .035 and 'stair tread' not in name: continue
    m=bpy.data.meshes.new_from_object(o.evaluated_get(dg),depsgraph=dg); m.calc_loop_triangles()
    start=len(vertices); vertices.extend(tuple(game(o.matrix_world@v.co)) for v in m.vertices)
    faces.extend(tuple(start+j for j in t.vertices) for t in m.loop_triangles)
    bpy.data.meshes.remove(m);used.append(o.name)
    if size.x>.4 and size.z>.4 and own not in ['Chassis_StructuralFrame','Decks_and_PerimeterCatwalks','External_Stairs_Ladders']:
        for level in [-2,-1,0]:
            floor=profile['deckSurface']+3*level
            if hi.y>floor+.35 and lo.y<floor+1.9:
                obstacles.append({'level':level,'minX':round(lo.x,3),'maxX':round(hi.x,3),'minZ':round(lo.z,3),'maxZ':round(hi.z,3)})
collision=bpy.data.scenes.new('Playable collision in game coordinates');bpy.context.window.scene=collision
m=bpy.data.meshes.new('Nomad static collision');m.from_pydata(vertices,[],faces);m.update()
o=bpy.data.objects.new('IronNomad_StaticCollision',m);collision.collection.objects.link(o)
o.select_set(True);bpy.context.view_layer.objects.active=o
bpy.ops.export_scene.gltf(filepath=str(OUT/'exports/iron-nomad-collision.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=False,export_materials='NONE',export_animations=False)
(ROOT/'src/data/iron-nomad-obstacles.json').write_text(json.dumps(obstacles,separators=(',',':')))
(OUT/'source/gameplay-manifest.json').write_text(json.dumps({'profile':profile,'collisionTriangles':len(faces),'collisionObjects':used},indent=2))
print('COLLISION COMPLETE',len(faces),len(used),flush=True)
os.environ['MMF_NOMAD_OUT']=str(OUT)
runpy.run_path(str(HERE/'export.py'),run_name='__main__')
