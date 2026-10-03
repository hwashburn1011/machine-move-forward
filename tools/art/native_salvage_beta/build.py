"""Nomad recovery family. Original metre-scale meshes; isolated Blender process.

Editable parts stay split in the master. Runtime joins only siblings sharing a
material, so every functional pivot survives and static detail costs no draw.
"""
import bpy, bmesh, sys, math, json, ast, struct
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-salvage-beta';OUT.mkdir(parents=True,exist_ok=True)
ART=ROOT/'godot/art'
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'));import common as c
recipe=ast.parse((ROOT/'tools/art/native_weapons/build.py').read_text())
fn=next(n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name=='wear_material')
exec(compile(ast.Module(body=[fn],type_ignores=[]),'<wear material>','exec'))
paint=wear_material('Beta salvage aged ochre',(.35,.245,.105),.32,.68,261001)
steel=wear_material('Beta salvage graphite steel',(.085,.105,.094),.65,.57,261002)
# Restrain inherited coating noise: these are maintained tools with light wear,
# not camouflage. Fine roughness and grain remain portable packed PBR textures.
for material,base in [(paint,(.35,.245,.105)),(steel,(.085,.105,.094))]:
    img=next(n.image for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image.name.endswith('_Base'))
    pixels=np.array(img.pixels[:],dtype=np.float32).reshape((-1,4))
    pixels[:,:3]=pixels[:,:3]*.23+np.array(base)[None,:]*.77
    img.pixels.foreach_set(pixels.ravel());img.pack()
olive=c.flat('Beta salvage mineral enamel',(.225,.27,.21),.28,.69)
metal=c.flat('Beta salvage scoured alloy',(.39,.40,.34),.8,.42)
dark=c.flat('Beta salvage seals and recesses',(.013,.021,.018),.04,.85)
ivory=c.flat('Beta salvage ceramic lettering',(.69,.68,.52),0,.69)
amber=c.flat('Beta salvage amber indicators',(.57,.27,.055),.1,.4)
MATS=[paint,steel,olive,metal,dark,ivory,amber]
roots=[];meta={}

def box(n,p,d,m,r,b=.008):return c.box(n,p,d,m,r,min(b,min(d)*.38))
def tube(n,a,b,rad,m,r,N=20):
    a,b=c.xyz(a),c.xyz(b);d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=N,radius=rad,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y')
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    c.finish(o,n,m,r,min(rad*.13,.007))
    for f in o.data.polygons:
        if len(f.vertices)>4:f.use_smooth=False
    return o
def beam(n,a,b,w,d,m,r):
    av,bv=Vector(a),Vector(b);o=box(n,(av+bv)/2,(w,d,(bv-av).length),m,r,min(w*.13,.014))
    o.rotation_mode='QUATERNION';o.rotation_quaternion=(c.xyz(b)-c.xyz(a)).to_track_quat('Y','Z');return o
def profile(n,xy,depth,z,m,r,b=.008):
    vertices=[c.xyz((x,y,zz)) for zz in [z-depth/2,z+depth/2] for x,y in xy];L=len(xy)
    faces=[tuple(reversed(range(L))),tuple(range(L,2*L))]+[(i,(i+1)%L,(i+1)%L+L,i+L) for i in range(L)]
    mesh=bpy.data.meshes.new(n);mesh.from_pydata(vertices,[],faces);mesh.update()
    o=bpy.data.objects.new(n,mesh);bpy.context.collection.objects.link(o);c.finish(o,n,m,r,b)
    mod=o.modifiers.new('Area weighted casting normals','WEIGHTED_NORMAL');mod.keep_sharp=True
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name);return o
def annulus(n,at,outer,inner,height,m,r,N=48):
    x,y,z=at;verts=[]
    for yy,rad in [(y-height/2,outer),(y+height/2,outer),(y+height/2,inner),(y-height/2,inner)]:
        verts.extend(c.xyz((x+rad*math.cos(i*math.tau/N),yy,z+rad*math.sin(i*math.tau/N))) for i in range(N))
    faces=[(j*N+i,j*N+(i+1)%N,((j+1)%4)*N+(i+1)%N,((j+1)%4)*N+i) for j in range(4) for i in range(N)]
    mesh=bpy.data.meshes.new(n);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(n,mesh)
    bpy.context.collection.objects.link(o);c.finish(o,n,m,r)
    mod=o.modifiers.new('Rounded rolled rim','BEVEL');mod.width=.003;mod.segments=1
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name);return o
def text(value,at,size,r,up=False):
    bpy.ops.object.text_add(location=c.xyz(at));o=bpy.context.object;o.name='Stamped '+value;o.parent=r
    o.data.body=value;o.data.size=size;o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.resolution_u=3
    o.rotation_euler=(0,0,0) if up else (math.pi/2,0,0);o.data.materials.append(ivory)
    bpy.ops.object.convert(target='MESH');return bpy.context.object
def bolt(at,r,axis='Y',rad=.018):
    a=Vector(at);d=Vector((0,1,0) if axis=='Y' else (0,0,1))
    tube('Captive washer',a,a+d*.004,rad*1.4,metal,r,16)
    tube('Hex fixing',a+d*.004,a+d*.017,rad,steel,r,6)
def mark(at,r,label,w=.5):
    box('Enamel identification plate',at,(w,.16,.012),dark,r,.004)
    text(label,(at[0],at[1],at[2]+.008),.052,r)
def root(name,file):
    r=c.empty(name);roots.append(r);meta[name]={'file':file};return r

# PORT / 04: a deck-mounted repairable knuckle boom. The reach and jaw throat
# are designed around the existing 1.639 m chest, not a decorative tiny grab.
r=root('PortClaw','beta-port-claw.glb')
box('Continuous deck isolation seal',(0,.018,0),(1.46,.036,1.40),dark,r,.01)
box('Bolted load spreading foot',(0,.083,0),(1.44,.13,1.38),steel,r,.025)
for x in [-.60,.60]:
    for z in [-.57,.57]:bolt((x,.151,z),r,rad=.032)
tube('Slew bearing stationary race',(0,.15,0),(0,.34,0),.58,metal,r,48)
for i in range(12):
    a=i*math.tau/12;bolt((.49*math.cos(a),.345,.49*math.sin(a)),r,rad=.017)
slew=c.empty('SlewPivot',(0,.35,0),r)
tube('Rotating sealed hub',(0,-.015,0),(0,.16,0),.45,steel,slew,40)
box('Cast counterweight',(.32,.40,0),(.99,.52,.99),paint,slew,.07)
for z in [-.49,.49]:
    profile('Forged pedestal cheek',[(-.37,.05),(-.37,1.28),(-.14,1.45),(.22,1.29),(.44,.06)],.12,z,steel,slew,.025)
    tube('Shoulder bearing cover',(0,1.25,z-.08),(0,1.25,z+.08),.23,paint,slew,40)
    tube('Shoulder axle end',(0,1.25,z-.091),(0,1.25,z+.091),.13,metal,slew,32)
box('Hydraulic reservoir',(.19,.75,0),(.64,.62,.61),olive,slew,.05)
box('Replaceable service cover',(.19,.76,.32),(.50,.42,.035),paint,slew,.018)
for x in [-.01,.39]:
    for y in [.61,.90]:bolt((x,y,.341),slew,'Z',.018)
mark((.19,.77,.347),slew,'PORT / 04',.39)
box('Hand control housing',(.69,.89,.40),(.28,.35,.32),steel,slew,.027)
beam('Console welded support',(.34,.63,.30),(.69,.75,.40),.12,.11,steel,slew)
c.cable('Console restrained conduit',[(.34,.77,.32),(.47,.67,.34),(.62,.72,.40)],.025,dark,slew)
box('Gated control plate',(.69,1.071,.40),(.23,.014,.26),dark,slew,.005)
tube('Control lever',(.69,1.08,.4),(.64,1.24,.4),.017,metal,slew,12)
tube('Control handgrip',(.64,1.21,.4),(.635,1.29,.4),.033,dark,slew,16)
box('CraneReadyLamp',(.72,.945,.567),(.09,.08,.012),amber,slew,.008)
c.empty('CraneInteract',(.94,.99,.42),slew)
shoulder=c.empty('ShoulderPivot',(0,1.25,0),slew)
for z in [-.31,.31]:
    profile('Tapered box girder cheek',[(.16,-.22),(-.38,-.20),(-3.61,1.52),(-3.67,1.86),(-3.27,1.98),(-.19,.24)],.095,z,paint,shoulder,.018)
    profile('Recessed reinforcement cheek',[(-.50,.09),(-3.16,1.56),(-3.20,1.73),(-.62,.30)],.017,z+(.055 if z>0 else -.055),olive,shoulder,.008)
for z in [-.265,.265]:
    beam('Continuous girder lower flange',(-.25,-.12,z),(-3.53,1.62,z),.12,.10,steel,shoulder)
    beam('Continuous girder upper flange',(-.20,.18,z),(-3.46,1.86,z),.12,.10,steel,shoulder)
for t in [.22,.46,.70,.90]:
    x=-3.45*t;y=1.75*t;box('Internal cross diaphragm',(x,y,0),(.12,.24,.54),steel,shoulder,.009)
tube('Main lift cylinder',(-.27,-.64,0),(-1.83,.56,0),.115,steel,shoulder,32)
tube('Main lift polished rod',(-1.79,.54,0),(-2.93,1.42,0),.063,metal,shoulder,24)
for at in [(-.27,-.64,0),(-2.93,1.42,0)]:tube('Ram clevis pin',(at[0],at[1],-.18),(at[0],at[1],.18),.092,metal,shoulder,24)
c.cable('Clamped hydraulic supply',[(-.08,-.20,.39),(-.53,.14,.39),(-2.7,1.43,.39),(-3.50,1.64,.39)],.024,dark,shoulder)
for t in [.3,.6,.84]:box('Hydraulic line saddle',(-3.45*t,1.75*t,.40),(.11,.075,.08),metal,shoulder,.006)
elbow=c.empty('ElbowPivot',(-3.48,1.75,0),shoulder)
tube('Knuckle axle',(0,0,-.45),(0,0,.45),.22,steel,elbow,40)
for z in [-.46,.46]:tube('Knuckle machined cover',(0,0,z-.025),(0,0,z+.025),.16,metal,elbow,32)
for z in [-.20,.20]:
    profile('Outer knuckle boom',[(-.02,.17),(-2.70,-.25),(-3.19,-.43),(-3.22,-.68),(-2.70,-.58),(-.08,-.17)],.09,z,paint,elbow,.018)
    beam('Boom edge stiffener',(-.15,.14,z),(-3.10,-.40,z),.065,.08,metal,elbow)
for t in [.25,.53,.8]:box('Forearm web',(-3.15*t,-.52*t,0),(.12,.24,.38),steel,elbow,.009)
tube('Elbow trim cylinder',(-.35,.37,0),(-1.51,.12,0),.086,steel,elbow,28)
tube('Elbow trim piston',(-1.49,.12,0),(-2.5,-.095,0),.043,metal,elbow,24)
for x,upper,lower in [(-.35,.37,-.02),(-2.50,-.095,-.43)]:
    for z in [-.115,.115]:profile('Welded trim cylinder clevis',[(x-.10,lower),(x+.10,lower),(x+.07,upper+.04),(x-.07,upper+.04)],.06,z,steel,elbow,.008)
    tube('Trim cylinder transverse pin',(x,upper,-.17),(x,upper,.17),.064,metal,elbow,24)
c.cable('Knuckle flexible hose',[(-.03,.28,.27),(-.30,.49,.28),(-.69,.30,.28),(-1.01,.19,.28)],.022,dark,elbow)
beam('Short telescoping nose',(-2.83,-.48,0),(-3.60,-.57,0),.23,.21,steel,elbow)
box('Nose travel stop',(-3.59,-.57,0),(.12,.27,.29),metal,elbow,.015)
tip=c.empty('HoistAnchor',(-3.60,-.57,0),elbow)
tube('Suspension swivel',(0,.09,0),(0,-.40,0),.095,metal,tip,28)
claw=c.empty('ClawHead',(0,-.45,0),tip)
box('Grab crosshead',(0,0,0),(.56,.25,1.89),steel,claw,.035)
box('Protected jaw drive',(0,.105,0),(.40,.23,.66),olive,claw,.035)
for s,name in [(-1,'JawA'),(1,'JawB')]:
    jaw=c.empty(name,(0,-.05,s*.91),claw)
    for x in [-.23,.23]:
        # Profile extrusion is across Z; rotate to place a broad jaw in YZ.
        xy=[(-.03,.04),(.16,-.20),(.14,-1.40),(-.18,-1.51),(-.44,-1.46),(-.44,-1.33),(-.08,-1.27),(-.09,-.22)]
        o=profile('Forged cupped grab finger',xy,.11,0,paint,jaw,.018)
        o.rotation_euler.z=-math.pi/2*s;o.location.x=x
    tube('Grab finger hinge',(-.34,0,0),(.34,0,0),.08,metal,jaw,24)
    box('Contact grip pad',(0,-.82,-s*.018),(.51,.48,.07),dark,jaw,.012)
    for y in [-.65,-.79,-.93]:box('Jaw replaceable grip rib',(0,y,-s*.060),(.51,.045,.036),metal,jaw,.006)
c.empty('CargoAnchor',(0,-1.00,0),claw)
meta[r.name].update({'deckOrigin':[0,0,0],'portDirection':[-1,0,0],'jawInnerWidth':1.80,'cargoAnchorFromHead':[0,-1,0],
 'collision':[{'name':'PortClawBase','offset':{'x':0,'y':.78,'z':0},'half':{'x':.78,'y':.78,'z':.73}}]})

# MENDER / 02: compact four-duct civilian recovery drone. The shrouded fans,
# flat service head and tactile retrieval latch contrast with hostile optics.
r=root('DroneRoot','beta-salvage-drone.glb')
box('Sealed magnesium airframe',(0,0,0),(.47,.19,.60),steel,r,.045)
box('Pressed service shell',(0,.09,-.03),(.45,.13,.50),olive,r,.047)
box('Replaceable front bumper',(0,-.015,.318),(.44,.14,.08),paint,r,.027)
box('Forward lens gasket',(0,.045,.326),(.26,.065,.018),dark,r,.008)
for x in [-.075,.075]:box('Twin ranging lens',(x,.046,.338),(.067,.040,.018),amber,r,.01)
box('Battery removal seam',(0,.163,-.065),(.34,.008,.31),dark,r,.014)
box('Battery removable hatch',(0,.170,-.065),(.317,.015,.29),paint,r,.012)
text('MENDER / 02',(0,.18,-.07),.037,r,True)
for x in [-.13,.13]:
    for z in [-.17,.04]:bolt((x,.179,z),r,rad=.009)
for z in [-.16,-.11,-.06,-.01,.04]:box('Rear vent slot',(0,.074,z-.21),(.26,.019,.018),dark,r,.004)
for x in [-.44,.44]:
    for z in [-.37,.37]:
        beam('Boxed fan support',(x*.38,0,z*.55),(x,.015,z),.09,.11,steel,r)
        annulus('Continuous safety fan duct',(x,.034,z),.241,.211,.115,paint,r,48)
        annulus('Rolled duct lip',(x,.094,z),.247,.216,.016,metal,r,48)
        for dx,dz in [(.16,0),(-.16,0),(0,.16),(0,-.16)]:
            beam('Motor radial support',(x,.012,z),(x+dx,.012,z+dz),.022,.025,steel,r)
        rotor=c.empty(('RotorF' if z>0 else 'RotorR')+('L' if x<0 else 'R'),(x,.075,z),r)
        tube('Fan motor hub',(0,-.068,0),(0,.020,0),.054,metal,rotor,24)
        for angle in [0,math.tau/3,2*math.tau/3]:
            o=box('Swept fan blade',(.115,0,.025),(.184,.014,.052),dark,rotor,.015)
            o.location=c.xyz((.105*math.cos(angle),0,.105*math.sin(angle)))
            o.rotation_euler.z=-angle;o.rotation_euler.x=.09
for x in [-.24,.24]:
    for z in [-.21,.21]:beam('Landing strut',(x*.80,-.06,z),(x,-.245,z),.028,.033,metal,r)
    box('Shock absorbing landing skid',(x,-.261,0),(.066,.038,.58),dark,r,.012)
box('Retrieval latch base',(0,-.132,0),(.25,.065,.24),steel,r,.015)
for x in [-.09,.09]:
    beam('Cargo latch cheek',(x,-.13,0),(x,-.26,0),.038,.050,metal,r)
    box('Cargo latch catch',(x*.61,-.293,.01),(.13,.06,.065),paint,r,.011)
c.empty('CargoAnchor',(0,-.90,0),r);c.empty('DroneDockPoint',(0,-.28,0),r)
meta[r.name].update({'flightOrigin':'body center','groundContactY':-.28,'cargoAnchor':[0,-.90,0],'rotorAxis':'Y','dockRootPosition':[0,.60,0]})

r=root('SalvageDock','beta-salvage-dock.glb')
for x in [-.66,.66]:
    for z in [-.66,.66]:
        box('Dock isolation foot',(x,.035,z),(.18,.07,.18),dark,r,.015)
        bolt((x,.07,z),r,rad=.018)
box('Drainable collector plinth',(0,.125,0),(1.52,.17,1.52),steel,r,.035)
box('Recessed landing tray',(0,.218,0),(1.38,.025,1.37),olive,r,.022)
for x in [-.24,.24]:box('Raised landing skid guide',(x,.275,0),(.12,.09,.73),metal,r,.009)
for z in [-.39,.39]:
    for x in [-.31,.31]:box('Tray lead-in angle',(x,.29,z),(.09,.12,.14),paint,r,.007)
box('Rear charging pedestal',(0,.50,-.715),(.84,.59,.15),paint,r,.038)
box('Charging cabinet inset',(0,.52,-.632),(.69,.36,.023),dark,r,.01)
box('Charging cabinet door',(0,.52,-.614),(.65,.33,.02),olive,r,.011)
mark((0,.54,-.598),r,'MENDER / DOCK',.58)
for x in [-.30,.30]:
    for y in [.40,.64]:bolt((x,y,-.601),r,'Z',.009)
box('DockStatusLamp',(0,.799,-.715),(.24,.025,.09),amber,r,.007)
c.cable('Restrained dock feed',[(.43,.17,-.58),(.50,.23,-.58),(.49,.48,-.64),(.41,.49,-.66)],.018,dark,r)
for x in [-.61,.61]:
    box('Landing stripe',(x,.237,0),(.055,.006,.81),ivory,r,.002)
    for z in [-.47,.47]:box('Landing alignment block',(x,.237,z),(.19,.006,.055),ivory,r,.002)
c.empty('DroneDockPoint',(0,.60,0),r);c.empty('CargoDeposit',(0,.27,.48),r)
meta[r.name].update({'groundContactY':0,'droneDockPoint':[0,.60,0],'existingColliderHalf':[.82,.55,.82]})

# Three low-count, identifiable salvage silhouettes. Ground origins are exact.
r=root('SalvageCassette','beta-salvage-cassette.glb')
for x in [-.32,.32]:box('Equipment skid',(x,.032,0),(.09,.064,.57),steel,r,.009)
box('Sealed spare assembly',(0,.25,0),(.75,.40,.52),olive,r,.045)
box('Cassette lid seam',(0,.443,0),(.766,.012,.534),dark,r,.007)
box('Pressed service lid',(0,.463,0),(.77,.035,.54),paint,r,.017)
for x in [-.28,.28]:
    box('Steel retaining strap',(x,.271,0),(.049,.43,.54),metal,r,.007)
    box('Strap latch',(x,.31,.287),(.09,.105,.025),steel,r,.007)
for x in [-.14,.14]:tube('Handle standoff',(x,.48,0),(x,.54,0),.021,metal,r,12)
tube('Service carry handle',(-.14,.54,0),(.14,.54,0),.024,dark,r,16)
mark((0,.26,.270),r,'SPARES',.31)
r=root('SalvageCoil','beta-salvage-coil.glb')
for z in [-.24,.24]:box('Coil transit cradle',(0,.037,z),(.73,.074,.12),steel,r,.012)
tube('Coil sealed axle',(0,.08,0),(0,.41,0),.10,metal,r,32)
for y in [.104,.389]:annulus('Winding protective cheek',(0,y,0),.355,.13,.030,olive,r,48)
for y in [.14,.18,.22,.26,.30,.34]:annulus('Visible insulated copper winding',(0,y,0),.313,.12,.035,paint,r,40)
for z in [-.29,.29]:box('Transit clamp',(0,.265,z),(.075,.29,.048),metal,r,.005)
r=root('SalvageCell','beta-salvage-cell.glb')
box('Impact resistant battery heel',(0,.045,0),(.51,.09,.39),steel,r,.018)
box('Sealed ceramic battery',(0,.386,0),(.45,.60,.34),olive,r,.03)
for y in [.18,.49,.665]:box('Cell compression collar',(0,y,0),(.48,.042,.37),metal,r,.008)
box('Insulating contact crown',(0,.70,0),(.46,.09,.35),dark,r,.02)
for x in [-.13,.13]:tube('Recessed battery contact',(x,.737,0),(x,.772,0),.045,metal,r,24)
mark((0,.39,.177),r,'CELL / 07',.34)

# UVs, winding and tiny-face cleanup are shared across the whole family.
for r in roots:
    meta[r.name]['editableParts']=sum(o.type=='MESH' for o in r.children_recursive)
    for o in r.children_recursive:
        if o.type!='MESH':continue
        uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
        for face in o.data.polygons:
            axis=max(range(3),key=lambda i:abs(face.normal[i]));a,b=[i for i in range(3) if i!=axis]
            for loop in face.loop_indices:
                p=o.data.vertices[o.data.loops[loop].vertex_index].co+o.location;uv.data[loop].uv=(p[a]*1.8,p[b]*1.8)
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
        if not o.name.startswith('Stamped '):
            bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(o.data);bm.free()
        mod=o.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_area()<1e-10],context='FACES_ONLY');bm.to_mesh(o.data);bm.free();o.data.update()
bpy.context.view_layer.update()
for r in roots:
    points=[o.matrix_world@v.co for o in r.children_recursive if o.type=='MESH' for v in o.data.vertices]
    points=[(p.x,p.z,-p.y) for p in points]
    meta[r.name]['bounds']={'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]}
    meta[r.name]['anchors']={o.name.split('.')[0]:[round(v,5) for v in (o.location.x,o.location.z,-o.location.y)] for o in r.children_recursive if o.type=='EMPTY'}
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadSalvageBeta.blend'),compress=True)
for r in roots:
    parents=[r]+[o for o in r.children_recursive if o.type=='EMPTY']
    for parent in parents:
        for mat in MATS:
            objs=[o for o in parent.children if o.type=='MESH' and o.data.materials and o.data.materials[0]==mat]
            if not objs:continue
            bpy.ops.object.select_all(action='DESELECT')
            for o in objs:o.select_set(True)
            bpy.context.view_layer.objects.active=objs[0]
            if len(objs)>1:bpy.ops.object.join()
            bpy.context.object.name=parent.name+'_'+mat.name
    bpy.ops.object.select_all(action='DESELECT');r.select_set(True)
    for o in r.children_recursive:o.select_set(True)
    path=ART/meta[r.name]['file']
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True)
    # Blender requires unique names across separate models in one master. Each
    # standalone GLB exposes clean contract names without Blender's .001 suffix.
    data=path.read_bytes();length=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+length])
    for node in doc['nodes']:
        if node.get('name','').split('.')[0] in ['CargoAnchor','DroneDockPoint']:node['name']=node['name'].split('.')[0]
    payload=json.dumps(doc,separators=(',',':')).encode();payload+=b' '*((-len(payload))%4)
    tail=data[20+length:];path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(payload)+len(tail))+struct.pack('<II',len(payload),0x4E4F534A)+payload+tail)
    objs=[o for o in r.children_recursive if o.type=='MESH']
    for o in objs:o.data.calc_loop_triangles()
    meta[r.name].update({'triangles':sum(len(o.data.loop_triangles) for o in objs),'materialBatches':len(objs),'bytes':path.stat().st_size})
(OUT/'manifest.json').write_text(json.dumps(meta,indent=2));(ART/'beta-salvage.json').write_text(json.dumps(meta,indent=2))

# Review studio uses the exported static batches, with the original editable
# master saved before joins. Review file and live MCP append are non-destructive.
scene=bpy.context.scene;scene.name='Nomad salvage beta review';scene.render.engine='CYCLES';scene.cycles.samples=32
scene.cycles.use_denoising=True;scene.world=bpy.data.worlds.new('Salvage studio world');scene.world.color=(.23,.23,.23)
bpy.ops.mesh.primitive_plane_add(size=200);ground=bpy.context.object;ground.name='Studio floor';ground.data.materials.append(c.flat('Studio muted warm ground',(.14,.13,.10)))
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';scene.camera=cam
for at,power,size in [((-5,8,6),2400,7),((3,5,-4),2200,6),((-9,6,-1),1500,5)]:
    bpy.ops.object.light_add(type='AREA',location=c.xyz(at));o=bpy.context.object;o.data.energy=power;o.data.size=size
    o.rotation_euler=(c.xyz((-2,1,0))-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=1500;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
def show(names):
    for r in roots:
        for o in [r,*r.children_recursive]:o.hide_render=r.name not in names
def shot(name,at,target,scale,names):
    show(names);cam.location=c.xyz(at);cam.rotation_euler=(c.xyz(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
    scene.render.filepath=str(OUT/name)
    if '--no-render' not in sys.argv:bpy.ops.render.render(write_still=True)
shot('port-claw-review.png',(-10,6.1,10),(-3.0,1.85,0),9.8,['PortClaw'])
roots[1].location=c.xyz((0,.60,0))
shot('drone-dock-review.png',(2.5,2.2,3),(0,.40,0),2.20,['DroneRoot','SalvageDock'])
roots[1].location=c.xyz((0,.85,0))
ground.hide_render=True
shot('drone-underside-review.png',(1.5,.20,2),(0,.80,0),1.70,['DroneRoot'])
ground.hide_render=False
for r,p in zip(roots[3:],[(-1.15,0,0),(0,0,0),(1.0,0,0)]):r.location=c.xyz(p)
shot('salvage-family-review.png',(2.6,2.6,4),(0,.3,0),3.60,[r.name for r in roots[3:]])
show([r.name for r in roots]);roots[1].location=c.xyz((1.8,.60,0));roots[2].location=c.xyz((1.8,0,0))
for r,p in zip(roots[3:],[(.1,0,2.1),(1.25,0,2.1),(2.2,0,2.1)]):r.location=c.xyz(p)
cam.location=c.xyz((-10,9,13));cam.rotation_euler=(c.xyz((-2,1.7,.5))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=12
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadSalvageBetaReview.blend'),compress=True)
print('SALVAGE_BETA_COMPLETE',json.dumps(meta),flush=True)
