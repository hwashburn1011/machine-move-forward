import bpy,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[3]
bpy.ops.wm.open_mainfile(filepath=str(R/'assets/native-character-refinement/bastion-components.blend'))
results=[]
for obj in bpy.data.objects:
 if obj.type!='MESH':continue
 pts=[obj.matrix_world@v.co for v in obj.data.vertices]
 lo=[min(p[k] for p in pts) for k in range(3)];hi=[max(p[k] for p in pts) for k in range(3)]
 if hi[2]>1.9 and lo[0]<.5 and hi[0]>-.5:
  results.append({'name':obj.name,'min':lo,'max':hi,'vertices':len(pts),'triangles':len(obj.data.polygons),'groups':[(g.name,g.index) for g in obj.vertex_groups]})
print(json.dumps(results,indent=2))
heads=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith(('Segmented cranial housing','Temporal layered shell','Continuous swept armored mask'))]
verts=[];faces=[]
for obj in heads:
 offset=len(verts);verts.extend(obj.matrix_world@v.co for v in obj.data.vertices);faces.extend(tuple(i+offset for i in p.vertices) for p in obj.data.polygons)
bvh=BVHTree.FromPolygons(verts,faces)
for obj in bpy.data.objects:
 if obj.type=='MESH' and obj.name.startswith('Cranial stub antenna'):
  distances=[bvh.find_nearest(obj.matrix_world@v.co)[3] for v in obj.data.vertices]
  print('ANTENNA_MIN_GAP',obj.name,min(distances),'bindings',[(g.name,sum(w.weight for v in obj.data.vertices for w in v.groups if w.group==g.index)) for g in obj.vertex_groups if any(w.group==g.index and w.weight>0 for v in obj.data.vertices for w in v.groups)])
(R/'assets/art100/story-robots/bastion-upper-source.json').write_text(json.dumps(results,indent=2)+'\n')
