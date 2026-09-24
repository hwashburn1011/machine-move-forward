"""Original supported intake, editable Blender source and articulated native GLB."""
import bpy,bmesh,math,json,sys,ast
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/native-turbine';OUT.mkdir(parents=True,exist_ok=True);ART=ROOT/'godot/art'
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'));import common as c
recipe=ast.parse((ROOT/'tools/art/native_weapons/build.py').read_text());fn=next(n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name=='wear_material');exec(compile(ast.Module(body=[fn],type_ignores=[]),'<wear material>','exec'))
paint=wear_material('Intake worn graphite casting',(.145,.172,.162),.48,.70,1521)
metal=wear_material('Intake oxidized machined steel',(.25,.265,.241),.70,.66,1522)
brass=wear_material('Intake aged bronze hardware',(.26,.178,.077),.68,.64,1523)
dark=c.flat('Intake gaskets and recesses',(.019,.024,.021),.04,.82)
ivory=c.flat('Intake service lettering',(.71,.69,.56),.05,.74)
cyan=c.flat('Intake cyan running light',(.015,.22,.27),.05,.43)
bs=cyan.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(.012,.56,.75,1);bs.inputs['Emission Strength'].default_value=1.8
MATS=[paint,metal,brass,dark,ivory,cyan]
assembly=c.empty('NomadMainIntake');housing=c.empty('IntakeHousing',parent=assembly);root=housing;Y=1.62
recipe=ast.parse((ROOT/'tools/art/native_machine/build_switchgear.py').read_text());helpers=[n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name in ['box','tube','torus','text','screw']];exec(compile(ast.Module(body=helpers,type_ignores=[]),'<hard surface helpers>','exec'))

def mesh(name,points,faces,mat,bevel=0):
    data=bpy.data.meshes.new(name);data.from_pydata([c.xyz(p) for p in points],[],faces);data.update();obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);c.finish(obj,name,mat,root,bevel);return obj

def lathe(name,profile,mat,center_y=Y,n=128):
    points=[(r*math.cos(j*math.tau/n),center_y+r*math.sin(j*math.tau/n),z) for z,r in profile for j in range(n)]
    faces=[(k*n+j,k*n+(j+1)%n,(k+1)*n+(j+1)%n,(k+1)*n+j) for k in range(len(profile)-1) for j in range(n)]
    return mesh(name,points,faces,mat)

def ring(name,r,z,mat=metal,minor=.012,center_y=Y,n=112):return torus(name,(0,center_y,z),r,minor,mat,True,n=n,m=8)
def bolt(name,x,y,z,front=True,r=.017):
    s=-1 if front else 1
    tube(name+' washer',(x,y,z),(x,y,z+s*.006),r*1.44,metal,20)
    tube(name+' hex head',(x,y,z+s*.006),(x,y,z+s*.027),r,brass,6)
    tube(name+' central recess',(x,y,z+s*.0275),(x,y,z+s*.028),r*.38,dark,6,0)

# A hollow rolled casing: no opaque disk closes the workshop-facing side.
lathe('Continuous rolled intake duct',[(-.42,1.47),(-.40,1.535),(-.37,1.545),(-.32,1.525),(.29,1.525),(.33,1.49),(.33,1.422),(-.31,1.422),(-.37,1.433),(-.42,1.47)],paint)
for z in [-.39,.29]:ring('Casing flange machined edge',1.515,z,metal,.020)
for z in [-.12,.10]:ring('Rolled casing reinforcing bead',1.531,z,metal,.010)
for i in range(32):
    a=i*math.tau/32;x=1.489*math.cos(a);y=Y+1.489*math.sin(a)
    bolt('Forward flange fastener',x,y,-.423)
    bolt('Rear flange fastener',x,y,.339,False)
for i in range(12):
    a=i*math.tau/12
    tube('Casing longitudinal joint',(1.527*math.cos(a),Y+1.527*math.sin(a),-.315),(1.527*math.cos(a),Y+1.527*math.sin(a),.265),.006,metal,10,0)
# Feet and curved saddles terminate at the casing instead of burying it in deck.
for side in [-1,1]:
    x=side*1.02
    box('Deck isolation pad',(x,.012,0),(.56,.024,.77),dark,.008)
    box('Bolted steel mounting shoe',(x,.044,0),(.56,.040,.77),metal,.010)
    xs=[side*(.80+i*.40/16) for i in range(17)];points=[]
    for z in [-.29,.25]:
        points.extend([(xx,.064,z) for xx in xs]);points.extend([(xx,Y-math.sqrt(1.518**2-xx**2),z) for xx in xs])
    faces=[];N=len(xs)
    for j in range(N-1):
        faces.extend([(j,j+1,N+j+1,N+j),(2*N+j,3*N+j,3*N+j+1,2*N+j+1),(N+j,N+j+1,3*N+j+1,3*N+j),(j,2*N+j,2*N+j+1,j+1)])
    faces.extend([(0,N,3*N,2*N),(N-1,3*N-1,4*N-1,2*N-1)])
    mesh('Fitted cast saddle',points,faces,paint,.004)
    for xx in [x-.21,x+.21]:
        for z in [-.30,.30]:
            tube('Deck restraint washer',(xx,.064,z),(xx,.069,z),.026,metal,20)
            tube('Deck restraint head',(xx,.069,z),(xx,.094,z),.018,brass,6)
    for z in [-.298,.258]:
        for xx in [x-.11,x+.11]:bolt('Saddle service fixing',xx,.18,z,z<0,r=.013)
box('Saddle connecting bed',(0,.09,.0),(1.62,.09,.25),paint,.008)

# Stationary drive and stator stays are visible through the rear guard.
for i in range(6):
    a=(i+.5)*math.tau/6;r0=.29;r1=1.436;points=[]
    for z in [.04,.20]:
        for r in [r0,r1]:
            for offset in [-.035,.035]:points.append((r*math.cos(a)-offset*math.sin(a),Y+r*math.sin(a)+offset*math.cos(a),z))
    mesh('Rear motor support vane',points,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],paint,.005)
lathe('Sealed stationary drive housing',[(-.19,.001),(-.19,.24),(-.145,.30),(.21,.30),(.285,.27),(.32,.25),(.32,.001)],paint,n=96)
for i in range(24):
    a=i*math.tau/24
    tube('Drive cooling rib',(.306*math.cos(a),Y+.306*math.sin(a),-.10),(.306*math.cos(a),Y+.306*math.sin(a),.195),.012,metal,12,.001)
for z,r in [(-.13,.30),(.21,.285),(.312,.252)]:ring('Drive endbell seam',r,z,metal,.011,n=64)
for i in range(8):
    a=i*math.tau/8;bolt('Rear bearing cover',.204*math.cos(a),Y+.204*math.sin(a),.324,False,.012)
tube('Bearing end cap',(0,Y,.32),(0,Y,.351),.108,brass,64)
box('Drive data plate',(0,Y,.353),(.16,.075,.006),dark,.005)
label=text('DRIVE 07',(0,Y,.357),.021);label.rotation_euler.z=0
tube('Drive shaft',(0,Y,-.33),(0,Y,-.175),.11,metal,48)

# Guard wires retain visible open gaps. Front guard clears every swept blade.
for front in [True,False]:
    z=-.491 if front else .393
    for r in [.37,.62,.89,1.17,1.417]:ring('Forward guard hoop' if front else 'Rear guard hoop',r,z,metal,.008 if r<1.4 else .014)
    for i in range(24):
        a=i*math.tau/24
        tube('Radial guard wire',(.37*math.cos(a),Y+.37*math.sin(a),z),(1.42*math.cos(a),Y+1.42*math.sin(a),z),.007,metal,10,0)
    for i in range(8):
        a=(i+.5)*math.tau/8;x=1.433*math.cos(a);y=Y+1.433*math.sin(a)
        tube('Guard stand-off',(x,y,z),(x,y,-.37 if front else .28),.020,metal,16)
        bolt('Removable guard fixing',x,y,z,front,.014)

# Original cyan crown becomes a fitted diffused strip in a recessed channel.
points=[(1.557*math.cos(a),Y+1.557*math.sin(a),-.395) for a in np.linspace(1.015,2.205,65)]
c.cable('Crown light protective channel',points,.026,dark,root)
points=[(1.558*math.cos(a),Y+1.558*math.sin(a),-.412) for a in np.linspace(1.04,2.18,64)]
c.cable('Diffused cyan intake crown',points,.013,cyan,root)
for a in [1.04,2.18]:
    x=1.558*math.cos(a);y=Y+1.558*math.sin(a)
    tube('Lamp channel sealed end',(x,y,-.431),(x,y,-.385),.028,metal,24)
# Rear wiring follows a support vane into a restrained deck penetration.
c.cable('Rear drive supply conduit',[(.15,Y+.10,.26),(.34,Y+.08,.32),(.61,Y-.11,.31),(.97,.73,.27),(1.18,.16,.22),(1.18,.045,.22)],.015,dark,root)
for at in [(.15,Y+.10,.28),(1.18,.065,.22)]:
    tube('Cable compression gland',(at[0],at[1]-.02,at[2]),(at[0],at[1]+.035,at[2]),.025,brass,16)
box('Rear maintenance plate',(0,.14,.131),(.67,.15,.018),dark,.006)
label=text('NOMAD / INTAKE 07',(0,.155,.142),.033);label.rotation_euler.z=0
label=text('ISOLATE BEFORE SERVICE',(0,.101,.142),.018);label.rotation_euler.z=0
for x in [-.29,.29]:screw(x,.14,.144,False)

# Thirty-six closed, curved vanes replace the coarse straight strips.
rotor=c.empty('Turbine_Rotor',(0,Y,0),assembly);root=rotor
for i in range(36):
    points=[];rows=12;cols=8
    for side in [-1,1]:
        for j in range(rows+1):
            s=j/rows;r=.31+1.084*s;angle=i*math.tau/36-.16+.12*s
            width=.036+.122*s
            for k in range(cols+1):
                t=k/cols;across=(t-.5)*width;thickness=.0035+.005*math.sin(math.pi*t)
                z=-.295+.042*(1-s)+(t-.5)*.064+.009*math.sin(math.pi*t)+side*thickness
                points.append((r*math.cos(angle)-across*math.sin(angle),r*math.sin(angle)+across*math.cos(angle),z))
    stride=(rows+1)*(cols+1);faces=[]
    for j in range(rows):
        for k in range(cols):
            a=j*(cols+1)+k;faces.extend([(a,a+1,a+cols+2,a+cols+1),(a+stride,a+cols+1+stride,a+cols+2+stride,a+1+stride)])
    perimeter=list(range(cols+1))+[j*(cols+1)+cols for j in range(1,rows+1)]+[rows*(cols+1)+k for k in range(cols-1,-1,-1)]+[j*(cols+1) for j in range(rows-1,0,-1)]
    for j,a in enumerate(perimeter):
        b=perimeter[(j+1)%len(perimeter)];faces.append((a,a+stride,b+stride,b))
    mesh('Curved closed impeller vane',points,faces,metal)
lathe('Rotor hub and root socket',[(-.20,.11),(-.20,.33),(-.28,.345),(-.36,.32),(-.37,.11),(-.20,.11)],metal,center_y=0,n=96)
lathe('Spun bronze hub cover',[(-.355,.001),(-.355,.318),(-.40,.31),(-.46,.272),(-.51,.204),(-.55,.115),(-.566,.035),(-.566,.001)],brass,center_y=0,n=96)
for i in range(12):
    a=i*math.tau/12;bolt('Hub socket fixing',.294*math.cos(a),.294*math.sin(a),-.393,True,.012)
c.empty('ShaftAxis',(0,0,-.30),rotor);root=housing
for name,at in [('DeckContact',(0,0,0)),('FrontGuard',(0,Y,-.491)),('RearGuard',(0,Y,.393))]:c.empty(name,at,assembly)

parts=sum(o.type=='MESH' for o in assembly.children_recursive)
for obj in list(assembly.children_recursive):
    if obj.type!='MESH':continue
    uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
    for face in obj.data.polygons:
        axis=max(range(3),key=lambda i:abs(face.normal[i]));a,b=[i for i in range(3) if i!=axis]
        for loop in face.loop_indices:
            p=obj.data.vertices[obj.data.loops[loop].vertex_index].co+obj.location;uv.data[loop].uv=(p[a]*1.6,p[b]*1.6)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    if not obj.name.startswith('Engraved '):
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    mod=obj.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_area()<1e-9],context='FACES_ONLY');bm.to_mesh(obj.data);bm.free();obj.data.update()
# Fit the round casing below the real overhead crossmember, while keeping the
# feet on the deck. Bake this measured fit into geometry, never a runtime scale.
FIT=.95
for obj in assembly.children_recursive:
    obj.location*=FIT
    if obj.type=='MESH':
        for vertex in obj.data.vertices:vertex.co*=FIT
        obj.data.update()
bpy.ops.outliner.orphans_purge(do_recursive=True)
scene=bpy.context.scene;scene.name='Nomad main intake studio';scene.world=bpy.data.worlds.new('Intake studio world');scene.world.color=(.20,.20,.20)
bpy.ops.object.camera_add(location=c.xyz((3.6,2.9,-5.6)));cam=bpy.context.object;target=c.xyz((0,1.55,0));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=4.25;scene.camera=cam
for at,power,size in [((-3,-4,6),820,4),((4,1,4),650,3),((0,4,5),500,3)]:
    bpy.ops.object.light_add(type='AREA',location=at);obj=bpy.context.object;obj.data.energy=power;obj.data.size=size;obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.render.resolution_x=1500;scene.render.resolution_y=1500;scene.render.resolution_percentage=100;scene.render.filepath=str(OUT/'intake-front.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadMainIntake.blend'),compress=True)
if '--no-render' not in sys.argv:
    bpy.ops.render.render(write_still=True);cam.location=c.xyz((-3.1,2.7,5.6));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/'intake-rear.png');bpy.ops.render.render(write_still=True)
for parent in [housing,rotor]:
    for mat in MATS:
        objects=[o for o in parent.children if o.type=='MESH' and o.data.materials[0]==mat]
        if not objects:continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        bpy.context.object.name=('Rotor_' if parent==rotor else 'Housing_')+mat.name
bpy.ops.object.select_all(action='DESELECT');assembly.select_set(True)
for obj in assembly.children_recursive:obj.select_set(True)
path=ART/'nomad-main-intake.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True)
objects=[o for o in assembly.children_recursive if o.type=='MESH'];bpy.context.view_layer.update()
for obj in objects:obj.data.calc_loop_triangles()
points=[obj.matrix_world@v.co for obj in objects for v in obj.data.vertices];points=[(p.x,p.z,-p.y) for p in points]
report={'sourceRevision':'80b55d2','position':[5.01875,12.43,-13.39],'originalBox':{'min':[3.410,12.059,-14.025],'max':[6.628,15.663,-12.93]},'originalNode':'Front_Turbine_Housing','editableParts':parts,'materialBatches':len(objects),'masterTriangles':sum(len(o.data.loop_triangles) for o in objects),'bytes':path.stat().st_size,'bounds':{'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]},'fitScale':FIT,'centerHeight':Y*FIT,'bladeCount':36,'bladeRadius':1.397*FIT,'housingBore':1.422*FIT,'rotationAxis':'game -Z','reference':'https://content.greenheck.com/public/DAMProd/Original/10003/VaneAxial_Application_Perf_Supplement.pdf'}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8');(ART/'nomad-intake.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print('INTAKE_COMPLETE',json.dumps(report),flush=True)
