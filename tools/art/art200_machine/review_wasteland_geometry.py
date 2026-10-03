"""Independent, read-only geometry review. Never saves or edits the source model."""
import bpy, json, sys
import numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/art200/fine-comb';OUT.mkdir(exist_ok=True)
collection='art100' if '--collection=art100' in sys.argv else 'art200'
manifest=json.loads((ROOT/'assets'/collection/'wasteland/manifest.json').read_text())
result={}
for entry in manifest['models']:
    obj=bpy.data.objects[entry['id']];mesh=obj.data;mesh.calc_loop_triangles()
    vertices=np.array([v.co[:] for v in mesh.vertices]);n=len(vertices);parents=list(range(n))
    def find(x):
        while parents[x]!=x:parents[x]=parents[parents[x]];x=parents[x]
        return x
    for edge in mesh.edges:
        a,b=edge.vertices;ra,rb=find(a),find(b)
        if ra!=rb:parents[rb]=ra
    groups={}
    for i in range(n):groups.setdefault(find(i),[]).append(i)
    bounds=[];components=[];index={}
    for c,(key,ids) in enumerate(groups.items()):
        pts=vertices[ids];lo=pts.min(0);hi=pts.max(0)
        bounds.append((lo,hi));index[key]=c
        components.append({'vertices':len(ids),'min_godot':[float(lo[0]),float(lo[2]),float(-hi[1])],'max_godot':[float(hi[0]),float(hi[2]),float(-lo[1])],'materials':set(),'volume':0.0,'boundary_edges':0})
    edge_faces={tuple(sorted(e.vertices[:])):0 for e in mesh.edges}
    for face in mesh.polygons:
        ci=index[find(face.vertices[0])];components[ci]['materials'].add(mesh.materials[face.material_index].name)
        for i,a in enumerate(face.vertices):
            b=face.vertices[(i+1)%len(face.vertices)];key=tuple(sorted((a,b)))
            edge_faces[key]=edge_faces.get(key,0)+1
    for (a,b),count in edge_faces.items():
        if count!=2:components[index[find(a)]]['boundary_edges']+=1
    for face in mesh.loop_triangles:
        a,b,c=vertices[list(face.vertices)]
        components[index[find(face.vertices[0])]]['volume']+=float(np.dot(a,np.cross(b,c))/6)
    lo=np.array([b[0] for b in bounds]);hi=np.array([b[1] for b in bounds]);adj=[]
    for i in range(len(bounds)):
        delta=np.maximum(0,np.maximum(lo-hi[i],lo[i]-hi));distance=np.sqrt((delta*delta).sum(axis=1));adj.append(set(np.flatnonzero(distance<=.025).tolist())-{i})
    supported=set(np.flatnonzero(lo[:,2]<=.045).tolist());queue=list(supported)
    while queue:
        for j in adj[queue.pop()]-supported:supported.add(j);queue.append(j)
    floating=set(range(len(components)))-supported;clusters=[]
    while floating:
        seed=floating.pop();group={seed};queue=[seed]
        while queue:
            for j in adj[queue.pop()]&floating:floating.remove(j);group.add(j);queue.append(j)
        clusters.append(sorted(group))
    for c in components:c['materials']=sorted(c['materials']);c['volume']=round(c['volume'],9)
    record={'source':str(Path(bpy.data.filepath).relative_to(ROOT)),'mesh_components':len(components),'minimum_y':float(vertices[:,2].min()),'triangle_count':len(mesh.loop_triangles),'zero_area_faces':sum(p.area<1e-10 for p in mesh.polygons),'nonfinite_vertices':int((~np.isfinite(vertices)).any(axis=1).sum()),'inverted_closed_components':[i for i,c in enumerate(components) if c['boundary_edges']==0 and c['volume']<-.000001],'unsupported_bounds_clusters':clusters,'components':components}
    result[obj.name]=record
    print(obj.name,'components',len(components),'unsupported groups',len(clusters),'inverted',len(record['inverted_closed_components']),flush=True)
(OUT/(collection+'-wasteland-geometry.json')).write_text(json.dumps(result,indent=2))
