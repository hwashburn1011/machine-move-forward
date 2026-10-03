"""Read-only support-gap screening of the editable master, alongside visual review."""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector

collection='art100' if '--collection=art100' in sys.argv else 'art200'
prefix='nomad-' if collection=='art100' else 'nomad2-'
OUT=Path(__file__).resolve().parents[3]/'assets'/collection/'machine'
results={}
for root in bpy.context.scene.objects:
    if not root.name.startswith(prefix) or root.type!='EMPTY':continue
    parts=[]
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        p=[obj.matrix_world@Vector(v) for v in obj.bound_box]
        lo=[min(v[i] for v in p) for i in range(3)]
        hi=[max(v[i] for v in p) for i in range(3)]
        parts.append((obj.name,lo,hi))
    gaps=[];adj=[set() for _ in parts]
    for i,(name,lo,hi) in enumerate(parts):
        nearest=(1000,'')
        for j,(other,olo,ohi) in enumerate(parts):
            if i==j:continue
            distance=math.sqrt(sum(max(0,olo[a]-hi[a],lo[a]-ohi[a])**2 for a in range(3)))
            if distance<=.012:adj[i].add(j)
            if distance<nearest[0]:nearest=(distance,other)
        if nearest[0]>.012:gaps.append({'part':name,'nearest':nearest[1],'gap_m':round(nearest[0],5)})
    supported={i for i,p in enumerate(parts) if p[1][2]<=.006};queue=list(supported)
    while queue:
        for j in adj[queue.pop()]-supported:supported.add(j);queue.append(j)
    floating=set(range(len(parts)))-supported;clusters=[]
    while floating:
        seed=floating.pop();group={seed};queue=[seed]
        while queue:
            for j in adj[queue.pop()]&floating:floating.remove(j);group.add(j);queue.append(j)
        clusters.append([parts[i][0] for i in sorted(group)])
    results[root.name]={'parts':len(parts),'separated_parts':gaps,'unsupported_clusters':clusters}
(OUT/'support-gap-screen.json').write_text(json.dumps(results,indent=2))
print(json.dumps({k:{'separated_parts':v['separated_parts'],'unsupported_clusters':v['unsupported_clusters']} for k,v in results.items() if v['separated_parts'] or v['unsupported_clusters']},indent=2))
