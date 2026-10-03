"""Read-only evaluated source proof: closed parts, finite triangles and supports."""
import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/site-grounding'
data=json.loads((OUT/'manifest.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(OUT/'SiteGrounding.blend'))
reports=[]
for name,definition in data['models'].items():
 r=bpy.data.objects[name];parts=[];degen=0;negative=[]
 for o in r.children_recursive:
  if o.type!='MESH':continue
  points=[o.matrix_world@v.co for v in o.data.vertices];coords=[(p.x,p.z,-p.y) for p in points]
  o.data.calc_loop_triangles();volume=0
  for tri in o.data.loop_triangles:
   a,b,c=[points[i] for i in tri.vertices]
   if (b-a).cross(c-a).length_squared<1e-16:degen+=1
   volume+=a.dot(b.cross(c))/6
  if volume<-.00001:negative.append(o.name)
  parts.append({'name':o.name,'min':[min(p[i] for p in coords) for i in range(3)],'max':[max(p[i] for p in coords) for i in range(3)],'finite':all(math.isfinite(v) for p in coords for v in p)})
 anchors=[]
 for foot in definition['foundations']:
  x,z=foot['center'];sx,sz=foot['size'];anchors.append({'min':[x-sx/2,-23,z-sz/2],'max':[x+sx/2,foot['top'],z+sz/2]})
 if name in ['FoundationUnit','GradeCollar']:anchors=[{'min':[-1,-.01,-1],'max':[1,.01,1]}]
 boxes=anchors+parts;seen=set(range(len(anchors)));changed=True
 def touch(a,b):return all(a['min'][i]-.006<=b['max'][i] and b['min'][i]-.006<=a['max'][i] for i in range(3))
 while changed:
  changed=False
  for i in range(len(anchors),len(boxes)):
   if i not in seen and any(touch(boxes[i],boxes[j]) for j in seen):seen.add(i);changed=True
 unsupported=[boxes[i]['name'] for i in range(len(anchors),len(boxes)) if i not in seen]
 report={'root':name,'parts':len(parts),'finite':all(p['finite'] for p in parts),'degenerateTriangles':degen,'negativeVolumeCandidates':negative,'unsupportedBoundsCandidates':unsupported,'triangles':definition['triangles'],'batches':definition['batches']}
 reports.append(report);print('GROUNDING_GEOMETRY',json.dumps(report),flush=True)
(OUT/'geometry-review.json').write_text(json.dumps(reports,indent=2)+'\n')
