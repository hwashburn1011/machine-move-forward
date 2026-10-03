"""Authored receiver vessels, in game metres. Isolated background Blender only.

The frozen machine/browser master is read-only. Remove complete old assemblies
from seven shared batches, retaining every unrelated vertex and its material.
"""
import bpy,bmesh,math,json,sys,ast,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-pressure-vessels';OUT.mkdir(parents=True,exist_ok=True)
ART=ROOT/'godot/art';SITES=[(x,12.43,10.4) for x in [8,4,0,-4,-8]]
OLD=['Brace_welded_receiver001','Brace_welded_receiver001_5','Workshop_overhead_cable_tray004','Workshop_overhead_cable_tray004_3','Workshop_overhead_cable_tray004_4','Workshop_overhead_cable_tray004_5','Workshop_overhead_cable_tray004_6']
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/runtime/machine.glb'))
bpy.context.view_layer.update();kept=[];trim=[]
def selected(v):
    x,y,z=v.co.x,v.co.z,-v.co.y
    return 12.425<y<14.59 and 9.91<z<10.85 and any(-.40<x-at[0]<.32 for at in SITES)
for index,old in enumerate(OLD):
    obj=bpy.data.objects[old];obj.data=obj.data.copy();obj.data.transform(obj.matrix_world);obj.parent=None;obj.matrix_world=Matrix.Identity(4)
    chosen={v.index for v in obj.data.vertices if selected(v)};assert chosen,old
    for f in obj.data.polygons:
        n=sum(v in chosen for v in f.vertices);assert n==0 or n==len(f.vertices),(old,f.index,'Partial component')
    before=sorted(tuple(v.co) for v in obj.data.vertices if v.index not in chosen)
    obj.data.calc_loop_triangles();old_triangles=len(obj.data.loop_triangles)
    bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.verts[i] for i in chosen],context='VERTS');bm.to_mesh(obj.data);bm.free();obj.data.update()
    assert sorted(tuple(v.co) for v in obj.data.vertices)==before
    obj.data.calc_loop_triangles();name='VesselRetained'+str(index+1) if obj.data.vertices else ''
    trim.append({'original':old,'replacement':name,'removedVertices':len(chosen),'unchangedVertices':len(before),'originalTriangles':old_triangles,'keptTriangles':len(obj.data.loop_triangles),'unchangedCoordinatesSha256':hashlib.sha256(repr(before).encode()).hexdigest()})
    if name:obj.name=name;kept.append(obj)
for obj in list(bpy.context.scene.objects):
    if obj not in kept:bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.outliner.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'RetainedWorkshopHardware.blend'),compress=True)
for obj in kept:
    mat=bpy.data.materials.new('Original_'+obj.name);mat.diffuse_color=(.15,.15,.13,1);obj.data.materials.clear();obj.data.materials.append(mat)
    for f in obj.data.polygons:f.material_index=0
bpy.ops.export_scene.gltf(filepath=str(ART/'nomad-vessels-retained.glb'),export_format='GLB',export_animations=False)

# Common procedural geometry helpers reset their own isolated scene on import.
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'));import common as c
recipe=ast.parse((ROOT/'tools/art/native_weapons/build.py').read_text(encoding='utf-8'))
fn=next(n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name=='wear_material')
exec(compile(ast.Module(body=[fn],type_ignores=[]),'<project wear material>','exec'))
paint=wear_material('Receiver weathered enamel',(.19,.215,.185),.42,.74,1107)
metal=c.flat('Receiver worn fittings',(.21,.205,.174),.82,.48)
dark=c.flat('Receiver rubber and ink',(.018,.022,.021),.08,.78)
cream=c.flat('Receiver ceramic dial',(.72,.69,.56),.04,.42)
red=c.flat('Receiver faded safety red',(.30,.053,.031),.34,.64)
root=c.empty('NomadPressureVessel')
def box(name,at,size,mat=metal,bevel=.003):return c.box(name,at,size,mat,root,bevel)
def tube(name,a,b,r,mat=metal,n=24,bevel=.001):
    a,b=c.xyz(a),c.xyz(b);delta=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=delta.length,location=(a+b)/2)
    o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=delta.to_track_quat('Z','Y')
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);c.finish(o,name,mat,root,bevel)
    for f in o.data.polygons:
        if len(f.vertices)>4:f.use_smooth=False
    return o
def lathe(name,profile,mat=paint,n=80,ellipse=1.0666667):
    vertices=[];faces=[]
    for y,r in profile:
        for i in range(n):
            t=i*math.tau/n;vertices.append(c.xyz((r*math.cos(t),y,r*math.sin(t)*ellipse)))
    for row in range(len(profile)-1):
        for i in range(n):faces.append((row*n+i,row*n+(i+1)%n,(row+1)*n+(i+1)%n,(row+1)*n+i))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);c.finish(o,name,mat,root)
    uv=mesh.uv_layers.new(name='UVMap');o['authored_uv']=True
    lengths=[0]
    for a,b in zip(profile,profile[1:]):lengths.append(lengths[-1]+math.hypot(b[0]-a[0],b[1]-a[1]))
    for f in mesh.polygons:
        wrap=any(v%n==0 for v in f.vertices) and any(v%n==n-1 for v in f.vertices)
        for loop in f.loop_indices:
            row,col=divmod(mesh.loops[loop].vertex_index,n);uv.data[loop].uv=(1 if wrap and col==0 else col/n,lengths[row]/lengths[-1])
    return o
def torus(name,at,r,minor,mat=metal,front=False,n=64,m=8):
    bpy.ops.mesh.primitive_torus_add(major_segments=n,minor_segments=m,major_radius=r,minor_radius=minor,location=c.xyz(at))
    o=bpy.context.object
    if front:o.rotation_euler.x=math.pi/2
    c.finish(o,name,mat,root);return o
def text(name,value,at,size,mat=dark):
    # Text lies in the XY plane of game space, facing the middle-deck aisle (-Z).
    bpy.ops.object.text_add(location=c.xyz(at));o=bpy.context.object;o.name=name;o.parent=root
    o.data.body=value;o.data.size=size;o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.extrude=0;o.data.resolution_u=4
    o.rotation_euler=(math.pi/2,0,math.pi);o.data.materials.append(mat);bpy.ops.object.convert(target='MESH');return bpy.context.object
def bolt(x,y,z):
    tube('Foot captive washer',(x,y,z),(x,y+.004,z),.018,metal,16)
    tube('Deck anchor hex',(x,y+.004,z),(x,y+.016,z),.012,metal,6)
    box('Anchor tool mark',(x,y+.0166,z),(.013,.0012,.0025),dark,.0003)

# Short supports put the dished bottom above the deck, with drain access.
for x in [-.18,.18]:
    for z in [-.20,.20]:
        # Keep the feet clear of the neighbouring cargo case's low restraints.
        box('Bolted receiver foot',(x,.014,z),(.14,.028,.15),metal,.009)
        # The dished bottom rises toward its perimeter. The legs must reach
        # into that curved head, not stop at the lowest central drain height.
        box('Welded support leg',(x*.85,.20,z*.85),(.080,.352,.07),paint,.007)
        box('Foot corner gusset',(x,.063,z),(.094,.070,.099),metal,.005)
        bolt(x,.028,z+math.copysign(.047,z))
# A continuous elliptical formed shell, matching the original maximum envelope.
profile=[(.196,.035),(.200,.070),(.218,.130),(.248,.190),(.283,.235),(.329,.266),(.371,.280),(.397,.283),(.414,.283),(1.436,.283),(1.460,.280),(1.505,.262),(1.551,.229),(1.593,.187),(1.635,.128),(1.665,.065),(1.673,.032)]
lathe('Formed pressure shell and dished heads',profile)
tube('Bottom drain boss',(0,.168,0),(0,.204,0),.040,metal,32)
c.cable('Connected drain elbow',[(0,.18,0),(0,.119,0),(0,.10,-.11)],.017,metal,root)
tube('Drain service hex',(0,.10,-.09),(0,.10,-.17),.026,metal,6)
box('Drain quarter turn lever',(.031,.115,-.171),(.092,.014,.018),red,.004)
tube('Closed drain dust plug',(0,.10,-.166),(0,.10,-.186),.018,dark,20)
for y in [.404,1.440]:lathe('Circumferential weld bead',[(y-.003,.281),(y,.285),(y+.003,.281)],metal,n=80)
c.cable('Longitudinal welded seam',[(0,.414,.302),(0,.90,.302),(0,1.431,.302)],.0017,metal,root)
# Original wheel height, now mounted on a proper boss, valve body and spindle.
tube('Valve welded socket',(0,.874,-.260),(0,.874,-.315),.065,paint,40)
tube('Valve bonnet hex',(0,.874,-.31),(0,.874,-.347),.044,metal,6)
tube('Valve packing nut',(0,.874,-.347),(0,.874,-.365),.031,metal,6)
tube('Captured valve spindle',(0,.874,-.357),(0,.874,-.393),.012,metal,24)
torus('Cast spoked handwheel rim',(0,.874,-.382),.141,.012,red,True)
for i in range(4):
    t=math.pi/4+i*math.tau/4
    c.cable('Handwheel cast spoke',[(.021*math.cos(t),.874+.021*math.sin(t),-.394),(.078*math.cos(t),.874+.078*math.sin(t),-.387),(.133*math.cos(t),.874+.133*math.sin(t),-.382)],.009,red,root)
tube('Handwheel central boss',(0,.874,-.368),(0,.874,-.407),.025,red,32)
tube('Wheel retaining nut',(0,.874,-.407),(0,.874,-.416),.017,metal,6)
# Isolated, back-connected Bourdon-style instrument with a recessed dial.
tube('Gauge tapping boss',(0,1.217,-.27),(0,1.217,-.320),.045,paint,32)
tube('Gauge isolation body',(0,1.217,-.31),(0,1.217,-.350),.027,metal,6)
tube('Gauge isolation key',(.02,1.217,-.331),(.055,1.217,-.331),.008,metal,16)
box('Gauge isolation lever',(.055,1.235,-.331),(.014,.054,.010),dark,.004)
tube('Damped instrument back case',(0,1.217,-.340),(0,1.217,-.388),.095,metal,64)
tube('Gauge dial recess',(0,1.217,-.387),(0,1.217,-.394),.087,dark,64)
tube('Ceramic numbered gauge face',(0,1.217,-.394),(0,1.217,-.396),.080,cream,64,0)
torus('Rolled protective gauge bezel',(0,1.217,-.395),.089,.006,metal,True)
tube('Instrument fill stopper',(0,1.307,-.366),(0,1.321,-.366),.009,dark,16)
for i in range(61):
    t=math.radians(315+i*270/60);major=i%10==0;inner=.063 if major else .068 if i%5==0 else .071
    # Printed ticks are planar triangles, not hundreds of tiny bevelled boxes.
    a=Vector((math.cos(t)*inner,1.217+math.sin(t)*inner,-.3964));b=Vector((math.cos(t)*.076,1.217+math.sin(t)*.076,-.3964));w=Vector((-math.sin(t),math.cos(t),0))*(.00065 if major else .00035)
    mesh=bpy.data.meshes.new('Dial tick');mesh.from_pydata([c.xyz(p) for p in [a-w,a+w,b+w,b-w]],[],[(0,1,2,3)]);mesh.update();o=bpy.data.objects.new('Calibrated dial mark',mesh);bpy.context.collection.objects.link(o);c.finish(o,o.name,red if i>=50 else dark,root)
    if major:text('Pressure scale',str(i//5),(math.cos(t)*.052,1.217+math.sin(t)*.052,-.3966),.012)
text('Pressure units','bar',(0,1.188,-.3966),.014)
text('Instrument identifier','NOMAD',(0,1.243,-.3966),.009)
# Needle sits directly inside the bezel, visibly connected to its central pivot.
t=math.radians(315+7.2/12*270);d=Vector((math.cos(t),math.sin(t),0));s=Vector((-d.y,d.x,0));center=Vector((0,1.217,-.400))
mesh=bpy.data.meshes.new('Tapered pointer');mesh.from_pydata([c.xyz(p) for p in [center-d*.018-s*.0025,center-d*.018+s*.0025,center+d*.063,center+d*.015-s*.002]],[],[(0,1,2,3)]);mesh.update();o=bpy.data.objects.new('Seated instrument needle',mesh);bpy.context.collection.objects.link(o);c.finish(o,o.name,dark,root)
tube('Needle pivot cap',(0,1.217,-.398),(0,1.217,-.403),.007,metal,24)
# Small fastened information plate uses actual standoff supports on the barrel.
for x in [-.065,.065]:
    tube('Plate welded standoff',(x,.592,-.280),(x,.592,-.305),.009,metal,16)
box('Receiver rating plate',(0,.592,-.306),(.157,.12,.009),metal,.006)
text('Receiver identification','AIR / 08',(0,.620,-.311),.021,cream)
text('Receiver service stencil','RECEIVER',(0,.591,-.311),.015,cream)
text('Receiver nominal marking','12 BAR',(0,.563,-.311),.015,cream)
for x in [-.065,.065]:
    tube('Plate flush rivet',(x,.592,-.311),(x,.592,-.313),.005,metal,12,0)
# Relief valve and downward exhaust: no disconnected open pipe in the air.
tube('Top welded process boss',(0,1.66,0),(0,1.739,0),.041,metal,32)
tube('Relief valve lower hex',(0,1.73,0),(0,1.777,0),.052,metal,6)
tube('Spring relief valve casing',(0,1.774,0),(0,1.985,0),.039,metal,32)
for y in [1.8,1.94]:torus('Relief valve casing shoulder',(0,y,0),.039,.004,metal)
tube('Relief bonnet',(0,1.982,0),(0,2.018,0),.034,metal,6)
torus('Relief test pull ring',(0,2.043,0),.024,.004,metal,True,n=40)
c.cable('Bent relief exhaust',[(0,1.875,0),(-.145,1.875,0),(-.244,1.932,.08),(-.285,2.08,.21),(-.285,2.084,.35),(-.285,2.03,.392)],.026,metal,root)
tube('Relief outlet union',(-.07,1.875,0),(-.112,1.875,0),.036,metal,6)
# Open annulus and recessed dark throat face down at the end of the bent pipe.
torus('Exhaust rolled lip',(-.285,2.024,.392),.025,.003,metal)
tube('Exhaust recessed throat',(-.285,2.029,.392),(-.285,2.030,.392),.021,dark,32,0)
c.empty('GaugeFace',(0,1.217,-.40),root);c.empty('DeckContact',(0,0,0),root)
c.empty('ValveCenter',(0,.874,-.382),root);c.empty('ReliefVent',(-.285,2.024,.392),root)

parts=len([o for o in root.children_recursive if o.type=='MESH'])
for obj in list(root.children_recursive):
    if obj.type!='MESH':continue
    mesh=obj.data
    if not mesh.uv_layers:
        uv=mesh.uv_layers.new(name='UVMap')
        for face in mesh.polygons:
            axis=max(range(3),key=lambda i:abs(face.normal[i]));a,b=[i for i in range(3) if i!=axis]
            for loop in face.loop_indices:
                p=mesh.vertices[mesh.loops[loop].vertex_index].co;uv.data[loop].uv=(p[a]*2.5,p[b]*2.5)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    # Recalculate closed solids only. Text/printed dials have authored front faces.
    if len(mesh.polygons)>1 and not obj.name.startswith(('Pressure scale','Pressure units','Instrument identifier','Receiver identification','Receiver service','Receiver nominal')):
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    mod=obj.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_area()<1e-10],context='FACES_ONLY');bm.to_mesh(obj.data);bm.free();obj.data.update()

# Drop unused material libraries brought in by the shared geometry helpers.
# Only the five authored materials and their packed textures belong in this file.
bpy.ops.outliner.orphans_purge(do_recursive=True)
scene=bpy.context.scene;scene.name='Nomad pressure receiver studio';scene.world=bpy.data.worlds.new('Receiver studio world');scene.world.color=(.19,.19,.19)
bpy.ops.object.camera_add(location=c.xyz((-2.5,2.1,-3.8)));cam=bpy.context.object;target=c.xyz((0,1.04,0));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.62;scene.camera=cam
for at,power,size in [((-2,-3,4),430,3),((2,-1,2.8),270,2),((0,2,3),330,2)]:
    bpy.ops.object.light_add(type='AREA',location=at);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.render.resolution_x=1400;scene.render.resolution_y=1600;scene.render.resolution_percentage=100
scene.render.filepath=str(OUT/'vessel-studio.png');bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadPressureVessel.blend'),compress=True)
if '--no-render' not in sys.argv:
    bpy.ops.render.render(write_still=True)
    cam.location=c.xyz((-.43,1.29,-1.50));target=c.xyz((0,1.06,-.30));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.90;scene.render.filepath=str(OUT/'vessel-instruments.png');bpy.ops.render.render(write_still=True)
for mat in [paint,metal,dark,cream,red]:
    meshes=[o for o in root.children if o.type=='MESH' and o.data.materials[0]==mat]
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    if len(meshes)>1:bpy.ops.object.join()
    bpy.context.object.name='Receiver_'+mat.name
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for o in root.children_recursive:o.select_set(True)
path=ART/'nomad-pressure-vessel.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True)
meshes=[o for o in root.children_recursive if o.type=='MESH'];bpy.context.view_layer.update()
for o in meshes:o.data.calc_loop_triangles()
pts=[o.matrix_world@v.co for o in meshes for v in o.data.vertices];pts=[(p.x,p.z,-p.y) for p in pts]
report={'sourceRevision':'9e84cbd','trim':trim,'sites':[{'name':'PressureReceiver'+str(i+1),'position':site} for i,site in enumerate(SITES)],'editableParts':parts,'masterTriangles':sum(len(o.data.loop_triangles) for o in meshes),'materialBatches':len(meshes),'bytes':path.stat().st_size,'bounds':{'min':[min(p[i] for p in pts) for i in range(3)],'max':[max(p[i] for p in pts) for i in range(3)]},'shellRadius':[.285,.304],'references':['https://www.wika.com/en-au/213_53.WIKA','https://us.kaeser.com/compressed-air-resources/kaeser-talks-shop/when-sizing-met-safety.aspx']}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8');(ART/'nomad-vessels.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('PRESSURE_VESSELS_COMPLETE',json.dumps(report),flush=True)
