import bpy,json
from mathutils import Vector
from pathlib import Path
root=Path(__file__).resolve().parents[3]
bpy.ops.wm.open_mainfile(filepath=str(root/'assets/iron-nomad/gameplay/source/IronNomad_Master.blend'))
bpy.context.view_layer.update()
for x,y,z in [(-2,12.7,2.45),(-2,11.15,-.386)]:
 print('POINT',x,y,z,flush=True)
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  pts=[o.matrix_world@Vector(v) for v in o.bound_box]
  pts=[(-p.x*.75,p.z/1.2-.003333333,p.y*.8) for p in pts]
  lo=[min(p[i] for p in pts) for i in range(3)];hi=[max(p[i] for p in pts) for i in range(3)]
  if all(lo[i] < c+r and hi[i] > c-r for i,c,r in [(0,x,.35),(1,y,.85),(2,z,.35)]):
   print(o.name,[round(t,2) for t in lo],[round(t,2) for t in hi],flush=True)
