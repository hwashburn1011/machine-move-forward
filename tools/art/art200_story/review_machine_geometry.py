"""Independent read-only evaluated geometry screen of all 50 furnishings."""
import bpy,json,math
from pathlib import Path
R=Path(__file__).resolve().parents[3];O=R/'assets/art200/fine-comb';results={}
for collection,source in [('art100','NomadFurnishings.blend'),('art200','NomadLivingArchive.blend')]:
 directory=R/'assets'/collection/'machine';manifest=json.loads((directory/'manifest.json').read_text())
 bpy.ops.wm.open_mainfile(filepath=str(directory/source))
 for c in bpy.data.collections:c.hide_viewport=False
 bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
 for id,entry in manifest.items():
  root=bpy.data.objects[id];parts=[]
  for obj in root.children_recursive:
   if obj.type not in ['MESH','CURVE','FONT']:continue
   ev=obj.evaluated_get(deps);mesh=ev.to_mesh()
   if not mesh or not mesh.vertices:continue
   pts=[ev.matrix_world@v.co-root.matrix_world.translation for v in mesh.vertices];lo=[min(v[k] for v in pts) for k in range(3)];hi=[max(v[k] for v in pts) for k in range(3)];mesh.calc_loop_triangles()
   parts.append({'name':obj.name,'min':lo,'max':hi,'triangles':len(mesh.loop_triangles),'zero_area_faces':sum(p.area<1e-12 for p in mesh.polygons),'nonfinite_vertices':sum(not all(math.isfinite(x) for x in p) for p in pts)})
   ev.to_mesh_clear()
  def distance(a,b):return math.sqrt(sum(max(0,a['min'][k]-b['max'][k],b['min'][k]-a['max'][k])**2 for k in range(3)))
  adjacency=[{j for j,b in enumerate(parts) if i!=j and distance(a,b)<=.004} for i,a in enumerate(parts)]
  supported={i for i,p in enumerate(parts) if p['min'][2]<=.005};todo=list(supported)
  while todo:
   for j in adjacency[todo.pop()]-supported:supported.add(j);todo.append(j)
  missing=set(range(len(parts)))-supported;groups=[]
  while missing:
   start=missing.pop();group={start};todo=[start]
   while todo:
    for j in adjacency[todo.pop()]&missing:missing.remove(j);group.add(j);todo.append(j)
   groups.append({'parts':[parts[i]['name'] for i in sorted(group)],'nearest_gap_m':min(distance(parts[i],parts[j]) for i in group for j in range(len(parts)) if j not in group) if len(group)<len(parts) else None})
  result={'source':str((directory/source).relative_to(R)),'parts':parts,'support_candidates_4mm':groups,'finite':all(p['nonfinite_vertices']==0 for p in parts),'degenerate_faces':sum(p['zero_area_faces'] for p in parts)};results[id]=result
  print(id,'finite',result['finite'],'degenerate',result['degenerate_faces'],'candidates',json.dumps(groups),flush=True)
(O/'machine-geometry-independent.json').write_text(json.dumps(results,indent=2)+'\n');print('INDEPENDENT_MACHINE_REVIEW',len(results))
