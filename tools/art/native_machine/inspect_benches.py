"""Measure the six original benches, loose cases and their shared native batches."""
import bpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
PREFIXES=('Workshop bench top','Bench pedestal','Service tool case','Workbench ')
profile=json.loads((ROOT/'src/data/iron-nomad.json').read_text());sx,sz,sy=profile['scale'];oy=profile['offsetY']
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/iron-nomad/gameplay/source/IronNomad_Master.blend'));bpy.context.view_layer.update();source=[]
for obj in bpy.context.scene.objects:
    if obj.type!='MESH' or not obj.name.startswith(PREFIXES):continue
    ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh()
    pts=[obj.matrix_world@v.co for v in mesh.vertices];pts=[(-p.x*sx,p.z*sz+oy,p.y*sy) for p in pts]
    source.append({'name':obj.name,'min':[min(p[i] for p in pts) for i in range(3)],'max':[max(p[i] for p in pts) for i in range(3)]});ev.to_mesh_clear()
boxes=[]
for x in [-7.2,1.5,6.5]:
    for z in [-7,7.2]:
        group=[s for s in source if abs((s['min'][0]+s['max'][0])/2-x)<1.4 and abs((s['min'][2]+s['max'][2])/2-z)<1]
        boxes.append({'site':[x,12.43,z],'min':[min(s['min'][i] for s in group) for i in range(3)],'max':[max(s['max'][i] for s in group) for i in range(3)]})
def selected(p):return any(all(b['min'][i]-.003<p[i]<b['max'][i]+.003 for i in range(3)) for b in boxes)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/runtime/machine.glb'));bpy.context.view_layer.update();native=[]
for obj in bpy.context.scene.objects:
    if obj.type!='MESH':continue
    chosen=set()
    for v in obj.data.vertices:
        p=obj.matrix_world@v.co
        if selected((p.x,p.z,-p.y)):chosen.add(v.index)
    if not chosen:continue
    partial=sum(any(v in chosen for v in face.vertices) and not all(v in chosen for v in face.vertices) for face in obj.data.polygons)
    native.append({'name':obj.name,'selectedVertices':len(chosen),'totalVertices':len(obj.data.vertices),'partialFaces':partial,'materials':[m.name for m in obj.data.materials]})
result={'source':source,'boxes':boxes,'native':native}
(ROOT/'test-results/godot-native/benches-inspection.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print('BENCH_INSPECTION',json.dumps({'boxes':boxes,'native':native}),flush=True)
