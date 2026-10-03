"""Read-only measurements of the original fan assembly and native articulation."""
import bpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
profile=json.loads((ROOT/'src/data/iron-nomad.json').read_text());sx,sz,sy=profile['scale'];oy=profile['offsetY']
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/iron-nomad/gameplay/source/IronNomad_Master.blend'));bpy.context.view_layer.update();fan=bpy.data.objects['Front_Turbine_Housing'];source=[]
def measure(obj,convert):
    ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();points=[convert(obj.matrix_world@v.co) for v in mesh.vertices]
    result={'name':obj.name,'parent':obj.parent.name if obj.parent else None,'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)],'vertices':len(points),'faces':len(mesh.polygons)};ev.to_mesh_clear();return result
for obj in fan.children_recursive:
    if obj.type=='MESH':source.append(measure(obj,lambda p:(-p.x*sx,p.z*sz+oy,p.y*sy)))
at=fan.matrix_world.translation;source_center=[-at.x*sx,at.z*sz+oy,at.y*sy]
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/runtime/machine.glb'));bpy.context.view_layer.update()
fan=bpy.data.objects.get('Front_Turbine_Housing');rotor=bpy.data.objects.get('Turbine_Rotor');native=[]
for obj in fan.children_recursive:
    if obj.type=='MESH':
        native.append(measure(obj,lambda p:(p.x,p.z,-p.y)))
hierarchy=[]
for obj in [fan,rotor]+list(fan.children_recursive if fan else []):
    if obj is None:continue
    hierarchy.append({'name':obj.name,'type':obj.type,'parent':obj.parent.name if obj.parent else None,'local':[[v for v in row] for row in obj.matrix_local],'world':[[v for v in row] for row in obj.matrix_world]})
report={'sourceCenter':source_center,'source':source,'native':native,'hierarchy':hierarchy}
(ROOT/'test-results/godot-native/turbine-inspection.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print('TURBINE_INSPECTION',json.dumps({'sourceCenter':source_center,'native':native,'hierarchy':hierarchy}),flush=True)
