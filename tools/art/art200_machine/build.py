"""Twenty-five complete Nomad furnishings, authored in metres, +Y up in game.

Blender 5.1: blender --background --threads 4 --python tools/art/art200_machine/build.py
An editable, unjoined master is saved before material batching. No live MCP scene
is modified. A --render argument also makes five individually framed review sheets.
"""
import bpy, math, json, sys, struct, zlib
from pathlib import Path
from mathutils import Vector
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'assets/art200/machine'
OUT.mkdir(parents=True, exist_ok=True)
ART = ROOT / 'godot/art'
TEX = OUT / 'textures'; TEX.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.context.scene.unit_settings.system = 'METRIC'
roots = []; manifest = {}; current = None

def xyz(p): return Vector((p[0], -p[2], p[1]))

def rgb(value):return tuple(int(value[i:i+2],16)/255 for i in [1,3,5])

def png(path,data):
    """Write exact sRGB bytes; avoid accidental double color conversion."""
    h,w,_=data.shape
    def chunk(kind,raw):return struct.pack('>I',len(raw))+kind+raw+struct.pack('>I',zlib.crc32(kind+raw)&0xffffffff)
    raw=b''.join(b'\0'+row.tobytes() for row in data)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,7))+chunk(b'IEND',b''))

def material(name,hexvalue,metal=.32,rough=.64,seed=200):
    m=bpy.data.materials.new(name);m.use_nodes=True;nodes=m.node_tree.nodes;shader=nodes.get('Principled BSDF')
    shader.inputs['Metallic'].default_value=metal;shader.inputs['Roughness'].default_value=rough
    rng=np.random.default_rng(seed);n=256;y,x=np.mgrid[:n,:n]
    grain=rng.normal(0,.004,(n,n))+.0015*np.sin(x*.8)
    for suffix,values,space in [('albedo',np.clip(np.array(rgb(hexvalue))[None,None,:]+grain[:,:,None],0,1),'sRGB'),('roughness',np.repeat(np.clip(rough+grain[:,:,None]*3,0,1),3,axis=2),'Non-Color')]:
        rgba=np.ones((n,n,4),np.uint8)*255;rgba[:,:,:3]=np.round(values*255).astype(np.uint8)
        path=TEX/(name+'-'+suffix+'.png');png(path,rgba)
        image=bpy.data.images.load(str(path),check_existing=False);image.colorspace_settings.name=space;image.pack()
        tex=nodes.new('ShaderNodeTexImage');tex.image=image
        m.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color' if suffix=='albedo' else 'Roughness'])
    return m

shared=json.loads((ROOT/'assets/art200/palette.json').read_text())
colors={};soft={};palette=[]
for i,family in enumerate(shared['families']):
    colors[family['id']]=material('N200_'+family['id'],family['paint'],seed=200+i)
    soft[family['id']]=material('N200_'+family['id']+'_washed',family['secondary'],metal=.06,rough=.82,seed=240+i)
    palette.extend([colors[family['id']],soft[family['id']]])
steel=material('N200_steel',shared['substrates']['steel'],.70,.49,280)
alloy=material('N200_machined_alloy',shared['substrates']['aged_aluminium'],.84,.37,281)
rubber=material('N200_rubber',shared['substrates']['rubber'],0,.89,282)
ivory=material('N200_age_ivory','#BAB5A5',.02,.70,283)
wood=material('N200_oiled_timber','#655548',.0,.68,284)
glass=material('N200_smoked_glass','#83938A',.04,.20,285)
glass.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.22
glass.surface_render_method='DITHERED'
ochre=colors['ochre'];green=colors['celadon'];cloth=soft['denim'];amber=colors['clay']
palette.extend([steel,alloy,rubber,ivory,wood,glass])

def start(id, title, description, scrap, components=0, weight=12,family='petrol'):
    global current
    id='nomad2-'+id; r=bpy.data.objects.new(id,None); bpy.context.collection.objects.link(r)
    r['asset_type']='complete placeable cosmetic assembly';r['units']='metres';r['ground_y']=0.0
    roots.append(r);current=r
    manifest[id]={'name':title,'description':description+' Cosmetic; no gameplay effect.',
        'cost':{'scrap':scrap,**({'components':components} if components else {})},'weight':weight,'color_family':family,'colliders':[]}
    return r

def collider(at,size):
    manifest[current.name]['colliders'].append({'offset':dict(zip('xyz',at)),'half':dict(zip('xyz',[v/2 for v in size]))})

def finish(o,name,mat,bevel=0):
    o.name=name;o.parent=current;o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Manufactured edge radius','BEVEL');mod.width=bevel;mod.segments=1 if bevel<.005 else 2
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    for f in o.data.polygons:f.use_smooth=True
    mod=o.modifiers.new('Area weighted normals','WEIGHTED_NORMAL');mod.keep_sharp=True;mod.weight=45
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def box(n,p,d,m=steel,b=.01,col=False):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(p));o=bpy.context.object
    o.dimensions=(d[0],d[2],d[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(o,n,m,min(b,min(d)*.3))
    if col:collider(p,d)
    # Tiny exposed-metal nicks only at handled enamel panel corners. They are
    # geometry attached to the real panel face, never a blanket orange noise.
    if m in colors.values() and d[0]>.35 and d[1]>.12 and d[2]>.02:
        for side in [-1,1]:
            at=(p[0]+side*(d[0]/2-max(b,.012)-.026),p[1]-d[1]/2+max(b,.012)+.020,p[2]+d[2]/2+.0006)
            box('Small worn enamel corner',at,(.028,.0025,.001),alloy,.0003)
    return o

def slope_collider(a,b,w):
    assert a[0]==b[0]
    dy=b[1]-a[1];dz=b[2]-a[2]
    collider(tuple((a[i]+b[i])/2 for i in range(3)),(w,math.hypot(dy,dz),w))
    manifest[current.name]['colliders'][-1]['rotX']=math.atan2(dz,dy)

def tube(n,a,b,rad,m=alloy,N=20):
    av,bv=xyz(a),xyz(b);d=bv-av
    bpy.ops.mesh.primitive_cylinder_add(vertices=N,radius=rad,depth=d.length,location=(av+bv)/2)
    o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y')
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    return finish(o,n,m,min(rad*.16,.008))

def beam(n,a,b,w,m=alloy):
    av,bv=xyz(a),xyz(b);d=bv-av
    bpy.ops.mesh.primitive_cube_add(size=1,location=(av+bv)/2);o=bpy.context.object
    o.dimensions=(w,w,d.length);o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y')
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    return finish(o,n,m,min(w*.15,.012))

def ring(n,at,r,wire,m=alloy,axis='y'):
    bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=6,location=xyz(at),major_radius=r,minor_radius=wire)
    o=bpy.context.object
    if axis=='z':o.rotation_euler.x=math.pi/2
    elif axis=='x':o.rotation_euler.y=math.pi/2
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    return finish(o,n,m)

def hose(n,points,rad=.016,m=rubber):
    curve=bpy.data.curves.new(n,'CURVE');curve.dimensions='3D';curve.resolution_u=5;curve.bevel_resolution=1;curve.bevel_depth=rad
    s=curve.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for p,co in zip(s.bezier_points,points):p.co=xyz(co);p.handle_left_type=p.handle_right_type='AUTO'
    o=bpy.data.objects.new(n,curve);bpy.context.collection.objects.link(o);o.parent=current;o.data.materials.append(m)
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
    return o

def label(value,p,size=.045,m=ivory,up=False):
    bpy.ops.object.text_add(location=xyz(p));o=bpy.context.object;o.parent=current;o.name='Stamped '+value
    o.data.body=value;o.data.size=size;o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.resolution_u=2
    o.rotation_euler=(0,0,0) if up else (math.pi/2,0,0);o.data.materials.append(m)
    bpy.ops.object.convert(target='MESH');return o

def plate(value,p,width=.4):
    box('Riveted nomenclature plate',p,(width,.125,.012),steel,.005)
    label(value,(p[0],p[1],p[2]+.007),min(.052,width/max(len(value),1)*1.6))
    for dx in [-width/2+.018,width/2-.018]:bolt((p[0]+dx,p[1],p[2]+.008),.008)

def bolt(p,r=.013,up=False):
    d=Vector((0,.009,0) if up else (0,0,.009));a=Vector(p)
    tube('Countersunk washer',a,a+d*.4,r*1.3,alloy,12)
    tube('Captive hex screw',a+d*.4,a+d,r,steel,6)

def handle(p,w=.22,h=.045):
    x,y,z=p
    for dx in [-w/2,w/2]:tube('Pull mounting lug',(x+dx,y,z),(x+dx,y,z+h),.014,alloy,12)
    tube('Rounded pull grip',(x-w/2,y,z+h),(x+w/2,y,z+h),.019,rubber,16)

def feet(w,d,h=.12):
    for x in [-w/2+.055,w/2-.055]:
        for z in [-d/2+.055,d/2-.055]:
            box('Isolated floor foot',(x,h/2,z),(.11,h,.11),rubber,.018,True)

def legs(w,d,height,m=steel):
    for x in [-w/2,w/2]:
        for z in [-d/2,d/2]:
            box('Load bearing square leg',(x,height/2,z),(.075,height,.075),m,.01,True)
            box('Quiet rubber ferrule',(x,.035,z),(.09,.07,.09),rubber,.012)

def vents(p,w=.5,count=6,vertical=False):
    x,y,z=p
    for i in range(count):
        off=(i-(count-1)/2)*.06
        box('Punched ventilation slot',(x+off if vertical else x,y if vertical else y+off,z),(.018,w,.008) if vertical else (w,.016,.008),rubber,.006)

def wheel(p,r=.085):
    x,y,z=p
    tube('Moulded caster tire',(x-.035,y,z),(x+.035,y,z),r,rubber,24)
    tube('Caster metal hub',(x-.038,y,z),(x+.038,y,z),r*.50,alloy,16)
    box('Caster fork',(x,y+.06,z),(.095,.12,.045),steel,.01)
    collider((x,y,z),(.095,r*2,r*2))

def cabinet(w=.95,h=1.02,d=.54,m=ochre):
    feet(w,d)
    box('Folded steel carcass',(0,(h+.12)/2,0),(w,h-.12,d),steel,.025,True)
    box('Enamel top cap',(0,h+.025,0),(w+.025,.05,d+.025),m,.02,True)

def drawer(p,w=.80,h=.17,m=ochre):
    box('Drawer front shadow gap',p,(w,h,.022),rubber,.008)
    box('Rolled enamel drawer',(p[0],p[1],p[2]+.018),(w-.024,h-.022,.03),m,.008)
    handle((p[0],p[1],p[2]+.036),min(w*.42,.29),.035)

def dial(p,r=.075):
    x,y,z=p;tube('Instrument bezel',(x,y,z),(x,y,z+.032),r,alloy,28)
    tube('Porcelain instrument face',(x,y,z+.033),(x,y,z+.038),r*.81,ivory,24)
    for i in range(7):
        a=.2+math.pi*.88+i*math.pi*1.4/6
        tube('Dial graduation',(x+math.cos(a)*r*.53,y+math.sin(a)*r*.53,z+.04),(x+math.cos(a)*r*.70,y+math.sin(a)*r*.70,z+.04),.0028,steel,6)
    tube('Resting indicator needle',(x-r*.35,y+r*.30,z+.042),(x+r*.13,y-r*.13,z+.042),.004,ochre,8)

def handwheel(p,r,m=alloy):
    """A complete wheel: rim, intersecting spokes and a hub joined to its stem."""
    x,y,z=p
    ring('Cast handwheel rim',p,r,.009,m)
    tube('Handwheel cross spoke',(x-r*.91,y,z),(x+r*.91,y,z),.007,m,12)
    tube('Handwheel cross spoke',(x,y,z-r*.91),(x,y,z+r*.91),.007,m,12)
    tube('Handwheel keyed hub',(x,y-.022,z),(x,y+.014,z),.020,m,16)


def lathe(n,p,profile,m=alloy,N=28):
    verts=[];rings=[]
    for height,radius in profile:
        ids=[]
        for i in range(1 if radius==0 else N):
            angle=i*math.tau/N;ids.append(len(verts));verts.append(xyz((p[0]+radius*math.cos(angle),p[1]+height,p[2]+radius*math.sin(angle))))
        rings.append(ids)
    faces=[]
    for lower,upper in zip(rings,rings[1:]):
        for j in range(N):
            k=(j+1)%N
            if len(lower)==1:faces.append((lower[0],upper[j],upper[k]))
            elif len(upper)==1:faces.append((lower[j],upper[0],lower[k]))
            else:faces.append((lower[j],upper[j],upper[k],lower[k]))
    mesh=bpy.data.meshes.new(n);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(n,mesh);bpy.context.collection.objects.link(o)
    return finish(o,n,m)

def brass_pin(p):
    x,y,z=p;tube('Retained pivot washer',(x,y,z),(x,y,z+.012),.034,alloy,16);bolt((x,y,z+.013),.018)

def turntable(p,r=.2,m=alloy):
    x,y,z=p;tube('Flanged rotary bearing',(x,y-.025,z),(x,y+.025,z),r,m,32)
    for i in range(6):
        a=i*math.tau/6;bolt((x+r*.75*math.cos(a),y+.028,z+r*.75*math.sin(a)),.012,True)

def book(p,w=.075,h=.27,d=.22,m=None):
    x,y,z=p;m=m or colors['oxblood']
    box('Bound paper block',(x,y+h/2,z),(w-.010,h-.016,d-.010),ivory,.003)
    for dx in [-w/2,w/2]:box('Book cloth cover',(x+dx,y+h/2,z),(.006,h,d),m,.002)
    box('Book bound spine',(x,y+h/2,z+d/2),(w,h,.010),m,.004)
    for yy in [y+.038,y+h-.04]:box('Spine pressed band',(x,yy,z+d/2+.006),(w*.78,.006,.003),alloy,.001)

def tabletop(w,d,height,m=wood):
    legs(w-.20,d-.20,height-.04)
    box('Table aproned front',(0,height-.13,d/2-.07),(w-.12,.13,.05),steel,.01,True)
    box('Rounded work surface',(0,height,0),(w,.08,d),m,.022,True)

# 01 / A real folding card table, cards and score pegs held on the table surface.
start('card-table','Last Light card table','A folding card table with retained cards, a score rail and stitched baize.',14,0,16,'oxblood')
tabletop(1.06,.90,.79,colors['oxblood'])
box('Inset baize playing field',(0,.836,0),(.89,.009,.73),soft['oxblood'],.018)
for x in [-.38,.38]:beam('Folding leg brace',(x,.15,-.31),(x,.68,.31),.025,alloy)
for x,z,ang in [(-.24,.14,0),(-.12,.14,0),(.12,-.13,0),(.24,-.13,0)]:
    box('Worn playing card',(x,.843,z),(.085,.005,.14),ivory,.004)
    box('Printed card pip',(x,.847,z),(.022,.003,.022),colors['oxblood'],.002)
box('Score peg rail',(0,.855,-.35),(.53,.035,.045),wood,.008)
for x in [-.18,-.06,.06,.18]:tube('Captive score peg',(x,.87,-.35),(x,.906,-.35),.012,alloy,12)
plate('LAST LIGHT / CLUB',(0,.685,.418),.55)

# 02 / An instrument technician's bench with oscilloscope and hanging test leads.
start('instrument-bench','Horizon instrument bench','An inactive oscilloscope bench with analog meters and parked probes.',23,3,35,'petrol')
tabletop(1.32,.72,.88,soft['petrol'])
box('Instrument shelf upright',(-.57,1.16,-.29),(.055,.55,.055),steel,.01,True)
box('Instrument shelf upright',(.57,1.16,-.29),(.055,.55,.055),steel,.01,True)
box('Instrument upper shelf',(0,1.42,-.15),(1.26,.045,.37),colors['petrol'],.013,True)
box('Oscilloscope cast housing',(-.22,1.13,-.015),(.64,.40,.41),colors['petrol'],.05,True)
box('Recessed cathode screen',(-.31,1.17,.198),(.31,.22,.020),rubber,.038)
for x in [-.39,-.31,-.23]:box('Oscilloscope etched grid',(x,1.17,.210),(.002,.18,.002),soft['petrol'],.001)
for y in [1.11,1.17,1.23]:box('Oscilloscope etched grid',(-.31,y,.210),(.27,.002,.002),soft['petrol'],.001)
for y in [1.06,1.19]:tube('Oscilloscope control knob',(.02,y,.201),(.02,y,.237),.035,alloy,20)
box('Portable bench meter',(.38,1.05,.02),(.28,.24,.30),colors['petrol'],.027)
dial((.38,1.085,.178),.075)
for x in [.27,.47]:hose('Parked test lead',[(x,1.42,-.06),(x,1.18,.13),(x,.72,.30),(x,.90,.31)],.009,rubber)
plate('HORIZON / INSTRUMENTS',(0,.73,.332),.69)

# 03 / Three panels hinged into a U-shaped screen; cloth is physically framed.
start('privacy-screen','Quiet Quarter privacy screen','A folding three-panel screen with framed canvas and full-height hinge pins.',18,0,19,'plum')
for x in [-.39,.39]:
    for z in [-.08,.49]:box('Screen foot',(x,.035,z),(.15,.07,.20),steel,.02,True)
    box('Screen rear frame',(x,.86,-.05),(.055,1.67,.055),alloy,.008,True)
    box('Screen forward frame',(x,.86,.46),(.055,1.67,.055),alloy,.008,True)
    box('Return canvas panel',(x,.91,.21),(.024,1.43,.49),soft['plum'],.008,True)
    for y in [.18,1.65]:box('Screen return rail',(x,y,.21),(.055,.05,.55),colors['plum'],.008)
box('Main privacy canvas',(0,.91,-.05),(.74,1.43,.024),soft['plum'],.008,True)
for y in [.18,1.65]:box('Screen cross rail',(0,y,-.05),(.82,.055,.055),colors['plum'],.008)
for x in [-.39,.39]:
    for y in [.31,.90,1.48]:tube('Captive screen hinge',(x,y-.065,-.05),(x,y+.065,-.05),.045,colors['plum'],20)
for x in [-.25,0,.25]:box('Stitched vertical binding',(x,.91,-.032),(.007,1.34,.006),colors['plum'],.002)

# 04 / Books in varied formats, crossed retaining straps and a low cabinet.
start('book-cabinet','Waymark lending cabinet','A wood-lined book cabinet with a retained travelling library.',19,0,30,'umber')
cabinet(1.05,1.52,.44,colors['umber'])
box('Open shelf dark backing',(0,1.01,.23),(.88,.89,.024),rubber,.01)
for y in [.58,1.0,1.45]:box('Book shelf lip',(0,y,.29),(.94,.045,.20),wood,.01)
for row,y in enumerate([.615,1.035]):
    for j in range(9):book((-.37+j*.09,y,.30),.073,.29+(j%3)*.022,.20,colors['oxblood'] if j%4==0 else (colors['umber'] if j%2 else soft['umber']))
box('Lower cupboard door',(0,.34,.238),(.88,.31,.025),colors['umber'],.015)
handle((0,.37,.254),.29)
plate('WAYMARK / LIBRARY',(0,1.53,.246),.59)

# 05 / Wire pantry rack: contrasting tins remain captive behind wire rails.
start('ration-pantry','Trail Tin pantry rack','A pantry-style display of sealed tins on open wire shelves.',17,0,18,'olive')
legs(.80,.50,1.56,colors['olive'])
for y in [.18,.62,1.06,1.52]:
    box('Pressed pantry shelf',(0,y,0),(.91,.045,.60),colors['olive'],.013,True)
    for z in [-.28,.28]:
        tube('Shelf retention rail',(-.42,y+.14,z),(.42,y+.14,z),.013,alloy,12)
        for x in [-.40,.40]:tube('Retention rail riser',(x,y,z),(x,y+.14,z),.013,alloy,12)
for row in range(3):
    for x in [-.28,0,.28]:
        y=.205+row*.44
        lathe('Ration storage tin',(x,y,.01),[(0,0),(0,.105),(.02,.112),(.26,.112),(.28,.105),(.28,0)],soft['olive'],24)
        for yy in [y+.025,y+.255]:ring('Crimped can rim',(x,yy,.01),.112,.009,alloy)
        box('Tin stock label',(x,y+.14,.128),(.10,.085,.008),ivory,.002)
plate('TRAIL TIN / SEALED',(0,1.58,.276),.58)

# 06 / A full recliner, with slung canvas supported along its complete perimeter.
start('folding-lounge','Blue Mile folding lounge','A reclining field lounger with a braced frame and bound canvas panels.',17,0,15,'denim')
for x in [-.35,.35]:
    for z in [-.61,.62]:box('Lounge foot',(x,.035,z),(.12,.07,.18),rubber,.017,True)
    beam('Lounge rear leg',(x,.07,-.61),(x,.64,-.40),.043,alloy)
    beam('Lounge front leg',(x,.07,.62),(x,.42,.29),.043,alloy)
    slope_collider((x,.07,-.61),(x,.64,-.40),.043)
    slope_collider((x,.07,.62),(x,.42,.29),.043)
    beam('Crossed folding brace',(x,.09,-.54),(x,.41,.44),.025,steel)
    beam('Lounge back support',(x,.46,-.25),(x,1.10,-.78),.044,alloy)
    beam('Lounge leg support',(x,.445,-.25),(x,.445,.82),.044,alloy)
box('Lounge canvas seat',(0,.455,.26),(.68,.035,1.15),soft['denim'],.012,True)
back=box('Reclined canvas back',(0,.79,-.53),(.68,.035,.82),colors['denim'],.012)
back.rotation_euler.x=.879
collider((0,.79,-.53),(.68,.035,.82));manifest[current.name]['colliders'][-1]['rotX']=.879
for x in [-.35,.35]:brass_pin((x,.46,-.24))
box('Bound head cushion',(0,1.065,-.765),(.60,.12,.18),soft['denim'],.042)

# 07 / Microscope stage, objective turret, twin eyepieces and a slide cabinet.
start('microscope-bench','Morrow specimen bench','A retired inspection microscope on a specimen preparation bench.',24,3,31,'celadon')
tabletop(1.16,.70,.88,soft['celadon'])
box('Microscope horseshoe foot',(-.23,.96,.02),(.39,.085,.42),colors['celadon'],.045)
box('Optical column',(-.23,1.16,-.11),(.13,.39,.16),colors['celadon'],.035)
beam('Microscope head arm',(-.23,1.34,-.11),(-.23,1.43,.10),.095,colors['celadon'])
box('Microscope slide stage',(-.23,1.14,.11),(.36,.035,.29),steel,.011)
turntable((-.23,1.365,.11),.085,alloy)
for x in [-.27,-.19]:tube('Microscope objective',(x,1.30,.12),(x,1.36,.12),.032,alloy,20)
for x in [-.275,-.185]:tube('Binocular eyepiece',(x,1.43,.11),(x,1.55,-.035),.034,rubber,20)
for x in [-.34,-.12]:tube('Focus wheel',(x,1.26,-.10),(x+(.03 if x>-.2 else -.03),1.26,-.10),.058,alloy,24)
tube('Microscope focus spindle',(-.37,1.26,-.10),(-.09,1.26,-.10),.021,alloy,16)
box('Specimen slide holder',(-.23,1.163,.10),(.22,.009,.075),ivory,.002)
box('Slide drawer case',(.32,1.05,0),(.33,.24,.34),colors['celadon'],.017)
for y in [.985,1.07,1.155]:drawer((.32,y,.177),.285,.065,soft['celadon'])
plate('MORROW / SPECIMENS',(0,.73,.310),.63)
collider((-.23,1.22,.04),(.43,.54,.43));collider((.32,1.05,0),(.33,.24,.34))

# 08 / A painter's wheeled easel carries a clamped panel, paints and tool cups.
start('paint-trolley','Patchcoat painter trolley','A paint display trolley with a clamped sample panel and brush cups.',18,1,21,'clay')
for x in [-.36,.36]:
    for z in [-.25,.25]:wheel((x,.085,z));box('Painter trolley upright',(x,.60,z),(.04,.94,.04),steel,.01,True)
box('Painter tray',(0,.30,0),(.82,.07,.62),colors['clay'],.023,True)
box('Painter work shelf',(0,.90,0),(.84,.08,.63),colors['clay'],.023,True)
for x in [-.22,.22]:box('Easel rear support',(x,1.28,-.21),(.045,.76,.055),alloy,.01,True)
box('Easel clamped panel',(0,1.28,-.17),(.60,.60,.038),soft['clay'],.018,True)
for x in [-.22,0,.22]:box('Test panel color block',(x,1.29,-.145),(.16,.31,.008),colors['clay'] if x else ivory,.006)
for y in [1.01,1.59]:box('Panel clamp',(0,y,-.145),(.27,.045,.055),steel,.009)
for x in [-.25,.20]:
    lathe('Brush cleaning cup',(x,.95,.18),[(0,0),(0,.086),(.17,.086),(.18,.074),(.035,.074),(.035,0)],alloy,24)
    for dx in [-.025,.025]:tube('Paint brush handle',(x+dx,1.015,.18),(x+dx,1.24,.18),.010,wood,12);box('Brush bristle tuft',(x+dx,1.27,.18),(.029,.07,.018),ivory,.008)
plate('PATCHCOAT / STUDIO',(0,.82,.326),.62)

# 09 / A bent rectangular return duct with supported elbow and removable grille.
start('air-return-duct','Crosswind return duct','A freestanding retired air duct with an elbow, mesh grille and service cover.',19,1,34,'slate')
box('Duct mounting skid',(0,.07,0),(.89,.14,.74),steel,.022,True)
box('Vertical duct casing',(0,.67,-.08),(.56,1.09,.47),colors['slate'],.042,True)
box('Elbow transition',(0,1.22,.02),(.61,.28,.66),colors['slate'],.066,True)
box('Duct forward mouth',(0,1.18,.40),(.65,.42,.28),colors['slate'],.034,True)
box('Grille perimeter seal',(0,1.18,.551),(.57,.34,.028),rubber,.018)
for x in [-.24,-.16,-.08,0,.08,.16,.24]:box('Return grille bar',(x,1.18,.573),(.019,.30,.020),alloy,.004)
for y in [1.08,1.18,1.28]:box('Return cross grille',(0,y,.580),(.52,.013,.016),alloy,.004)
box('Duct removable service cover',(0,.57,.166),(.39,.48,.024),soft['slate'],.023)
for x in [-.14,.14]:
    for y in [.40,.74]:bolt((x,y,.183),.019)
plate('CROSSWIND / RETURN',(0,.57,.194),.34)

# 10 / Sewing machine neck, needle, flywheel and physically supported treadle.
start('sewing-station','Threadline sewing station','A treadle sewing machine with a resting needle and retained thread spools.',22,2,34,'oxblood')
tabletop(1.10,.64,.79,wood)
box('Sewing machine bed',(0,.863,0),(.72,.075,.36),colors['oxblood'],.027)
box('Sewing machine pillar',(.23,1.08,0),(.15,.39,.24),colors['oxblood'],.05)
box('Sewing machine arm',(-.03,1.245,0),(.62,.11,.20),colors['oxblood'],.046)
box('Needle head',(-.29,1.145,0),(.12,.27,.17),colors['oxblood'],.027)
tube('Needle bar',(-.29,.92,.04),(-.29,1.06,.04),.015,alloy,12)
box('Presser foot',(-.29,.913,.07),(.06,.015,.09),alloy,.005)
tube('Machine handwheel axle',(.30,1.15,0),(.43,1.15,0),.025,alloy,16)
ring('Machine handwheel rim',(.43,1.15,0),.115,.017,alloy,'x')
for a in [0,math.pi/2]:beam('Machine handwheel spoke',(.43,1.15-.103*math.cos(a),-.103*math.sin(a)),(.43,1.15+.103*math.cos(a),.103*math.sin(a)),.018,alloy)
for x in [-.02,.15]:tube('Thread spool pin',(x,1.28,0),(x,1.43,0),.012,alloy,12);tube('Cotton thread spool',(x,1.29,0),(x,1.40,0),.043,ivory,24)
box('Treadle pedal',(0,.16,.02),(.46,.035,.31),steel,.009,True)
for x in [-.28,.28]:
    box('Treadle stand runner',(x,.023,0),(.045,.046,.36),steel,.009,True)
    beam('Treadle pivot support',(x,.035,.13),(x,.18,.02),.027,alloy)
tube('Treadle crank shaft',(-.28,.20,0),(.45,.20,0),.018,alloy,16)
ring('Treadle drive pulley',(.45,.20,0),.08,.014,alloy,'x')
for a in [0,math.pi/2]:beam('Treadle pulley spoke',(.45,.20-.072*math.cos(a),-.072*math.sin(a)),(.45,.20+.072*math.cos(a),.072*math.sin(a)),.014,alloy)
hose('Sewing drive belt',[(.45,1.15,-.115),(.45,1.265,0),(.45,1.15,.115),(.45,.20,.08),(.45,.12,0),(.45,.20,-.08),(.45,1.15,-.115)],.007,rubber)
collider((0,1.12,0),(.80,.49,.39))
plate('THREADLINE / 08',(0,.65,.293),.55)

# 11 / Timber console houses a turntable, tonearm and vertically stored records.
start('record-console','Evening Signal record console','A silent record player console with a parked tonearm and sleeve collection.',21,2,28,'umber')
legs(.99,.47,.28,wood)
box('Record console lower',(0,.47,0),(1.12,.43,.62),colors['umber'],.035,True)
box('Turntable deck',(0,.72,0),(1.15,.09,.64),wood,.022,True)
turntable((-.23,.79,0),.215,alloy)
tube('Vinyl record',(-.23,.815,0),(-.23,.823,0),.204,rubber,48)
tube('Record paper label',(-.23,.824,0),(-.23,.827,0),.062,soft['umber'],32)
for r in [.11,.15,.19]:ring('Pressed record groove',(-.23,.825,0),r,.0010,steel)
turntable((.34,.792,-.14),.055,alloy)
hose('Tonearm with supported cartridge',[(.34,.81,-.14),(.34,.90,-.14),(.10,.90,.12),(.05,.87,.15)],.015,alloy)
box('Phono cartridge',(.05,.863,.15),(.07,.035,.05),colors['umber'],.007)
for x in [-.44,-.36,-.28,-.20,-.12,-.04,.04]:box('Console speaker louvre',(x,.47,.323),(.014,.27,.025),wood,.004)
box('Sleeve storage recess',(.32,.46,.321),(.38,.28,.024),rubber,.01)
for x in [.19,.25,.31,.37,.43]:book((x,.325,.31),.036,.26,.04,soft['umber'])

# 12 / Retro typewriter with a real carriage, platen, return lever and key rows.
start('typewriter-desk','Courier typewriter desk','A writing desk with a mechanical typewriter and an unfinished field letter.',19,1,24,'denim')
tabletop(1.12,.70,.79,soft['denim'])
box('Typewriter base',(0,.88,.01),(.61,.105,.42),colors['denim'],.035,True)
box('Carriage mounting riser',(0,.951,-.10),(.54,.045,.16),colors['denim'],.009)
box('Typewriter carriage',(0,1.05,-.10),(.66,.16,.16),colors['denim'],.028,True)
tube('Rubber platen',(-.25,1.12,-.08),(.25,1.12,-.08),.034,rubber,24)
for x in [-.33,.33]:tube('Platen advance wheel',(x-.025,1.12,-.08),(x+.025,1.12,-.08),.057,alloy,24)
box('Letter paper',(0,1.235,-.095),(.33,.22,.007),ivory,.002)
for y in [1.18,1.21,1.24,1.27]:box('Typed correspondence',(0,y,-.088),(.24,.004,.003),steel,.001)
for row in range(3):
    for col in range(9):
        x=(col-4)*.054;z=.08+row*.066;y=.954-row*.008
        tube('Round typewriter key',(x,.931,z),(x,y,z),.021,rubber,12)
box('Typewriter space bar',(0,.945,.27),(.36,.035,.025),alloy,.007)
for x in [-.13,.13]:box('Space bar connected linkage',(x,.936,.23),(.024,.02,.095),steel,.004)
hose('Carriage return lever',[(-.27,1.11,-.11),(-.38,1.15,-.11),(-.40,1.15,.12)],.012,alloy)
plate('COURIER / LETTERS',(0,.65,.310),.60)

# 13 / Three intentionally stopped clocks, a stout stem and engraved city cards.
start('clock-rack','Three Roads clock standard','A freestanding display of three stopped route clocks.',15,2,17,'heather')
box('Clock standard foot',(0,.055,0),(.67,.11,.49),steel,.03,True)
box('Clock standard pillar',(0,.85,-.035),(.11,1.54,.11),colors['heather'],.018,True)
for i,(x,y) in enumerate([(-.31,1.57),(.31,1.57),(0,1.99)]):
    beam('Clock fork support',(0,1.39,-.04),(x,y,-.04),.055,alloy)
    tube('Clock enclosure',(x,y,-.10),(x,y,.06),.255,colors['heather'],48)
    tube('Clock dial',(x,y,.068),(x,y,.075),.225,ivory,48)
    for j in range(12):
        a=j*math.tau/12;tube('Clock hour marker',(x+.182*math.sin(a),y+.182*math.cos(a),.082),(x+.206*math.sin(a),y+.206*math.cos(a),.082),.005,steel,8)
    tube('Clock hour hand',(x,y,.086),(x+.075,y+.085,.086),.007,steel,8)
    tube('Clock minute hand',(x,y,.089),(x-.135,y+.066,.089),.005,colors['heather'],8)
    tube('Clock central pin',(x,y,.078),(x,y,.096),.015,alloy,16)
    collider((x,y,-.015),(.51,.51,.18))
plate('THREE ROADS',(0,.42,.028),.30)

# 14 / A handmade tile mural with a coherent geometric route motif.
start('tile-mural','Roseway ceramic route mural','A standing ceramic mural made from raised, individually framed route tiles.',16,0,23,'rose')
for x in [-.51,.51]:box('Mural spread foot',(x,.045,0),(.16,.09,.50),steel,.02,True);box('Mural support post',(x,.86,0),(.055,1.62,.055),alloy,.01,True)
box('Mural framed backing',(0,1.20,0),(1.21,.99,.10),colors['rose'],.03,True)
for row in range(4):
    for col in range(5):
        x=(col-2)*.22;y=.88+row*.21
        box('Hand-set ceramic tile',(x,y,.061),(.20,.19,.024),soft['rose'] if (row+col)%3 else ivory,.012)
        if col==(row+1)%5 or col==row:box('Raised route tile mark',(x,y,.078),(.11,.075,.013),colors['rose'],.014)
plate('ROSEWAY / KEEP GOING',(0,.58,.014),.67)
box('Mural nameplate crossbar',(0,.58,-.01),(1.06,.07,.045),alloy,.01)

# 15 / A seated observation rig with paired lenses and supported optical bridge.
start('observation-seat','Farline observation seat','A fixed binocular display rig with its own padded operator perch.',23,2,33,'petrol')
box('Observation skid',(0,.055,0),(1.00,.11,1.18),steel,.023,True)
box('Seat pedestal',(0,.31,-.28),(.20,.43,.20),colors['petrol'],.025,True)
box('Observation seat',(0,.55,-.28),(.64,.13,.51),soft['petrol'],.05,True)
box('Seat back frame',(0,.77,-.50),(.61,.46,.10),colors['petrol'],.038,True)
box('Observation back pad',(0,.80,-.434),(.53,.34,.042),soft['petrol'],.021)
tube('Optical support mast',(0,.11,.31),(0,1.20,.31),.070,alloy,28)
collider((0,.64,.31),(.15,1.08,.15))
turntable((0,1.20,.31),.15,colors['petrol'])
box('Optical trunnion support',(0,1.27,.28),(.10,.12,.12),alloy,.012,True)
box('Optical bridge',(0,1.33,.26),(.44,.09,.16),alloy,.018,True)
for x in [-.15,.15]:
    tube('Binocular telescope',(x,1.40,.03),(x,1.40,.57),.095,colors['petrol'],32)
    for z in [.025,.57]:tube('Optical lens bezel',(x,1.40,z-.012),(x,1.40,z+.012),.108,alloy,28)
    tube('Dark objective lens',(x,1.40,.586),(x,1.40,.591),.085,rubber,32)
    tube('Operator eyecup',(x,1.40,-.02),(x,1.40,.02),.067,rubber,24)
    beam('Binocular cradle cheek',(x,1.29,.26),(x,1.40,.26),.065,alloy)
collider((0,1.40,.28),(.53,.22,.65))

# 16 / Complete, recognizable 32-piece chess display on a locking pedestal.
start('chess-pedestal','Long Crossing chess pedestal','A complete retained chess set on a braced travelling-game pedestal.',17,1,19,'plum')
box('Chess pedestal base',(0,.065,0),(.65,.13,.65),steel,.027,True)
box('Chess pedestal column',(0,.43,0),(.19,.66,.19),colors['plum'],.024,True)
box('Chess board frame',(0,.80,0),(.97,.09,.97),colors['plum'],.026,True)
for i in range(8):
    for j in range(8):box('Inset chess square',((i-3.5)*.105,.852,(j-3.5)*.105),(.104,.010,.104),ivory if (i+j)%2 else soft['plum'],.002)
for side in [-1,1]:
    m=steel if side==-1 else ivory
    for row in [2.5,3.5]:
        for i in range(8):
            x=(i-3.5)*.105;z=side*row*.105
            h=.085 if row==2.5 else [.12,.13,.15,.17,.19,.15,.13,.12][i]
            lathe('Retained chess piece',(x,.86,z),[(0,0),(0,.034),(.012,.038),(.024,.028),(h-.026,.016),(h-.018,.024),(h,.018),(h,0)],m,12)
            if row==3.5 and i in [0,7]:
                for dx,dz in [(-.018,-.018),(.018,-.018),(-.018,.018),(.018,.018)]:box('Rook crenellation',(x+dx,.86+h+.007,z+dz),(.017,.027,.017),m,.002)
            elif row==3.5 and i in [1,6]:
                beam('Knight angled neck',(x,.86+h-.016,z),(x,.86+h+.044,z-side*.015),.032,m)
                box('Knight muzzle',(x,.86+h+.042,z-side*.031),(.032,.027,.055),m,.009)
            elif row==3.5 and i in [2,5]:
                lathe('Bishop pointed mitre',(x,.86+h-.01,z),[(0,0),(0,.022),(.030,.017),(.052,0)],m,12)
            elif row==3.5 and i==3:
                for j in range(5):
                    a=j*math.tau/5;tube('Queen crown point',(x+.018*math.cos(a),.86+h-.008,z+.018*math.sin(a)),(x+.021*math.cos(a),.86+h+.023,z+.021*math.sin(a)),.004,m,8)
            if row==3.5 and i==4:
                box('King cross vertical',(x,.86+h+.016,z),(.012,.043,.012),m,.003)
                box('King cross arms',(x,.86+h+.020,z),(.036,.009,.012),m,.002)

# 17 / A compact triangular rack carrying six distinct plate dumbbells.
start('exercise-rack','Loadline exercise rack','A compact stand of captive exercise weights and wrapped grips.',16,0,43,'clay')
for x in [-.47,.47]:
    box('Weight rack foot',(x,.035,0),(.13,.07,.59),rubber,.015,True)
    beam('Weight rack front leg',(x,.07,.24),(x,1.16,-.12),.055,colors['clay'])
    beam('Weight rack rear leg',(x,.07,-.24),(x,1.16,-.12),.055,colors['clay'])
for y,z in [(.31,.15),(.66,.025),(1.01,-.10)]:
    box('Weight rack shelf',(0,y,z),(1.06,.055,.22),colors['clay'],.013,True)
    for x in [-.26,.26]:
        tube('Knurled dumbbell grip',(x-.10,y+.12,z),(x+.10,y+.12,z),.025,rubber,16)
        for dx in [-.13,.13]:tube('Round retained weight',(x+dx-.026,y+.12,z),(x+dx+.026,y+.12,z),.099 if y<.7 else .084,alloy,24)
        collider((x,y+.11,z),(.35,.22,.22))
plate('LOADLINE / DAILY',(0,.20,.27),.57)
box('Rack lower nameplate crossmember',(0,.20,.23),(1.02,.075,.08),colors['clay'],.012,True)

# 18 / An elevated boot-care stool with wooden last, brush and mud scraper.
start('boot-care-stand','Solemate boot-care stand','A small care stand with a wooden boot last, brush and tread scraper.',11,0,13,'olive')
legs(.58,.40,.56,colors['olive'])
box('Boot-care worktop',(0,.58,0),(.79,.08,.57),wood,.025,True)
box('Raised boot rest',(-.17,.71,.03),(.22,.19,.36),soft['olive'],.034,True)
verts=[];faces=[];sections=[(-.085,.038,.96),(-.035,.068,.985),(.07,.076,.916),(.18,.066,.87),(.235,.022,.835)]
for z,rx,top in sections:
    for i in range(12):
        a=i*math.tau/12;verts.append(xyz((-.17+rx*math.cos(a),(.805+top)/2+(top-.805)/2*math.sin(a),z)))
for j in range(len(sections)-1):
    for i in range(12):faces.append((j*12+i,j*12+(i+1)%12,(j+1)*12+(i+1)%12,(j+1)*12+i))
faces.extend([tuple(reversed(range(12))),tuple(range(48,60))])
mesh=bpy.data.meshes.new('Sculpted boot last');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Sculpted wooden foot last',mesh);bpy.context.collection.objects.link(o);finish(o,o.name,wood)
box('Brush wooden back',(.23,.642,.04),(.18,.045,.29),wood,.013)
for i in range(6):
    for j in range(8):box('Dense brush tuft',(.165+i*.026,.682,-.055+j*.027),(.019,.065,.019),rubber,.004)
for z in [-.16,-.08,0,.08,.16]:box('Lower sole scraper',(0,.15,z),(.49,.03,.025),alloy,.006)
for x in [-.24,.24]:box('Scraper mounting bar',(x,.135,0),(.036,.045,.40),steel,.008,True)

# 19 / A preserved botanical display under a bell jar, all stems rooted in soil.
start('botanical-belljar','Still Orchard botanical bell jar','A preserved botanical miniature under a smoke-glass bell jar.',18,1,17,'verdigris')
box('Bell jar pedestal foot',(0,.065,0),(.67,.13,.59),steel,.025,True)
box('Bell jar column',(0,.56,0),(.25,.88,.25),colors['verdigris'],.026,True)
tube('Bell jar timber base',(0,.98,0),(0,1.055,0),.32,wood,48)
tube('Specimen soil',(0,1.055,0),(0,1.077,0),.235,rubber,32)
for stem,x in enumerate([-.10,.08]):
    hose('Preserved botanical stem',[(x,1.07,0),(x+.015,1.27,.0),(x-.01,1.48,.015)],.010,colors['verdigris'])
    for j in range(5):
        y=1.14+j*.065;side=-1 if j%2 else 1
        verts=[xyz((x,y,0)),xyz((x+side*.11,y+.015,.04)),xyz((x+side*.17,y+.06,.01)),xyz((x+side*.08,y+.061,-.025))]
        mesh=bpy.data.meshes.new('Preserved leaf');mesh.from_pydata(verts,[],[(0,1,2,3)]);mesh.update();o=bpy.data.objects.new('Preserved leaf',mesh);bpy.context.collection.objects.link(o);finish(o,o.name,soft['verdigris'])
        mod=o.modifiers.new('Leaf thickness','SOLIDIFY');mod.thickness=.004;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
lathe('Smoke-glass specimen bell',(0,1.047,0),[(0,.29),(.40,.29),(.52,.22),(.58,.08),(.59,0),(.578,.08),(.51,.21),(.398,.28),(0,.28),(0,.29)],glass,40)
lathe('Bell jar lifting knob',(0,1.637,0),[(0,0),(0,.034),(.035,.044),(.059,.025),(.06,0)],colors['verdigris'],24)
collider((0,1.36,0),(.59,.61,.59))
plate('STILL ORCHARD',(0,.68,.139),.32)

# 20 / Eight rolled charts in sockets on a purpose-built angled rack.
start('map-roll-rack','Survey Folio roller rack','A rack of banded survey scrolls with capped ends and index cards.',16,0,21,'ochre')
for x in [-.40,.40]:box('Map rack floor runner',(x,.035,0),(.13,.07,.62),steel,.018,True);box('Map rack upright',(x,.86,-.12),(.055,1.65,.055),colors['ochre'],.01,True)
for y in [.28,.67,1.06,1.45]:
    box('Scroll support shelf',(0,y,0),(.86,.045,.50),colors['ochre'],.013,True)
    for x in [-.20,.20]:
        tube('Banded rolled survey chart',(x,y+.095,-.18),(x,y+.095,.23),.080,ivory,28)
        for z in [-.14,.19]:ring('Chart canvas band',(x,y+.095,z),.083,.012,soft['ochre'],'z')
        tube('Chart labelled end cap',(x,y+.095,.23),(x,y+.095,.24),.077,wood,24)
        label('%02d'%(int(y/.38)*2+(1 if x<0 else 2)),(x,y+.095,.248),.044)
plate('SURVEY FOLIO',(0,1.62,.015),.53)
box('Survey index mounting rail',(0,1.62,-.035),(.85,.09,.095),colors['ochre'],.012)

# 21 / A single-pole canvas awning with four visible load-bearing diagonal ribs.
start('shade-awning','Dusk Rose shade awning','A small freestanding shade canopy with sewn panels and a braced mast.',20,1,25,'rose')
box('Canopy weighted foot',(0,.06,0),(.65,.12,.65),steel,.03,True)
tube('Awning mast',(0,.12,0),(0,2.43,0),.045,colors['rose'],28)
collider((0,1.23,0),(.10,2.28,.10))
for x in [-.82,.82]:
    for z in [-.82,.82]:beam('Canopy diagonal spar',(0,2.05,0),(x,2.34,z),.027,alloy)
box('Bound canvas canopy',(0,2.37,0),(1.78,.045,1.78),soft['rose'],.022,True)
for x in [-.87,.87]:box('Canopy edge binding',(x,2.374,0),(.035,.055,1.79),colors['rose'],.014)
for z in [-.87,.87]:box('Canopy edge binding',(0,2.374,z),(1.79,.055,.035),colors['rose'],.014)
for x in [-.43,.43]:box('Sewn canopy panel joint',(x,2.397,0),(.010,.006,1.72),ivory,.002)
tube('Mast crown cap',(0,2.394,0),(0,2.45,0),.065,alloy,24)

# 22 / A vintage bagatelle table with ball guides, pegs and a mechanical plunger.
start('bagatelle-table','Railrunner bagatelle table','A dormant mechanical tabletop game with captive balls and numbered targets.',22,2,28,'celadon')
tabletop(.90,1.18,.78,colors['celadon'])
box('Bagatelle recessed playfield',(0,.828,0),(.76,.023,1.03),soft['celadon'],.02)
for x in [-.405,.405]:box('Game perimeter rail',(x,.866,0),(.045,.10,1.15),wood,.014)
for z in [-.55,.55]:box('Game end rail',(0,.866,z),(.85,.10,.045),wood,.014)
for x,z in [(-.23,-.31),(0,-.31),(.22,-.31),(-.13,-.03),(.14,-.03),(-.23,.24),(0,.24),(.23,.24)]:
    ring('Bagatelle scoring well',(x,.848,z),.073,.009,alloy)
    for dx,dz in [(-.07,0),(.07,0),(0,-.07)]:tube('Retained scoring pin',(x+dx,.84,z+dz),(x+dx,.905,z+dz),.010,alloy,8)
for x in [-.24,0,.24]:label('10' if x else '50',(x,.841,-.31),.033,steel,True)
for x,z in [(-.13,-.03),(.23,.24)]:lathe('Captive steel game ball',(x,.855,z),[(0,0),(.008,.021),(.028,.026),(.044,.016),(.05,0)],alloy,16)
tube('Plunger guide',(.30,.865,.35),(.30,.865,.64),.024,alloy,20)
tube('Plunger grip',(.30,.865,.63),(.30,.865,.70),.040,colors['celadon'],20)
plate('RAILRUNNER / 193',(0,.64,.55),.58)

# 23 / A hand-cranked laundry drum, guarded drive and small wringer cradle.
start('laundry-drum','Spindrift laundry drum','A retired hand-cranked wash drum with a hinged lid and wringer rolls.',21,1,33,'stone')
legs(.66,.60,.42,colors['stone'])
box('Laundry stand support platform',(0,.307,0),(.77,.045,.64),steel,.015,True)
for x in [-.33,.33]:
    for z in [-.30,.30]:beam('Drum retaining saddle',(x,.39,z),(x*.87,.51,z*.87),.038,alloy)
lathe('Pressed laundry drum',(0,.32,0),[(0,0),(0,.35),(.07,.40),(.66,.40),(.70,.37),(.70,0)],soft['stone'],48)
collider((0,.67,0),(.80,.70,.80))
ring('Drum lid seal',(0,1.018,0),.374,.016,rubber)
tube('Drum top lid',(0,1.018,0),(0,1.065,0),.376,colors['stone'],48)
handle((0,1.064,.03),.24,.044)
for x in [-.27,.27]:box('Wringer bearing cheek',(x,1.15,-.20),(.08,.24,.20),colors['stone'],.024,True)
for y in [1.16,1.27]:tube('Retired wringer roll',(-.25,y,-.20),(.25,y,-.20),.045,rubber,28)
tube('Wringer handle axle',(.25,1.27,-.20),(.40,1.27,-.20),.019,alloy,16)
beam('Wringer hand crank',(.40,1.27,-.20),(.40,1.36,-.06),.025,alloy)
tube('Wringer rotating grip',(.39,1.36,-.06),(.51,1.36,-.06),.030,colors['stone'],20)
plate('SPINDRIFT / HAND DRIVE',(0,.73,.404),.52)

# 24 / A floor fan with proper blades, hub, cage supports and a rear motor.
start('rotary-fan','Crosswind rotary fan','A stopped floor fan with a bolted motor, curved blades and wire guard.',18,2,19,'heather')
box('Floor fan weighted foot',(0,.065,0),(.66,.13,.55),steel,.038,True)
box('Fan telescopic stem',(0,.62,-.03),(.070,1.00,.070),colors['heather'],.013,True)
box('Fan yoke bridge',(0,1.06,0),(.67,.045,.08),alloy,.008)
for x in [-.33,.33]:box('Fan yoke cheek',(x,1.26,0),(.055,.42,.075),colors['heather'],.011,True)
tube('Fan rear motor',(0,1.37,-.22),(0,1.37,.08),.12,colors['heather'],32)
for z in [-.03,.12]:
    ring('Rolled fan guard rim',(0,1.37,z),.35,.018,colors['heather'],'z')
    for r in [.13,.23]:ring('Fan concentric guard',(0,1.37,z),r,.009,alloy,'z')
    for i in range(8):
        a=i*math.tau/8;tube('Fan cage radial spoke',(0,1.37,z),(.35*math.cos(a),1.37+.35*math.sin(a),z),.006,alloy,8)
for i in range(4):
    a=i*math.tau/4;tube('Fan guard perimeter bridge',(.35*math.cos(a),1.37+.35*math.sin(a),-.03),(.35*math.cos(a),1.37+.35*math.sin(a),.12),.012,alloy,12)
    a=i*math.tau/4;verts=[]
    for x,y in [(.06,-.025),(.27,-.10),(.30,.03),(.16,.11)]:verts.append(xyz((x*math.cos(a)-y*math.sin(a),1.37+x*math.sin(a)+y*math.cos(a),.048)))
    mesh=bpy.data.meshes.new('Swept fan blade');mesh.from_pydata(verts,[],[(0,1,2,3)]);mesh.update();o=bpy.data.objects.new('Swept fan blade',mesh);bpy.context.collection.objects.link(o);finish(o,o.name,soft['heather'])
    mod=o.modifiers.new('Fan blade thickness','SOLIDIFY');mod.thickness=.012;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
tube('Cast fan hub',(0,1.37,-.01),(0,1.37,.14),.073,colors['heather'],28)
collider((0,1.37,-.015),(.74,.74,.46))

# 25 / Cast arrival bell, hollow mouth, connected clapper and a heavy armature.
start('arrival-bell','Homeward arrival bell','A silent cast bell hung from a riveted freestanding armature.',17,1,29,'oxblood')
box('Bell stand ballast foot',(0,.06,0),(.70,.12,.62),steel,.035,True)
for x in [-.28,.28]:box('Bell stand post',(x,.96,-.04),(.065,1.81,.065),colors['oxblood'],.014,True)
box('Bell lintel',(0,1.84,-.04),(.71,.075,.10),colors['oxblood'],.018,True)
tube('Bell suspension hanger',(0,1.48,-.04),(0,1.81,-.04),.035,alloy,20)
lathe('Hollow cast arrival bell',(0,1.05,-.04),[(0,.28),(.03,.30),(.07,.27),(.17,.20),(.35,.14),(.41,.10),(.43,.045),(.42,0),(.38,.07),(.32,.105),(.14,.17),(.045,.245),(0,.255),(0,.28)],alloy,40)
tube('Bell clapper rod',(0,1.08,-.04),(0,1.43,-.04),.018,steel,16)
lathe('Clapper striking weight',(0,1.035,-.04),[(0,0),(.02,.045),(.07,.05),(.10,.02),(.10,0)],steel,24)
hose('Bell pull cord',[(0,1.04,-.04),(.025,.81,.0),(.014,.53,.03)],.009,wood)
lathe('Pull cord grip',(.014,.44,.03),[(0,0),(0,.035),(.10,.035),(.12,0)],wood,20)
collider((0,1.29,-.04),(.61,.53,.61))
plate('HOMEWARD / ARRIVAL',(0,.40,.005),.49)
box('Arrival plate mounting rail',(0,.40,-.022),(.62,.08,.05),colors['oxblood'],.012)

exec(compile((Path(__file__).parent/'refine_pass.py').read_text(),'<first all-model refinement>','exec'))

sys.path.insert(0,str(Path(__file__).parent))
from fine_comb import apply as apply_fine_comb
apply_fine_comb(roots,manifest)

# Authoring master keeps every knob, sheet, bracket and text part editable.
bpy.context.view_layer.update()
assert len(roots)==25
for r in roots:
    r['catalog_name']=manifest[r.name]['name'];r['collision_contract']=json.dumps(manifest[r.name]['colliders'])
    for o in r.children_recursive:
        if o.type!='MESH':continue
        if not o.data.uv_layers:
            # All generated meshes receive UVs; box/cylinder primitives already have them.
            bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
            bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.01);bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadLivingArchive.blend'))

# Join siblings by shared material: maximum eight surfaces per whole furnishing.
report={}
for r in roots:
    for mat in palette:
        parts=[o for o in r.children if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==mat]
        if len(parts)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in parts:o.select_set(True)
        bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();bpy.context.object.name=r.name+'_'+mat.name
    for o in r.children_recursive:
        if o.type=='MESH':
            mod=o.modifiers.new('Runtime triangles','TRIANGULATE');bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.update()
    points=[o.matrix_world@Vector(v) for o in r.children_recursive if o.type=='MESH' for v in o.bound_box]
    lo=[min(p[i] for p in points) for i in range(3)];hi=[max(p[i] for p in points) for i in range(3)]
    gamelo=[lo[0],lo[2],-hi[1]];gamehi=[hi[0],hi[2],-lo[1]]
    report[r.name]={'min':gamelo,'max':gamehi,'size':[gamehi[i]-gamelo[i] for i in range(3)],
        'triangles':sum(len(o.data.polygons) for o in r.children_recursive if o.type=='MESH'),
        'material_batches':sum(o.type=='MESH' for o in r.children_recursive),'colliders':len(manifest[r.name]['colliders'])}
    assert abs(gamelo[1])<.006,(r.name,'ground',gamelo)
    assert gamelo[0]>=-1 and gamehi[0]<=1 and gamelo[2]>=-1 and gamehi[2]<=1,(r.name,'footprint',gamelo,gamehi)
    assert report[r.name]['material_batches']<=8
    assert manifest[r.name]['colliders']
    manifest[r.name]['bounds']=report[r.name]

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(ART/'art200-machine.glb'),export_format='GLB',export_animations=False,export_tangents=False)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(OUT/'geometry-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')

# Generated catalog data is independent of the game boot sequence. Root owns hooks.
definitions={k:{'id':k,'name':v['name'],'description':v['description'],'category':'decor','anchor':'cell',
    'cost':v['cost'],'weight':v['weight'],'maxHealth':100,'armor':0,'boundsRoom':False,'blocksNavigation':False,'rotatable':True}
    for k,v in manifest.items()}
data_path=ROOT/'godot/data/art200-machine.json'
data_path.write_text(json.dumps({'pieces':definitions,'colliders':{k:v['colliders'] for k,v in manifest.items()}},indent=2),encoding='utf-8')
print('ART200_MACHINE_COMPLETE',len(roots),sum(v['triangles'] for v in report.values()),flush=True)

render_ids=next((arg.split('=',1)[1].split(',') for arg in sys.argv if arg.startswith('--render-only=')),None)
if '--render' in sys.argv or render_ids:
    # Render each assembly separately with a matching stage, then combine with PIL externally.
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
    scene.cycles.use_denoising=True;scene.render.resolution_x=700;scene.render.resolution_y=740;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.world=bpy.data.worlds.new('Nomad review studio');scene.world.use_nodes=True
    scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.16,.16,.16,1)
    scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.7
    scene.view_settings.view_transform='AgX';scene.render.film_transparent=False
    floor=bpy.data.materials.new('Review warm grey');floor.diffuse_color=(.11,.125,.13,1);floor.use_nodes=True
    floor.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.11,.125,.13,1)
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.002));stage=bpy.context.object;stage.data.materials.append(floor)
    for pos,power,size in [((3,-4,6),900,5),((-3,-1,3),500,4),((1,4,5),900,3)]:
        bpy.ops.object.light_add(type='AREA',location=pos);lamp=bpy.context.object;lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=size
        lamp.rotation_euler=(Vector((0,0,.7))-lamp.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera;camera.data.type='ORTHO'
    for r in roots:
        if render_ids and r.name not in render_ids:continue
        for other in roots:
            for o in other.children_recursive:o.hide_render=other!=r
        bounds=report[r.name];height=bounds['max'][1];target=Vector((0,0,height*.49))
        camera.location=target+Vector((3.5,-5.8,3.4));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.ortho_scale=max(height*1.31,bounds['size'][0]*1.40,bounds['size'][2]*1.28,1.05)
        scene.render.filepath=str(OUT/(r.name+'.png'));bpy.ops.render.render(write_still=True)
    for r in roots:
        for o in r.children_recursive:o.hide_render=False
    print('ART200_MACHINE_RENDERS_COMPLETE',flush=True)
