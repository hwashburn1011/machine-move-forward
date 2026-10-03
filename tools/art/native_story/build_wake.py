"""Refine the existing Wake expedition in an isolated Blender process."""
import ast, json, math, sys, bmesh
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-wake';OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'));import common as c
sys.path.insert(0,str(ROOT/'tools/art/native_enemies'));from repair_tangents import repair
tree=ast.parse((ROOT/'tools/art/native_weapons/build.py').read_text(encoding='utf-8'))
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='wear_material'],type_ignores=[]),'<original portable wear>','exec'))
paint=wear_material('Wake faded hull enamel',(.22,.245,.195),.38,.79,8101)
rust=wear_material('Wake oxide structure',(.17,.102,.061),.58,.84,8102)
steel=wear_material('Wake scoured deck steel',(.19,.21,.19),.76,.66,8103)
graphite=wear_material('Wake worn cast housings',(.043,.062,.057),.65,.73,8104)
ochre=wear_material('Wake faded safety ochre',(.30,.205,.079),.24,.81,8105)
fabric=wear_material('Wake aged seat leather',(.091,.094,.067),.02,.93,8106)
concrete=wear_material('Wake mineral support',(.23,.217,.18),0,.96,8107)
alloy=c.flat('Wake machined alloy',(.31,.32,.29),.85,.43)
dark=c.flat('Wake recess and seals',(.008,.014,.014),0,.89)
letter=c.flat('Wake faded stencils',(.61,.59,.49),0,.87)
glass=c.flat('Wake dark instrument glass',(.014,.043,.042),.18,.25)
phosphor=c.flat('Wake restrained amber',(.41,.19,.025),.02,.5)
bs=phosphor.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(.52,.27,.075,1);bs.inputs['Emission Strength'].default_value=.45
root=c.empty('WakeRefined');preserve=[]

def adopt(obj,parent):
    bpy.context.view_layer.update()
    obj.matrix_basis=parent.matrix_world.inverted()@obj.matrix_basis
    return obj
def box(name,at,size,mat=paint,parent=None,bevel=.012):
    p=parent or root;return adopt(c.box(name,at,size,mat,p,bevel),p)
def tube(name,a,b,r,mat=steel,parent=None,n=24):
    p=parent or root;obj=adopt(c.tube(name,a,b,r,mat,p,n),p)
    for face in obj.data.polygons:
        if len(face.vertices)>4:face.use_smooth=False
    return obj
def cable(name,points,r,mat=dark,parent=None):
    p=parent or root;return adopt(c.cable(name,points,r,mat,p),p)
def marker(name,at,parent=None,keep=False):
    p=parent or root;obj=c.empty(name,parent=p);bpy.context.view_layer.update();obj.location=p.matrix_world.inverted()@c.xyz(at)
    bpy.context.view_layer.update()
    if keep:preserve.append(obj)
    return obj
def mesh(name,vertices,faces,mat=paint,parent=None,bevel=0):
    p=parent or root;data=bpy.data.meshes.new(name);data.from_pydata([c.xyz(v) for v in vertices],[],faces);data.update()
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj)
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
    c.finish(obj,name,mat,p,bevel);adopt(obj,p)
    for poly in obj.data.polygons:poly.use_smooth=False
    if bevel:
        bpy.context.view_layer.objects.active=obj;mod=obj.modifiers.new('Weighted folded faces','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj
def ring(name,at,r,inner,depth,mat=alloy,axis='y',parent=None,n=40):
    x,y,z=at;verts=[];faces=[]
    for offset,radius in [(-depth/2,r),(depth/2,r),(depth/2,inner),(-depth/2,inner)]:
        for i in range(n):
            a=i*math.tau/n
            verts.append((x+radius*math.cos(a),y+offset,z+radius*math.sin(a)) if axis=='y' else (x+offset,y+radius*math.cos(a),z+radius*math.sin(a)) if axis=='x' else (x+radius*math.cos(a),y+radius*math.sin(a),z+offset))
    for row in range(4):
        for i in range(n):faces.append((row*n+i,row*n+(i+1)%n,((row+1)%4)*n+(i+1)%n,((row+1)%4)*n+i))
    obj=mesh(name,verts,faces,mat,parent)
    for i,face in enumerate(obj.data.polygons):face.use_smooth=(i//n)%2==0
    return obj
def bolt(at,axis=(0,1,0),r=.012,parent=None):
    a=Vector(at);d=Vector(axis)
    tube('Captive washer',a,a+d*.003,r,graphite,parent,16)
    tube('Hex retention head',a+d*.003,a+d*.011,r*.70,alloy,parent,6)
    tube('Recessed hex socket',a+d*.0112,a+d*.0115,r*.29,dark,parent,6)
def label(value,at,size,normal=(0,0,1),parent=None):
    p=parent or root;normal=Vector(normal);up=Vector((0,1,0)) if abs(normal.y)<.5 else Vector((0,0,-1))
    right=up.cross(normal);up=normal.cross(right)
    bpy.ops.object.text_add(location=c.xyz(at));obj=bpy.context.object;obj.name='Stencil '+value;obj.parent=p
    obj.data.body=value;obj.data.size=size;obj.data.align_x='CENTER';obj.data.resolution_u=3;obj.data.extrude=.0002;obj.data.materials.append(letter)
    obj.rotation_euler=Matrix((c.xyz(right),c.xyz(up),c.xyz(normal))).transposed().to_euler();bpy.ops.object.convert(target='MESH');return adopt(obj,p)
def beam(name,a,b,width=.16,depth=.25,mat=rust):
    a,b=Vector(a),Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,1,0)))
    if u.length<.1:u=axis.cross(Vector((0,0,1)))
    u.normalize();v=axis.cross(u).normalized();t=.018
    outline=[(-width/2,-depth/2),(width/2,-depth/2),(width/2,-depth/2+t),(t/2,-depth/2+t),(t/2,depth/2-t),(width/2,depth/2-t),(width/2,depth/2),(-width/2,depth/2),(-width/2,depth/2-t),(-t/2,depth/2-t),(-t/2,-depth/2+t),(-width/2,-depth/2+t)]
    verts=[tuple(at+u*x+v*y) for at in [a,b] for x,y in outline];n=len(outline)
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,verts,faces,mat,bevel=.003)

# The exact original floor and two passage openings remain authoritative.
box('Continuous load deck',(0,-.145,0),(12,.25,18),graphite,bevel=0)
for x in [-5,-3,-1,1,3,5]:
    for z in [-8,-6,-4,-2,0,2,4,6,8]:
        box('Flush replaceable deck plate',(x,-.012,z),(1.988,.024,1.988),steel,bevel=.002)
        for dx,dz in [(-.91,-.91),(.91,.91)]:
            tube('Recessed deck fixing',(x+dx,-.0002,z+dz),(x+dx,.0002,z+dz),.016,graphite,n=12)
for z in [-.80,.80]:
    for x in [-5,-3,-1,1]:box('Worn route marking',(x,.001,z),(1.6,.002,.037),ochre,bevel=0)

def side_wall(x,start,end,inside):
    length=end-start
    box('Sealed hull backing',(x,1.25,(start+end)/2),(.19,2.5,length),graphite,bevel=.008)
    for i in range(math.ceil(length/1.3)):
        span=length/math.ceil(length/1.3);z=start+(i+.5)*span
        box('Riveted hull cassette',(x+inside*.102,1.28,z),(.018,2.37,span-.023),paint,bevel=.006)
        box('Hull folded stiffener',(x+inside*.117,1.27,z-span*.47),(.048,2.36,.065),rust,bevel=.006)
        for y in [.17,1.27,2.37]:bolt((x+inside*.130,y,z+span*.42),(inside,0,0),.009)
    for y in [.10,2.42]:box('Continuous hull stringer',(x+inside*.12,y,(start+end)/2),(.055,.10,length),rust,bevel=.009)
for x in [-5.9,2.0]:
    for a,b in [(-9,-1),(1,9)]:side_wall(x,a,b,1 if x<0 else -1)
    for z in [-1.08,1.08]:
        box('Passage folded jamb',(x,1.25,z),(.29,2.5,.13),steel,bevel=.012)
        for y in [.25,.85,1.50,2.15]:bolt((x-.151,y,z),(-1,0,0),.011)
    box('Passage load header',(x,2.63,0),(.31,.26,2.3),ochre,bevel=.02)
    label('TRANSIT' if x<0 else 'NAV / GYRO',(x-.162,2.59,0),.09,(-1,0,0))
side_wall(5.9,-9,9,-1)
for z in [-8.9,8.9]:
    sign=-1 if z>0 else 1
    box('End shell',(0,1.25,z),(12,2.5,.2),paint,bevel=.009)
    for x in [-5.5,-4.2,-2.9,-1.6,-.3,1,2.3,3.6,4.9]:
        box('End wall hat stiffener',(x,1.25,z+sign*.115),(.065,2.38,.055),rust,bevel=.006)
        for y in [.25,1.25,2.25]:bolt((x+.075,y,z+sign*.106),(0,0,sign),.009)
    box('End wall coping',(0,2.5,z),(12,.09,.27),steel,bevel=.014)

# Roof ribs actually reach bolted columns and surviving corrugated sheets.
for z in [-7.6,-3.8,3.8,7.6]:
    for x in [-5.89,5.89]:
        beam('Roof supporting stanchion',(x,.06,z),(x,3.50,z),.18,.17)
        box('Stanchion foot',(x,.031,z),(.22,.062,.32),steel,bevel=.008)
        beam('Supported knee bracket',(x,2.58,z),(x+(.57 if x<0 else -.57),3.40,z),.11,.12)
    # Partly collapsed members are still attached at their surviving end.
    if abs(z)<5:
        beam('Fractured port roof rib',(-5.89,3.43,z),(-2.9,3.10,z+.28),.15,.20)
        beam('Fractured starboard roof rib',(5.89,3.43,z),(3.1,3.33,z-.19),.15,.20)
    else:beam('Roof transverse load rib',(-5.89,3.43,z),(5.89,3.43,z),.17,.22)
for x in [-5.89,2.0,5.89]:beam('Longitudinal roof rail',(x,3.48,-8.9),(x,3.48,8.9),.14,.15)
for rear in [False,True]:
    za,zb=(-8.98,-6.18) if not rear else (6.5,8.98)
    for i in range(10):
        x=2.10+i*.37;verts=[];rows=4
        for row in range(rows):
            z=za+(zb-za)*row/(rows-1)
            # Torn edges bend away from the route, with a closed sheet thickness.
            bend=(.075*math.sin(i*1.9) if row==(0 if rear else rows-1) else 0)
            for dx,dy in [(-.18,0),(-.10,0),(-.065,.046),(.065,.046),(.10,0),(.18,0)]:verts.append((x+dx,3.565+dy+bend,z))
        count=len(verts);verts.extend([(x,y-.014,z) for x,y,z in verts]);faces=[]
        for row in range(rows-1):
            for j in range(5):
                a=row*6+j;face=(a,a+1,a+7,a+6);faces.extend([face,tuple(v+count for v in reversed(face))])
        border=list(range(6))+[11,17,23]+list(range(22,17,-1))+[12,6]
        for j,a in enumerate(border):b=border[(j+1)%len(border)];faces.append((a,b,b+count,a+count))
        mesh('Torn corrugated roof sheet',verts,faces,rust)
        for z in [za+.16,zb-.16]:bolt((x,3.616,z),r=.012)

# A damaged raised support frame reaches below the dunes, instead of hanging
# several metres below a floating floor. No new traversable ground is added.
for x in [-5.1,5.1]:
    beam('Underdeck longitudinal',(x,-.45,-8.9),(x,-.45,8.9),.38,.58)
    for z in [-7.4,0,7.4]:
        box('Buried support column',(x,-11,z),(.58,20,.58),concrete,bevel=.035)
        box('Cracked column head',(x,-1.35,z),(.86,.76,.86),concrete,bevel=.025)
        box('Steel load saddle',(x,-.91,z),(1.1,.15,1.1),rust,bevel=.014)
        for y in [-2.3,-6.5,-11]:
            box('Column reinforcement collar',(x,y,z),(.67,.18,.67),rust,bevel=.012)
    for a,b in [(-7.4,0),(0,7.4)]:
        beam('Underframe diagonal',(x,-7.5,a),(x,-1,b),.14,.19)
        beam('Underframe diagonal',(x,-1,a),(x,-7.5,b),.14,.19)
for z in [-7.4,-3.7,0,3.7,7.4]:beam('Cross-deck girder',(-5.75,-.5,z),(5.75,-.5,z),.24,.55)

# Cargo and crew fittings stay within their original blocker footprints.
box('Cargo lower skid',(-1,.085,-5.8),(2.18,.17,2.18),graphite,bevel=.024)
box('Cargo sealed shell',(-1,.59,-5.8),(2.08,1.0,2.08),paint,bevel=.04)
box('Cargo lid gasket',(-1,1.049,-5.8),(2.13,.025,2.13),dark,bevel=.015)
box('Cargo lid flange',(-1,1.08,-5.8),(2.14,.05,2.14),steel,bevel=.017)
for x in [-1.98,-.02]:
    for z in [-6.78,-4.82]:
        box('Cargo corner protector',(x,.60,z),(.12,.97,.12),rust,bevel=.016)
        for y in [.25,.65,.96]:bolt((x,y,z-.064),(0,0,-1),.012)
for z in [-6.60,-5,-5.8]:box('Seated cargo lid rib',(-1,1.108,z),(1.90,.014,.052),rust,bevel=.004)
for x in [-1.60,-.40]:
    box('Cargo recessed latch',(x,.89,-4.735),(.18,.22,.028),graphite,bevel=.012)
    box('Cargo captive pull',(x,.90,-4.710),(.04,.12,.022),alloy,bevel=.008)
label('ANNIKA / STORES',(-1,.69,-4.746),.10)
for x in [-3.14,-.86]:
    box('Bench pedestal foot',(x,.035,5.8),(.30,.07,1.52),steel,bevel=.012)
    box('Bench anchored upright',(x,.37,5.8),(.15,.67,1.40),rust,bevel=.014)
box('Bench formed tray',(-2,.70,5.8),(2.76,.20,1.53),steel,bevel=.024)
for x in [-2.86,-2,-1.14]:
    box('Separated worn seat cushion',(x,.794,5.8),(.80,.045,1.35),fabric,bevel=.018)
    for z in [5.18,6.42]:box('Seat welt seam',(x,.816,z),(.74,.006,.010),graphite,bevel=.002)
for x in [-3.24,-.76]:
    tube('Seat arm support',(x,.64,5.25),(x,1.02,5.25),.026,alloy)
    tube('Seat arm support',(x,.64,6.35),(x,1.02,6.35),.026,alloy)
    tube('Seat return handrail',(x,1.02,5.25),(x,1.02,6.35),.032,graphite)

anchors={'JournalCargo':(-1,1.115,-5.8),'JournalCrew':(-2,.815,5.8),'JournalRoute':(-5.74,1.05,-2),'CourseGyro':(4.5,.92,3),'Gangway':(-6.5,0,0)}
for name,at in anchors.items():marker(name,at,keep=True)
for name in ['JournalCargo','JournalCrew']:
    p=bpy.data.objects[name];x,y,z=anchors[name]
    box('Journal protective back',(x,y+.010,z),(.42,.02,.31),graphite,p,.014)
    box('Journal sealed reader',(x,y+.022,z),(.395,.02,.285),ochre,p,.016)
    box('Recessed reader glass',(x,y+.034,z),(.335,.004,.224),glass,p,.006)
    label('LOG / '+('CARGO' if name=='JournalCargo' else 'WATCH'),(x,y+.0363,z-.055),.029,(0,1,0),p)
    for i in range(3):box('Quiet recorded text',(x-.02,y+.036,z-.01+i*.045),(.22-i*.025,.001,.005),phosphor,p,.0002)
    for dx,dz in [(-.18,-.12),(.18,.12)]:bolt((x+dx,y+.033,z+dz),r=.006,parent=p)
p=bpy.data.objects['JournalRoute']
box('Wall reader backplate',(-5.758,1.05,-2),(.052,.45,.34),rust,p,.012)
box('Wall reader casing',(-5.724,1.05,-2),(.032,.40,.30),graphite,p,.015)
box('Wall reader recessed display',(-5.705,1.09,-2),(.008,.23,.24),glass,p,.005)
label('RELAY / LOG',(-5.7005,1.205,-2),.025,(1,0,0),p)
for y in [1.03,1.09,1.15]:box('Reader trace',(-5.7005,y,-2),(.002,.009,.16),phosphor,p,.0003)

# Recovery pedestal: the original anchor and collision footprint are retained.
box('Gyro deck isolation',(4.5,.015,3),(.88,.03,.88),dark,bevel=.016)
box('Gyro anchored plinth',(4.5,.06,3),(.88,.06,.88),steel,bevel=.012)
box('Gyro service pedestal',(4.5,.47,3),(.79,.79,.79),graphite,bevel=.03)
box('Gyro top mounting flange',(4.5,.88,3),(.87,.06,.87),steel,bevel=.012)
for x in [4.11,4.89]:
    for z in [2.61,3.39]:bolt((x,.095,z),r=.021)
box('Gyro service panel gasket',(4.099,.52,3),(.02,.52,.61),dark,bevel=.009)
box('Gyro removable service panel',(4.083,.52,3),(.016,.49,.58),paint,bevel=.009)
label('GYRO / SAFE RELEASE',(4.073,.69,3),.039,(-1,0,0))
for z in [2.76,3.24]:
    for y in [.32,.73]:bolt((4.072,y,z),(-1,0,0),.009)
for i,z in enumerate([2.81,3.,3.19]):
    p=marker('GyroLever'+str(i),(4.055,.50,z),keep=True)
    ring('Lever bearing',(4.069,.50,z),.040,.021,.016,alloy,'x')
    tube('Interlocked lever spindle',(4.066,.50,z),(4.045,.50,z),.020,graphite)
    tube('Lever shaft',(4.044,.50,z),(3.996,.585,z),.009,alloy,p)
    tube('Lever insulated handle',(3.996,.585,z-.025),(3.996,.585,z+.025),.017,ochre,p)
    lamp=marker('GyroStatus'+str(i),(4.069,.37,z),keep=True)
    tube('Sealed status bezel',(4.071,.37,z),(4.059,.37,z),.022,alloy)
    tube('Gyro status lens',(4.058,.37,z),(4.054,.37,z),.015,phosphor,lamp)
    label(str(i+1),(4.071,.62,z),.031,(-1,0,0))
gyro=bpy.data.objects['CourseGyro'];assembly=marker('GyroAssembly',(4.5,1.20,3),gyro,True)
tube('Gyro central spindle',(4.5,.91,3),(4.5,1.46,3),.071,alloy,assembly,36)
ring('Gyro horizontal gimbal',(4.5,1.14,3),.31,.276,.043,steel,parent=assembly,n=56)
ring('Gyro outer vertical gimbal',(4.5,1.22,3),.292,.252,.041,ochre,'x',assembly,56)
ring('Gyro inner vertical gimbal',(4.5,1.22,3),.245,.213,.036,alloy,'z',assembly,56)
tube('Gyro rotor casing',(4.5,1.16,3),(4.5,1.28,3),.166,graphite,assembly,48)
for y in [1.16,1.28]:ring('Rotor retaining flange',(4.5,y,3),.179,.15,.020,alloy,parent=assembly,n=48)
for a in np.linspace(0,math.tau,12,endpoint=False):bolt((4.5+.15*math.cos(a),1.295,3+.15*math.sin(a)),r=.007,parent=assembly)

# Wall-attached decommissioned machinery with visible saddles and pipe ends.
for z in [-6.8,-4.4,-2.6,.1,6.6]:
    x=5.47
    box('Vessel wall support',(5.72,1.18,z),(.26,.74,.38),rust,bevel=.014)
    tube('Sealed reservoir',(x,.45,z),(x,1.63,z),.22,graphite,n=40)
    for y in [.52,1.53]:
        ring('Reservoir retaining collar',(x,y,z),.233,.205,.055,steel,n=32)
        box('Reservoir saddle',(5.65,y,z),(.20,.08,.48),steel,bevel=.009)
    for y in [.43,1.65]:tube('Reservoir end cap',(x,y-.018,z),(x,y+.018,z),.223,steel,n=40)
    cable('Connected service return',[(x,1.65,z),(x,1.91,z),(5.70,2.05,z),(5.70,2.05,z+.42)],.026,alloy)
    box('Bulkhead service termination',(5.745,2.05,z+.42),(.10,.13,.13),graphite,bevel=.01)
    tube('Service valve neck',(5.27,1.20,z),(5.19,1.20,z),.024,alloy)
    ring('Valve rim',(5.155,1.20,z),.077,.063,.015,ochre,'x',n=28)
    for a in [0,math.pi/2]:
        d=Vector((0,math.cos(a)*.065,math.sin(a)*.065));center=Vector((5.155,1.20,z));tube('Valve spoke',center-d,center+d,.008,alloy,n=12)
    tube('Valve hub',(5.19,1.20,z),(5.14,1.20,z),.020,alloy,n=20)

p=bpy.data.objects['Gangway']
box('Gangway structural plate',(-6.5,-.09,0),(1,.14,2),graphite,p,0)
for i in range(9):
    x=-6.95+i*.1125
    box('Flush gangway tread',(x,-.008,0),(.108,.016,1.95),steel,p,.002)
    for z in [-.91,.91]:tube('Gangway recessed fixing',(x,-.0002,z),(x,.0002,z),.01,graphite,p,12)
for z in [-.94,.94]:box('Gangway edge paint',(-6.5,.001,z),(.99,.002,.045),ochre,p,0)

# Portable UVs in metres and fine geometry, with no collapsed bevel faces.
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
for obj in objects:
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    # Preserve named runtime pivots while baking child geometry transforms.
    mod=obj.modifiers.new('Portable triangulation','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new();bm.from_mesh(obj.data);tiny=[f for f in bm.faces if f.calc_area()<1e-10]
    if tiny:bmesh.ops.delete(bm,geom=tiny,context='FACES_ONLY')
    loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
    for poly in obj.data.polygons:
        normal=obj.matrix_world.to_3x3()@poly.normal;axis=max(range(3),key=lambda i:abs(normal[i]));a,b=[i for i in range(3) if i!=axis]
        for loop in poly.loop_indices:
            at=obj.matrix_world@obj.data.vertices[obj.data.loops[loop].vertex_index].co;uv.data[loop].uv=(at[a]*.73,at[b]*.73)
    obj.data.calc_loop_triangles();obj.select_set(False)
scene=bpy.context.scene;scene.name='The Wake - refined wreck';scene.world=bpy.data.worlds.new('Wake studio');scene.world.color=(.18,.18,.18)
target=c.xyz((0,1,0));bpy.ops.object.camera_add(location=c.xyz((-17,14,23)));camera=bpy.context.object;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=26;scene.camera=camera
for at,power,size in [((-8,-10,16),2400,12),((10,2,12),3000,10),((0,12,9),1800,8)]:
    bpy.ops.object.light_add(type='AREA',location=at);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100;scene.render.filepath=str(OUT/'wake.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'TheWake.blend'),compress=True)
if '--no-render' not in sys.argv:bpy.ops.render.render(write_still=True)
triangles=sum(len(o.data.loop_triangles) for o in objects)
for parent in [root,*preserve]:
    group=[o for o in parent.children if o.type=='MESH']
    if not group:continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in group:obj.select_set(True)
    bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();obj=bpy.context.object;obj.name=parent.name+'_Geometry'
    old=list(obj.data.materials);mats=list(dict.fromkeys(old));indices=[mats.index(old[p.material_index]) for p in obj.data.polygons];obj.data.materials.clear()
    for mat in mats:obj.data.materials.append(mat)
    for poly,index in zip(obj.data.polygons,indices):poly.material_index=index
bpy.ops.object.select_all(action='DESELECT')
for obj in [root,*root.children_recursive]:obj.select_set(True)
path=ROOT/'godot/art/wake-refined.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True)
repaired=repair(path)
report={'editableParts':len(objects),'triangles':triangles,'runtimeMeshes':sum(o.type=='MESH' for o in root.children_recursive),'bytes':path.stat().st_size,'repairedTangents':repaired,'anchors':anchors}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print('WAKE_BUILT',report,flush=True)
