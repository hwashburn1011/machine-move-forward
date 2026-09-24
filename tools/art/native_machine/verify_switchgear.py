"""Actual Blender source support/closure and exported neighbouring-mesh checks."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/native-switchgear'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'NomadSwitchgear.blend'));bpy.context.view_layer.update()
def bounds(name):
    o=bpy.data.objects[name];p=[o.matrix_world@v.co for v in o.data.vertices];return {'min':[min(v[i] for v in p) for i in range(3)],'max':[max(v[i] for v in p) for i in range(3)]}
plinth=bounds('Continuous deck plinth');body=bounds('Continuous folded enclosure');roof=bounds('Top drip lip')
assert abs(plinth['min'][2])<1e-6 and abs(body['min'][2]-plinth['max'][2])<1e-6
assert abs(roof['min'][2]-body['max'][2])<1e-6 and roof['max'][2]>body['max'][2]+.015
report={'support':{'deckContactY':plinth['min'][2],'plinthToBodyGap':body['min'][2]-plinth['max'][2],'bodyToLidGap':roof['min'][2]-body['max'][2],'lidTopY':roof['max'][2]},'neighbourTests':[]}
bpy.ops.wm.read_factory_settings(use_empty=True)
def imported(path):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));bpy.context.view_layer.update();vertices=[];triangles=[]
    for obj in set(bpy.data.objects)-before:
        if obj.type!='MESH':continue
        start=len(vertices);vertices.extend(obj.matrix_world@v.co for v in obj.data.vertices);obj.data.calc_loop_triangles();triangles.extend(tuple(start+i for i in tri.vertices) for tri in obj.data.loop_triangles)
    return vertices,triangles
def placed(geometry,position,yaw=0):
    transform=Matrix.Translation(Vector((position[0],-position[2],position[1])))@Matrix.Rotation(yaw,4,'Z');v=[transform@p for p in geometry[0]];return v,geometry[1],BVHTree.FromPolygons(v,geometry[1],all_triangles=True)
def segment_hit(p,q,tri):
    d=q-p
    if d.length<1e-9:return False
    hit=intersect_ray_tri(*tri,d,p,True)
    return hit is not None and 1e-6<(hit-p).dot(d)/d.length_squared<1-1e-6
master=imported(ROOT/'godot/art/nomad-switchgear.glb');cargo=imported(ROOT/'godot/art/nomad-cargo-locker.glb');vessel=imported(ROOT/'godot/art/nomad-pressure-vessel.glb')
neighbours=[]
for site in json.loads((ROOT/'godot/art/nomad-lockers.json').read_text())['sites']:neighbours.append((site['name'],placed(cargo,site['position'],site['yaw'])))
for site in json.loads((ROOT/'godot/art/nomad-vessels.json').read_text())['sites']:neighbours.append((site['name'],placed(vessel,site['position'])))
for site in json.loads((ROOT/'godot/art/nomad-switchgear.json').read_text())['sites']:
    a=placed(master,site['position'],site['yaw'])
    for name,b in neighbours:
        pairs=a[2].overlap(b[2]);hits=0
        for ia,ib in pairs:
            ta=[a[0][i] for i in a[1][ia]];tb=[b[0][i] for i in b[1][ib]]
            for source,target in [(ta,tb),(tb,ta)]:
                for i in range(3):hits+=int(segment_hit(source[i],source[(i+1)%3],target))
        report['neighbourTests'].append({'cabinet':site['name'],'neighbour':name,'candidatePairs':len(pairs),'intersections':hits})
report['passed']=all(r['intersections']==0 for r in report['neighbourTests'])
(OUT/'source-fit.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print('SWITCHGEAR_SOURCE_FIT',json.dumps(report),flush=True)
assert report['passed'],'Switchgear intersects an adjacent refined artifact'
