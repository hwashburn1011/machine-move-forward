"""Measure the original pump assemblies and locate complete frozen components."""
import bpy,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
PREFIXES=('Workshop pump','Pump cooling','Volute pump','Bent pump','Discharge flanged','Pump isolation','Workshop loose','Pump anti-vibration','Pump skid','Pump motor saddle','Pump valve')
profile=json.loads((ROOT/'src/data/iron-nomad.json').read_text());sx,sz,sy=profile['scale'];oy=profile['offsetY']
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/iron-nomad/gameplay/source/IronNomad_Master.blend'));bpy.context.view_layer.update()
source=[]
for obj in bpy.context.scene.objects:
    if obj.type!='MESH' or not obj.name.startswith(PREFIXES):continue
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
    points=[obj.matrix_world@v.co for v in mesh.vertices];points=[(-p.x*sx,p.z*sz+oy,p.y*sy) for p in points]
    source.append({'name':obj.name,'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]});evaluated.to_mesh_clear()
boxes=[]
for z in [-2.8,2.8]:
    group=[s for s in source if abs((s['min'][2]+s['max'][2])/2-z)<2.0]
    boxes.append({'site':[4.5,12.43,z],'min':[min(s['min'][i] for s in group) for i in range(3)],'max':[max(s['max'][i] for s in group) for i in range(3)]})
def selected(p):return any(all(b['min'][i]-.003<p[i]<b['max'][i]+.003 for i in range(3)) for b in boxes)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/runtime/machine.glb'));bpy.context.view_layer.update();native=[]
for obj in bpy.context.scene.objects:
    if obj.type!='MESH':continue
    chosen=[]
    for v in obj.data.vertices:
        p=obj.matrix_world@v.co
        if selected((p.x,p.z,-p.y)):chosen.append(v.index)
    if not chosen:continue
    ids=set(chosen);partial=sum(any(v in ids for v in face.vertices) and not all(v in ids for v in face.vertices) for face in obj.data.polygons)
    native.append({'name':obj.name,'selectedVertices':len(ids),'totalVertices':len(obj.data.vertices),'partialFaces':partial,'materials':[m.name for m in obj.data.materials]})
result={'source':source,'boxes':boxes,'native':native}
(ROOT/'test-results/godot-native/pumps-inspection.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print('PUMP_INSPECTION',json.dumps({'boxes':boxes,'native':native}),flush=True)
