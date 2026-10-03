"""Art100 story and hostile equipment: 19 complete props and six authored loadouts.

Metres, +Y up/+Z service face in the public recipe. Blender keeps editable named
parts; runtime exports join by material. Run with Blender --background --threads 4.
The six loadouts augment existing complete, rigged robot assemblies (not new AI).
"""
import bpy, bmesh, math, json, sys, ast
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/art100/story-robots'; OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
def xyz(v): return Vector((v[0],-v[2],v[1]))
def flat(name,color,metal=0,rough=.6):
 m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF')
 s.inputs['Base Color'].default_value=(*color,1);s.inputs['Metallic'].default_value=metal;s.inputs['Roughness'].default_value=rough
 return m
# Portable map-based microfinish; base color remains deliberately quiet.
class C:
 flat=staticmethod(flat)
c=C()
recipe=ast.parse((ROOT/'tools/art/native_weapons/build.py').read_text())
fn=next(n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name=='wear_material')
exec(compile(ast.Module(body=[fn],type_ignores=[]),'<retained material recipe>','exec'))
def coat(name,color,metal,rough,seed):
 m=wear_material('A100 '+name,color,metal,rough,seed)
 for n in m.node_tree.nodes:
  if n.type=='NORMAL_MAP':n.inputs['Strength'].default_value=.22
  if n.type=='TEX_IMAGE' and n.image.name.endswith('_ORM'):
   pix=np.array(n.image.pixels[:],dtype=np.float32).reshape(-1,4);pix[:,1]=.58+(pix[:,1]-.5)*.12;pix[:,2]=metal+(pix[:,2]-metal)*.15
   n.image.pixels.foreach_set(pix.ravel());texture_dir=OUT/'textures';texture_dir.mkdir(exist_ok=True)
   n.image.filepath_raw=str(texture_dir/(name.replace(' ','-')+'-orm.png'));n.image.file_format='PNG';n.image.save()
   if n.image.packed_file:n.image.unpack(method='REMOVE')
   n.image.reload();n.image.pack()
  if n.type=='TEX_IMAGE' and n.image.name.endswith('_Base'):
   pix=np.array(n.image.pixels[:],dtype=np.float32).reshape(-1,4);pix[:,:3]=pix[:,:3]*.16+np.array(color)[None,:]*.84
   n.image.pixels.foreach_set(pix.ravel())
   texture_dir=OUT/'textures';texture_dir.mkdir(exist_ok=True)
   n.image.filepath_raw=str(texture_dir/(name.replace(' ','-')+'-base.png'));n.image.file_format='PNG';n.image.save()
   if n.image.packed_file:n.image.unpack(method='REMOVE')
   n.image.reload();n.image.pack()
 return m
steel=coat('phosphated steel',(.083,.11,.105),.72,.42,401)
paint=coat('maintenance enamel',(.36,.39,.30),.3,.53,402)
ochre=coat('recovery ochre',(.40,.235,.075),.3,.55,403)
metal=flat('A100 brushed alloy',(.38,.43,.42),.85,.3)
dark=flat('A100 vulcanized seals',(.013,.02,.02),.05,.75)
cream=flat('A100 ceramic lettering',(.74,.76,.62),.04,.65)
glass=flat('A100 smoked inspection glass',(.025,.10,.105),.65,.18)
red=coat('oxide ceramic',(.27,.06,.025),.28,.5,404)
leaf=flat('A100 propagation leaves',(.105,.235,.055),0,.8)
cyan=flat('A100 low power cyan',(.045,.37,.40),.15,.35)
amber=flat('A100 status amber',(.55,.19,.025),.1,.4)
for m in [cyan,amber]:
 s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Emission Color'].default_value=s.inputs['Base Color'].default_value;s.inputs['Emission Strength'].default_value=.5
roots=[];manifest=[]
def empty(name,at=(0,0,0),parent=None):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent;o.location=xyz(at);return o
def finish(o,name,mat,r,bevel=0):
 o.name=name;o.parent=r;o.data.materials.append(mat)
 bpy.context.view_layer.objects.active=o
 if bevel:
  mod=o.modifiers.new('Machined edge radius','BEVEL');mod.width=bevel;mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
 for p in o.data.polygons:p.use_smooth=True
 mod=o.modifiers.new('Weighted planar normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
def box(n,p,d,m,r,b=.008):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(p));o=bpy.context.object;o.dimensions=(d[0],d[2],d[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 return finish(o,n,m,r,min(b,min(d)*.35))
def tube(n,a,b,rad,m,r,N=24):
 av,bv=xyz(a),xyz(b);d=bv-av;bpy.ops.mesh.primitive_cylinder_add(vertices=N,radius=rad,depth=d.length,location=(av+bv)/2)
 o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y');bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
 return finish(o,n,m,r,min(.004,rad*.15))
def cable(n,pts,rad,m,r):
 curve=bpy.data.curves.new(n,'CURVE');curve.dimensions='3D';curve.resolution_u=5;curve.bevel_depth=rad;curve.bevel_resolution=2
 spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(pts)-1)
 for p,at in zip(spline.bezier_points,pts):p.co=xyz(at);p.handle_left_type=p.handle_right_type='AUTO'
 o=bpy.data.objects.new(n,curve);bpy.context.collection.objects.link(o);o.parent=r;o.data.materials.append(m)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');return o
def ring(n,at,outer,inner,h,m,r,N=40):
 x,y,z=at;vs=[]
 for yy,rad in [(y-h/2,outer),(y+h/2,outer),(y+h/2,inner),(y-h/2,inner)]:
  vs += [xyz((x+rad*math.cos(i*math.tau/N),yy,z+rad*math.sin(i*math.tau/N))) for i in range(N)]
 fs=[(j*N+i,j*N+(i+1)%N,((j+1)%4)*N+(i+1)%N,((j+1)%4)*N+i) for j in range(4) for i in range(N)]
 mesh=bpy.data.meshes.new(n);mesh.from_pydata(vs,[],fs);mesh.update();o=bpy.data.objects.new(n,mesh);bpy.context.collection.objects.link(o);return finish(o,n,m,r,.003)
def profile(n,xy,z,depth,m,r):
 vs=[xyz((x,y,zz)) for zz in [z-depth/2,z+depth/2] for x,y in xy];L=len(xy)
 fs=[tuple(reversed(range(L))),tuple(range(L,2*L))]+[(i,(i+1)%L,(i+1)%L+L,i+L) for i in range(L)]
 mesh=bpy.data.meshes.new(n);mesh.from_pydata(vs,[],fs);mesh.update();o=bpy.data.objects.new(n,mesh);bpy.context.collection.objects.link(o);return finish(o,n,m,r,.008)
def text(value,at,size,r):
 bpy.ops.object.text_add(location=xyz(at));o=bpy.context.object;o.parent=r;o.name='Engraved '+value;o.data.body=value;o.data.size=size;o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.resolution_u=2
 o.rotation_euler=(math.pi/2,0,0);o.data.materials.append(cream);bpy.ops.object.convert(target='MESH');return bpy.context.object
def bolt(at,r,axis='Z',radius=.014):
 p=Vector(at);d=Vector((0,1,0) if axis=='Y' else (0,0,1));tube('Captive washer',p,p+d*.003,radius*1.35,metal,r,16);tube('Hex fastener',p+d*.003,p+d*.012,radius,steel,r,6)
def badge(title,at,w,r):
 box('Recessed identification plate',at,(w,.11,.012),dark,r,.004);text(title,(at[0],at[1],at[2]+.007),min(.038,w/max(1,len(title))*1.45),r)
def feet(r,w,d,h=.08):
 for x in [-w/2+.07,w/2-.07]:
  for z in [-d/2+.07,d/2-.07]:
   box('Vibration isolation foot',(x,h/2,z),(.13,h,.13),dark,r,.014);bolt((x,h,z),r,'Y')
def root(name,title,status='new',target='meridian-berth'):
 p=empty(name);roots.append(p);manifest.append({'id':name,'title':title,'status':status,'runtime_target':target,'counting_unit':'complete assembled model','root':name});return p
def panel(r,at,w=.5,h=.32,mode='meter'):
 x,y,z=at;box('Cast instrument surround',(x,y,z),(w,h,.048),metal,r,.016);box('Inset glazed display',(x,y,z+.028),(w-.035,h-.035,.013),glass,r,.01)
 for i in range(3):
  yy=y-h*.28+i*h*.24
  box('Engraved display rule',(x,yy,z+.037),(w*.77,.005,.002),steel,r,.0005)
  if mode=='wave':cable('Phosphor trace',[(x-w*.34+j*w*.068,yy+math.sin(j*.9+i)*h*.07,z+.039) for j in range(11)],.002,cyan,r)
  else:box('Channel bar',(x-w*.15+i*.025,yy,z+.04),(w*(.3+i*.12),.016,.004),cyan,r,.002)
def dial(r,at,rad=.058):
 x,y,z=at;tube('Instrument bezel',(x,y,z),(x,y,z+.028),rad,metal,r,32);tube('Dial face',(x,y,z+.03),(x,y,z+.034),rad*.83,dark,r,32)
 for i in range(8):
  a=i*math.tau/8;box('Gauge index',(x+rad*.62*math.cos(a),y+rad*.62*math.sin(a),z+.039),(.005,.009,.003),cream,r,.001)
 cable('Instrument needle',[(x,y,z+.042),(x+rad*.4,y+rad*.36,z+.042)],.003,amber,r)
def radiator(r,at,w,h,coatmat=steel,facing=1):
 x,y,z=at;box('Radiator cassette',(x,y,z),(w,h,.09),coatmat,r,.013)
 for i in range(max(3,int(h/.045))):box('Separated cooling fin',(x,y-h*.42+i*.045,z+facing*.054),(w*.88,.018,.04),metal,r,.003)
def leaf_blade(at,direction,length,width,r):
 base=Vector(at);d=Vector(direction).normalized();side=Vector((-d.z,0,d.x));vs=[];fs=[];N=12
 for thickness in [0,-.003]:
  for i in range(N+1):
   t=i/N;center=base+d*length*t+Vector((0,length*(.30*t-.12*t*t),0))
   for s in [-1,0,1]:
    p=center+side*(width*math.sin(math.pi*t)*s)+Vector((0,width*.16*(1-abs(s))*math.sin(math.pi*t)+thickness,0));vs.append(xyz(p))
 stride=(N+1)*3
 for k in range(2):
  for i in range(N):
   for j in range(2):
    a=k*stride+i*3+j;face=(a,a+1,a+4,a+3);fs.append(face if k==0 else tuple(reversed(face)))
 for j in [0,2]:
  for i in range(N):
   a=i*3+j;fs.append((a,a+3,a+3+stride,a+stride))
 mesh=bpy.data.meshes.new('Curved cotyledon');mesh.from_pydata(vs,[],fs);mesh.update();o=bpy.data.objects.new('Curved cotyledon',mesh);bpy.context.collection.objects.link(o)
 return finish(o,'Curved cotyledon',leaf,r)
def cabinet(r,w=.92,h=1.3,d=.6,coatmat=paint,title='SERVICE'):
 feet(r,w,d);box('Folded enclosure',(0,(h+.08)/2,0),(w,h-.08,d),steel,r,.03);box('Removable enamel door',(0,h*.52,d/2+.014),(w-.055,h-.14,.033),coatmat,r,.025)
 for x in [-w*.41,w*.41]:
  for y in [.16,h-.08]:bolt((x,y,d/2+.034),r)
 for y in [.22,h-.24]:box('Flush hinge',(-w*.46,y,d*.51),(.035,.13,.03),metal,r,.007)
 badge(title,(0,h-.11,d/2+.04),w*.73,r)
def tank(r,at,rad=.24,h=1.3):
 x,y,z=at;tube('Sealed pressure shell',(x,y+.10,z),(x,y+h-.09,z),rad,paint,r,40)
 for yy in [y+.1,y+h-.1]:tube('Rolled protective rim',(x,yy-.035,z),(x,yy+.035,z),rad*1.06,metal,r,40)
 for xx in [x-rad*.7,x+rad*.7]:box('Bolted vessel foot',(xx,y+.06,z),(.13,.12,.25),steel,r,.012)
 tube('Top boss',(x,y+h-.1,z),(x,y+h+.03,z),rad*.3,metal,r)
 ring('Handwheel',(x,y+h+.07,z),rad*.42,rad*.3,.025,red,r,32);tube('Valve spindle',(x,y+h,z),(x,y+h+.08,z),.02,metal,r)
 for j in range(4):
  a=j*math.pi/2;tube('Handwheel spoke',(x,y+h+.07,z),(x+rad*.37*math.cos(a),y+h+.07,z+rad*.37*math.sin(a)),.009,red,r,10)

# 01: readable maintenance desk: suspended terminal, file tray and protected switches.
r=root('BerthReferenceDesk','Meridian maintenance reference desk')
feet(r,.95,.62)
for x in [-.39,.39]:profile('Splayed console cheek',[(x-.055,.07),(x-.055,.9),(x+.055,1.02),(x+.09,.1)],0,.5,steel,r)
box('Work surface',(0,.96,0),(.99,.055,.66),paint,r,.027)
box('Display pedestal',(0,1.10,-.19),(.12,.27,.1),metal,r)
panel(r,(0,1.27,-.11),.70,.33,'wave')
box('Document tray',(-.22,1.008,.17),(.38,.035,.25),dark,r)
for i in range(3):box('Maintenance cards',(-.22+i*.015,1.032+i*.008,.16),(.3,.007,.18),cream,r,.004)
for i in range(3):tube('Guarded selector',(.17+i*.075,1.008,.18),(.17+i*.075,1.041,.18),.025,ochre,r,20)
badge('MERIDIAN / REFERENCE',(0,.77,.263),.72,r)
cable('Supported display loom',[(0,1.08,-.21),(0,.8,-.21),(.25,.4,-.21),(.25,.15,-.21)],.013,dark,r)
# 02 grounded, visibly load-bearing dock receiving contactor.
r=root('BerthReceivingCoupler','Receiving coupler and service breaker')
cabinet(r,.85,1.08,.58,ochre,'RECEIVE / ISOLATE')
for x in [-.24,.24]:tube('Insulator socket',(x,.91,0),(x,1.3,0),.073,dark,r)
for x in [-.24,.24]:
 for y in [1.04,1.12,1.2]:tube('Ceramic insulator disc',(x,y-.018,0),(x,y+.018,0),.10,cream,r)
tube('Bridge contact',(-.24,1.31,0),(.24,1.31,0),.032,metal,r)
panel(r,(0,.72,.34),.43,.22);dial(r,(-.24,.43,.34));dial(r,(.24,.43,.34))
cable('Grounded feed loop',[(.28,.26,.1),(.39,.2,.2),(.34,.14,.33),(.05,.13,.33)],.028,dark,r)
# 03 sealed seed enclosure with actual visible carriers rather than opaque cubes.
r=root('BerthSeedEnclosure','Climate controlled seed enclosure')
cabinet(r,1.02,1.03,.66,paint,'ORCHARD / LIVING SEED')
box('Recessed lower drawer',(0,.4,.357),(.82,.25,.018),dark,r)
for x in [-.34,-.17,0,.17,.34]:
 tube('Seed carrier sleeve',(x,1.055,0),(x,1.42,0),.06,metal,r)
 tube('Seed preservation capsule',(x,1.11,0),(x,1.34,0),.065,glass,r)
 tube('Ceramic seed cap',(x,1.36,0),(x,1.42,0),.074,cream,r)
for x in [-.48,.48]:tube('Protective upright',(x,1.02,-.28),(x,1.57,-.28),.026,steel,r)
box('Climate hood',(0,1.57,-.04),(1.05,.06,.62),paint,r,.025);box('Grow strip',(0,1.531,-.04),(.87,.015,.10),cyan,r)
panel(r,(0,.8,.367),.48,.22)
# 04 cradle engages a memory magazine and three visible keyed guide rails.
r=root('BerthArchiveReceiver','Meridian archive receiving cradle')
cabinet(r,.95,.88,.58,steel,'ARCHIVE / VERIFIED')
for x in [-.32,0,.32]:box('Keyed extraction rail',(x,1.02,0),(.058,.28,.62),metal,r,.008)
box('Archive spine',(0,1.03,-.06),(.66,.25,.36),paint,r,.027)
for x in [-.23,0,.23]:
 box('Removable memory drawer',(x,1.09,.15),(.18,.13,.14),dark,r)
 box('Ceramic drawer pull',(x,1.09,.237),(.12,.06,.028),cream,r)
panel(r,(0,.55,.327),.55,.22)
cable('Shielded readback loom',[(-.31,.84,-.2),(-.42,1.10,-.2),(-.31,1.2,-.2)],.018,dark,r)
# 05 three channels + keyed mechanism for receiving policy selection.
r=root('BerthAccessTransmitter','Access policy transmitter console')
cabinet(r,.9,1.26,.59,paint,'MERIDIAN / ACCESS')
panel(r,(0,.96,.34),.61,.25,'wave')
for i,x in enumerate([-.24,0,.24]):dial(r,(x,.61,.34),.075);text(['P','L','R'][i],(x,.45,.343),.048,r)
radiator(r,(0,.27,.325),.60,.19)
box('Antenna junction',(0,1.36,-.13),(.53,.15,.25),ochre,r,.016)
for x in [-.19,.19]:tube('Short service aerial',(x,1.39,-.13),(x,1.85,-.13),.012,metal,r,12)
# 06 full standing propagation rack (plants also toggle via a named subroot).
r=root('SeedPropagationBench','Six cup propagation bench')
for x in [-1.12,1.12]:
 for z in [-.22,.22]:box('Bench foot',(x,.025,z),(.17,.05,.17),dark,r);tube('Bench upright',(x,.05,z),(x,.81,z),.026,steel,r)
box('Raised propagation tray',(0,.82,0),(2.5,.10,.60),paint,r,.027)
for z in [-.28,.28]:box('Rolled containment lip',(0,.9,z),(2.48,.07,.025),metal,r)
plants=empty('LivingSprouts',parent=r)
for i in range(6):
 x=-1+i*.4;tube('Seed cup',(x,.85,0),(x,1.08,0),.145,cream,r,32);tube('Cultivation soil',(x,1.07,0),(x,1.086,0),.131,dark,r,32)
 tube('Seedling stem',(x,1.08,0),(x,1.29,0),.007,leaf,plants,10)
 for j in range(3):
  leaf_blade((x,1.15+j*.045,0),(1 if j%2 else -1,0,.28 if j%2 else -.28),.16,.042,plants)
badge('PRESERVATION / 06',(0,.812,.309),.9,r)
# 07 compact pressure reservoir sized to the existing berth footprints.
r=root('PreservationReservoir','Preservation fluid reservoir')
tank(r,(0,0,0),.24,1.46);dial(r,(0,1.1,.248));badge('P-02',(0,.63,.248),.28,r)
tube('Low outlet',(0,.22,.18),(0,.22,.36),.04,metal,r)
# 08/09 two actually different antenna assemblies; same near-exact old footprints.
r=root('OpenChannelMast','Public invitation dipole mast')
box('Mast load plate',(0,.035,0),(.45,.07,.45),steel,r)
tube('Tapered mast',(0,.05,0),(0,4.2,0),.058,metal,r,32)
for y in [.22,2.7,3.9]:tube('Mast service collar',(0,y-.04,0),(0,y+.04,0),.077,ochre,r)
for x in [-.26,.26]:
 tube('Dipole cross stay',(0,3.6,0),(x,3.6,0),.022,steel,r)
 tube('Balanced open channel element',(x,3.02,0),(x,4.18,0),.016,metal,r,16)
box('Feed balun',(0,3.6,.08),(.13,.24,.11),paint,r)
cable('Clipped feeder',[(.068,.12,0),(.068,1.6,0),(.068,3.5,0),(0,3.6,.08)],.013,dark,r)
r=root('RelayChallengeMast','Narrowcast challenge response array')
box('Mast load plate',(0,.035,0),(.44,.07,.44),steel,r)
tube('Relay mast',(0,.05,0),(0,3.68,0),.063,metal,r,32)
for y in [2.55,3.55]:tube('Array standoff',(0,y,0),(0,y,-.12),.026,steel,r)
box('Shielded array spine',(0,3.05,-.12),(.10,1.2,.09),paint,r)
for i in range(7):
 y=2.6+i*.15;w=.30+(.3-abs(i-3)*.04);tube('Directional relay element',(-w/2,y,-.17),(w/2,y,-.17),.018,metal,r)
box('Challenge unit',(0,1.0,.08),(.23,.35,.13),steel,r);badge('L / 12',(0,1.0,.15),.17,r)
# 10-19 distinct deployed, service-oriented story components.
r=root('IsolatorCabinet','Orchard archive circuit isolator',target='glass-orchard / berth rear service wall')
cabinet(r,.8,1.55,.48,cream,'ARCHIVE / ISOLATOR')
for x in [-.22,0,.22]:
 tube('Insulated fuse',(x,.77,.29),(x,1.18,.29),.053,red,r)
 for y in [.80,1.15]:tube('Fuse ferrule',(x,y-.03,.29),(x,y+.03,.29),.061,metal,r)
panel(r,(0,1.35,.295),.43,.16)
box('Isolating handle',(0,.45,.335),(.40,.065,.10),ochre,r,.015)
r=root('ArchiveTransitCore','Sealed archive transport core',target='meridian-berth')
feet(r,.64,.43,.04);box('Shock sealed transport housing',(0,.28,0),(.66,.48,.43),steel,r,.045)
for x in [-.27,.27]:box('Replaceable bumper',(x,.28,0),(.06,.53,.47),ochre,r,.018)
box('Ceramic archival seal',(0,.3,.226),(.44,.29,.025),cream,r,.02)
for i in range(4):box('Archive key',(0,.21+i*.048,.245),(.31,.015,.014),dark,r)
tube('Carry handle',(-.14,.56,0),(.14,.56,0),.022,metal,r);tube('Handle leg',(-.14,.51,0),(-.14,.56,0),.022,metal,r);tube('Handle leg',(.14,.51,0),(.14,.56,0),.022,metal,r)
badge('ANNIKA / 03',(0,.10,.228),.40,r)
r=root('MemoryReader','Archive memory inspection desk',target='meridian-berth')
feet(r,.75,.48);box('Reader pedestal',(0,.44,0),(.22,.78,.23),steel,r)
box('Continuous pedestal load plate',(0,.09,0),(.75,.06,.48),steel,r,.014)
box('Worktable',(0,.84,0),(.76,.07,.49),paint,r,.025)
panel(r,(0,1.13,-.10),.56,.35,'wave');box('Reader display support',(0,.99,-.14),(.1,.24,.09),metal,r)
for x in [-.20,0,.20]:box('Memory key socket',(x,.895,.14),(.15,.034,.15),dark,r)
badge('MEMORY / READBACK',(0,.68,.128),.51,r)
r=root('SeedVault','Hermetic seed cassette vault',target='meridian-berth')
cabinet(r,.76,1.18,.56,ochre,'SEED / KEEP DRY')
box('Vault door gasket',(0,.64,.305),(.6,.73,.03),dark,r,.04)
box('Insulated vault door',(0,.64,.34),(.55,.68,.05),paint,r,.04)
for x in [-.2,.2]:
 for y in [.42,.87]:bolt((x,y,.375),r)
wheel=ring('Vault lock handwheel',(0,.64,.42),.13,.09,.035,metal,r)
center=xyz((0,.64,.42));rotation=Matrix.Rotation(math.pi/2,3,'X')
for v in wheel.data.vertices:v.co=center+rotation@(v.co-center)
# A front-facing real wheel axis and spoke, separate from the preservation valves.
tube('Vault cross handle',(-.11,.64,.43),(.11,.64,.43),.022,metal,r)
panel(r,(0,1.0,.309),.35,.12)
r=root('EmergencyFuelPump','Foundry emergency fuel service pump',target='relay-foundry / glass-orchard service bay')
cabinet(r,.68,1.5,.51,ochre,'SERVICE / FUEL')
panel(r,(0,1.23,.301),.46,.21);dial(r,(0,.91,.30),.10)
box('Hose reel spindle',(.40,.70,0),(.13,.11,.15),metal,r)
for x in [.40,.47]:tube('Reel cheek',(x-.014,.70,0),(x+.014,.70,0),.25,steel,r,40)
for i in range(4):cable('Supported service hose',[((.405+i*.018),.50,-.1),((.405+i*.018),.74,-.20),((.405+i*.018),.90,0),((.405+i*.018),.71,.20),((.405+i*.018),.50,-.1)],.018,dark,r)
cable('Nozzle return loop',[(.47,.51,0),(.50,.25,.13),(.34,.20,.27),(.28,.71,.31)],.021,dark,r)
box('Docked dispensing nozzle',(.28,.74,.32),(.11,.22,.08),metal,r,.018)
r=root('CourierChargeCradle','Courier autonomous charging cradle',target='meridian-berth')
box('Dock load pad',(0,.045,0),(1.03,.09,.83),steel,r,.045)
for x in [-.35,.35]:
 profile('Dock guide rail',[(x-.045,.09),(x-.045,.41),(x+.045,.26),(x+.045,.09)],0,.66,ochre,r)
box('Charge contact pedestal',(0,.44,-.29),(.63,.73,.13),paint,r,.03)
for x in [-.19,0,.19]:tube('Spring power contact',(x,.44,-.19),(x,.44,-.12),.038,metal,r)
panel(r,(0,.70,-.19),.40,.16)
badge('COURIER / DOCK',(0,.074,.421),.65,r)
r=root('RecoveryToolCart','Mobile recovery technician cart',target='meridian-berth / foundry service bay')
for x in [-.31,.31]:
 for z in [-.24,.24]:tube('Rubber caster',(x-.025,.095,z),(x+.025,.095,z),.095,dark,r,24)
for x in [-.30,.30]:
 for z in [-.21,.21]:tube('Tubular cart frame',(x,.16,z),(x,.86,z),.025,metal,r)
for y in [.23,.76]:box('Folded tool tray',(0,y,0),(.71,.055,.55),paint,r,.014)
for z in [-.27,.27]:box('Tray retaining lip',(0,.815,z),(.69,.08,.022),steel,r)
box('Diagnostic case',(-.13,.94,-.05),(.35,.3,.31),ochre,r,.023)
for x in [.14,.25]:tube('Stowed socket extension',(x,.79,-.16),(x,.79,.18),.021,metal,r)
cable('Push handle',[(-.30,.86,-.20),(-.30,1.05,-.25),(.30,1.05,-.25),(.30,.86,-.20)],.026,steel,r)
badge('RECOVERY',(0,.65,.245),.46,r)
r=root('NavGyroCradle','Navigation gyroscope service cradle',target='wreck-one')
feet(r,.78,.62);box('Instrument plinth',(0,.28,0),(.79,.40,.64),steel,r,.025)
for x in [-.29,.29]:profile('Trunnion bearing cheek',[(x-.045,.42),(x-.045,.98),(x+.045,.98),(x+.045,.42)],0,.15,paint,r)
ring('Gyro outer cage',(0,.83,0),.32,.27,.07,metal,r,48)
tube('Gyro rotor',(0,.78,0),(0,.89,0),.22,ochre,r,48)
for x in [-.3,.3]:tube('Trunnion pivot',(x-.065,.83,0),(x+.065,.83,0),.065,steel,r)
tube('Continuous gimbal axle',(-.31,.83,0),(.31,.83,0),.034,metal,r)
badge('COURSE / GYRO',(0,.33,.33),.59,r)
r=root('FoundryPowerBus','Foundry three circuit recovery bus',target='relay-foundry')
cabinet(r,1.20,1.35,.51,steel,'FOUNDRY / 3 CIRCUITS')
for x in [-.37,0,.37]:
 box('Removable power cassette',(x,.73,.295),(.29,.73,.072),ochre,r,.018)
 dial(r,(x,.94,.34),.07);radiator(r,(x,.63,.35),.22,.25)
 tube('Cassette lock handle',(x-.075,.40,.37),(x+.075,.40,.37),.019,metal,r)
for x in [-.37,0,.37]:cable('Bonded bus output',[(x,.30,-.05),(x,.16,-.19),(0,.15,-.19)],.021,dark,r)
r=root('ArrayPhaseRack','Quiet Array phase analysis rack',target='quiet-array')
feet(r,.87,.52);box('Array enclosure',(0,.79,0),(.84,1.42,.49),steel,r,.026)
for i in range(3):
 y=.41+i*.40;box('Receiver cassette',(0,y,.267),(.77,.34,.032),paint,r,.016)
 panel(r,(-.12,y,.298),.42,.21,'wave');dial(r,(.265,y,.301),.060)
 badge(['PORT','CENTRE','STARBOARD'][i],(-.12,y+.132,.30),.33,r)
box('Service header',(0,1.56,0),(.91,.10,.53),ochre,r,.025)

# Six purposeful loadouts, authored around the original approximately 2 m rig.
# Positioning is expressed in full-character local space; runtime cancels the
# rest bone transform, so any clip moves the whole attached unit rigidly.
specs=[('WardenRangefinder','warden','Warden rangefinder cuirass'),('RevenantPulseRack','revenant','Revenant pulse spine'),('BastionSiegeRadiator','bastion','Bastion siege cooling assembly'),('SovereignComms','sovereign','Sovereign command uplink'),('RaiderRecoveryPack','raider','Raider recovery harness'),('ScavengerSurveyPack','scavenger','Scavenger survey equipment')]
for name,kind,title in specs:
 r=root(name,title,'refined','enemy:'+kind)
 # Continuous saddle sinks into the existing back by 2 cm, never hovers away.
 box('Conformal spinal saddle',(0,1.39,-.17),(.31,.42,.07),dark,r,.035)
 for x in [-.13,.13]:box('Bolted load rail',(x,1.4,-.205),(.035,.40,.045),metal,r)
 if kind=='warden':
  box('Rangefinding control body',(0,1.42,-.25),(.29,.31,.11),paint,r,.02)
  for x in [-.105,.105]:tube('Optics support',(x,1.48,-.25),(x,1.74,-.25),.021,metal,r)
  tube('Paired optical sensor',(-.17,1.72,-.25),(.17,1.72,-.25),.055,steel,r)
  for x in [-.145,.145]:tube('Protected rear lens',(x,1.72,-.29),(x,1.72,-.315),.034,glass,r)
  radiator(r,(0,1.43,-.316),.23,.19,facing=-1)
 elif kind=='revenant':
  for x in [-.085,.085]:
   tube('Pulse coolant cartridge',(x,1.14,-.25),(x,1.63,-.25),.065,steel,r,32)
   for y in [1.20,1.55]:tube('Compression ring',(x,y-.025,-.25),(x,y+.025,-.25),.072,red,r)
  for y in [1.23,1.38,1.53]:box('Conductive bridging strap',(0,y,-.313),(.24,.025,.027),metal,r)
  cable('Pulse link',[(0,1.58,-.24),(0,1.67,-.25),(.12,1.62,-.25)],.016,amber,r)
 elif kind=='bastion':
  for x in [-.12,.12]:
   radiator(r,(x,1.38,-.28),.21,.44,ochre,facing=-1)
   tube('Cooling riser',(x,1.11,-.25),(x,1.64,-.25),.023,metal,r)
  box('Armored top shroud',(0,1.66,-.24),(.46,.075,.24),steel,r,.025)
  for x in [-.19,.19]:cable('Short return line',[(x,1.15,-.25),(x,1.08,-.2),(x,1.17,-.15)],.016,dark,r)
 elif kind=='sovereign':
  profile('Armored uplink housing',[(-.17,1.16),(-.20,1.46),(-.13,1.68),(.13,1.68),(.20,1.46),(.17,1.16)],-.245,.12,steel,r)
  for x in [-.13,.13]:
   tube('Insulated uplink mast',(x,1.55,-.25),(x,1.94 if x<0 else 1.84,-.25),.010,metal,r,16)
   tube('Mast isolation bead',(x,1.60,-.25),(x,1.65,-.25),.025,cream,r)
  for i in range(4):box('Uplink cassette',(0,1.24+i*.09,-.319),(.25,.048,.024),paint,r,.009)
 elif kind=='raider':
  box('Recovered power pack',(0,1.37,-.27),(.36,.43,.17),ochre,r,.042)
  for y in [1.22,1.53]:box('Broad retention strap',(0,y,-.365),(.39,.044,.026),dark,r)
  for x in [-.12,.12]:box('Steel tie buckle',(x,1.53,-.383),(.055,.07,.017),metal,r)
  tube('Salvage tool socket',(.19,1.18,-.22),(.19,1.71,-.22),.026,steel,r)
  box('Folded tool head',(.19,1.7,-.22),(.10,.06,.05),metal,r)
 else:
  box('Survey instrument body',(0,1.36,-.255),(.29,.34,.13),paint,r,.026)
  for x in [-.11,.11]:tube('Sample cylinder',(x,1.19,-.34),(x,1.47,-.34),.051,ochre,r)
  tube('Survey mast',(0,1.48,-.23),(0,1.79,-.23),.016,metal,r)
  box('Dual aperture head',(0,1.77,-.23),(.24,.09,.09),steel,r,.02)
  for x in [-.068,.068]:tube('Survey optic',(x,1.77,-.276),(x,1.77,-.292),.026,glass,r)
 for x in [-.13,.13]:
  for y in [1.23,1.55]:bolt((x,y,-.16),r)
 # A shaped front escutcheon gives all six a visible frontal refinement too.
 profile('Fitted chest service escutcheon',[(-.105,1.37),(-.12,1.49),(-.075,1.56),(.075,1.56),(.12,1.49),(.105,1.37)],.173,.028,paint if kind not in ['revenant','raider'] else red,r)
 badge(kind[:3].upper()+' / 07',(0,1.465,.191),.17,r)
 for x in [-.076,.076]:bolt((x,1.53,.192),r,radius=.008)
 manifest[-1]['assembly_base']='res://art/refined-'+kind+'.scn'
 manifest[-1]['attachment_bone']='spine_02' if kind not in ['raider','scavenger'] else 'Spine'
 manifest[-1]['gameplay_changes']=False
 if kind=='sovereign':
  # The commander wears a retained cape. Carry the uplink outside its cloth,
  # with a continuous saddle bridging back to the unchanged torso mounting.
  bpy.context.view_layer.update()
  for obj in [o for o in r.children_recursive if o.type=='MESH']:
   if obj.name.startswith('Conformal spinal saddle'):
    for v in obj.data.vertices:
     world=obj.matrix_world@v.co;world.y=.135+(world.y-.135)*3.5;v.co=obj.matrix_world.inverted()@world
   elif min((obj.matrix_world@Vector(v)).y for v in obj.bound_box)>0:obj.location.y+=.13

assert len(roots)==25
# Fix UVs for extrusions and curved cables so every PBR surface exports cleanly.
for o in [o for o in bpy.data.objects if o.type=='MESH']:
 mesh=o.data
 if not mesh.uv_layers:mesh.uv_layers.new()
 uv=mesh.uv_layers.active.data
 for p in mesh.polygons:
  axis=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3) if i!=axis]
  for li in p.loop_indices:
   v=mesh.vertices[mesh.loops[li].vertex_index].co;uv[li].uv=(v[axes[0]]*2,v[axes[1]]*2)
 mesh.calc_loop_triangles()
 # Remove numerical zero area slivers before exporting portable tangents.
 bm=bmesh.new();bm.from_mesh(mesh);bad=[f for f in bm.faces if f.calc_area()<1e-11]
 if bad:bmesh.ops.delete(bm,geom=bad,context='FACES_ONLY')
 bm.to_mesh(mesh);bm.free();mesh.update()
for r,entry in zip(roots,manifest):
 children=[o for o in r.children_recursive if o.type=='MESH'];pts=[o.matrix_world@Vector(v) for o in children for v in o.bound_box]
 lo=Vector(tuple(min(p[i] for p in pts) for i in range(3)));hi=Vector(tuple(max(p[i] for p in pts) for i in range(3)))
 entry['dimensions_m']=[round(hi[0]-lo[0],5),round(hi[2]-lo[2],5),round(hi[1]-lo[1],5)]
 entry['bounds_min']=[round(lo[0],5),round(lo[2],5),round(-hi[1],5)]
 entry['bounds_max']=[round(hi[0],5),round(hi[2],5),round(-lo[1],5)]
 for o in children:o.data.calc_loop_triangles()
 entry['triangles']=sum(len(o.data.loop_triangles) for o in children);entry['materials']=sorted({m.name for o in children for m in o.data.materials});entry['editable_parts']=len(children)
 entry['source']='assets/art100/story-robots/StoryRobots-editable.blend'
 collision={
  'BerthReferenceDesk':'compound frame, work surface and display; open leg space',
  'SeedPropagationBench':'compound tray, legs and feet; six separately rounded cups with open gaps',
  'PreservationReservoir':'round pressure shell, rim bands, valve and outlet with supporting feet',
  'OpenChannelMast':'round stem and clipped feeder, baseplate, collars and service unit; no antenna bounding wall',
  'RelayChallengeMast':'round stem, baseplate and challenge unit; no antenna bounding wall',
  'MemoryReader':'compound plinth, pedestal, work surface and display',
  'CourierChargeCradle':'compound base, side supports and rear receiver; open central cradle'}
 entry['collision']='existing robot capsule unchanged' if entry['status']=='refined' else collision.get(entry['id'],'tight authored assembly bounds for closed solid equipment')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'StoryRobots-editable.blend'),compress=True)
# One mesh per material under each semantic root, preserving LivingSprouts pivot.
for parent in roots+[o for o in bpy.data.objects if o.type=='EMPTY' and o.name=='LivingSprouts']:
 for mat in list(bpy.data.materials):
  parts=[o for o in parent.children if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==mat]
  if len(parts)<2:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in parts:o.select_set(True)
  bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();bpy.context.object.name=parent.name+'_'+mat.name
for o in [o for o in bpy.data.objects if o.type=='MESH']:
 bpy.context.view_layer.objects.active=o
 mod=o.modifiers.new('Portable tangent topology','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(ROOT/'godot/art/art100-story-robots.glb'),export_format='GLB',export_animations=False,export_tangents=True,export_cameras=False,export_lights=False)
sys.path.insert(0,str(ROOT/'tools/art/native_enemies'))
from repair_tangents import repair
print('REPAIRED_TANGENTS',repair(ROOT/'godot/art/art100-story-robots.glb'))
for entry,r in zip(manifest,roots):entry['runtime_meshes']=sum(o.type=='MESH' for o in r.children_recursive)
(OUT/'manifest.json').write_text(json.dumps({'count':25,'new':19,'refined':6,'units':'metres','models':manifest},indent=2)+'\n',encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'StoryRobots-runtime.blend'),compress=True)
print('ART100_STORY_ROBOTS_COMPLETE',len(roots),sum(x['triangles'] for x in manifest),flush=True)

