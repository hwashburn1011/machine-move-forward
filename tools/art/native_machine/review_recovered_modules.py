"""Read-only 4 mm attachment screen of both compatible recovered-crane modes."""
import bpy,json,math
from pathlib import Path
R=Path(__file__).resolve().parents[3]
O=R/'assets/native-recovered-modules'
bpy.ops.wm.open_mainfile(filepath=str(O/'NomadRecoveredModules.blend'))
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();results={}
for id in ['quiet-drive','battery-bank','salvage-crane']:
 root=bpy.data.objects[id]
 for mode in (['folded','deployed'] if id=='salvage-crane' else ['service']):
  parts=[]
  for obj in root.children_recursive:
   if obj.type!='MESH':continue
   ancestors=[];parent=obj.parent
   while parent:ancestors.append(parent.name);parent=parent.parent
   if mode=='folded' and 'ExtendedJib' in ancestors:continue
   if mode=='deployed' and 'FoldedGuide' in ancestors:continue
   ev=obj.evaluated_get(deps);mesh=ev.to_mesh();pts=[ev.matrix_world@v.co for v in mesh.vertices]
   parts.append({'name':obj.name,'min':[min(p[k] for p in pts) for k in range(3)],'max':[max(p[k] for p in pts) for k in range(3)],'zero_area_faces':sum(p.area<1e-12 for p in mesh.polygons),'finite':all(math.isfinite(x) for p in pts for x in p)})
   ev.to_mesh_clear()
  def distance(a,b):return math.sqrt(sum(max(0,a['min'][k]-b['max'][k],b['min'][k]-a['max'][k])**2 for k in range(3)))
  adjacency=[{j for j,b in enumerate(parts) if j!=i and distance(a,b)<=.004} for i,a in enumerate(parts)]
  supported={i for i,p in enumerate(parts) if p['min'][2]<=.005};todo=list(supported)
  while todo:
   for j in adjacency[todo.pop()]-supported:supported.add(j);todo.append(j)
  missing=set(range(len(parts)))-supported;groups=[]
  while missing:
   first=missing.pop();group={first};todo=[first]
   while todo:
    for j in adjacency[todo.pop()]&missing:missing.remove(j);group.add(j);todo.append(j)
   groups.append({'parts':[parts[i]['name'] for i in sorted(group)],'nearest_gap_m':min(distance(parts[i],parts[j]) for i in group for j in range(len(parts)) if j not in group)})
  value={'parts':parts,'support_candidates_4mm':groups,'finite':all(p['finite'] for p in parts),'zero_area_faces':sum(p['zero_area_faces'] for p in parts)}
  results[id+'/'+mode]=value
  print(id,mode,'unsupported',json.dumps(groups),'zero',value['zero_area_faces'],flush=True)
(O/'source-support-review.json').write_text(json.dumps(results,indent=2)+'\n')
assert all(v['finite'] and not v['support_candidates_4mm'] and not v['zero_area_faces'] for v in results.values())
print('RECOVERED_MODULE_SUPPORT_REVIEW_PASS',flush=True)
