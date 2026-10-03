"""Read-only pressure-assembly audit in an isolated Blender process."""
import bpy,bmesh,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'test-results/godot-native'
profile=json.loads((ROOT/'src/data/iron-nomad.json').read_text())
sx,sz,sy=profile['scale'];oy=profile['offsetY']
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/iron-nomad/gameplay/source/IronNomad_Master.blend'))
bpy.context.view_layer.update();source=[]
prefixes=('vertical pressure vessel','dished pressure tank crown','tank pressure outlet','pressure handwheel','instrument gauge','gauge needle','pressure vessel foot','vessel valve stem')
def bounds(points):return {'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]}
for o in bpy.context.scene.objects:
    if not o.name.lower().startswith(prefixes):continue
    ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh()
    pts=[o.matrix_world@v.co for v in mesh.vertices];pts=[Vector((-p.x*sx,p.z*sz+oy,p.y*sy)) for p in pts]
    source.append({'name':o.name,'type':o.type,**bounds(pts)});ev.to_mesh_clear()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/runtime/machine.glb'))
bpy.context.view_layer.update();native=[]
def nearby(p):return 12.425<p.y<14.85 and 9.8<p.z<11.0 and any(abs(p.x-x)<.70 for x in [-8,-4,0,4,8])
for o in bpy.context.scene.objects:
    if o.type!='MESH':continue
    def game(v):
        p=o.matrix_world@v;return Vector((p.x,p.z,-p.y))
    if not any(nearby(game(v.co)) for v in o.data.vertices):continue
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000005)
    unseen=set(bm.verts);components=[]
    while unseen:
        seed=unseen.pop();component={seed};pending=[seed]
        while pending:
            v=pending.pop()
            for e in v.link_edges:
                other=e.other_vert(v)
                if other in unseen:unseen.remove(other);component.add(other);pending.append(other)
        pts=[game(v.co) for v in component]
        if any(nearby(p) for p in pts):components.append({'vertices':len(component),**bounds(pts)})
    o.data.calc_loop_triangles();native.append({'name':o.name,'triangles':len(o.data.loop_triangles),'materials':[m.name for m in o.data.materials],'nearbyComponents':components});bm.free()
(OUT/'vessel-inspection.json').write_text(json.dumps({'source':source,'native':native},indent=2),encoding='utf-8')
print('VESSEL_INSPECTION',json.dumps({'source':source,'native':[{'name':b['name'],'triangles':b['triangles'],'nearbyComponents':len(b['nearbyComponents'])} for b in native]}),flush=True)
