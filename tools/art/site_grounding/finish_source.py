"""Narrow fabrication cleanup, also called by the reproducible main builder."""
import bpy,bmesh,json,sys,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/site-grounding'
sys.path.insert(0,str(ROOT/'tools/art/native_site_roofs'))
import roofkit as k

def clean(roots,models):
    # Filled bevels at very narrow window mullions can leave area~1e-10 wedges.
    # They carry no useful surface; remove only those evaluated tiny faces.
    removed=0
    for r in roots:
        for o in r.children_recursive:
            if o.type!='MESH':continue
            bm=bmesh.new();bm.from_mesh(o.data)
            tiny=[f for f in bm.faces if f.calc_area()<1e-8];removed+=len(tiny)
            if tiny:bmesh.ops.delete(bm,geom=tiny,context='FACES_ONLY')
            bm.to_mesh(o.data);bm.free()
    print('COLLAPSED_BEVEL_FACES_REMOVED',removed,flush=True)

def repair_existing():
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'SiteGrounding.blend'))
    bpy.context.preferences.filepaths.save_version=0
    data=json.loads((OUT/'manifest.json').read_text());models=data['models']
    roots=[bpy.data.objects[name] for name in models]
    r=bpy.data.objects['WakeRelayPodium']
    for o in r.children_recursive:
        if o.type=='MESH' and o.name.startswith('Relay external buttress'):
            # Extend the original part itself, preserving UVs and materials.
            for v in o.data.vertices:v.co.z*=12.0/11.4
            o.location.z=-6.2
    for spec in models[r.name]['colliders']:
        if spec['size']==[.65,11.4,.6]:spec['at'][1]=-6.2;spec['size'][1]=12.0
    r=bpy.data.objects['SalvageDepotBase'];m=k.materials()
    for z in [-4.5,4.5]:
        for x in [-5.3,5.3]:
            for y in [-12,-6.4,-.7]:k.box('Depot brace wall cleat',(x,y,z*.97),(.42,.40,.54),m['steel'],r,.01,False)
    # Only the new six-vertex boxes require initial triangulation/UVs.
    for o in r.children_recursive:
        if o.type=='MESH' and o.name.startswith('Depot brace wall cleat'):
            bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();k.planar_uv(o)
    clean(roots,models)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'SiteGrounding.blend'),compress=True)
    for r in roots:
        tris=0;points=[]
        for o in r.children_recursive:
            if o.type!='MESH':continue
            o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
            points.extend([[p.x,p.z,-p.y] for p in [o.matrix_world@v.co for v in o.data.vertices]])
        models[r.name]['triangles']=tris
        if points:models[r.name]['bounds']={'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]}
        k.merge(r);models[r.name]['batches']=len([o for o in r.children_recursive if o.type=='MESH'])
    path=ROOT/'godot/art/native-site-grounding.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_animations=False,export_extras=True,export_tangents=True,export_vertex_color='NAME',export_vertex_color_name='RoofPigment',export_all_vertex_colors=False)
    data['sha256']=hashlib.sha256(path.read_bytes()).hexdigest();data['note']='Original upper assets untouched. Measured added architecture top is -0.12527 m, seated inside the original platform underside.'
    (OUT/'manifest.json').write_text(json.dumps(data,indent=2)+'\n');(ROOT/'godot/data/site-grounding.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
    print('GROUNDING_FINISH_COMPLETE',data['sha256'],flush=True)
if __name__=='__main__':repair_existing()
