"""Narrow, reproducible overlap cleanup of the existing editable access module.

Never rebuilds the machine or changes stairs, rails, supports or materials.
Run with Blender --background --threads 4 --python this_file.
"""
import bpy, json, sys, shutil, hashlib
from pathlib import Path
from mathutils import Matrix, Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'test-results/roof-floor';OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'assets/native-machine/NomadNativeAccess.blend'
ARCHIVE=OUT/'before-sources/NomadNativeAccess.blend'
ARCHIVE.parent.mkdir(parents=True,exist_ok=True)
if not ARCHIVE.exists():shutil.copy2(SOURCE,ARCHIVE)
sys.path.insert(0,str(ROOT/'tools/art/iron_nomad'));import kit
bpy.ops.wm.open_mainfile(filepath=str(ARCHIVE))
scene=bpy.context.scene;scene.view_layers[0].update()
prefixes=['Playable deck ','Walkaround deck ','Port continuous bypass deck','Upper external stair landing','External stair transfer landing']
floors=[o for o in scene.objects if o.type=='MESH' and any(o.name.startswith(p) for p in prefixes)]
assert len(floors)>400

def rect_of(o):
    points=[o.matrix_world@Vector(p) for p in o.bound_box]
    return [round(min(p.x for p in points),4),round(max(p.x for p in points),4),round(-max(p.y for p in points),4),round(-min(p.y for p in points),4)],round(max(p.z for p in points),4)
def subtract(rect,cut):
    x0,x1,z0,z1=rect;a,b,c,d=cut
    if x1<=a or x0>=b or z1<=c or z0>=d:return [rect]
    return [list(p) for p in [(x0,min(x1,a),z0,z1),(max(x0,b),x1,z0,z1),(max(x0,a),min(x1,b),z0,min(z1,c)),(max(x0,a),min(x1,b),max(z0,d),z1)] if p[1]-p[0]>1e-5 and p[3]-p[2]>1e-5]
def area(r):return (r[1]-r[0])*(r[3]-r[2])
def signature(o):
    return hashlib.sha256(repr(([tuple(v.co) for v in o.data.vertices],[tuple(p.vertices) for p in o.data.polygons],list(o.matrix_world))).encode()).hexdigest()
untouched={o.name:signature(o) for o in scene.objects if o.type=='MESH' and o not in floors}
accepted={};prior={};changes=[]
for obj in sorted(floors,key=lambda o:(next(i for i,p in enumerate(prefixes) if o.name.startswith(p)),o.name)):
    rect,y=rect_of(obj);level=round((y-16.03)/3.6);key=str(level)
    assert abs(y-(16.03+level*3.6))<.001
    parts=[rect];prior.setdefault(key,[]).append(rect)
    for cut in accepted.setdefault(key,[]):parts=[part for item in parts for part in subtract(item,cut)]
    if parts!=[rect]:
        changes.append({'name':obj.name,'rect':rect,'retained':parts,'deck':level})
        mat=obj.material_slots[0].material;parent=obj.parent;name=obj.name
        bpy.data.objects.remove(obj,do_unlink=True)
        for i,(x0,x1,z0,z1) in enumerate(parts):
            kit.box(name+'_disjoint_'+str(i),((x0+x1)/2,-(z0+z1)/2,y-.09),(x1-x0,z1-z0,.18),mat,parent,.012)
    accepted[key].extend(parts)
assert all(signature(bpy.data.objects[name])==value for name,value in untouched.items())

def merge_rects(rects):
    rects=[list(r) for r in rects];changed=True
    while changed:
        changed=False
        for i,a in enumerate(rects):
            for j in range(i+1,len(rects)):
                b=rects[j];joined=None
                if a[:2]==b[:2] and (a[3]==b[2] or b[3]==a[2]):joined=[a[0],a[1],min(a[2],b[2]),max(a[3],b[3])]
                elif a[2:]==b[2:] and (a[1]==b[0] or b[1]==a[0]):joined=[min(a[0],b[0]),max(a[1],b[1]),a[2],a[3]]
                if joined:
                    rects[i]=joined;rects.pop(j);changed=True;break
            if changed:break
    return rects
footprint={'format':1,'units':'metres','axes':'game X/Z rectangles, fixed deck Y','levels':{key:merge_rects(value) for key,value in accepted.items()}}
report={'source_archive':str(ARCHIVE.relative_to(ROOT)),'unchanged_nonfloor_meshes':len(untouched),'changed_slabs':changes,'decks':{}}
report['editable_meshes']=sum(o.type=='MESH' for o in scene.objects)
for key,rects in accepted.items():
    covered=sum(map(area,rects));overlap=sum(map(area,prior[key]))-covered
    for i,r in enumerate(rects):
        assert all(abs(sum(map(area,subtract(r,c)))-area(r))<1e-6 for c in rects[i+1:])
    # Exact rectangle set subtraction proves complete coverage, including voids.
    for old in prior[key]:
        remainder=[old]
        for cut in rects:remainder=[p for r in remainder for p in subtract(r,cut)]
        assert not remainder
    report['decks'][key]={'original_area_with_duplicates':sum(map(area,prior[key])),'union_area':covered,'removed_duplicate_area':overlap,'after_overlap_area':0,'floor_pieces':len(rects),'coverage_unchanged':True,'footprint_rectangles':len(footprint['levels'][key])}
(ROOT/'godot/art/nomad-floor-footprint.json').write_text(json.dumps(footprint,indent=2))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)

# Same five batches, materials, triangulation and portable tangent contract.
for material in list(bpy.data.materials):
    objects=[o for o in scene.objects if o.type=='MESH' and len(o.material_slots)==1 and o.material_slots[0].material==material]
    if not objects:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:bpy.ops.object.join()
    obj=bpy.context.object;obj.name='NativeAccess_'+material.name
    obj.data.transform(obj.matrix_world);obj.matrix_world=Matrix.Identity(4)
    obj.data.materials.clear();obj.data.materials.append(material)
    for p in obj.data.polygons:p.material_index=0
    mod=obj.modifiers.new('Portable explicit triangulation','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
    if material.name.startswith('Nomad_'):
        obj.data.materials.clear();obj.data.materials.append(kit.plain('Shared_'+material.name,(.2,.22,.21),.5,.65))
report['runtime_batches']=sum(o.type=='MESH' for o in scene.objects)
for o in scene.objects:
    if o.type=='MESH':o.data.calc_loop_triangles()
report['triangles']=sum(len(o.data.loop_triangles) for o in scene.objects if o.type=='MESH')
assert report['runtime_batches']==5
bpy.ops.export_scene.gltf(filepath=str(ROOT/'godot/art/nomad-access.glb'),export_format='GLB',use_active_scene=True,export_animations=False,export_tangents=True)
sys.path.insert(0,str(Path(__file__).parent))
from floor_export_tangents import repair
report['repaired_degenerate_uv_tangents']=repair(ROOT/'godot/art/nomad-access.glb')
manifest_path=ROOT/'assets/native-machine/manifest.json';manifest=json.loads(manifest_path.read_text())
manifest['floorSurfaceCleanup']=report;manifest['triangles']=report['triangles'];manifest['editableMeshes']=report['editable_meshes'];manifest_path.write_text(json.dumps(manifest,indent=2))
(OUT/'machine-floor-geometry.json').write_text(json.dumps(report,indent=2))
print('FLOOR_SURFACE_REFINEMENT_COMPLETE',json.dumps(report),flush=True)
