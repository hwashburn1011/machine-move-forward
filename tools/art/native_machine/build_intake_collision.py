"""Compose exact old intake removal with the earlier pump/bench collision trims."""
import bpy,ast,json,sys,math,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];ART=ROOT/'godot/art';OUT=ROOT/'assets/native-turbine'
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'));import common as c
root=c.empty('IntakeCollision');metal=c.flat('Intake collision preview',(.25,.3,.28));paint=metal
recipe=ast.parse((ROOT/'tools/art/native_machine/build_switchgear.py').read_text())
exec(compile(ast.Module(body=[n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name in ['box','tube']],type_ignores=[]),'<collision helpers>','exec'))
# Guards close the moving rotor to walking, camera and bullet queries, as the
# original disk did. Use a low-resolution envelope, never all detailed wires.
points=[];faces=[];N=64;Y=1.62
for z,r in [(-.491,1.433),(-.38,1.545),(.29,1.535),(.393,1.433)]:
    points.extend([(r*math.cos(j*math.tau/N),Y+r*math.sin(j*math.tau/N),z) for j in range(N)])
for k in range(3):
    for j in range(N):faces.append((k*N+j,k*N+(j+1)%N,(k+1)*N+(j+1)%N,(k+1)*N+j))
faces.extend([tuple(reversed(range(N))),tuple(range(3*N,4*N))])
data=bpy.data.meshes.new('Guard and casing envelope');data.from_pydata([c.xyz(p) for p in points],[],faces);data.update();obj=bpy.data.objects.new('Guard and casing envelope',data);bpy.context.collection.objects.link(obj);c.finish(obj,obj.name,metal,root,0)
tube('Central hub',(0,Y,-.566),(0,Y,-.491),.20,metal,24,0)
for side in [-1,1]:
    x=side*1.02;box('Pad and shoe',(x,.032,0),(.56,.064,.77),metal,0)
    # Eight-point saddle follows the casing underside. No solid block across
    # the open space beneath the raised circular duct.
    xs=[side*(.8+i*.4/4) for i in range(5)];points=[]
    for z in [-.29,.25]:
        points.extend([(xx,.064,z) for xx in xs]);points.extend([(xx,Y-math.sqrt(1.518**2-xx**2),z) for xx in xs])
    faces=[];M=len(xs)
    for j in range(M-1):faces.extend([(j,j+1,M+j+1,M+j),(2*M+j,3*M+j,3*M+j+1,2*M+j+1),(M+j,M+j+1,3*M+j+1,3*M+j),(j,2*M+j,2*M+j+1,j+1)])
    faces.extend([(0,M,3*M,2*M),(M-1,3*M-1,4*M-1,2*M-1)])
    data=bpy.data.meshes.new('Saddle');data.from_pydata([c.xyz(p) for p in points],[],faces);data.update();obj=bpy.data.objects.new('Saddle',data);bpy.context.collection.objects.link(obj);c.finish(obj,'Saddle',metal,root,0)
box('Bed',(0,.09,0),(1.62,.09,.25),metal,0)
for obj in root.children_recursive:
    obj.location*=.95
    if obj.type=='MESH':
        for vertex in obj.data.vertices:vertex.co*=.95
        obj.data.update()
bpy.ops.object.select_all(action='DESELECT');parts=[o for o in root.children if o.type=='MESH']
for obj in parts:obj.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();obj=bpy.context.object;obj.name='IntakeCollisionSurface'
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
obj.data.calc_loop_triangles();count=len(obj.data.loop_triangles)
root.select_set(True);bpy.ops.export_scene.gltf(filepath=str(ART/'nomad-intake-collision.glb'),export_format='GLB',use_selection=True,export_animations=False)
prior=json.loads((ART/'nomad-benches-collision.json').read_text());manifest=json.loads((ART/'nomad-intake.json').read_text());b=manifest['originalBox']
data=json.loads((ROOT/'godot/data/runtime.json').read_text());result={}
for index,raw in enumerate(data['colliders']):
    if 'vertices' not in raw:continue
    points=list(zip(*[iter(raw['vertices'])]*3));indices=raw['indices']
    chosen={i for i,p in enumerate(points) if all(b['min'][k]<p[k]<b['max'][k] for k in range(3))}
    if not chosen:continue
    removed=[]
    for j in range(0,len(indices),3):
        n=sum(indices[k] in chosen for k in range(j,j+3));assert n in [0,3],('Partial collision triangle',index,j)
        if n==3:removed.append(j)
    if not removed:continue
    assert index==prior['sourceCollider'] and not result,('Unexpected shared collider',index)
    assert raw['position']=={'x':0,'y':0,'z':0} and raw['rotation']=={'x':0,'y':0,'z':0,'w':1}
    earlier={j for j in range(0,len(indices),3) if not any(a<=j<b for a,b in prior['retainedIndexRanges'])}
    assert not earlier.intersection(removed)
    ranges=[];start=0
    for j in sorted(earlier.union(removed)):
        if start<j:ranges.append([start,j])
        start=j+3
    if start<len(indices):ranges.append([start,len(indices)])
    result={'sourceCollider':index,'sourceIndexCount':len(indices),'priorPumpRemovedTriangles':prior['priorPumpRemovedTriangles'],'priorBenchRemovedTriangles':prior['removedBenchTriangles'],'removedIntakeTriangles':len(removed),'retainedIndexRanges':ranges,'replacementTriangles':count,'sourceSha256':hashlib.sha256(json.dumps(raw,separators=(',',':')).encode()).hexdigest()}
assert result and result['removedIntakeTriangles']==12724
(ART/'nomad-intake-collision.json').write_text(json.dumps(result,indent=2),encoding='utf-8');(OUT/'collision-manifest.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print('INTAKE_COLLISION',json.dumps(result),flush=True)
