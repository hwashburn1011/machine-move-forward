"""Geometric fit checks against the actual editable Blender source."""
import bpy,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri
ROOT=Path(__file__).resolve().parents[3]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/native-pressure-vessels/NomadPressureVessel.blend'))
bpy.context.view_layer.update()
shell=bpy.data.objects['Formed pressure shell and dished heads'];report={'supports':[]}
legs=[o for o in bpy.context.scene.objects if o.name.startswith('Welded support leg')]
assert len(legs)==4
for leg in legs:
    points=[leg.matrix_world@v.co for v in leg.data.vertices]
    x=sum(p.x for p in points)/len(points);y=sum(p.y for p in points)/len(points)
    # Cast through the closed bottom of the receiver at the actual leg centre.
    hit,at,normal,_=shell.ray_cast(shell.matrix_world.inverted()@Vector((x,y,.7)),Vector((0,0,-1)))
    assert hit and normal.z<-.1,(leg.name,'No downward-facing dished bottom')
    at=shell.matrix_world@at;lo=min(p.z for p in points);hi=max(p.z for p in points)
    assert lo<at.z<hi-.015,(leg.name,'Disconnected foot',lo,at.z,hi)
    feet=[o for o in bpy.context.scene.objects if o.name.startswith('Bolted receiver foot')]
    foot=min(feet,key=lambda f:(f.location-leg.location).length)
    foot_points=[foot.matrix_world@v.co for v in foot.data.vertices]
    assert abs(min(p.z for p in foot_points))<.00001
    assert min(p.x for p in foot_points)<x<max(p.x for p in foot_points) and min(p.y for p in foot_points)<y<max(p.y for p in foot_points)
    assert lo<max(p.z for p in foot_points)
    report['supports'].append({'leg':leg.name,'shellContactY':at.z,'supportTopY':hi,'overlapM':hi-at.z,'deckContactY':min(p.z for p in foot_points)})
# Assert original main-body envelope after evaluating geometry, not object dims.
points=[shell.matrix_world@v.co for v in shell.data.vertices]
assert max(abs(p.x) for p in points)<.285 and max(abs(p.y) for p in points)<.304
report['shellEnvelope']={'xRadius':max(abs(p.x) for p in points),'zRadius':max(abs(p.y) for p in points)}
# The chamfered cargo case is especially close to receiver 1. Check complete
# exported triangles, including the low feet omitted by a shell-only envelope.
bpy.ops.wm.read_factory_settings(use_empty=True)
def imported(path,offset):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));bpy.context.view_layer.update()
    vertices=[];triangles=[];shift=Vector((offset[0],-offset[2],offset[1]))
    for obj in set(bpy.data.objects)-before:
        if obj.type!='MESH':continue
        start=len(vertices);vertices.extend(obj.matrix_world@v.co+shift for v in obj.data.vertices)
        obj.data.calc_loop_triangles();triangles.extend(tuple(start+i for i in tri.vertices) for tri in obj.data.loop_triangles)
    return vertices,triangles,BVHTree.FromPolygons(vertices,triangles,all_triangles=True)
a=imported(ROOT/'godot/art/nomad-pressure-vessel.glb',(8,12.43,10.4))
b=imported(ROOT/'godot/art/nomad-cargo-locker.glb',(8.8,12.43,9.88))
pairs=a[2].overlap(b[2]);hits=[]
def segment_hits(p,q,tri):
    delta=q-p
    if delta.length<1e-9:return None
    hit=intersect_ray_tri(*tri,delta,p,True)
    if hit is not None and 1e-6<(hit-p).dot(delta)/delta.length_squared<1-1e-6:return hit
for ia,ib in pairs:
    ta=[a[0][i] for i in a[1][ia]];tb=[b[0][i] for i in b[1][ib]]
    for source,target in [(ta,tb),(tb,ta)]:
        for i in range(3):
            hit=segment_hits(source[i],source[(i+1)%3],target)
            if hit is not None:hits.append([hit.x,hit.z,-hit.y])
report['adjacentCargo']={'candidatePairs':len(pairs),'triangleIntersectionPoints':hits}
report['passed']=not hits
(ROOT/'assets/native-pressure-vessels/source-fit.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('VESSEL_SOURCE_FIT',json.dumps(report),flush=True)
assert not hits,'Receiver fittings intersect adjacent cargo case'
