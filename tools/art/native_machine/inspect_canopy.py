"""Read-only canopy audit in an isolated Blender process."""
import bpy,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'test-results/godot-native'
profile=json.loads((ROOT/'src/data/iron-nomad.json').read_text())
sx,sz,sy=profile['scale'];oy=profile['offsetY']
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/iron-nomad/gameplay/source/IronNomad_Master.blend'))
bpy.context.view_layer.update();source=[]
for o in bpy.context.scene.objects:
    if o.type!='MESH' or not any(s in o.name.lower() for s in ['canopy','awning']):continue
    points=[o.matrix_world@v.co for v in o.data.vertices]
    pts=[(-p.x*sx,p.z*sz+oy,p.y*sy) for p in points]
    row={'name':o.name,'vertices':len(pts),'min':[min(p[i] for p in pts) for i in range(3)],'max':[max(p[i] for p in pts) for i in range(3)]}
    if 'Sagging' in o.name:row['corners']=[pts[i] for i in [0,24,600,624]]
    source.append(row)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/runtime/machine.glb'))
bpy.context.view_layer.update();native=[]
for o in bpy.context.scene.objects:
    if o.type!='MESH':continue
    pts=[o.matrix_world@v.co for v in o.data.vertices];pts=[(p.x,p.z,-p.y) for p in pts]
    inside=[p for p in pts if -3.3<p[0]<6.5 and 18.25<p[1]<20.4 and -1.3<p[2]<6.8]
    if inside:native.append({'name':o.name,'vertices':len(pts),'inside':len(inside),'min':[min(p[i] for p in pts) for i in range(3)],'max':[max(p[i] for p in pts) for i in range(3)],'materials':[m.name for m in o.data.materials]})
report={'source':source,'native':native}
(OUT/'canopy-inspection.json').write_text(json.dumps(report,indent=2));print('CANOPY_INSPECTION',json.dumps(report),flush=True)
