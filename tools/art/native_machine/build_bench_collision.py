"""Author the bench collision and compose trims with the prior pump collision."""
import bpy,ast,json,sys,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];ART=ROOT/'godot/art';OUT=ROOT/'assets/native-benches'
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'));import common as c
root=c.empty('BenchCollision');metal=c.flat('Bench collision preview',(.25,.3,.28));paint=metal
recipe=ast.parse((ROOT/'tools/art/native_machine/build_switchgear.py').read_text())
exec(compile(ast.Module(body=[n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name=='box'],type_ignores=[]),'<box>','exec'))
TOP=.7583333333
for x in [-.81,.81]:
    for z in [-.235,.235]:
        box('Shoe',(x,.014,z),(.15,.028,.15),metal,0)
        box('Leg',(x,.364,z),(.068,.672,.068),metal,0)
    for y in [.175,TOP-.075]:box('Endframe',(x,y,0),(.068,.07,.402),metal,0)
box('Shelf',(0,.218,.032),(1.57,.027,.425),metal,0)
box('Worktop',(0,TOP-.020,0),(1.93,.040,.66),metal,0)
for z in [-.312,.312]:box('Skirt',(0,TOP-.060,z),(1.93,.082,.032),metal,0)
box('Drawer',(.47,.543,-.016),(.55,.31,.502),metal,0)
for x,w,h in [(.045,.37,.223),(.573,.30,.175)]:box('Case',(x,TOP+.012+h/2,.027),(w,h,.28),metal,0)
box('Vise',(-.62,TOP+.112,.02),(.224,.224,.224),metal,0)
box('Vise slide',(-.62,TOP+.079,-.179),(.12,.079,.198),metal,0)
bpy.ops.object.select_all(action='DESELECT');parts=[o for o in root.children if o.type=='MESH']
for obj in parts:obj.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();obj=bpy.context.object;obj.name='BenchCollisionSurface';obj.data.calc_loop_triangles();count=len(obj.data.loop_triangles)
root.select_set(True);bpy.ops.export_scene.gltf(filepath=str(ART/'nomad-bench-collision.glb'),export_format='GLB',use_selection=True,export_animations=False)
benches=json.loads((ART/'nomad-benches.json').read_text());pumps=json.loads((ART/'nomad-pumps-collision.json').read_text())
data=json.loads((ROOT/'godot/data/runtime.json').read_text());result={}
for index,raw in enumerate(data['colliders']):
    if 'vertices' not in raw:continue
    points=list(zip(*[iter(raw['vertices'])]*3));indices=raw['indices']
    chosen={i for i,p in enumerate(points) if any(all(b['min'][k]-.003<p[k]<b['max'][k]+.003 for k in range(3)) for b in benches['originalBoxes'])}
    if not chosen:continue
    bench_removed=[]
    for j in range(0,len(indices),3):
        n=sum(indices[k] in chosen for k in range(j,j+3));assert n in [0,3],('Partial collision triangle',index,j)
        if n==3:bench_removed.append(j)
    if not bench_removed:continue
    assert index==pumps['sourceCollider'] and not result,('Unexpected shared collider',index)
    assert raw['position']=={'x':0,'y':0,'z':0} and raw['rotation']=={'x':0,'y':0,'z':0,'w':1}
    prior_removed={j for j in range(0,len(indices),3) if not any(a<=j<b for a,b in pumps['retainedIndexRanges'])}
    assert not prior_removed.intersection(bench_removed)
    removed=sorted(prior_removed.union(bench_removed));ranges=[];start=0
    for j in removed:
        if start<j:ranges.append([start,j])
        start=j+3
    if start<len(indices):ranges.append([start,len(indices)])
    result={'sourceCollider':index,'sourceIndexCount':len(indices),'priorPumpRemovedTriangles':len(prior_removed),'removedBenchTriangles':len(bench_removed),'retainedIndexRanges':ranges,'replacementTrianglesPerBench':count,'sourceSha256':hashlib.sha256(json.dumps(raw,separators=(',',':')).encode()).hexdigest()}
assert result
(ART/'nomad-benches-collision.json').write_text(json.dumps(result,indent=2),encoding='utf-8');(OUT/'collision-manifest.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print('BENCH_COLLISION',json.dumps(result),flush=True)
