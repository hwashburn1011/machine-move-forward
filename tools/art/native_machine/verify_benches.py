"""Check source support contact and complete exported neighbour clearance."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/native-benches';ART=ROOT/'godot/art'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'NomadServiceBench.blend'));bpy.context.view_layer.update()

def bounds(obj):
    points=[obj.matrix_world@v.co for v in obj.data.vertices]
    return {'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]}
def named(prefix):return [o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith(prefix)]
def gap(a,b):return max(max(a['min'][i]-b['max'][i],b['min'][i]-a['max'][i]) for i in range(3))
report={'supports':[],'deckContact':[]}
for subject,partners in [('Square welded leg',['Continuous deck shoe']),('Endframe crossmember',['Square welded leg']),('Upper longitudinal bearer',['Square welded leg']),('Full steel worktop',['Endframe crossmember','Upper longitudinal bearer']),('Drawer suspension housing',['Drawer welded suspension strap']),('Drawer welded suspension strap',['Upper longitudinal bearer']),('Lower folded parts shelf',['Endframe crossmember']),('Vise swivel base',['Full steel worktop']),('Vise fixed body',['Vise swivel base']),('Vise slide rail',['Vise swivel base']),('Vise moving body',['Vise slide rail']),('Replaceable vise jaw',['Vise moving body','Vise fixed body']),('Parts tray base',['Full steel worktop'])]:
    for obj in named(subject):
        value=min(gap(bounds(obj),bounds(other)) for prefix in partners for other in named(prefix));report['supports'].append({'part':obj.name,'gapM':value});assert value<1e-5,(obj.name,value)
for name in ['Sealed field tool case','Fastener case']:
    for subject,partners in [(name+' rubber foot',['Full steel worktop']), (name+' formed lower shell',[name+' rubber foot']), (name+' fitted lid',[name+' continuous lid gasket'])]:
        for obj in named(subject):
            value=min(gap(bounds(obj),bounds(other)) for prefix in partners for other in named(prefix));report['supports'].append({'part':obj.name,'gapM':value});assert value<1e-5,(obj.name,value)
for obj in named('Continuous deck shoe'):
    value=bounds(obj)['min'][2];assert abs(value)<1e-6;report['deckContact'].append({'part':obj.name,'minY':value})
assert abs(bounds(named('Full steel worktop')[0])['max'][2]-.7583333333)<1e-6
for obj in named('Endframe crossmember'):
    b=bounds(obj);assert abs(b['min'][1]+.201)<1e-6 and abs(b['max'][1]-.201)<1e-6,'Crossmembers must end at the leg inner faces without coplanar outer skins'

bpy.ops.wm.read_factory_settings(use_empty=True)
manifest=json.loads((ART/'nomad-benches.json').read_text());old_names={e['frozen'] for e in manifest['trim']}
def selected(p,boxes):return any(all(b['min'][i]-.003<p[i]<b['max'][i]+.003 for i in range(3)) for b in boxes)
def load_geometry(path,neighbours=False):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));bpy.context.view_layer.update();points=[];triangles=[]
    for obj in set(bpy.data.objects)-before:
        if obj.type!='MESH':continue
        start=len(points);local=[obj.matrix_world@v.co for v in obj.data.vertices];points.extend(local);obj.data.calc_loop_triangles()
        for tri in obj.data.loop_triangles:
            coords=[(local[i].x,local[i].z,-local[i].y) for i in tri.vertices]
            if neighbours and (max(p[1] for p in coords)<=12.44 or (obj.name in old_names and all(selected(p,manifest['originalBoxes']) for p in coords))):continue
            triangles.append(tuple(start+i for i in tri.vertices))
    return points,triangles
original=load_geometry(ROOT/'godot/assets/runtime/machine.glb',True);bench=load_geometry(ART/'nomad-service-bench.glb')
neighbours=[('frozen surrounding structure',BVHTree.FromPolygons(*original,all_triangles=True))]
for asset,info in [('nomad-service-pump','nomad-pumps'),('nomad-switchgear','nomad-switchgear'),('nomad-pressure-vessel','nomad-vessels')]:
    data=json.loads((ART/(info+'.json')).read_text());geometry=load_geometry(ART/(asset+'.glb'))
    for site in data['sites']:
        at=site['position'];transform=Matrix.Translation(Vector((at[0],-at[2],at[1])))@Matrix.Rotation(site.get('yaw',0),4,'Z')
        neighbours.append((site['name'],BVHTree.FromPolygons([transform@p for p in geometry[0]],geometry[1],all_triangles=True)))
report['neighbourClearance']=[]
for site in manifest['sites']:
    at=site['position'];transform=Matrix.Translation(Vector((at[0],-at[2],at[1])))@Matrix.Rotation(site['yaw'],4,'Z')
    tree=BVHTree.FromPolygons([transform@p for p in bench[0]],bench[1],all_triangles=True)
    for name,other in neighbours:
        pairs=tree.overlap(other);report['neighbourClearance'].append({'bench':site['name'],'neighbour':name,'overlappingTrianglePairs':len(pairs)})
        assert not pairs,(site['name'],name,'intersecting triangles',len(pairs))
report['passed']=True;(OUT/'source-fit.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print('BENCH_SOURCE_FIT',json.dumps(report),flush=True)
