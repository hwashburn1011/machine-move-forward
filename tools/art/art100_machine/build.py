"""Twenty-five complete Nomad furnishings, authored in metres, +Y up in game.

Blender 5.1: blender --background --threads 4 --python tools/art/art100_machine/build.py
An editable, unjoined master is saved before material batching. No live MCP scene
is modified. A --render argument also makes five individually framed review sheets.
"""
import bpy, math, json, sys, struct, zlib
from pathlib import Path
from mathutils import Vector
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'assets/art100/machine'
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
    colors[family['id']]=material('N100_'+family['id'],family['paint'],seed=200+i)
    soft[family['id']]=material('N100_'+family['id']+'_washed',family['secondary'],metal=.06,rough=.82,seed=240+i)
    palette.extend([colors[family['id']],soft[family['id']]])
steel=material('N100_steel',shared['substrates']['steel'],.70,.49,280)
alloy=material('N100_machined_alloy',shared['substrates']['aged_aluminium'],.84,.37,281)
rubber=material('N100_rubber',shared['substrates']['rubber'],0,.89,282)
ivory=material('N100_age_ivory','#BAB5A5',.02,.70,283)
wood=material('N100_oiled_timber','#655548',.0,.68,284)
glass=material('N100_smoked_glass','#83938A',.04,.20,285)
glass.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.22
glass.surface_render_method='DITHERED'
ochre=colors['ochre'];green=colors['celadon'];cloth=soft['denim'];amber=colors['clay']
palette.extend([steel,alloy,rubber,ivory,wood,glass])


fabrics={f["id"]:material("N100_fabric_"+f["id"],f["paint"],0,.88,320+i) for i,f in enumerate(shared["families"])}
palette.extend(fabrics.values())

def start(id, title, description, scrap, components=0, weight=12):
    global current
    id='nomad-'+id; r=bpy.data.objects.new(id,None); bpy.context.collection.objects.link(r)
    r['asset_type']='complete placeable cosmetic assembly';r['units']='metres';r['ground_y']=0.0
    roots.append(r);current=r
    manifest[id]={'name':title,'description':description+' Cosmetic; provides no storage, power, healing or resource production.',
        'cost':{'scrap':scrap,**({'components':components} if components else {})},'weight':weight,'colliders':[]}
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
    return o

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

# 01 / Machinist storage, seven different-height drawers and full kick plinth.
start('tool-drawers','Rivetline tool drawers','A fitted machinist chest with seven enamel drawers and replaceable corner guards.',18,1,31)
cabinet(1.13,1.02,.65)
for y,h in [(.23,.15),(.40,.15),(.57,.15),(.72,.11),(.85,.11)]:drawer((0,y,.334),1.02,h)
for x in [-.263,.263]:drawer((x,.96,.334),.50,.08)
for x in [-.58,.58]:box('Chest corner guard',(x,.57,0),(.055,.90,.69),alloy,.015)
box('Dense worktop mat',(0,1.06,0),(1.04,.026,.55),rubber,.01)
plate('RIVETLINE / 07',(0,.14,.344),.42)

# 02 / Caster cart, two trays, pushbar, guarded bottles and actual empty volume.
start('service-cart','Portside service cart','A two-shelf rolling cart with captive spares and a wrapped pushbar.',16,0,19)
for x in [-.42,.42]:
    for z in [-.27,.27]:wheel((x,.085,z));box('Cart corner upright',(x,.53,z),(.055,.80,.055),alloy,.01,True)
for y in [.25,.88]:
    box('Pressed tray',(0,y,0),(.94,.055,.64),ochre,.017,True)
    for x in [-.46,.46]:box('Tray edge flange',(x,y+.055,0),(.035,.10,.64),ochre,.01)
    for z in [-.31,.31]:box('Tray end flange',(0,y+.055,z),(.93,.10,.035),ochre,.01)
for x in [-.42,.42]:tube('Pushbar upright',(x,.87,-.28),(x,1.12,-.28),.022,alloy)
tube('Wrapped cart handle',(-.42,1.12,-.28),(.42,1.12,-.28),.034,rubber)
box('Contained cloth roll',(-.20,.34,0),(.41,.14,.39),cloth,.035)
for x in [.10,.28]:tube('Capped service bottle',(x,.91,0),(x,1.12,0),.067,green);tube('Bottle cap',(x,1.12,0),(x,1.145,0),.044,steel)
plate('PORTSIDE / 02',(0,.86,.344),.37)

# 03 / Human-sized padded chair, curved pipe frame, durable stitched cushions.
start('field-chair','Wayfarer field chair','A weathered canvas armchair on a welded steel frame.',12,0,12)
legs(.58,.53,.46)
box('Seat pan',(0,.43,0),(.72,.075,.69),steel,.025,True)
box('Quilted seat cushion',(0,.51,.015),(.68,.115,.63),cloth,.055,True)
box('Padded backrest',(0,.84,-.29),(.72,.60,.14),cloth,.06,True)
for x in [-.365,.365]:
    box('Arm support',(x,.60,.19),(.044,.34,.044),alloy,.01,True)
    box('Canvas covered arm',(x,.76,0),(.095,.09,.69),cloth,.035,True)
    box('Back frame upright',(x,.74,-.33),(.048,.75,.05),alloy,.009)
for x in [-.22,0,.22]:box('Double stitched back channel',(x,.84,-.213),(.005,.43,.005),ivory,.001)
for x in [-.25,.25]:box('Seat piping',(x,.575,.01),(.006,.006,.51),ivory,.001)
plate('NOMAD / HABITAT',(0,.435,.356),.43)

# 04 / 1.92m berth, mattress, headboard and folded blanket; standalone whole bed.
start('sleeping-berth','Surveyor sleeping berth','A compact bunk with a quilted mattress, field pillow and strapped blanket.',22,1,29)
legs(.75,1.72,.36)
box('Rolled berth perimeter',(0,.345,0),(.94,.15,1.93),steel,.035,True)
box('Segmented mattress',(0,.485,0),(.88,.18,1.86),ivory,.075,True)
box('Head end guard',(0,.54,-.94),(.96,.43,.075),ochre,.025,True)
box('Canvas field pillow',(0,.62,-.58),(.70,.13,.39),cloth,.055)
box('Folded blanket',(0,.61,.46),(.90,.10,.63),cloth,.04)
for z in [.25,.56]:box('Bound blanket stripe',(0,.665,z),(.85,.006,.025),ochre,.001)
for z in [-.30,-.04,.20]:box('Mattress stitched seam',(0,.58,z),(.82,.007,.006),alloy,.002)
for x in [-.43,.43]:tube('Berth perimeter rail',(x,.43,-.84),(x,.43,.85),.017,alloy)
plate('SURVEY BERTH / 01',(0,.35,.974),.56)

# 05 / Vintage transistor cabinet with big speaker, knobs and analog dial.
start('radio-cabinet','Longwave radio cabinet','A salvaged analog radio and twin speaker cabinet with an unlit tuning dial.',14,2,17)
cabinet(.66,.98,.43,green)
box('Radio instrument surround',(0,.86,.235),(.55,.19,.035),alloy,.015)
box('Inactive tuning window',(0,.89,.26),(.34,.06,.015),rubber,.008)
for i in range(11):box('Etched frequency tick',(-.15+i*.03,.89,.271),(.003,.022 if i%2 else .038,.005),ivory,.001)
for x in [-.22,.22]:tube('Knurled tuning knob',(x,.795,.25),(x,.795,.30),.039,rubber,20)
for y in [.39,.63]:
    tube('Speaker outer ring',(0,y,.223),(0,y,.25),.128,alloy,32)
    tube('Speaker dark diaphragm',(0,y,.252),(0,y,.266),.108,rubber,32)
    for x in [-.078,-.052,-.026,0,.026,.052,.078]:box('Speaker protective grille',(x,y,.274),(.008,.17,.015),steel,.003)
plate('LONGWAVE',(0,.17,.220),.41)
handle((0,1.018,0),.28,.055)

# 06 / Thick vise bench with clear space beneath a real worktop.
start('repair-trestle','Rivetline repair trestle','A compact workshop trestle with a forged vise and replaceable work mat.',20,2,37)
legs(1.10,.56,.90)
box('Workbench front apron',(0,.78,.30),(1.19,.15,.06),ochre,.012,True)
box('Workbench rear apron',(0,.78,-.30),(1.19,.15,.06),ochre,.012,True)
box('Oil-resistant worktop',(0,.94,0),(1.34,.11,.78),ivory,.025,True)
box('Replaceable work mat',(.26,1.005,0),(.57,.02,.51),rubber,.009)
box('Vise swivel shoe',(-.41,1.035,.12),(.31,.065,.31),steel,.018,True)
box('Vise screw housing',(-.41,1.12,.10),(.18,.14,.35),green,.026,True)
for z in [-.05,.21]:box('Forged vise jaw',(-.41,1.23,z),(.32,.10,.085),alloy,.008,True)
tube('Vise screw spindle',(-.41,1.12,.18),(-.41,1.12,.42),.023,alloy)
tube('Vise sliding handle',(-.51,1.12,.42),(-.28,1.12,.42),.014,alloy)
for x in [-.51,-.28]:tube('Handle captive stop',(x-.007,1.12,.42),(x+.007,1.12,.42),.024,steel)
plate('RIVETLINE / VISE',(0,.78,.337),.56)

# 07 / Many divided parts bins, not a plain cuboid shelf.
start('parts-organizer','Fastener library','A freestanding library of labelled parts bins and capped hardware samples.',14,0,20)
feet(.96,.42)
box('Organizer back',(0,.84,-.19),(.98,1.44,.06),steel,.015,True)
for x in [-.47,.47]:box('Organizer end panel',(x,.84,0),(.065,1.44,.42),ochre,.012,True)
for y in [.14,.49,.84,1.19,1.55]:box('Rack shelf',(0,y,0),(.95,.05,.43),alloy,.01,True)
for row in range(4):
    for column in range(3):
        x=(column-1)*.30;y=.16+row*.35
        box('Removable parts bin',(x,y+.12,.04),(.27,.23,.32),green if row%2 else ivory,.022)
        box('Inset bin mouth',(x,y+.225,.04),(.21,.014,.24),rubber,.006)
        box('Clip label',(x,y+.12,.208),(.16,.06,.008),steel,.002)
        label('%02d'% (row*3+column+1),(x,y+.12,.214),.035)
        if (row+column)%3==0:tube('Retained round stock',(x-.06,y+.21,.00),(x+.06,y+.21,.00),.044,alloy,12)

# 08 / Charging-shaped cabinet remains clearly decorative in game catalog.
start('charging-cabinet','Standby charging cabinet','A sealed display cabinet with parked connectors and inactive cell bays.',20,3,42)
cabinet(.88,1.72,.50,green)
box('Service door gasket',(0,.99,.26),(.75,1.24,.03),rubber,.018)
box('Sealed service door',(0,.99,.282),(.70,1.19,.03),green,.022)
for y in [.56,.92,1.28]:
    box('Recessed cell bay',(0,y,.303),(.48,.24,.02),steel,.012)
    for x in [-.14,0,.14]:box('Inset cell inspection pane',(x,y,.317),(.075,.13,.016),rubber,.009)
handle((.30,.99,.309),.10)
box('Charging cabinet vent surround',(0,1.57,.273),(.54,.23,.05),green,.01)
vents((0,1.57,.302),.45,3)
for x in [-.48,.48]:
    hose('Parked insulated connector',[(x,1.42,0),(x*.99,.91,.08),(x,1.15,.18)],.022)
    box('Docked connector grip',(x,1.19,.19),(.07,.20,.10),ochre,.018)
plate('STANDBY / CABINET',(0,.245,.268),.57)

# 09 / Expedition flight case with stacking ribs and captive latches.
start('expedition-trunk','Expedition flight trunk','A reinforced travel case with recessed grips, stack ribs and transport latches.',14,0,21)
box('Rubber skid base',(0,.04,0),(1.14,.08,.70),rubber,.025,True)
box('Pressed trunk lower',(0,.30,0),(1.16,.48,.73),green,.055,True)
box('Lid shadow seam',(0,.535,0),(1.18,.026,.75),rubber,.009)
box('Pressed trunk lid',(0,.62,0),(1.18,.15,.75),green,.045,True)
for x in [-.44,.44]:
    box('Stacking lid rib',(x,.71,0),(.10,.04,.70),alloy,.01)
    box('Corner shoe',(x,.15,0),(.11,.15,.78),alloy,.018)
    box('Captive latch body',(x,.515,.387),(.085,.18,.03),alloy,.012)
    box('Latch toggle',(x,.52,.41),(.04,.095,.025),steel,.009)
handle((0,.32,.365),.34,.065)
plate('EXPEDITION / 14',(0,.16,.372),.58)

# 10 / Seed archive vitrine with open protective cage and canister array.
start('archive-vitrine','Archive specimen vitrine','A guarded display of sealed sample tubes on a museum-style pedestal.',18,2,26)
box('Vitrine weighted base',(0,.075,0),(.75,.15,.64),steel,.03,True)
box('Pedestal waist',(0,.53,0),(.52,.83,.44),green,.022,True)
box('Specimen display tray',(0,.96,0),(.79,.08,.69),ivory,.025,True)
for x in [-.35,.35]:
    for z in [-.30,.30]:box('Protective cage corner',(x,1.22,z),(.035,.49,.035),alloy,.007,True)
box('Vitrine crown',(0,1.47,0),(.79,.07,.69),green,.025,True)
for x in [-.23,0,.23]:
    for z in [-.17,.17]:
        tube('Sealed amber specimen tube',(x,1.015,z),(x,1.34,z),.066,amber,24)
        for y in [1.035,1.33]:tube('Specimen tube clamp',(x,y-.025,z),(x,y+.025,z),.076,alloy,20)
        tube('Tube center paper band',(x,1.16,z),(x,1.23,z),.069,ivory,24)
plate('ARCHIVE / SPECIMENS',(0,.69,.231),.43)

# 11 / Chart table with non-emissive graphic route, compass and rolled map.
start('chart-desk','Forward chart desk','A field navigation desk with a printed route, compass and curled paper chart.',18,1,24)
legs(1.12,.62,.97)
box('Desk underslung drawer',(0,.84,-.18),(.68,.21,.37),steel,.02,True)
box('Chart desktop',(0,.99,0),(1.32,.09,.83),green,.023,True)
box('Laminated field map',(-.12,1.042,.03),(.85,.01,.62),ivory,.003)
for x in [-.46,-.28,-.1,.08,.26]:box('Printed map grid east',(x,1.049,.03),(.004,.003,.58),alloy,.001)
for z in [-.23,-.08,.07,.22]:box('Printed map grid north',(-.12,1.049,z),(.82,.003,.004),alloy,.001)
hose('Printed journey route',[(-.44,1.054,.21),(-.20,1.054,.05),(-.15,1.054,-.17),(.05,1.054,-.16),(.21,1.054,-.24)],.008,ochre)
for x,z in [(-.44,.21),(-.15,-.17),(.21,-.24)]:ring('Destination map marker',(x,1.055,z),.029,.006,steel)
tube('Rolled field chart',(-.57,1.10,-.30),(.28,1.10,-.30),.041,ivory)
tube('Desk compass body',(.47,1.04,.20),(.47,1.07,.20),.105,alloy,32)
tube('Desk compass face',(.47,1.072,.20),(.47,1.077,.20),.086,ivory,32)
beam('Compass needle',(.43,1.082,.25),(.51,1.082,.15),.018,ochre)
plate('FORWARD / CHARTS',(0,.88,.42),.60)

# 12 / Survey lamp tripod, yoke and broad lens; deliberately unpowered prop.
start('survey-floodlight','Survey tripod floodlight','A portable survey lamp with a folding tripod and parked cable.',15,2,16)
for a in [math.pi/2,math.pi*7/6,math.pi*11/6]:
    x=.46*math.cos(a);z=.46*math.sin(a)
    beam('Tripod lower leg',(0,.60,0),(x,.035,z),.05,alloy)
    box('Tripod foot',(x,.025,z),(.15,.05,.15),rubber,.013,True)
    # Thin leg box is split into short segments to preserve triangular openings.
    for t in [.18,.43,.68,.88]:collider((x*t,.60*(1-t)+.035*t,z*t),(.10,.16,.10))
tube('Telescopic lamp mast',(0,.21,0),(0,1.67,0),.042,alloy)
collider((0,1.0,0),(.10,1.42,.10))
for y in [.66,1.22]:tube('Mast locking collar',(0,y-.035,0),(0,y+.035,0),.058,steel)
box('Floodlight yoke crossbar',(0,1.55,0),(.59,.045,.06),steel,.009)
for x in [-.29,.29]:box('Floodlight yoke cheek',(x,1.78,0),(.045,.48,.07),steel,.01,True)
box('Weatherproof floodlight body',(0,1.83,0),(.51,.38,.18),ochre,.038,True)
box('Floodlight lens seal',(0,1.83,.102),(.46,.32,.035),rubber,.015)
box('Prismatic lens',(0,1.83,.123),(.42,.28,.014),ivory,.015)
for x in [-.14,-.07,0,.07,.14]:box('Lens fluting',(x,1.83,.134),(.013,.25,.008),alloy,.003)
for y in [1.70,1.95]:box('Lamp protection bar',(0,y,.151),(.45,.018,.02),steel,.005)
hose('Parked power lead',[(0,1.54,-.08),(.10,1.11,-.12),(.06,.52,-.10),(.18,.20,-.15)],.018)

# 13 / Tall articulated task lamp with a grounded desk pedestal.
start('machinist-lamp','Machinist task lamp','An articulated lamp on a narrow weighted stand, with its original enamel shade.',10,1,10)
box('Lamp weighted foot',(0,.055,0),(.42,.11,.42),steel,.045,True)
tube('Lamp stand column',(0,.11,0),(0,1.10,0),.035,alloy)
collider((0,.65,0),(.085,1.08,.085))
beam('Parallel arm left',(-.033,1.06,0),(-.033,1.43,-.18),.025,alloy)
beam('Parallel arm right',(.033,1.06,0),(.033,1.43,-.18),.025,alloy)
beam('Lamp cantilever',(0,1.43,-.18),(0,1.52,.16),.035,alloy)
for y,z in [(1.06,0),(1.43,-.18),(1.52,.16)]:tube('Adjustable arm knuckle',(-.065,y,z),(.065,y,z),.061,ochre,24)
box('Lamp shade',(0,1.48,.26),(.29,.19,.24),green,.065,True)
box('Shade porcelain diffuser',(0,1.388,.28),(.23,.013,.18),ivory,.025)
hose('Lamp arm cable',[(0,.95,-.04),(.04,1.20,-.05),(.04,1.47,-.21),(.04,1.55,.15)],.009)

# 14 / Freestanding coat rail with canvas jacket and small bag silhouette.
start('coat-rack','Survey coat rack','A freestanding coat rail with a patched canvas work jacket and sling satchel.',12,0,11)
for x in [-.38,.38]:
    box('Rack long foot',(x,.035,0),(.10,.07,.59),steel,.02,True)
    box('Rack vertical tube',(x,.91,0),(.045,1.76,.045),alloy,.01,True)
tube('Clothes hanging bar',(-.38,1.78,0),(.38,1.78,0),.026,alloy)
for x in [-.18,.18]:
    hose('Coat hanger hook',[(x,1.68,.0),(x,1.82,.02),(x+.035,1.81,.02)],.009,alloy)
    beam('Hanger shoulder',(x-.14,1.54,0),(x,1.68,0),.021,alloy)
    beam('Hanger shoulder',(x,1.68,0),(x+.14,1.54,0),.021,alloy)
box('Hanging field jacket',(-.17,1.20,.03),(.39,.68,.12),cloth,.065,True)
for x in [-.38,.04]:box('Canvas jacket sleeve',(x,1.27,.02),(.13,.45,.12),cloth,.055)
box('Jacket chest patch',(-.26,1.35,.10),(.11,.09,.012),ochre,.009)
box('Jacket opening seam',(-.17,1.21,.10),(.012,.53,.006),steel,.002)
box('Satchel main pouch',(.19,.95,.09),(.26,.29,.17),green,.035,True)
hose('Satchel strap',[(.06,1.06,.02),(.19,1.62,.02),(.31,1.06,.02)],.020,cloth)

# 15 / Industrial cable drum on two bearing feet, wound layers and jack socket.
start('cable-reel','Retrieval cable drum','A braked cable drum on a solid stand with a capped connector.',14,1,23)
for x in [-.35,.35]:
    box('Drum bearing foot',(x,.045,0),(.12,.09,.65),steel,.02,True)
    box('Drum bearing support',(x,.32,0),(.065,.55,.11),ochre,.015,True)
    tube('Drum circular cheek',(x-.025,.51,0),(x+.025,.51,0),.37,ochre,48)
    ring('Cheek rolled rim',(x,.51,0),.34,.014,alloy,'x')
tube('Wound cable core',(-.30,.51,0),(.30,.51,0),.30,rubber,48)
for i in range(15):ring('Individual cable turn',(-.28+i*.04,.51,0),.305,.018,rubber,'x')
tube('Through axle',(-.41,.51,0),(.43,.51,0),.054,alloy,24)
collider((0,.51,0),(.76,.72,.72))
beam('Brake crank',(.43,.51,0),(.43,.66,.15),.029,alloy)
tube('Crank grip',(.43,.66,.15),(.56,.66,.15),.032,rubber)
hose('Parked drum lead',[(.18,.26,.16),(.23,.13,.30),(.30,.15,.38)],.021)
box('Cable connector shell',(.29,.18,.40),(.12,.10,.12),ochre,.025)

# 16 / Vented crew locker with separate boot cubby and folded coat shelf.
start('boots-locker','Crew gear locker','A narrow personal locker with a vented door, boot cubby and stamped crew number.',16,0,26)
cabinet(.61,1.80,.49,ochre)
box('Locker door shadow gap',(0,1.15,.256),(.52,1.15,.018),rubber,.01)
box('Vented crew locker door',(0,1.15,.272),(.48,1.11,.025),green,.022)
vents((0,1.51,.29),.30,4);vents((0,.80,.29),.30,3)
handle((.15,1.13,.29),.085,.045)
box('Boot cubby shadow',(0,.37,.253),(.47,.33,.018),rubber,.012)
for x in [-.12,.12]:
    box('Boot sole',(x,.22,.20),(.16,.04,.28),rubber,.02)
    box('Stored work boot',(x,.30,.14),(.145,.15,.20),cloth,.035)
    box('Boot ankle',(x,.39,.09),(.13,.19,.13),cloth,.028)
plate('CREW / 07',(0,1.71,.278),.38)

# 17 / Hospitality cabinet / cups, solid closures, no hidden resource system.
start('galley-sideboard','Copperline galley sideboard','A home corner with a sealed cupboard, mugs and a vintage thermos.',17,1,28)
cabinet(1.10,.88,.57,ivory)
for x in [-.26,.26]:
    box('Cupboard gasket',(x,.49,.295),(.49,.67,.025),rubber,.01)
    box('Raised cupboard door',(x,.49,.314),(.46,.64,.025),green,.018)
    handle((x+(.16 if x<0 else -.16),.56,.329),.07,.035)
box('Galley backsplash',(0,1.02,-.26),(1.12,.23,.045),ivory,.015,True)
tube('Vacuum flask',(-.31,.93,0),(-.31,1.25,0),.087,alloy,32)
tube('Thermos cap',(-.31,1.25,0),(-.31,1.31,0),.082,rubber,24)
for x in [.10,.31]:
    tube('Enamel mug',(x,.93,.02),(x,1.07,.02),.061,ivory,24)
    tube('Mug dark interior',(x,1.07,.02),(x,1.073,.02),.048,rubber,24)
    ring('Mug handle',(x+.076,1.01,.02),.041,.010,alloy,'z')
plate('COPPERLINE',(0,.19,.335),.44)

# 18 / Portable washstand with formed ceramic rim, not a flat cube basin.
start('ceramic-basin','Field ceramic washstand','A dry portable washstand with a ceramic bowl and stoppered tap.',14,1,19)
legs(.52,.46,.87,alloy)
box('Washstand towel shelf',(0,.28,0),(.58,.04,.50),green,.012,True)
box('Folded shop towel',(0,.34,0),(.39,.08,.36),cloth,.02)
box('Basin support tray',(0,.88,0),(.68,.08,.59),steel,.02,True)
box('Bowl outer body',(0,.965,0),(.63,.13,.53),ivory,.06,True)
box('Bowl shadow well',(0,1.034,0),(.48,.012,.36),rubber,.06)
box('Ceramic bowl inner floor',(0,1.040,0),(.40,.013,.28),ivory,.065)
for x in [-.27,.27]:box('Bowl side rim',(x,1.067,0),(.08,.07,.50),ivory,.03)
for z in [-.225,.225]:box('Bowl end rim',(0,1.067,z),(.58,.07,.08),ivory,.03)
hose('Arched faucet',[(-.15,1.03,-.21),(-.15,1.23,-.20),(-.06,1.25,-.16),(-.02,1.17,-.10)],.023,alloy)
handwheel((.15,1.12,-.21),.055,alloy)
tube('Tap valve stem',(.15,1.035,-.21),(.15,1.12,-.21),.018,alloy)

# 19 / Round three-leg stool, dished cushion, full foot ring.
start('navigation-stool','Navigator swivel stool','A compact three-leg stool with a stitched cushion and circular footrest.',8,0,9)
for a in [0,math.tau/3,math.tau*2/3]:
    x=.27*math.cos(a);z=.27*math.sin(a)
    beam('Splayed stool leg',(x,.03,z),(x*.65,.64,z*.65),.04,steel)
    box('Stool rubber foot',(x,.027,z),(.075,.055,.075),rubber,.01,True)
    collider((x*.83,.33,z*.83),(.09,.59,.09))
ring('Stool foot ring',(0,.25,0),.215,.018,alloy)
tube('Seat turntable',(0,.61,0),(0,.69,0),.26,alloy,40)
tube('Canvas circular cushion',(0,.69,0),(0,.78,0),.28,cloth,48)
ring('Cushion bound edge',(0,.764,0),.267,.009,ivory)
collider((0,.70,0),(.55,.17,.55))

# 20 / Broad two-place bench: multiple loose cushions and bolted side supports.
start('patchwork-bench','Patchwork deck bench','A bolted two-place bench with repaired canvas seat pads and a low back.',18,0,24)
legs(1.33,.44,.44)
box('Bench seat frame',(0,.44,0),(1.55,.085,.62),steel,.02,True)
for x in [-.39,.39]:box('Individual patchwork seat',(x,.53,0),(.72,.11,.58),cloth,.045,True)
box('Bench backrest',(0,.82,-.27),(1.55,.35,.09),green,.027,True)
for x in [-.67,.67]:box('Backrest riser',(x,.68,-.30),(.06,.61,.06),alloy,.01,True)
for x in [-.40,.40]:
    box('Stitched repair patch',(x,.591,.04),(.25,.009,.24),ochre,.01)
    for dx in [-.105,.105]:box('Patch stitch seam',(x+dx,.598,.04),(.004,.003,.20),ivory,.001)
plate('CARRY EACH OTHER',(0,.82,-.218),.67)

# 21 / Track-shoe exhibit in a genuinely load-bearing cradle.
start('spare-track-stand','Drive shoe service stand','A displayed articulated drive shoe held in a bolted workshop cradle.',20,1,62)
for x in [-.47,.47]:
    box('Cradle skid',(x,.055,0),(.12,.11,.77),steel,.015,True)
    box('Cradle upright',(x,.39,0),(.075,.68,.12),ochre,.012,True)
    tube('Cradle bearing pin',(x-.06,.66,0),(x+.06,.66,0),.077,alloy,24)
box('Suspended drive sole',(0,.69,0),(.85,.27,.64),rubber,.055,True)
box('Shoe top casting',(0,.88,0),(.84,.14,.52),steel,.03,True)
for z in [-.22,0,.22]:box('Replaceable tread bar',(0,.532,z),(.81,.065,.09),alloy,.014)
for x in [-.30,.30]:
    for z in [-.16,.16]:bolt((x,.958,z),.035,True)
tube('Drive socket sleeve',(0,.95,0),(0,1.09,0),.13,green,32)
tube('Recessed drive socket',(0,1.09,0),(0,1.094,0),.085,rubber,24)
plate('DRIVE / SPARE',(0,.665,.333),.46)

# 22 / Ribbed scrubber tower with inspection gauge and service ports.
start('air-filter-tower','Cyclone filter column','A retired cyclone housing with removable filter ribs and a pressure gauge.',20,2,44)
box('Filter skid',(0,.055,0),(.75,.11,.72),steel,.02,True)
tube('Filter column main body',(0,.12,0),(0,1.61,0),.285,green,48)
collider((0,.88,0),(.57,1.52,.57))
for y in [.16,.57,1.11,1.57]:ring('Filter clamp ring',(0,y,0),.287,.024,alloy)
for a in range(12):
    t=a*math.tau/12;x=.287*math.cos(t);z=.287*math.sin(t)
    box('Filter cooling rib',(x,1.29,z),(.018,.43,.035),steel,.004)
tube('Filter crown',(0,1.61,0),(0,1.72,0),.31,ochre,48)
tube('Sealed inlet pipe',(-.24,.65,0),(-.43,.65,0),.087,alloy,28)
tube('Inlet blanking cap',(-.44,.65,0),(-.455,.65,0),.104,steel,28)
dial((0,.94,.284),.105)
plate('CYCLONE / 3A',(0,.35,.294),.37)

# 23 / Two gas cylinders with valve guards, steel chain, and wheeled carrier.
start('canister-caddy','Twin canister caddy','Two capped service cylinders chained to a wheeled transport frame.',17,1,39)
for x in [-.30,.30]:wheel((x,.10,-.19),.10)
box('Caddy toe plate',(0,.045,.11),(.69,.09,.54),steel,.02,True)
for x in [-.27,.27]:
    box('Caddy riser',(x,.77,-.17),(.045,1.45,.045),alloy,.008,True)
tube('Caddy pushbar',(-.27,1.47,-.17),(.27,1.47,-.17),.026,rubber)
for x in [-.16,.16]:
    tube('Pressure cylinder',(x,.11,.04),(x,1.02,.04),.142,ochre if x<0 else green,32)
    collider((x,.58,.04),(.285,.95,.285))
    tube('Shouldered cylinder cap',(x,1.02,.04),(x,1.08,.04),.115,alloy,28)
    tube('Protected valve neck',(x,1.08,.04),(x,1.23,.04),.043,alloy,20)
    handwheel((x,1.24,.04),.062,steel)
    tube('Cylinder identification band',(x,.71,.04),(x,.84,.04),.145,ivory,32)
for y in [.47,.95]:hose('Cylinder retaining strap',[(-.27,y,-.14),(-.30,y,.10),(-.16,y,.20),(0,y,.14),(.16,y,.20),(.30,y,.10),(.27,y,-.14)],.016,steel)

# 24 / Creased cloth pennant sewn to a grounded mast, not a rigid signboard.
start('signal-pennant','Forward signal pennant','A stitched expedition pennant on a weighted deck mast.',10,0,12)
box('Pennant weighted base',(0,.06,0),(.53,.12,.53),steel,.028,True)
tube('Pennant tapered mast',(0,.12,0),(0,2.05,0),.027,alloy,24)
collider((0,1.05,0),(.07,1.98,.07))
tube('Mast finial',(0,2.05,0),(0,2.10,0),.040,ochre,20)
verts=[];faces=[];nx=12;ny=5
for i in range(nx+1):
    t=i/nx
    for j in range(ny+1):
        s=j/ny
        x=.025+t*.68;y=1.43+s*.53-(t*.12);z=.02+math.sin(t*math.pi*2-.4)*.055*t
        verts.append(xyz((x,y,z)))
for i in range(nx):
    for j in range(ny):
        a=i*(ny+1)+j;faces.append((a,a+1,a+ny+2,a+ny+1))
mesh=bpy.data.meshes.new('Stitched flowing pennant');mesh.from_pydata(verts,[],faces);mesh.update()
o=bpy.data.objects.new('Stitched expedition cloth',mesh);bpy.context.collection.objects.link(o);finish(o,o.name,cloth)
mod=o.modifiers.new('Hem thickness','SOLIDIFY');mod.thickness=.008;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
for y in [1.43,1.96]:hose('Bound cloth hem',[(.025+t*.68,y-t*.12,.02+math.sin(t*math.pi*2-.4)*.055*t) for t in [i/12 for i in range(13)]],.008,ochre)
ink=label('FORWARD',(.33,1.71,.065),.067,ivory)
bpy.context.view_layer.update()
for v in ink.data.vertices:
    point=ink.matrix_world@v.co;t=(point.x-.025)/.68
    point.y=-(.02+math.sin(t*math.tau-.4)*.055*t+.010)
    v.co=ink.matrix_world.inverted()@point
for y in [1.43,1.96]:ring('Pennant eyelet',(0,y,0),.044,.009,alloy)

# 25 / Community story board with cork-like cloth backing and pinned ephemera.
start('memory-board','Carried memories board','A freestanding board of postcards, route scraps and personal field notes.',13,0,16)
for x in [-.48,.48]:
    box('Memory board foot',(x,.035,0),(.10,.07,.58),steel,.018,True)
    box('Memory board upright',(x,.91,0),(.052,1.76,.052),alloy,.01,True)
box('Canvas-backed memory board',(0,1.21,0),(1.10,1.08,.075),cloth,.03,True)
for x in [-.545,.545]:box('Memory board side frame',(x,1.21,.012),(.06,1.13,.075),green,.015)
for y in [.66,1.77]:box('Memory board frame rail',(0,y,.012),(1.13,.055,.075),green,.01)
for i,(x,y,w,h) in enumerate([(-.30,1.48,.26,.19),(.04,1.48,.28,.22),(.34,1.36,.20,.30),(-.27,1.12,.33,.26),(.09,.99,.29,.20)]):
    box('Pinned field postcard',(x,y,.047),(w,h,.008),ivory,.002)
    box('Printed photo inset',(x,y+.018,.054),(w-.035,h*.53,.003),green if i%2 else ochre,.002)
    for dy in [-h*.34,-h*.25]:box('Postcard handwriting line',(x,y+dy,.055),(w*.68,.005,.003),steel,.001)
    tube('Postcard pin',(x,y+h/2-.013,.054),(x,y+h/2-.013,.067),.012,ochre,12)
hose('Pinned route thread',[(-.30,1.50,.069),(.34,1.41,.069),(.08,1.03,.069),(-.27,1.18,.069)],.004,ochre)
plate('CARRIED FORWARD',(0,.74,.05),.54)

exec(compile((Path(__file__).parent/'refine_pass.py').read_text(),'<first all-model refinement>','exec'))

sys.path.insert(0,str(ROOT/'tools/art/art200_machine'))
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
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadFurnishings.blend'))

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
bpy.ops.export_scene.gltf(filepath=str(ART/'art100-machine.glb'),export_format='GLB',export_animations=False,export_tangents=False)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(OUT/'geometry-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')

# Generated catalog data is independent of the game boot sequence. Root owns hooks.
definitions={k:{'id':k,'name':v['name'],'description':v['description'],'category':'decor','anchor':'cell',
    'cost':v['cost'],'weight':v['weight'],'maxHealth':100,'armor':0,'boundsRoom':False,'blocksNavigation':False,'rotatable':True}
    for k,v in manifest.items()}
data_path=ROOT/'godot/data/art100-machine.json'
data_path.write_text(json.dumps({'pieces':definitions,'colliders':{k:v['colliders'] for k,v in manifest.items()}},indent=2),encoding='utf-8')
print('ART100_MACHINE_COMPLETE',len(roots),sum(v['triangles'] for v in report.values()),flush=True)

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
    print('ART100_MACHINE_RENDERS_COMPLETE',flush=True)
