"""Read-only native/source grounding audit; run in isolated Blender."""
import bpy,bmesh,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'test-results/godot-native'
profile=json.loads((ROOT/'src/data/iron-nomad.json').read_text(encoding='utf-8'))
sx,sz,sy=profile['scale'];oy=profile['offsetY']
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/iron-nomad/gameplay/source/IronNomad_Master.blend'))
bpy.context.view_layer.update();source=[]
for o in bpy.context.scene.objects:
    if o.type not in ['MESH','CURVE','FONT']:continue
    if not any(s in o.name.lower() for s in ['service drum','drum strengthening','penetration','deck gland']):continue
    pts=[o.matrix_world@Vector(p) for p in o.bound_box]
    pts=[Vector((-p.x*sx,p.z*sz+oy,p.y*sy)) for p in pts]
    lo=[min(p[i] for p in pts) for i in range(3)];hi=[max(p[i] for p in pts) for i in range(3)]
    if lo[1]>15 and hi[1]<18.5:source.append({'name':o.name,'min':lo,'max':hi})
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/runtime/machine.glb'))
bpy.context.view_layer.update();native=[]
for o in list(bpy.context.scene.objects):
    if o.type!='MESH':continue
    # Examine all complete drum pieces, including their actual deck contacts.
    corners=[o.matrix_world@Vector(p) for p in o.bound_box]
    if max(p.z for p in corners)<16 or min(p.x for p in corners)>12 or max(p.x for p in corners)<3:continue
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    bm.verts.ensure_lookup_table();unseen=set(bm.verts)
    while unseen:
        seed=unseen.pop();component={seed};pending=[seed]
        while pending:
            v=pending.pop()
            for e in v.link_edges:
                other=e.other_vert(v)
                if other in unseen:unseen.remove(other);component.add(other);pending.append(other)
        pts=[o.matrix_world@v.co for v in component];pts=[Vector((p.x,p.z,-p.y)) for p in pts]
        lo=[min(p[i] for p in pts) for i in range(3)];hi=[max(p[i] for p in pts) for i in range(3)]
        sites=[(9.625,7.8),(-9.625,-6.5),(5.5,10.4)]
        if lo[1]>=16.015 and hi[1]<=16.925 and any(lo[0]>=x-.31 and hi[0]<=x+.31 and lo[2]>=z-.33 and hi[2]<=z+.33 for x,z in sites):
            native.append({'mesh':o.name,'vertices':len(component),'min':lo,'max':hi})
    bm.free()
report={'source':source,'nativeDrumComponents':native}
(OUT/'dressing-inspection.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('DRESSING_INSPECTION',json.dumps(report),flush=True)
