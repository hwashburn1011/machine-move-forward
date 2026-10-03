"""Independent evaluated-geometry screen; source-only, never edits exports."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/native-site-roofs'
reports=[]

def review(root,anchors):
    bpy.context.view_layer.update();parts=[];degenerate=0;inverted=[]
    for o in root.children_recursive:
        if o.type!='MESH':continue
        m=o.matrix_world;points=[m@v.co for v in o.data.vertices]
        coords=[(v.x,v.z,-v.y) for v in points]
        lo=[min(p[i] for p in coords) for i in range(3)];hi=[max(p[i] for p in coords) for i in range(3)]
        o.data.calc_loop_triangles();volume=0
        for t in o.data.loop_triangles:
            a,b,c=[points[i] for i in t.vertices]
            if (b-a).cross(c-a).length_squared<1e-16:degenerate+=1
            volume+=a.dot(b.cross(c))/6
        if volume<-.00001:inverted.append(o.name)
        parts.append({'name':o.name,'min':lo,'max':hi,'dimensions':[hi[i]-lo[i] for i in range(3)],'finite':all(math.isfinite(c) for p in coords for c in p)})
    boxes=anchors+parts;seen=set(range(len(anchors)));changed=True
    def touches(a,b):return all(a['min'][i]-.004<=b['max'][i] and b['min'][i]-.004<=a['max'][i] for i in range(3))
    while changed:
        changed=False
        for i in range(len(anchors),len(boxes)):
            if i in seen:continue
            if any(touches(boxes[i],boxes[j]) for j in seen):seen.add(i);changed=True
    unsupported=[boxes[i] for i in range(len(anchors),len(boxes)) if i not in seen]
    report={'root':root.name,'parts':len(parts),'degenerateTriangles':degenerate,'invertedSolidCandidates':inverted,'unsupportedBoundsCandidates':unsupported,'finite':all(p['finite'] for p in parts),'weatherStripBounds':[p for p in parts if any(n in p['name'] for n in ['Ridge weather cover','Eave gutter bottom','Eave gutter captured outer lip'])]}
    reports.append(report);print('ROOF_GEOMETRY',json.dumps(report),flush=True)

bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/blender/expansion-v1/relay-foundry.blend'))
r=bpy.data.objects['FoundryRoof'];anchors=[]
for o in bpy.context.scene.objects:
    if o.type!='MESH' or o in r.children_recursive:continue
    p=[o.matrix_world@Vector(v) for v in o.bound_box]
    coords=[(v.x,v.z,-v.y) for v in p]
    anchors.append({'name':o.name,'min':[min(p[i] for p in coords) for i in range(3)],'max':[max(p[i] for p in coords) for i in range(3)]})
review(r,anchors)
bpy.ops.wm.open_mainfile(filepath=str(OUT/'SiteRoofs.blend'))
anchors={
'WorkshopCanopy':[{'min':[-2,0,-4.86],'max':[5.6,3.6,-4.54]},{'min':[5.425,0,-4.75],'max':[5.775,3.6,4.75]}],
'ArrayVaultRoof':[{'min':[1.075,.25,1.075],'max':[4.925,3.55,4.925]},{'min':[.5,3.67,.5],'max':[5.5,3.83,5.5]}],
'OrchardArchiveRoof':[{'min':[2.25,.25,-8.9],'max':[7.75,4.05,-5.1]},{'min':[1.9,4.11,-9.25],'max':[8.1,4.29,-4.75]}],
'MeridianGardenSign':[{'min':[-7.57,0,-3.57],'max':[-7.43,3,-3.43]},{'min':[-2.57,0,-3.57],'max':[-2.43,3,-3.43]}]}
for name,boxes in anchors.items():review(bpy.data.objects[name],boxes)
(OUT/'geometry-review.json').write_text(json.dumps(reports,indent=2)+'\n')
