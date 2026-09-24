"""Derive a native access module from the editable Nomad, preserving the browser.

Run in an isolated Blender process. All new dimensions use game metres (Y up).
The original sources and the rest of the machine are never rewritten.
"""
import bpy, bmesh, json, sys, math
from pathlib import Path
from mathutils import Matrix, Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-machine';OUT.mkdir(parents=True,exist_ok=True)
RUNTIME=ROOT/'godot/art'
sys.path.insert(0,str(ROOT/'tools/art/iron_nomad'))
import kit

source_path=ROOT/'assets/iron-nomad/gameplay/source/IronNomad_Master.blend'
bpy.ops.wm.open_mainfile(filepath=str(source_path))
source=bpy.context.scene;source.view_layers[0].update()
original=bpy.data.objects['Gameplay_Decks_And_Access']
profile=json.loads((ROOT/'src/data/iron-nomad.json').read_text())
sx,sz,sy=profile['scale'];oy=profile['offsetY']
convert=Matrix.Diagonal((-sx,-sy,sz,1));convert.translation.z=oy
scene=bpy.data.scenes.new('Nomad native access - editable refinement')
root=bpy.data.objects.new('NomadNativeAccess',None);scene.collection.objects.link(root)
deps=bpy.context.evaluated_depsgraph_get()
removed=[];removed_corbels=[];retained=[]
for obj in original.children_recursive:
    if obj.type not in ['MESH','CURVE','FONT']:continue
    if obj.name.startswith('Bypass knee support'):
        removed.append(obj.name);continue
    if obj.name.startswith('Supported catwalk corbel'):
        center=convert@obj.matrix_world.translation
        if center.x < -11 and abs(center.y)<3.1 and center.z>11:
            removed_corbels.append(obj.name);continue
    mesh=bpy.data.meshes.new_from_object(obj.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
    mesh.materials.clear()
    for slot in obj.material_slots:mesh.materials.append(slot.material)
    mesh.transform(convert@obj.matrix_world)
    copy=bpy.data.objects.new(obj.name+'_Native',mesh);scene.collection.objects.link(copy);copy.parent=root
    retained.append(copy)
assert len(removed)==6, f'Unexpected source brace count: {removed}'
assert len(removed_corbels)==2, f'Unexpected stair-opening corbels: {removed_corbels}'
bpy.context.window.scene=scene
# Keep the saved source compact: all other authored machine data remains in its
# original file, while this derivative contains the complete access module.
for obj in list(source.objects):bpy.data.objects.remove(obj,do_unlink=True)
bpy.data.scenes.remove(source)
bpy.context.preferences.filepaths.save_version=0
def mat(fragment):return next(m for m in bpy.data.materials if fragment in m.name)
steel=mat('Charcoal_Steel');bare=mat('Aged_BareMetal');brass=mat('Worn_HandrailBrass')
paint=kit.plain('Native_Access_FadedOchre',(.43,.32,.15),.22,.78)
solids=[]
small_boxes={}
def xyz(p):return Vector((p[0],-p[2],p[1]))
def box(name,at,size,material=steel,bevel=.01,solid=False):
    dims=(size[0],size[2],size[1])
    if bevel<=.004:
        key=(dims,bevel)
        if key not in small_boxes:
            mesh=bpy.data.meshes.new(name);bm=bmesh.new();bmesh.ops.create_cube(bm,size=1)
            for v in bm.verts:
                for i in range(3):v.co[i]*=dims[i]
            if bevel:bmesh.ops.bevel(bm,geom=list(bm.edges),offset=bevel,segments=1,affect='EDGES')
            bm.to_mesh(mesh);bm.free();mesh.update();kit.uvmap(mesh);small_boxes[key]=mesh
        obj=kit.instance(name,small_boxes[key],material,root,xyz(at))
    else:obj=kit.box(name,xyz(at),dims,material,root,bevel)
    if solid:solids.append({'name':name,'position':dict(zip('xyz',at)),'half':dict(zip('xyz',[v*.5 for v in size]))})
    return obj
def beam(name,a,b,width=.16,depth=.20,material=steel):
    obj=kit.beam(name,xyz(a),xyz(b),width,depth,material,root,.012)
    solids.append({'name':name,'a':dict(zip('xyz',a)),'b':dict(zip('xyz',b)),'width':width,'depth':depth})
    return obj
def bolt(name,at,axis=(0,1,0),radius=.022):
    start=xyz(at);direction=xyz(axis)
    kit.cylinder(name+' washer',start,start+direction*.008,radius*1.5,bare,root,n=16)
    obj=kit.cylinder(name+' hex head',start+direction*.009,start+direction*.027,radius,brass,root,n=6)
    for p in obj.data.polygons:p.use_smooth=False

# End triangles transfer the catwalk load into the chassis girder. No brace
# spans the middle of either ascending flight; longitudinal rails carry the bay.
for level in [-2,-1]:
    y=profile['deckSurface']+level*3.6
    for x in [-14.82,-13.15]:
        beam('Bypass longitudinal box stringer',(x,y-.24,-4.78),(x,y-.24,4.78),.16,.22)
    for z in [-4.72,4.72]:
        a=(-10.72,y-.24,z);b=(-14.82,y-.24,z);c=(-10.72,y-1.12,z)
        beam('End bay outrigger top chord',a,b,.18,.22)
        beam('End bay diagonal knee',c,b,.16,.19)
        box('Chassis bolted hanger',(-10.72,y-.70,z),(.16,1.07,.26),steel,.015,True)
        for x,yy in [(-10.72,y-.27),(-10.72,y-1.05),(-14.72,y-.27)]:
            box('Outrigger welded gusset',(x,yy,z),(.36,.32,.028),bare,.014)
            for dx in [-.11,.11]:bolt('Gusset fastener',(x+dx,yy,z-.019),(0,0,-1),.026)

# Retain authored tread dimensions and running heights. Add beveled nosings,
# anti-slip ribs and visible captive bolts to all four existing 24-step flights.
flights=[(-12,-2,-3,3,1.88),(-12,-1,-3,3,1.88),(-2,-2,-2.4,2.4,1.92),(-2,-1,-2.4,2.4,1.92)]
for x,level,start,end,width in flights:
    y=profile['deckSurface']+level*3.6;step_depth=(end-start)/24
    for step in range(24):
        top=y+(step+1)*.15;z=start+(step+.5)*step_depth
        box('Tread anti-slip front lip',(x,top+.006,z-step_depth*.38),(width-.09,.012,.026),bare,.003)
        box('Tread worn safety insert',(x,top+.013,z-step_depth*.38),(width-.30,.004,.012),paint,.001)
        for dz in [-.012,.04]:box('Raised traction rib',(x,top+.004,z+dz),(width-.23,.008,.016),steel,.003)
        for dx in [-width*.41,width*.41]:bolt('Tread captive anchor',(x+dx,top+.005,z+step_depth*.25),radius=.014)

# Cap existing safety posts with bolted foot plates rather than floating rods.
for obj in retained:
    if not obj.name.startswith('External guard upright'):continue
    points=[obj.matrix_world@Vector(v) for v in obj.bound_box]
    lo=Vector([min(p[i] for p in points) for i in range(3)])
    hi=Vector([max(p[i] for p in points) for i in range(3)])
    x,z,y=(lo.x+hi.x)*.5,-(lo.y+hi.y)*.5,lo.z
    box('Stair rail welded foot',(x,y+.018,z),(.11,.036,.14),bare,.008)

# Standoff clamps secure the rerouted cable bundles to the inner chassis face.
for y,z in [(11.60,-3.60),(11.60,-1.43),(14.82,-.64),(14.82,.64)]:
    box('Cable tray chassis receiver',(-10.77,y,z),(.12,.27,.18),steel,.008)
    box('Cable retention saddle',(-10.95,y,z),(.28,.035,.12),brass,.004)
    box('Cable upper clamp',(-10.96,y+.12,z),(.09,.23,.11),bare,.008)
    for yy in [y-.065,y+.205]:bolt('Cable clamp fastener',(-11.01,yy,z),(-1,0,0),.016)

scene.view_layers[0].update()
for obj in scene.objects:
    if obj.type=='MESH':obj.data.calc_loop_triangles()
report={'source':str(source_path.relative_to(ROOT)),'sourceModule':'Gameplay_Decks_And_Access',
        'removedCrossFlightBraces':removed,'removedOpeningCorbels':removed_corbels,'retainedObjects':len(retained),'refinedTreads':96,
        'triangles':sum(len(o.data.loop_triangles) for o in scene.objects if o.type=='MESH'),
        'editableMeshes':sum(o.type=='MESH' for o in scene.objects),'collisionSupports':len(solids)}
(RUNTIME/'nomad-access-collision.json').write_text(json.dumps(solids,indent=2))
bpy.ops.outliner.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadNativeAccess.blend'),compress=True)

# Export material batches while retaining the individually editable .blend.
for material in list(bpy.data.materials):
    objects=[o for o in scene.objects if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==material]
    if not objects:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:bpy.ops.object.join()
    obj=bpy.context.object;obj.name='NativeAccess_'+material.name
    obj.data.transform(obj.matrix_world);obj.matrix_world=Matrix.Identity(4)
    # Merge helpers use per-object material links; normalize for glTF batching.
    obj.data.materials.clear();obj.data.materials.append(material)
    for p in obj.data.polygons:p.material_index=0
    triangulate=obj.modifiers.new('Portable explicit triangulation','TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
report['runtimeBatches']=sum(o.type=='MESH' for o in scene.objects)
# Runtime reuses the exact four materials from the replaced native module.
# Keep full textured materials in the editable source, but avoid a second copy
# of those texture maps in GPU memory or the exported asset.
shared=[]
for obj in scene.objects:
    if obj.type!='MESH':continue
    material=obj.data.materials[0]
    if material.name.startswith('Nomad_'):
        name=material.name;shared.append(name)
        placeholder=kit.plain('Shared_'+name,(.2,.22,.21),.5,.65)
        obj.data.materials.clear();obj.data.materials.append(placeholder)
report['sharedRuntimeMaterials']=shared
bpy.ops.export_scene.gltf(filepath=str(RUNTIME/'nomad-access.glb'),export_format='GLB',use_active_scene=True,export_animations=False,export_tangents=True)
(OUT/'manifest.json').write_text(json.dumps(report,indent=2));print('NATIVE_ACCESS_COMPLETE',json.dumps(report),flush=True)
