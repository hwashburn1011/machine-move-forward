"""Refine native fixed cargo cases. Run only in isolated background Blender."""
import bpy,bmesh,math,json,sys,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-cargo-lockers';OUT.mkdir(parents=True,exist_ok=True)
ART=ROOT/'godot/art'
SITES=[(8.525,16.03,7.54),(-8.9375,16.03,-8.19),(8.8,12.43,9.88),(6.875,8.83,-6.5)]
DRUMS=[(9.625,16.03,7.8),(-9.625,16.03,-6.5),(5.5,16.03,10.4)]
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/runtime/machine.glb'))
bpy.context.view_layer.update();kept=[];trim=[]

def selected(v):
    x,y,z=v.co.x,v.co.z,-v.co.y
    return any(abs(x-a)<.565 and b-.03<y<b+.90 and abs(z-c)<.54 for a,b,c in SITES) or any(abs(x-a)<.31 and b-.015<y<b+.895 and abs(z-c)<.33 for a,b,c in DRUMS)

for suffix in ['', '_1', '_2', '_5']:
    old='Secured_weatherproof_cargo_locker001'+suffix;obj=bpy.data.objects[old]
    obj.data=obj.data.copy();obj.data.transform(obj.matrix_world);obj.parent=None;obj.matrix_world=Matrix.Identity(4)
    chosen={v.index for v in obj.data.vertices if selected(v)}
    assert chosen,old
    for f in obj.data.polygons:
        n=sum(v in chosen for v in f.vertices);assert n==0 or n==len(f.vertices),(old,f.index)
    before=sorted(tuple(v.co) for v in obj.data.vertices if v.index not in chosen)
    obj.data.calc_loop_triangles();old_triangles=len(obj.data.loop_triangles)
    bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[bm.verts[i] for i in chosen],context='VERTS');bm.to_mesh(obj.data);bm.free();obj.data.update()
    assert sorted(tuple(v.co) for v in obj.data.vertices)==before
    obj.data.calc_loop_triangles();name='NativePressureAccumulators' if obj.data.vertices else ''
    assert not name or suffix=='_1','Unexpected retained cargo components'
    trim.append({'original':old,'replacement':name,'removedVertices':len(chosen),'unchangedVertices':len(before),'originalTriangles':old_triangles,'keptTriangles':len(obj.data.loop_triangles),'unchangedCoordinatesSha256':hashlib.sha256(repr(before).encode()).hexdigest()})
    if name:obj.name=name;kept.append(obj)
for obj in list(bpy.context.scene.objects):
    if obj not in kept:bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.outliner.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'RetainedPressureAccumulators.blend'),compress=True)
for obj in kept:
    mat=bpy.data.materials.new('Shared_original_accumulators');mat.diffuse_color=(.1,.1,.1,1)
    obj.data.materials.clear();obj.data.materials.append(mat)
    for f in obj.data.polygons:f.material_index=0
bpy.ops.export_scene.gltf(filepath=str(ART/'nomad-pressure-fittings.glb'),export_format='GLB',export_animations=False,export_tangents=True)

sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'))
import common as c

def paint_material():
    """Fine coating wear around exposed panel edges; original portable PBR maps."""
    size=1024;rng=np.random.default_rng(911);v,u=np.mgrid[0:size,0:size]/(size-1)
    field=np.zeros((size,size));amplitude=1;total=0
    for grid in [9,23,61,149]:
        data=rng.random((grid+2,grid+2));x=u*grid;y=v*grid;ix=x.astype(int);iy=y.astype(int)
        fx=x-ix;fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
        field+=amplitude*((1-fy)*((1-fx)*data[iy,ix]+fx*data[iy,ix+1])+fy*((1-fx)*data[iy+1,ix]+fx*data[iy+1,ix+1]));total+=amplitude;amplitude*=.48
    field/=total;grain=rng.random((size,size));edge=np.minimum.reduce([u,1-u,v,1-v])
    exposed=np.clip((.023+(field-.5)*.075-edge)*70,0,1)
    pits=np.clip((field-.68)*15,0,1)*.5
    scratch=np.zeros_like(field)
    for i in range(440):
        x,y=rng.integers(0,size,2);length=rng.integers(3,37)
        for k in range(length):scratch[(y+k//7)%size,(x+k)%size]=rng.uniform(.25,.7)
    mat=c.flat('Locker worn enamel',(.33,.315,.255),.32,.73)
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes.get('Principled BSDF');maps={}
    for channel in ['Base','ORM','Normal']:
        pixels=np.ones((size,size,4),dtype=np.float32)
        if channel=='Base':
            coating=np.array([.33,.315,.255])[None,None,:]*(.88+.17*field[:,:,None]+.035*grain[:,:,None])
            bare=np.array([.17,.15,.115])[None,None,:]*(.88+.18*grain[:,:,None]);wear=np.maximum(exposed,pits)
            pixels[:,:,:3]=np.clip(coating*(1-wear[:,:,None])+bare*wear[:,:,None]+scratch[:,:,None]*.04,0,1)
        elif channel=='ORM':
            pixels[:,:,0]=1;pixels[:,:,1]=.70+field*.11+exposed*.035-scratch*.07;pixels[:,:,2]=.27+exposed*.35
        else:
            height=field*.22+grain*.012-exposed*.10-scratch*.035
            pixels[:,:,0]=.5+(np.roll(height,1,1)-np.roll(height,-1,1))*.35
            pixels[:,:,1]=.5+(np.roll(height,1,0)-np.roll(height,-1,0))*.35;pixels[:,:,2]=1
        img=bpy.data.images.new('Locker enamel '+channel,width=size,height=size);img.colorspace_settings.name='sRGB' if channel=='Base' else 'Non-Color';img.pixels.foreach_set(pixels.ravel());img.pack()
        node=nodes.new('ShaderNodeTexImage');node.image=img;maps[channel]=node
    links.new(maps['Base'].outputs['Color'],bs.inputs['Base Color'])
    sep=nodes.new('ShaderNodeSeparateColor');links.new(maps['ORM'].outputs['Color'],sep.inputs[0]);links.new(sep.outputs[1],bs.inputs['Roughness']);links.new(sep.outputs[2],bs.inputs['Metallic'])
    normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.42;links.new(maps['Normal'].outputs['Color'],normal.inputs['Color']);links.new(normal.outputs[0],bs.inputs['Normal'])
    return mat

paint=paint_material();metal=c.flat('Locker scoured fittings',(.145,.153,.14),.78,.58)
dark=c.flat('Locker recessed rubber',(.024,.029,.025),.06,.89)
ink=c.flat('Locker faded ink',(.58,.55,.43),.05,.85);c.letter=ink
root=c.empty('NomadCargoLocker')

def box(name,at,size,mat=paint,bevel=.005):return c.box(name,at,size,mat,root,bevel)
def tube(name,a,b,r,mat=metal,n=16):return c.tube(name,a,b,r,mat,root,n)
def shell(name,y0,y1,hx,hz,cut,mat):
    outline=[(-hx+cut,-hz),(hx-cut,-hz),(hx,-hz+cut),(hx,hz-cut),(hx-cut,hz),(-hx+cut,hz),(-hx,hz-cut),(-hx,-hz+cut)]
    vertices=[c.xyz((x,y,z)) for y in [y0,y1] for x,z in outline]
    faces=[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]+[tuple(reversed(range(8))),tuple(range(8,16))]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);c.finish(o,name,mat,root,.009)
    mod=o.modifiers.new('Planar weighted normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def rim(name,y0,y1,hx,hz,cut,width,mat):
    vertices=[];faces=[]
    for y,w,d,chamfer in [(y0,hx,hz,cut),(y1,hx,hz,cut),(y1,hx-width,hz-width,cut-width*(2-math.sqrt(2))),(y0,hx-width,hz-width,cut-width*(2-math.sqrt(2)))]:
        vertices.extend(c.xyz((x,y,z)) for x,z in [(-w+chamfer,-d),(w-chamfer,-d),(w,-d+chamfer),(w,d-chamfer),(w-chamfer,d),(-w+chamfer,d),(-w,d-chamfer),(-w,-d+chamfer)])
    for row in range(4):
        for i in range(8):faces.append((row*8+i,row*8+(i+1)%8,((row+1)%4)*8+(i+1)%8,((row+1)%4)*8+i))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);c.finish(o,name,mat,root,.004)
    mod=o.modifiers.new('Planar weighted normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def screw(x,y,z,side=-1):
    tube('Sealed rivet washer',(x,y,z),(x,y,z+side*.003),.008,dark,12)
    tube('Rivet head',(x,y,z+side*.003),(x,y,z+side*.006),.0055,metal,12)

# Two full length skids, rubber contact pads and deck-bolted restraint shoes.
for x in [-.34,.34]:
    box('Rubber skid contact',(x,.008,0),(.135,.016,.83),dark,.005)
    box('Load bearing skid',(x,.051,0),(.126,.078,.84),metal,.012)
for x in [-.47,.47]:
    for z in [-.29,.29]:
        box('Deck restraint foot',(x,.014,z),(.15,.028,.13),metal,.007)
        box('Welded foot gusset',(x,.072,z),(.034,.108,.06),metal,.005)
        for zz in [z-.042,z+.042]:
            tube('Foot washer',(x,.028,zz),(x,.031,zz),.014,dark,20)
            tube('Deck fixing bolt',(x,.031,zz),(x,.041,zz),.009,metal,6)
shell('Lower rolled case frame',.078,.131,.552,.472,.16,metal)
shell('Sealed pressed enclosure',.12,.707,.54,.459,.15,paint)
shell('Upper mating rim',.694,.717,.55,.469,.16,metal)
shell('Continuous lid gasket',.717,.728,.549,.468,.16,dark)
shell('Closed shallow lid',.728,.839,.545,.464,.16,paint)
rim('Open centre lid perimeter',.824,.851,.552,.472,.16,.030,metal)
shell('Recessed lid field',.838,.848,.520,.440,.14,paint)
# Corner protection follows the chamfer instead of protruding into the adjacent tank.
for sx in [-1,1]:
    for sz in [-1,1]:
        for y,h in [(.177,.14),(.657,.10),(.793,.084)]:
            o=box('Cast corner protector',(sx*.47,y,sz*.385),(.19,h,.017),metal,.008)
            o.rotation_euler.z=sx*sz*math.pi/4
        # Along the side wall, safely behind the clipped corner profile.
        box('Inset side reinforcement',(sx*.536,.412,sz*.26),(.018,.43,.045),paint,.008)
for z in [-.455,.455]:
    box('Broad pressed front field',(0,.413,z),(.728,.422,.012),paint,.018)
    for y in [.233,.534]:box('Rounded pressed reinforcing rib',(0,y,z+math.copysign(.007,z)),(.70,.033,.021),paint,.012)
    # Handles sit inside their own shallow cup and pivot on fixed clevises.
    s=-1 if z<0 else 1
    box('Recessed carry handle cup',(0,.444,z+s*.012),(.344,.121,.013),metal,.018)
    box('Handle cup interior',(0,.445,z+s*.020),(.296,.084,.011),dark,.018)
    for x in [-.123,.123]:
        box('Handle pivot clevis',(x,.472,z+s*.032),(.033,.035,.040),metal,.006)
        tube('Handle pivot pin',(x-.02,.472,z+s*.04),(x+.02,.472,z+s*.04),.008)
    c.cable('Folded carry bail',[(-.123,.47,z+s*.044),(-.117,.422,z+s*.050),(-.085,.406,z+s*.050),(.085,.406,z+s*.050),(.117,.422,z+s*.050),(.123,.47,z+s*.044)],.0085,metal,root)
    for x in [-.146,.146]:screw(x,.444,z+s*.020,s)
for x in [-.537,.537]:
    box('Pressed side panel',(x,.413,0),(.012,.408,.472),paint,.013)
    for z in [-.15,0,.15]:box('Side panel stiffener',(x+math.copysign(.008,x),.415,z),(.018,.354,.025),paint,.009)
# Two closed draw latches and three knuckled hinges connect lid to body.
for x in [-.285,.285]:
    box('Latch mounting plate',(x,.651,-.471),(.092,.151,.015),metal,.011)
    box('Draw latch lever',(x,.665,-.492),(.050,.091,.020),metal,.008)
    tube('Latch pivot axle',(x-.030,.630,-.501),(x+.030,.630,-.501),.008)
    c.cable('Captured draw loop',[(x-.025,.676,-.498),(x-.025,.753,-.487),(x,.767,-.487),(x+.025,.753,-.487),(x+.025,.676,-.498)],.005,metal,root)
    box('Lid catch',(x,.757,-.471),(.061,.022,.021),metal,.004)
    screw(x,.595,-.480);screw(x,.772,-.475)
for x in [-.27,0,.27]:
    for y in [.686,.772]:box('Hinge leaf',(x,y,.468),(.113,.066,.010),metal,.004)
    for k in range(5):tube('Interleaved hinge knuckle',(x-.052+k*.021,.728,.479),(x-.034+k*.021,.728,.479),.011)
    for dx in [-.038,.038]:
        for y in [.678,.783]:screw(x+dx,y,.475,1)
box('Recessed identity panel',(0,.321,-.466),(.383,.082,.009),paint,.005)
c.label('Transit case stencil','NOMAD / TRANSIT',(0,.330,-.473),.036,root)
c.label('Cargo seal stencil','SEALED STORES',(0,.294,-.473),.021,root)
for x in [-.16,.16]:screw(x,.310,-.473)
c.empty('LidHinge',(0,.728,.479),root);c.empty('LatchFace',(0,.66,-.49),root)

# Stable box-projected UVs keep panel wear at manufactured borders. Bevels retain
# separate normals; all meshes stay editable until the export copy is batched.
source_count=len([o for o in root.children_recursive if o.type=='MESH'])
for obj in list(root.children_recursive):
    if obj.type!='MESH':continue
    mesh=obj.data;uv=mesh.uv_layers.new(name='UVMap') if not mesh.uv_layers else mesh.uv_layers.active
    lo=Vector([min(v.co[i] for v in mesh.vertices) for i in range(3)]);hi=Vector([max(v.co[i] for v in mesh.vertices) for i in range(3)])
    for face in mesh.polygons:
        axis=max(range(3),key=lambda i:abs(face.normal[i]));a,b=[i for i in range(3) if i!=axis]
        for loop in face.loop_indices:
            p=mesh.vertices[mesh.loops[loop].vertex_index].co
            uv.data[loop].uv=((p[a]-lo[a])/max(.001,hi[a]-lo[a]),(p[b]-lo[b])/max(.001,hi[b]-lo[b]))
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    mod=obj.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
    mesh=obj.data
    # Thin bevel limits leave numerical slivers that collapse in float32 glTF.
    # The 0.001 mm² cutoff is below any intentional hardware detail.
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_area()<1e-9],context='FACES_ONLY');bm.to_mesh(mesh);bm.free();mesh.update()

scene=bpy.context.scene;scene.name='Nomad sealed cargo studio';scene.world=bpy.data.worlds.new('Neutral cargo studio');scene.world.color=(.17,.17,.17)
bpy.ops.object.camera_add(location=c.xyz((-1.9,1.65,-2.2)));cam=bpy.context.object;target=c.xyz((0,.42,0));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=1.90;scene.camera=cam
for at,power,size in [((-2,-2,3),360,3),((2,0,3),270,2),((0,2,1.5),180,2)]:
    bpy.ops.object.light_add(type='AREA',location=at);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.render.resolution_x=1600;scene.render.resolution_y=1300;scene.render.resolution_percentage=100
scene.render.filepath=str(OUT/'cargo-studio.png');bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadCargoLocker.blend'),compress=True)
bpy.ops.render.render(write_still=True)
cam.location=c.xyz((1.7,1.45,2.1));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/'cargo-rear.png');bpy.ops.render.render(write_still=True)
for mat in [paint,metal,dark,ink]:
    meshes=[o for o in root.children if o.type=='MESH' and o.data.materials[0]==mat]
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    if len(meshes)>1:bpy.ops.object.join()
    bpy.context.object.name='Cargo_'+mat.name
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for o in root.children_recursive:o.select_set(True)
path=ART/'nomad-cargo-locker.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True)
meshes=[o for o in root.children_recursive if o.type=='MESH']
for o in meshes:o.data.calc_loop_triangles()
report={'sourceRevision':'9d2672d','trim':trim,'sites':[{'name':'CargoLocker'+str(i+1),'position':site,'yaw':math.pi if site[2]<0 else 0} for i,site in enumerate(SITES)],'editableParts':source_count,'masterTriangles':sum(len(o.data.loop_triangles) for o in meshes),'materialBatches':len(meshes),'bytes':path.stat().st_size}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8');(ART/'nomad-lockers.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('CARGO_LOCKERS_COMPLETE',json.dumps(report),flush=True)
