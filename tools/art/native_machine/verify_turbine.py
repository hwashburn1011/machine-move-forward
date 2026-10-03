"""Verify grounded mounting, real rotor clearance and complete neighbouring mesh fit."""
import bpy,json,math
from collections import Counter
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/native-turbine';ART=ROOT/'godot/art'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'NomadMainIntake.blend'));bpy.context.view_layer.update()
def named(prefix):return [o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith(prefix)]
def bounds(obj):
    points=[obj.matrix_world@v.co for v in obj.data.vertices]
    return {'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]}
def gap(a,b):return max(max(a['min'][i]-b['max'][i],b['min'][i]-a['max'][i]) for i in range(3))
def geometry(objects):
    points=[];faces=[]
    for obj in objects:
        first=len(points);points.extend([obj.matrix_world@v.co for v in obj.data.vertices]);obj.data.calc_loop_triangles();faces.extend([tuple(first+i for i in t.vertices) for t in obj.data.loop_triangles])
    return points,faces
report={'supports':[],'deckContact':[],'bladeClearance':[]}
for subject,partners in [('Bolted steel mounting shoe',['Deck isolation pad']),('Fitted cast saddle',['Bolted steel mounting shoe']),('Saddle connecting bed',['Fitted cast saddle']),('Rear maintenance plate',['Saddle connecting bed']),('Drive data plate',['Bearing end cap'])]:
    for obj in named(subject):
        value=min(gap(bounds(obj),bounds(other)) for prefix in partners for other in named(prefix));report['supports'].append({'part':obj.name,'gapM':value});assert value<1e-5,(obj.name,value)
for obj in named('Deck isolation pad'):
    y=bounds(obj)['min'][2];report['deckContact'].append(y);assert abs(y)<1e-6
blades=named('Curved closed impeller vane');assert len(blades)==36
rotor=bpy.data.objects['Turbine_Rotor'];housing=bpy.data.objects['IntakeHousing'];static=BVHTree.FromPolygons(*geometry([o for o in housing.children_recursive if o.type=='MESH']),all_triangles=True)
# Blade arrangement repeats every ten degrees; sample the complete unique turn.
for degree in range(20):
    rotor.rotation_euler.y=-math.radians(degree*.5);bpy.context.view_layer.update()
    pairs=static.overlap(BVHTree.FromPolygons(*geometry(blades),all_triangles=True))
    report['bladeClearance'].append({'degrees':degree*.5,'intersectingTrianglePairs':len(pairs)});assert not pairs,('Blade crosses stationary geometry',degree,len(pairs))
rotor.rotation_euler.y=0;bpy.context.view_layer.update()
# In Blender, game Y is Z and the circular rotor plane is XZ.
points,_=geometry(blades);radius=max(math.hypot(p.x,p.z-1.62*.95) for p in points)
report['bladeMaximumRadiusM']=radius;report['radialBoreClearanceM']=1.422*.95-radius;assert radius<1.400*.95

bpy.ops.wm.read_factory_settings(use_empty=True)
def load_geometry(path,neighbours=False):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));bpy.context.view_layer.update();objects=[]
    for obj in set(bpy.data.objects)-before:
        if obj.type!='MESH':continue
        ancestor=obj;is_old=False
        while ancestor:
            if ancestor.name=='Front_Turbine_Housing':is_old=True
            ancestor=ancestor.parent
        if neighbours and is_old:continue
        objects.append(obj)
    points=[];faces=[];owners=[]
    for obj in objects:
        first=len(points);local=[obj.matrix_world@v.co for v in obj.data.vertices];points.extend(local);obj.data.calc_loop_triangles()
        for tri in obj.data.loop_triangles:
            if neighbours and max(local[i].z for i in tri.vertices)<=12.431:continue
            faces.append(tuple(first+i for i in tri.vertices))
            owners.append(obj.name)
    return points,faces,owners
original=load_geometry(ROOT/'godot/assets/runtime/machine.glb',True);new=load_geometry(ART/'nomad-main-intake.glb')
manifest=json.loads((ART/'nomad-intake.json').read_text());p=manifest['position'];transform=Matrix.Translation(Vector((p[0],-p[2],p[1])))
tree=BVHTree.FromPolygons([transform@v for v in new[0]],new[1],all_triangles=True)
pairs=tree.overlap(BVHTree.FromPolygons(*original[:2],all_triangles=True));report['neighbourIntersectingTrianglePairs']=len(pairs)
if pairs:
    print('INTERSECTIONS',Counter(original[2][b] for a,b in pairs))
    print('CONTACTS',[(original[2][b],[[round(float(q),4) for q in original[0][i]] for i in original[1][b]]) for a,b in pairs[:8]])
assert not pairs,('Intake crosses surrounding machine',len(pairs))
report['passed']=True;(OUT/'source-fit.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print('INTAKE_SOURCE_FIT',json.dumps(report),flush=True)
