"""Read the four original electrical assemblies and their frozen native batches."""
import bpy,bmesh,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'test-results/godot-native'
profile=json.loads((ROOT/'src/data/iron-nomad.json').read_text());sx,sz,sy=profile['scale'];oy=profile['offsetY']
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/iron-nomad/gameplay/source/IronNomad_Master.blend'));bpy.context.view_layer.update()
prefixes=['Fore electrical distribution A','Fore electrical distribution B','Starboard service controls A','Starboard service controls B']
source=[];boxes=[]
def bounds(points):return {'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]}
for o in bpy.context.scene.objects:
    if not any(o.name.startswith(p) for p in prefixes):continue
    ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());m=ev.to_mesh()
    if not m:continue
    pts=[o.matrix_world@v.co for v in m.vertices];pts=[Vector((-p.x*sx,p.z*sz+oy,p.y*sy)) for p in pts]
    source.append({'name':o.name,**bounds(pts)});ev.to_mesh_clear()
for p in prefixes:
    parts=[s for s in source if s['name'].startswith(p)];boxes.append({'name':p,'min':[min(s['min'][i] for s in parts) for i in range(3)],'max':[max(s['max'][i] for s in parts) for i in range(3)]})
def selected(p):return any(all(b['min'][i]-.003<p[i]<b['max'][i]+.003 for i in range(3)) for b in boxes)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/runtime/machine.glb'));bpy.context.view_layer.update();native=[]
for o in bpy.context.scene.objects:
    if o.type!='MESH':continue
    def game(v):
        p=o.matrix_world@v;return Vector((p.x,p.z,-p.y))
    chosen=[v.index for v in o.data.vertices if selected(game(v.co))]
    if not chosen:continue
    index_set=set(chosen);partial=sum(any(v in index_set for v in f.vertices) and not all(v in index_set for v in f.vertices) for f in o.data.polygons)
    o.data.calc_loop_triangles();native.append({'name':o.name,'vertices':len(o.data.vertices),'selectedVertices':len(chosen),'partialFaces':partial,'triangles':len(o.data.loop_triangles),'materials':[m.name for m in o.data.materials]})
result={'source':source,'boxes':boxes,'native':native};(OUT/'switchgear-inspection.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print('SWITCHGEAR_INSPECTION',json.dumps({'boxes':boxes,'native':native}),flush=True)
