"""Reroute only four complete cable components in two frozen native batches."""
import bpy,json
from pathlib import Path
from mathutils import Matrix,Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/native-machine'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/runtime/machine.glb'))
bpy.context.view_layer.update()
specs=[
    ('Secured_weatherproof_cargo_locker001_4','NativeCargoCables',.65,[((-11.608,11.415,-3.920),(-11.094,11.910,-1.159))]),
    ('Suspended_undercarriage_reduction_gearbox001_5','NativeSideWiring',.45,[((-11.453,14.601,-.807),(-11.330,15.068,.802))]),
]
root=bpy.data.objects.new('NativeServiceCables',None);bpy.context.scene.collection.objects.link(root)
kept=[root];report=[]
for old_name,new_name,shift,regions in specs:
    obj=bpy.data.objects.get(old_name)
    assert obj is not None and obj.type=='MESH',old_name
    obj.data=obj.data.copy();obj.data.transform(obj.matrix_world);obj.parent=None;obj.matrix_world=Matrix.Identity(4)
    chosen=set()
    for v in obj.data.vertices:
        at=Vector((v.co.x,v.co.z,-v.co.y))
        if any(all(a[i]-.012<=at[i]<=b[i]+.012 for i in range(3)) for a,b in regions):chosen.add(v.index)
    assert chosen,f'No cable vertices found in {old_name}'
    # If a crop intersects part of a face, it could include unrelated geometry.
    # Abort instead of deforming a partial component or stretching triangles.
    for face in obj.data.polygons:
        count=sum(v in chosen for v in face.vertices)
        assert count==0 or count==len(face.vertices),f'Partial face in {old_name}: {face.index}'
    untouched={v.index:tuple(v.co) for v in obj.data.vertices if v.index not in chosen}
    for index in chosen:obj.data.vertices[index].co.x+=shift
    assert all(tuple(obj.data.vertices[i].co)==value for i,value in untouched.items())
    obj.name=new_name;obj.parent=root;kept.append(obj)
    obj.data.calc_loop_triangles()
    report.append({'originalMesh':old_name,'replacementMesh':new_name,'shiftInboardM':shift,'movedVertices':len(chosen),'unchangedVertices':len(untouched),'triangles':len(obj.data.loop_triangles)})
for obj in list(bpy.context.scene.objects):
    if obj not in kept:bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.outliner.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadServiceCables.blend'),compress=True)
for obj in kept:
    if obj.type!='MESH':continue
    mat=bpy.data.materials.new('Shared_'+obj.name);mat.diffuse_color=(.1,.1,.1,1)
    obj.data.materials.clear();obj.data.materials.append(mat)
    for p in obj.data.polygons:p.material_index=0
    bpy.context.view_layer.objects.active=obj
    tri=obj.modifiers.new('Portable triangulation','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'godot/art/nomad-service-cables.glb'),export_format='GLB',export_animations=False,export_tangents=True)
(OUT/'cable-manifest.json').write_text(json.dumps(report,indent=2));print('NATIVE_CABLES_COMPLETE',json.dumps(report),flush=True)
