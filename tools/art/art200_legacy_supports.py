"""Add reviewed attachments to the current pigment/atlas legacy master.

Run in background Blender after ART200_LEGACY_PALETTE_COMPLETE. This script is
idempotent: it appends supported hardware once, retaining all prior geometry,
UVs, custom normals, pigment corners and editable component collections.
"""
import bpy, json, hashlib, math, sys
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[2]
OLD=ROOT/'assets/art100/legacy';OUT=ROOT/'assets/art200/legacy-touchup'
assert 'ART200_LEGACY_PALETTE_COMPLETE' in (OUT/'finecomb.log').read_text(errors='replace')
bpy.ops.wm.open_mainfile(filepath=str(OLD/'Art100_DesertRefinement.blend'))
bpy.context.preferences.filepaths.save_version=0
S=bpy.context.scene;rows=json.loads((OLD/'manifest.json').read_text())
mat=bpy.data.objects[rows[0]['id']].data.materials[0]
VERSION='supports-2026-10-01-v3'
IDS=['wreck-pickup','wreck-ambulance','wreck-forklift','fuel-trailer','culvert','diesel-generator','signal-gantry']
image_ids=[(n.label,n.image.name,tuple(n.image.size))for n in mat.node_tree.nodes if n.type=='TEX_IMAGE']
prior_audit=json.loads((OUT/'supports-audit.json').read_text()) if (OUT/'supports-audit.json').exists() else {}
audit=prior_audit.get('changes',[]);newparts=[];current='';changed=[]

def bounds(o):
    # Hidden source collections can retain an unevaluated identity matrix_world.
    # Their authored location/rotation/scale remains authoritative.
    assert o.parent is None,o.name
    matrix=Matrix.LocRotScale(o.location,o.rotation_euler.to_quaternion(),o.scale)
    vs=[matrix@v.co for v in o.data.vertices]
    return Vector(tuple(min(v[i]for v in vs)for i in range(3))),Vector(tuple(max(v[i]for v in vs)for i in range(3)))

def parts(prefix):
    return [o for o in bpy.data.collections[current+' editable components'].objects if o.type=='MESH' and o.name.startswith(prefix)]

def unique(prefix):
    found=parts(prefix);assert len(found)==1,(current,prefix,len(found));return found[0]

def uv_project(o,tile=5):
    uv=o.data.uv_layers.new(name='UVMap');vs=[v.co for v in o.data.vertices]
    lo=[min(v[i]for v in vs)for i in range(3)];hi=[max(v[i]for v in vs)for i in range(3)]
    for p in o.data.polygons:
        axis=max(range(3),key=lambda i:abs(p.normal[i]));a,b=[i for i in range(3)if i!=axis]
        for li in p.loop_indices:
            v=o.data.vertices[o.data.loops[li].vertex_index].co
            u=(v[a]-lo[a])/max(.001,hi[a]-lo[a]);w=(v[b]-lo[b])/max(.001,hi[b]-lo[b])
            uv.data[li].uv=((tile%4+.018+u*.964)/4,(3-tile//4+.018+w*.964)/4)

def box(label,at,size,bevel=.006,tile=5):
    x,y,z=[v/2 for v in size]
    vertices=[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]
    faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    mesh=bpy.data.meshes.new('Finecomb '+label);mesh.from_pydata(vertices,[],faces);mesh.update()
    o=bpy.data.objects.new('Finecomb '+current+' / '+label,mesh);S.collection.objects.link(o);o.location=at
    mesh.materials.append(mat);uv_project(o,tile)
    color=mesh.color_attributes.new(name='Art200Pigment',type='FLOAT_COLOR',domain='CORNER')
    color.data.foreach_set('color',np.ones(len(mesh.loops)*4,dtype=np.float32));mesh.color_attributes.active_color=color
    for face in mesh.polygons:face.use_smooth=True
    mod=o.modifiers.new('Supported hardware soft edge','BEVEL');mod.width=min(bevel,min(size)*.19);mod.segments=2;mod.harden_normals=True
    mod=o.modifiers.new('Weighted flat hardware normals','WEIGHTED_NORMAL');mod.keep_sharp=True
    o['finecomb_support_version']=VERSION;newparts.append(o)
    return o

def bridge(label,lo,hi):
    lo=Vector(lo);hi=Vector(hi);return box(label,(lo+hi)*.5,hi-lo)

def seat_supports(seatprefix,baseprefix):
    base=unique(baseprefix);base_top=bounds(base)[1].z
    for i,seat in enumerate(parts(seatprefix)):
        lo,hi=bounds(seat);cx=(lo.x+hi.x)/2;cy=(lo.y+hi.y)/2
        bridge('seat pedestal '+str(i+1),(cx-.18,cy-.20,base_top-.022),(cx+.18,cy+.20,lo.z+.020))

def culvert_foundations():
    for wall in parts('culvert wing retaining wall'):
        lo,hi=bounds(wall)
        vertices=[v.co for v in wall.data.vertices]
        size=Vector(tuple(max(v[k]for v in vertices)-min(v[k]for v in vertices)for k in range(3)))
        top=lo.z+.035
        shoe=box('cast wingwall foundation shoe',(wall.location.x,wall.location.y,top*.5),(size.x+.12,size.y+.12,top),.025,0)
        shoe.rotation_euler=wall.rotation_euler.copy()
    return 'Two low cast foundation shoes ground the previously elevated retaining wingwalls and match their rotations.'

def headlamp_pedestals():
    bumper_top=bounds(unique('front bumper'))[1].z
    for lamp in parts('recessed headlamp'):
        lo,hi=bounds(lamp);cx=(lo.x+hi.x)*.5;cy=(lo.y+hi.y)*.5
        bridge('headlamp bumper mounting pedestal',(cx-.047,cy-.047,bumper_top-.020),(cx+.047,cy+.047,lo.z+.035))
    return 'Two small steel mounting pedestals connect the round headlamp housings to the front bumper, closing the 95 mm gap.'

def add_supports():
    if current=='wreck-pickup':
        seat_supports('seat squab','ribbed vehicle floor')
        for x in [-.28,.28]:bridge('grille welded return tab',(x-.045,-2.36,.81),(x+.045,-2.245,.895))
        return 'Two seat pedestals connect upholstery to floor; two welded return tabs connect cooling grille to bumper.'
    if current=='wreck-ambulance':
        seat_supports('seat squab','ribbed vehicle floor')
        cablo,cabhi=bounds(unique('dented cab crown'));rail_lo,rail_hi=bounds(unique('emergency beacon rail'))
        for x in [-.43,.43]:bridge('beacon roof saddle',(x-.075,-1.22,cablo.z-.015),(x+.075,-1.04,rail_lo.z+.020))
        for x in [-.67,.67]:
            for z in [1.00,1.43]:
                xa=sorted([x,math.copysign(1.055,x)])
                bridge('oxygen cradle wall tie',(xa[0]-.015,1.89,z-.025),(xa[1]+.015,1.97,z+.025))
        for x in [-1.08,1.08]:bridge('roof edge seating rail',(x-.065,-.63,2.68),(x+.065,2.735,2.765))
        for y in [-.605,2.69]:box('roof perimeter cross seat',(0,y,2.7275),(2.18,.09,.085))
        return 'Seats have floor pedestals; emergency light rail has two roof saddles; oxygen cradles tie to side walls; perimeter rails close roof-to-wall gap. '+headlamp_pedestals()
    if current=='wreck-forklift':
        seat_supports('driver seat','driver power unit')
        for x in [-.43,.43]:
            bridge('continuous chain inner strip',(x-.007,-1.526,.918),(x+.007,-1.504,2.968))
            box('chain upper tangent keeper',(x,-1.487,2.954),(.032,.105,.052))
            xa=sorted([x,math.copysign(.575,x)])
            bridge('sheave axle mast mounting',(xa[0]-.017,-1.452,2.920),(xa[1]+.017,-1.374,2.987))
        return 'Seat pedestal joins power unit; continuous inner chain strips connect every link to carriage and positively mounted sheave axles.'
    if current=='fuel-trailer':
        for x in [-.594,.594]:box('rear bumper welded hanger',(x,1.69,.535),(.11,.24,.12))
        return 'Two rear hangers connect safety beam directly into chassis channels.'
    if current=='culvert':
        rods=parts('collapsed inlet grate');lo,hi=bounds(rods[0]);footlo,foothi=bounds(unique('Cast footing at inlet'))
        y=(lo.y+hi.y)/2;z=lo.z+.09
        box('inlet grate continuous crossbar',(0,y,z),(2.01,.072,.075))
        for x in [-.9,.9]:bridge('grate apron anchor',(x-.037,y-.044,foothi.z-.035),(x+.037,y+.044,z+.03))
        return 'One continuous grate crossbar and two apron anchors support all inlet rods without closing the bore. '+culvert_foundations()
    if current=='diesel-generator':
        lo,hi=bounds(unique('Recessed enamel service plate DIESEL / 40'));bodylo,bodyhi=bounds(unique('diesel generator enclosure'))
        for x in [-.29,.29]:bridge('enamel plaque mounting post',(x-.026,lo.y+.005,(lo.z+hi.z)/2-.026),(x+.026,bodylo.y+.02,(lo.z+hi.z)/2+.026))
        return 'Two steel mounting posts connect the existing DIESEL / 40 plaque to enclosure; lettering and its UVs remain unchanged.'
    if current=='signal-gantry':
        for cx in [-2,1.5]:
            for dx in [-.82,.82]:box('panel-to-truss vertical strap',(cx+dx,-.344,5.768),(.08,.134,1.20))
        return 'Four continuous steel straps join panel backs, upper/lower mounting tubes and both actual truss chords.'
    raise AssertionError(current)

def array_of(collection,field,width):
    a=np.empty(len(collection)*width,dtype=np.float32);collection.foreach_get(field,a);return a

for current in IDS:
    runtime=bpy.data.objects[current]
    previous=runtime.get('finecomb_support_version')
    if previous==VERSION or (previous in ['supports-2026-10-01-v1','supports-2026-10-01-v2'] and current!='wreck-ambulance' and not (previous=='supports-2026-10-01-v1' and current=='culvert')):
        print('ALREADY_SUPPORTED',current,flush=True);continue
    original_vertices=array_of(runtime.data.vertices,'co',3)
    original_uv=array_of(runtime.data.uv_layers.active.data,'uv',2)
    original_color=array_of(runtime.data.color_attributes['Art200Pigment'].data,'color',4)
    original_normals=array_of(runtime.data.corner_normals,'vector',3)
    nv=len(runtime.data.vertices);nl=len(runtime.data.loops);newparts=[]
    note=headlamp_pedestals() if previous and current=='wreck-ambulance' else (culvert_foundations() if previous=='supports-2026-10-01-v1' and current=='culvert' else add_supports())
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
    evaluated=[]
    for part in newparts:
        evaluated_mesh=bpy.data.meshes.new_from_object(part.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
        o=bpy.data.objects.new('Runtime support duplicate',evaluated_mesh);S.collection.objects.link(o);o.matrix_world=part.matrix_world.copy();evaluated.append(o)
    saved_position=runtime.location.copy();runtime.location=(0,0,0)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT');runtime.select_set(True)
    for o in evaluated:o.select_set(True)
    bpy.context.view_layer.objects.active=runtime;bpy.ops.object.join()
    mod=runtime.modifiers.new('Support portable triangulation','TRIANGULATE');mod.keep_custom_normals=True;bpy.ops.object.modifier_apply(modifier=mod.name)
    assert np.array_equal(array_of(runtime.data.vertices,'co',3)[:nv*3],original_vertices),current+' original vertices moved'
    assert np.allclose(array_of(runtime.data.uv_layers.active.data,'uv',2)[:nl*2],original_uv,atol=1e-7),current+' original UVs changed'
    assert np.allclose(array_of(runtime.data.color_attributes['Art200Pigment'].data,'color',4)[:nl*4],original_color,atol=1e-7),current+' pigment changed'
    normal_delta=float(np.max(np.abs(array_of(runtime.data.corner_normals,'vector',3)[:nl*3]-original_normals)))
    assert normal_delta<.0002,(current,'existing custom normals changed beyond 16-bit re-encoding precision',normal_delta)
    assert len(runtime.data.materials)==1,(current,'material batches')
    runtime.location=saved_position;runtime['finecomb_support_version']=VERSION
    coll=bpy.data.collections[current+' editable components']
    for part in newparts:
        for owner in list(part.users_collection):owner.objects.unlink(part)
        coll.objects.link(part)
    row=next(r for r in rows if r['id']==current);row['fine_comb_supports']=(row.get('fine_comb_supports','')+' '+note).strip() if previous else note;row['editable_parts']=len(coll.objects)
    audit.append({'id':current,'added_editable_parts':[o.name for o in newparts],'original_vertices_uvs_pigment_preserved':True,'maximum_existing_normal_delta':normal_delta,'note':note})
    changed.append(current)
    print('SUPPORTED',current,len(newparts),'new editable supports',flush=True)

# All root bounds and accounting stay authoritative after append-only changes.
for row in rows:
    o=bpy.data.objects[row['id']];me=o.data;me.calc_loop_triangles();vs=np.array([v.co[:]for v in me.vertices]);lo=vs.min(0);hi=vs.max(0)
    row['triangles']=len(me.loop_triangles);row['dimensions_m']=[float(hi[0]-lo[0]),float(hi[2]-lo[2]),float(hi[1]-lo[1])]
    row['bounds_godot']={'min':[float(lo[0]),float(lo[2]),float(-hi[1])],'max':[float(hi[0]),float(hi[2]),float(-lo[1])]}
    row['runtime_geometry_sha256']=hashlib.sha256(vs.astype('<f4').tobytes()+np.array([t.vertices[:]for t in me.loop_triangles],dtype='<u4').tobytes()).hexdigest()
    assert abs(float(lo[2]))<1e-4,(row['id'],float(lo[2]))
    assert len(me.materials)==1
    assert me.color_attributes.get('Art200Pigment') is not None
assert image_ids==[(n.label,n.image.name,tuple(n.image.size))for n in mat.node_tree.nodes if n.type=='TEX_IMAGE']
saved={r['id']:bpy.data.objects[r['id']].location.copy()for r in rows}
bpy.ops.object.select_all(action='DESELECT')
for r in rows:
    o=bpy.data.objects[r['id']];o.location=(0,0,0);o.select_set(True)
glb=ROOT/'godot/art/art100-legacy.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,export_normals=True,export_texcoords=True,export_tangents=True,export_materials='EXPORT',export_vertex_color='NAME',export_vertex_color_name='Art200Pigment',export_all_vertex_colors=False)
for k,at in saved.items():bpy.data.objects[k].location=at
bpy.ops.wm.save_as_mainfile(filepath=str(OLD/'Art100_DesertRefinement.blend'))
(OLD/'manifest.json').write_text(json.dumps(rows,indent=2)+'\n')
report={'version':VERSION,'models_corrected':IDS,'glb_sha256':hashlib.sha256(glb.read_bytes()).hexdigest(),'master_sha256':hashlib.sha256((OLD/'Art100_DesertRefinement.blend').read_bytes()).hexdigest(),'materials_per_model':1,'triangles':sum(r['triangles']for r in rows),'texture_nodes_preserved':image_ids,'changes':audit}
(OUT/'supports-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print('ART200_LEGACY_SUPPORTS_EXPORTED',report['triangles'],report['glb_sha256'],flush=True)
if '--skip-render' in sys.argv:raise SystemExit(0)
models=[bpy.data.objects[r['id']]for r in rows];camera=S.camera
S.render.resolution_x=920;S.render.resolution_y=920;S.render.resolution_percentage=100;S.cycles.samples=24
for o in models:o.location=(0,0,0);o.hide_render=True
for key in changed:
    o=bpy.data.objects[key];o.hide_render=False;bpy.context.view_layer.update();lo,hi=bounds(o);center=(lo+hi)*.5;span=max(hi-lo)
    camera.location=center+Vector((1.15,-1.5,.95))*span;camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=span*1.42
    S.render.filepath=str(OLD/'renders'/(key+'.png'));bpy.ops.render.render(write_still=True);o.hide_render=True
    print('REVIEWED_SUPPORTS',key,flush=True)
print('ART200_LEGACY_SUPPORTS_COMPLETE',flush=True)
