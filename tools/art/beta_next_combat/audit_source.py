"""Read-only component/finite-geometry screen; native close views verify fit."""
import bpy,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/beta-next/gatekeeper'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'GatekeeperCompleteReview.blend'))
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
kit={o for name in ['GatekeeperHullDetails','GatekeeperGunDetails'] for o in bpy.data.objects[name].children_recursive if o.type=='MESH'}
parts=[]
for o in bpy.context.scene.objects:
    if o.type!='MESH':continue
    ev=o.evaluated_get(deps);me=ev.to_mesh();points=[ev.matrix_world@v.co for v in me.vertices]
    if not points:ev.to_mesh_clear();continue
    parts.append({'name':o.name,'new_hardware':o in kit,'min':[min(p[k] for p in points) for k in range(3)],'max':[max(p[k] for p in points) for k in range(3)],'nonfinite':sum(not all(math.isfinite(x) for x in p) for p in points),'degenerate':sum(p.area<1e-12 for p in me.polygons)})
    ev.to_mesh_clear()
def gap(a,b):return math.sqrt(sum(max(0,a['min'][k]-b['max'][k],b['min'][k]-a['max'][k])**2 for k in range(3)))
findings=[]
for part in parts:
    if not part['new_hardware']:continue
    nearest=min((other for other in parts if other is not part),key=lambda other:gap(part,other))
    part['nearest_bounds_gap_m']=gap(part,nearest);part['nearest_component']=nearest['name']
    if part['nonfinite'] or part['degenerate'] or gap(part,nearest)>.006:findings.append(part['name'])
report={'scope':'Whole-carrier source geometry screen; AABB proximity is a missing-support screen, not a mesh intersection proof. Native closed/open close views are required.','authored_components':len(kit),'finite':all(p['nonfinite']==0 for p in parts),'authored_zero_area_faces':sum(p['degenerate'] for p in parts if p['new_hardware']),'parts':parts,'candidates':findings}
(OUT/'source-geometry.json').write_text(json.dumps(report,indent=2)+'\n')
print('G01_SOURCE_AUDIT',len(kit),'components; candidates:',findings,flush=True)
