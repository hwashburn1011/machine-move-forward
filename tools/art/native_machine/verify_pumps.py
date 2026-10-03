"""Check authored supports, fin alignment and pipe terminations in Blender."""
import bpy,json
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/native-pumps'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'NomadServicePump.blend'));bpy.context.view_layer.update()
def box(obj):
    points=[obj.matrix_world@v.co for v in obj.data.vertices]
    return {'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]}
def named(prefix):return [obj for obj in bpy.context.scene.objects if obj.type=='MESH' and obj.name.startswith(prefix)]
def overlap(a,b):return all(a['max'][i]>=b['min'][i]-1e-6 and b['max'][i]>=a['min'][i]-1e-6 for i in range(3))
def nearest_gap(a,b):return max(max(a['min'][i]-b['max'][i],b['min'][i]-a['max'][i]) for i in range(3))
report={'supports':[],'fins':[],'terminations':[]}
for subject,partners in [('Welded skid tray',['Continuous rubber isolation pad']),('Machined mounting crossrail',['Welded skid tray']),('Cast motor mounting foot',['Machined mounting crossrail']),('Cast volute support',['Machined mounting crossrail']),('Cast motor barrel',['Cast motor mounting foot']),('Formed volute casing',['Cast volute support']),('Terminal box neck',['Cast motor barrel']),('Sealed motor terminal box',['Terminal box neck']),('Terminal lid gasket',['Sealed motor terminal box']),('Terminal box cap',['Terminal lid gasket'])]:
    candidates=[obj for prefix in partners for obj in named(prefix)]
    for obj in named(subject):
        value=min(nearest_gap(box(obj),box(other)) for other in candidates);report['supports'].append({'part':obj.name,'contactGapM':value});assert value<1e-5,(obj.name,value)
for obj in named('Longitudinal cooling fin'):
    b=box(obj);size=[b['max'][i]-b['min'][i] for i in range(3)]
    report['fins'].append({'name':obj.name,'size':size});assert size[0]>.57 and size[1]<.065 and size[2]<.065,(obj.name,size)
for pipe,ends in [('Suction elbow',['Axial suction collar','Inlet deck union']),('Discharge return riser',['Formed volute casing','Outlet sealed deck union']),('Motor supply conduit',['Motor electrical gland','Electrical deck gland'])]:
    obj=named(pipe)[0];p=box(obj)
    for end in ends:
        assert any(overlap(p,box(other)) for other in named(end)),(pipe,end)
        report['terminations'].append({'pipe':pipe,'fitting':end,'boundsOverlap':True})
for name in ['Continuous rubber isolation pad','Inlet sealed deck neck','Outlet deck neck','Electrical gland footing']:
    assert abs(box(named(name)[0])['min'][2])<1e-6,name
# Compare complete exported pump triangles against neighbouring frozen machine
# surfaces. Omit only the nine measured old pump batches and deck contact faces.
bpy.ops.wm.read_factory_settings(use_empty=True)
manifest=json.loads((ROOT/'godot/art/nomad-pumps.json').read_text())
old_names={entry['frozen'] for entry in manifest['trim']}
def selected(p):return any(all(box['min'][i]-.003<p[i]<box['max'][i]+.003 for i in range(3)) for box in manifest['originalBoxes'])
def load_geometry(path,neighbours=False):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));bpy.context.view_layer.update();points=[];triangles=[]
    for obj in set(bpy.data.objects)-before:
        if obj.type!='MESH':continue
        start=len(points);local=[obj.matrix_world@v.co for v in obj.data.vertices];points.extend(local);obj.data.calc_loop_triangles()
        for tri in obj.data.loop_triangles:
            coords=[(local[i].x,local[i].z,-local[i].y) for i in tri.vertices]
            if neighbours and (max(p[1] for p in coords)<=12.44 or (obj.name in old_names and all(selected(p) for p in coords))):continue
            triangles.append(tuple(start+i for i in tri.vertices))
    return points,triangles
original=load_geometry(ROOT/'godot/assets/runtime/machine.glb',True)
mesh=load_geometry(ROOT/'godot/art/nomad-service-pump.glb')
neighbours=BVHTree.FromPolygons(*original,all_triangles=True)
report['neighbourClearance']=[]
for site in manifest['sites']:
    x,y,z=site['position'];offset=Vector((x,-z,y));points=[p+offset for p in mesh[0]];tree=BVHTree.FromPolygons(points,mesh[1],all_triangles=True)
    pairs=tree.overlap(neighbours)
    report['neighbourClearance'].append({'site':site['name'],'overlappingTrianglePairs':len(pairs)})
    assert not pairs,(site['name'],'Pump intersects neighbouring machine geometry',len(pairs))
report['passed']=True
(OUT/'source-fit.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print('PUMP_SOURCE_FIT',json.dumps(report),flush=True)
