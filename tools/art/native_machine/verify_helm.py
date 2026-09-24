"""Independent support, enclosure fit and neighbouring mesh checks."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/native-helm'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'NomadHelm.blend'));bpy.context.view_layer.update()
def geometry(objects):
    vertices=[];faces=[]
    for obj in objects:
        offset=len(vertices);vertices.extend(obj.matrix_world@v.co for v in obj.data.vertices);obj.data.calc_loop_triangles()
        faces.extend(tuple(offset+i for i in tri.vertices) for tri in obj.data.loop_triangles)
    return vertices,faces
def named(prefix):return [o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith(prefix)]
def bounds(obj):
    points=geometry([obj])[0];return [[min(p[i] for p in points) for i in range(3)],[max(p[i] for p in points) for i in range(3)]]
def gap(a,b):return max(max(a[0][i]-b[1][i],b[0][i]-a[1][i]) for i in range(3))
report={'supports':[],'fasciaContactsM':[]}
for child,parent in [('Folded mounting plinth','Deck isolation seal'),('Pedestal bottom rim','Folded mounting plinth'),('Formed sealed control pedestal','Pedestal bottom rim'),('Gyro cartridge casing','Gyro fitted backplate'),('Rear service hatch','Rear door gasket'),('Rear maintenance label','Rear service hatch'),('Side identification plate','Formed sealed control pedestal')]:
    for obj in named(child):
        distance=min(gap(bounds(obj),bounds(other)) for other in named(parent));report['supports'].append({'part':obj.name,'gapM':distance});assert distance<1e-5,(obj.name,distance)
assert abs(bounds(named('Deck isolation seal')[0])[0][2])<1e-7
tree=BVHTree.FromPolygons(*geometry(named('Formed sealed control pedestal')),all_triangles=True)
panel=bpy.data.objects['ControlFascia']
for x in [-.40,0,.40]:
    for z in [-.20,0,.20]:
        point=panel.matrix_world@Vector((x,-z,-.006));hit=tree.find_nearest(point);distance=(point-hit[0]).dot(hit[1])
        report['fasciaContactsM'].append(distance);assert -.004<distance<.0003,('Unseated fascia gasket',x,z,distance)
objects=[o for o in bpy.data.objects['NativeHelm'].children_recursive if o.type=='MESH'];verts,_=geometry(objects)
points=[(p.x,p.z,-p.y) for p in verts]
low=[min(p[i] for p in points) for i in range(3)];high=[max(p[i] for p in points) for i in range(3)]
report['bounds']={'min':low,'max':high};assert all(low[i]>=[-.6,0,-.375][i]-1e-6 and high[i]<=[.6,1.35,.375][i]+1e-6 for i in range(3)),report['bounds']
identity=BVHTree.FromPolygons(*geometry(named('Side identification plate')+named('Legend NOMAD / NAVIGATION')+named('Legend FIELD SERVICE 07')),all_triangles=True)
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/models/authored/nomad-progress.glb'));bpy.context.view_layer.update()
upgrades=[o for o in set(bpy.data.objects)-before if o.type=='MESH']
overlap=identity.overlap(BVHTree.FromPolygons(*geometry(upgrades),all_triangles=True))
report['identityUpgradeIntersectingTrianglePairs']=len(overlap);assert not overlap,('Upgrade crosses permanent identification',len(overlap))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/art/nomad-helm.glb'));bpy.context.view_layer.update()
kit=bpy.data.objects['NativeHelm'];vertices,faces=geometry([o for o in kit.children_recursive if o.type=='MESH'])
translation=Vector((-3,9,16.03));candidate=BVHTree.FromPolygons([p+translation for p in vertices],faces,all_triangles=True)
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/runtime/machine.glb'));bpy.context.view_layer.update()
neighbours=[]
for obj in set(bpy.data.objects)-before:
    if obj.type!='MESH':continue
    node=obj;excluded=False
    while node:
        if node.name=='HelmRoot':excluded=True
        node=node.parent
    if not excluded:neighbours.append(obj)
vertices,faces=geometry(neighbours)
faces=[f for f in faces if max(vertices[i].z for i in f)>16.031]
overlap=candidate.overlap(BVHTree.FromPolygons(vertices,faces,all_triangles=True))
report['neighbourIntersectingTrianglePairs']=len(overlap);assert not overlap,('Crosses surrounding machine',len(overlap))
report['passed']=True;(OUT/'source-fit.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print('HELM_FIT',json.dumps(report),flush=True)
