"""Independent read-only inspection of the44 full story prop assemblies.

Bounds adjacency screens for missing supports; it is not a mesh intersection
proof. Final review combines this evidence with graphics and reverse views.
"""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets/art200/fine-comb'
results={}
for source,manifest in [('assets/art100/story-robots/StoryRobots-editable.blend','assets/art100/story-robots/manifest.json'),('assets/art200/story/Story200-editable.blend','assets/art200/story/manifest.json')]:
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/source))
    for c in bpy.data.collections:c.hide_viewport=False
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
    for row in json.loads((ROOT/manifest).read_text())['models']:
        if row['status']=='refined':continue
        root=bpy.data.objects[row['id']];parts=[]
        for o in root.children_recursive:
            if o.type not in ['MESH','CURVE','FONT']:continue
            ev=o.evaluated_get(deps);me=ev.to_mesh()
            if not me or not me.vertices:continue
            pts=[ev.matrix_world@v.co-root.matrix_world.translation for v in me.vertices]
            lo=[min(v[k] for v in pts) for k in range(3)];hi=[max(v[k] for v in pts) for k in range(3)]
            me.calc_loop_triangles()
            parts.append({'name':o.name,'min':lo,'max':hi,'triangles':len(me.loop_triangles),'zero_area_faces':sum(p.area<1e-12 for p in me.polygons),'nonfinite_vertices':sum(not all(math.isfinite(x) for x in p) for p in pts),'materials':[m.name for m in o.data.materials if m]})
            ev.to_mesh_clear()
        def distance(a,b):return math.sqrt(sum(max(0,a['min'][k]-b['max'][k],b['min'][k]-a['max'][k])**2 for k in range(3)))
        adjacency=[{j for j,b in enumerate(parts) if i!=j and distance(a,b)<=.025} for i,a in enumerate(parts)]
        supported={i for i,p in enumerate(parts) if p['min'][2]<=.035};todo=list(supported)
        while todo:
            for j in adjacency[todo.pop()]-supported:supported.add(j);todo.append(j)
        missing=set(range(len(parts)))-supported;groups=[]
        while missing:
            start=missing.pop();group={start};todo=[start]
            while todo:
                for j in adjacency[todo.pop()]&missing:missing.remove(j);group.add(j);todo.append(j)
            groups.append({'parts':[parts[i]['name'] for i in sorted(group)],'nearest_gap_m':min(distance(parts[i],parts[j]) for i in group for j in range(len(parts)) if j not in group) if len(group)<len(parts) else None})
        results[row['id']]={'source':source,'parts':parts,'unsupported_bounds_candidates':groups,'finite':all(p['nonfinite_vertices']==0 for p in parts),'degenerate_faces':sum(p['zero_area_faces'] for p in parts)}
        print(row['id'],'parts',len(parts),'candidates',json.dumps(groups),'degenerate',results[row['id']]['degenerate_faces'],flush=True)
(OUT/'story-geometry.json').write_text(json.dumps(results,indent=2)+'\n')
print('READ_ONLY_STORY_COMPLETE',len(results),flush=True)
