"""Verify source connections, envelope, neighbouring machine and earned hardware."""
import bpy,ast,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/native-receiver'
helpers=ast.parse((ROOT/'tools/art/native_machine/verify_helm.py').read_text())
exec(compile(ast.Module(body=[n for n in helpers.body if isinstance(n,ast.FunctionDef)],type_ignores=[]),'<geometry helpers>','exec'))
bpy.ops.wm.open_mainfile(filepath=str(OUT/'NomadReceiver.blend'));bpy.context.view_layer.update()
report={'supports':[]}
for child,parent in [('Bolted base plate','Deck isolation pad'),('Pedestal bottom flange','Bolted base plate'),('Sealed pedestal column','Pedestal bottom flange'),('Pedestal head flange','Sealed pedestal column'),('Instrument support tray','Pedestal head flange'),('Formed shielded receiver case','Instrument support tray'),('Front panel seal','Formed shielded receiver case'),('Removable front fascia','Front panel seal'),('Display compression gasket','Removable front fascia'),('Machined display bezel','Display compression gasket'),('Recessed phosphor glass','Machined display bezel'),('Rear removable gasket','Formed shielded receiver case'),('Rear service cover','Rear removable gasket'),('Rear identification plate','Rear service cover'),('Recessed edge connector','Scanner cartridge socket'),('Weather-sealed antenna socket','Antenna mounting heel'),('Deck power termination','Bolted base plate')]:
    assert named(child) and named(parent),(child,parent)
    for obj in named(child):
        distance=min(gap(bounds(obj),bounds(other)) for other in named(parent));report['supports'].append({'part':obj.name,'gapM':distance});assert distance<1e-5,(obj.name,distance)
assert abs(bounds(named('Deck isolation pad')[0])[0][2])<1e-7
objects=[o for o in bpy.data.objects['NativeReceiver'].children_recursive if o.type=='MESH'];vertices,faces=geometry(objects)
points=[(p.x,p.z,-p.y) for p in vertices]
low=[min(p[i] for p in points) for i in range(3)];high=[max(p[i] for p in points) for i in range(3)]
report['bounds']={'min':low,'max':high};assert low[0]>=-.45 and high[0]<=.45 and low[2]>=-.28001 and high[2]<=.28001 and low[1]>=0 and high[1]<=1.87,report['bounds']
# Thin existing-style antenna is the only part above the unchanged 1.44 m body.
above=[obj.name for obj in objects if bounds(obj)[1][2]>1.44001]
report['antennaAboveMainEnvelope']=above
assert all(any(key in name.lower() for key in ['whip','antenna']) for name in above),above
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/art/story-instruments.glb'));bpy.context.view_layer.update()
upgrades=[]
for name,x in [('ArchiveConsole',.22),('SeedTerrarium',-.22)]:
    part=bpy.data.objects[name];part.location=Vector((x,0,1.447));part.rotation_mode='XYZ';part.rotation_euler.z=math.pi;part.scale=Vector((.65,.65,.65))
    upgrades.extend(o for o in part.children_recursive if o.type=='MESH')
bpy.context.view_layer.update()
# Mounting feet and glands seat into the case top; above that interface there
# must be no penetration into the antenna or any other receiver component.
upper_faces=[f for f in faces if min(vertices[i].z for i in f)>1.447]
intersections=BVHTree.FromPolygons(vertices,upper_faces,all_triangles=True).overlap(BVHTree.FromPolygons(*geometry(upgrades),all_triangles=True))
report['earnedHardwareUpperIntersections']=len(intersections);assert not intersections
candidate=BVHTree.FromPolygons([p+Vector((1,9.8,16.03)) for p in vertices],faces,all_triangles=True)
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/runtime/machine.glb'));bpy.context.view_layer.update()
neighbours=[o for o in set(bpy.data.objects)-before if o.type=='MESH']
nv,nf=geometry(neighbours);nf=[f for f in nf if max(nv[i].z for i in f)>16.031]
intersections=candidate.overlap(BVHTree.FromPolygons(nv,nf,all_triangles=True))
report['neighbourIntersectingTrianglePairs']=len(intersections);assert not intersections,('Crosses surrounding machine',len(intersections))
report['passed']=True;(OUT/'source-fit.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print('RECEIVER_FIT',json.dumps(report),flush=True)
