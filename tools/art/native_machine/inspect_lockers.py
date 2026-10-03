"""Inspect original locker assemblies and native batches in isolated Blender."""
import bpy,bmesh,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'test-results/godot-native'
profile=json.loads((ROOT/'src/data/iron-nomad.json').read_text())
sx,sz,sy=profile['scale'];oy=profile['offsetY']
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/iron-nomad/gameplay/source/IronNomad_Master.blend'))
bpy.context.view_layer.update();source=[];neighbours=[]
for o in bpy.context.scene.objects:
    if o.type!='MESH':continue
    is_locker=o.name.lower().startswith(('secured weatherproof cargo locker','cargo locker steel band','locker carry handle'))
    is_tank=o.name.lower().startswith(('vertical pressure vessel','dished pressure tank crown'))
    if not is_locker and not is_tank:continue
    pts=[o.matrix_world@Vector(p) for p in o.bound_box]
    pts=[Vector((-p.x*sx,p.z*sz+oy,p.y*sy)) for p in pts]
    (source if is_locker else neighbours).append({'name':o.name,'min':[min(p[i] for p in pts) for i in range(3)],'max':[max(p[i] for p in pts) for i in range(3)]})
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/runtime/machine.glb'))
bpy.context.view_layer.update();native=[]
for o in list(bpy.context.scene.objects):
    if o.type!='MESH' or not o.name.startswith('Secured_weatherproof_cargo_locker'):continue
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    unseen=set(bm.verts);components=[]
    while unseen:
        seed=unseen.pop();component={seed};pending=[seed]
        while pending:
            v=pending.pop()
            for e in v.link_edges:
                other=e.other_vert(v)
                if other in unseen:unseen.remove(other);component.add(other);pending.append(other)
        pts=[o.matrix_world@v.co for v in component];pts=[Vector((p.x,p.z,-p.y)) for p in pts]
        components.append({'vertices':len(component),'min':[min(p[i] for p in pts) for i in range(3)],'max':[max(p[i] for p in pts) for i in range(3)]})
    o.data.calc_loop_triangles()
    native.append({'name':o.name,'triangles':len(o.data.loop_triangles),'materials':[m.name for m in o.data.materials],'components':components});bm.free()
(OUT/'locker-inspection.json').write_text(json.dumps({'source':source,'neighbours':neighbours,'native':native},indent=2),encoding='utf-8')
print('LOCKER_INSPECTION',json.dumps({'bodies':[o for o in source if o['name'].startswith('Secured')],'batches':[{k:v for k,v in b.items() if k!='components'} for b in native]}),flush=True)
